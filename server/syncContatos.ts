/**
 * syncContatos.ts
 *
 * Utility for automatically syncing contacts to the internal agenda
 * whenever a spreadsheet is processed (phones or emails).
 *
 * Strategy: "merge" — never overwrite existing data, only fill empty fields.
 * This ensures manual edits and previously imported data are preserved.
 */

import { getDb } from "./db";
import { contatos } from "../drizzle/schema";
import { sql } from "drizzle-orm";

export interface ContactRecord {
  documento: string;         // CPF or CNPJ (digits only)
  tipoDoc: "CPF" | "CNPJ" | "INVALIDO";
  nomeRazaoSocial?: string;
  celular1?: string;
  celular2?: string;
  celular3?: string;
  celular4?: string;
  email1?: string;
  email2?: string;
  email3?: string;
  origemArquivo?: string;
}

export interface SyncResult {
  total: number;
  upserted: number;
  skipped: number;
}

/**
 * Upsert a batch of contacts into the internal agenda.
 * Uses "merge" strategy: only fills empty fields, never overwrites existing data.
 */
export async function syncContatos(
  records: ContactRecord[],
  fileName: string
): Promise<SyncResult> {
  if (!records.length) return { total: 0, upserted: 0, skipped: 0 };

  const db = await getDb();
  if (!db) return { total: records.length, upserted: 0, skipped: records.length };

  // Filter out invalid documents
  const valid = records.filter(
    (r) => r.tipoDoc !== "INVALIDO" && r.documento && r.documento.length >= 11
  );
  const skipped = records.length - valid.length;

  if (!valid.length) return { total: records.length, upserted: 0, skipped };

  // Deduplicate by documento — if same doc appears multiple times in this batch,
  // merge all phones/emails into one record
  const merged = new Map<string, ContactRecord>();
  for (const r of valid) {
    const existing = merged.get(r.documento);
    if (!existing) {
      merged.set(r.documento, { ...r, origemArquivo: fileName });
    } else {
      // Merge phones: fill empty slots
      const phones = [
        existing.celular1, existing.celular2,
        existing.celular3, existing.celular4,
      ];
      const newPhones = [r.celular1, r.celular2, r.celular3, r.celular4]
        .filter((p): p is string => !!p && p.length >= 8);
      for (const phone of newPhones) {
        if (!phones.includes(phone)) {
          const emptySlot = phones.findIndex((p) => !p);
          if (emptySlot >= 0) phones[emptySlot] = phone;
        }
      }
      [existing.celular1, existing.celular2, existing.celular3, existing.celular4] =
        phones as [string?, string?, string?, string?];

      // Merge emails: fill empty slots
      const emails = [existing.email1, existing.email2, existing.email3];
      const newEmails = [r.email1, r.email2, r.email3]
        .filter((e): e is string => !!e && e.includes("@"));
      for (const email of newEmails) {
        if (!emails.includes(email)) {
          const emptySlot = emails.findIndex((e) => !e);
          if (emptySlot >= 0) emails[emptySlot] = email;
        }
      }
      [existing.email1, existing.email2, existing.email3] =
        emails as [string?, string?, string?];

      // Keep best name
      if (!existing.nomeRazaoSocial && r.nomeRazaoSocial) {
        existing.nomeRazaoSocial = r.nomeRazaoSocial;
      }
    }
  }

  const batch = Array.from(merged.values()).map((r) => ({
    documento: r.documento,
    tipoDoc: r.tipoDoc,
    nomeRazaoSocial: r.nomeRazaoSocial || null,
    celular1: r.celular1 || null,
    celular2: r.celular2 || null,
    celular3: r.celular3 || null,
    celular4: r.celular4 || null,
    email1: r.email1 || null,
    email2: r.email2 || null,
    email3: r.email3 || null,
    origemArquivo: fileName,
  }));

  // Insert in batches of 1000 with merge strategy
  const BATCH_SIZE = 1000;
  let upserted = 0;
  for (let i = 0; i < batch.length; i += BATCH_SIZE) {
    const chunk = batch.slice(i, i + BATCH_SIZE);
    await db.insert(contatos).values(chunk).onDuplicateKeyUpdate({
      set: {
        // Merge: only fill empty fields, never overwrite existing data
        nomeRazaoSocial: sql`COALESCE(nomeRazaoSocial, VALUES(nomeRazaoSocial))`,
        celular1: sql`COALESCE(celular1, VALUES(celular1))`,
        celular2: sql`COALESCE(celular2, VALUES(celular2))`,
        celular3: sql`COALESCE(celular3, VALUES(celular3))`,
        celular4: sql`COALESCE(celular4, VALUES(celular4))`,
        email1: sql`COALESCE(email1, VALUES(email1))`,
        email2: sql`COALESCE(email2, VALUES(email2))`,
        email3: sql`COALESCE(email3, VALUES(email3))`,
        origemArquivo: sql`VALUES(origemArquivo)`,
      },
    });
    upserted += chunk.length;
  }

  return { total: records.length, upserted, skipped };
}

/**
 * Build ContactRecord list from the expanded phone records
 * produced by processData() in processador.ts.
 *
 * Multiple rows for the same document (different phones) are merged
 * into a single ContactRecord with up to 4 phone slots.
 */
export function buildContactsFromPhoneRecords(
  expandedRecords: Array<{
    nome: string;
    documento: string;
    tipoDoc: "CPF" | "CNPJ" | "INVALIDO";
    telefone: string;
  }>
): ContactRecord[] {
  const map = new Map<string, ContactRecord>();

  for (const r of expandedRecords) {
    if (!r.documento || r.tipoDoc === "INVALIDO") continue;
    const doc = r.documento.replace(/\D/g, "");
    if (!doc) continue;

    const existing = map.get(doc);
    if (!existing) {
      map.set(doc, {
        documento: doc,
        tipoDoc: r.tipoDoc,
        nomeRazaoSocial: r.nome || undefined,
        celular1: r.telefone || undefined,
      });
    } else {
      // Fill next empty phone slot
      if (!existing.celular1 && r.telefone) existing.celular1 = r.telefone;
      else if (!existing.celular2 && r.telefone && r.telefone !== existing.celular1)
        existing.celular2 = r.telefone;
      else if (!existing.celular3 && r.telefone &&
        r.telefone !== existing.celular1 && r.telefone !== existing.celular2)
        existing.celular3 = r.telefone;
      else if (!existing.celular4 && r.telefone &&
        r.telefone !== existing.celular1 && r.telefone !== existing.celular2 &&
        r.telefone !== existing.celular3)
        existing.celular4 = r.telefone;
    }
  }

  return Array.from(map.values());
}

/**
 * Build ContactRecord list from the email map
 * produced by processEmailData() in processadorEmail.ts.
 *
 * Each unique document gets one ContactRecord with up to 3 email slots.
 */
export function buildContactsFromEmailRecords(
  emailEntries: Array<{
    email: string;
    devedor: string;
    cpfCnpj: string;
    tipoDoc: string;
  }>
): ContactRecord[] {
  const map = new Map<string, ContactRecord>();

  for (const r of emailEntries) {
    const doc = r.cpfCnpj.replace(/\D/g, "");
    if (!doc || doc.length < 11) continue;
    const tipoDoc: "CPF" | "CNPJ" | "INVALIDO" =
      doc.length === 11 ? "CPF" : doc.length === 14 ? "CNPJ" : "INVALIDO";
    if (tipoDoc === "INVALIDO") continue;

    const existing = map.get(doc);
    if (!existing) {
      map.set(doc, {
        documento: doc,
        tipoDoc,
        nomeRazaoSocial: r.devedor || undefined,
        email1: r.email || undefined,
      });
    } else {
      // Fill next empty email slot
      if (!existing.email1 && r.email) existing.email1 = r.email;
      else if (!existing.email2 && r.email && r.email !== existing.email1)
        existing.email2 = r.email;
      else if (!existing.email3 && r.email &&
        r.email !== existing.email1 && r.email !== existing.email2)
        existing.email3 = r.email;
    }
  }

  return Array.from(map.values());
}
