import { Router, Request, Response } from "express";
import multer from "multer";
import { parseFile } from "./processador";
import { getDb } from "./db";
import { contatos, contatosHistorico } from "../drizzle/schema";
import { eq, or, like, and, sql, desc } from "drizzle-orm";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = file.originalname.toLowerCase();
    if (ext.endsWith(".csv") || ext.endsWith(".xlsx") || ext.endsWith(".xls")) {
      cb(null, true);
    } else {
      cb(new Error("Formato não suportado. Use CSV ou XLSX."));
    }
  },
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function cleanDigits(v: string | undefined | null): string {
  return (v ?? "").replace(/\D/g, "");
}

function classifyDoc(digits: string): "CPF" | "CNPJ" | "INVALIDO" {
  if (digits.length === 11) return "CPF";
  if (digits.length === 14) return "CNPJ";
  return "INVALIDO";
}

/**
 * Try to auto-correct a document with wrong digit count.
 * Returns { corrected, tipo } if fixable, or null if not.
 *
 * Common cases:
 *  - 12 digits: likely CNPJ with 2 leading zeros missing → pad to 14
 *  - 13 digits: likely CNPJ with 1 leading zero missing → pad to 14
 *  - 10 digits: likely CPF with 1 leading zero missing → pad to 11
 *  - 9 digits:  likely CPF with 2 leading zeros missing → pad to 11
 */
function tryCorrectDoc(digits: string): { corrected: string; tipo: "CPF" | "CNPJ"; method: string } | null {
  const len = digits.length;
  // Pad to CNPJ (14 digits) if 12 or 13 digits
  if (len === 13) {
    const corrected = digits.padStart(14, "0");
    return { corrected, tipo: "CNPJ", method: "zero à esquerda adicionado (13→14 dígitos)" };
  }
  if (len === 12) {
    const corrected = digits.padStart(14, "0");
    return { corrected, tipo: "CNPJ", method: "zeros à esquerda adicionados (12→14 dígitos)" };
  }
  // Pad to CPF (11 digits) if 9 or 10 digits
  if (len === 10) {
    const corrected = digits.padStart(11, "0");
    return { corrected, tipo: "CPF", method: "zero à esquerda adicionado (10→11 dígitos)" };
  }
  if (len === 9) {
    const corrected = digits.padStart(11, "0");
    return { corrected, tipo: "CPF", method: "zeros à esquerda adicionados (9→11 dígitos)" };
  }
  return null;
}

// ─── In-memory progress store for SSE ────────────────────────────────────────
type ImportProgress = {
  status: "running" | "done" | "error";
  totalLidos: number;
  totalProcessados: number;
  totalImportados: number;
  totalCorrigidos: number;
  totalErros: number;
  message: string;
  result?: Record<string, unknown>;
};
const importProgressMap = new Map<string, ImportProgress>();
const sseClientsMap = new Map<string, Set<Response>>();

function cleanPhone(v: string | undefined | null): string | null {
  const d = cleanDigits(v);
  return d.length >= 8 ? d : null;
}

function cleanEmail(v: string | undefined | null): string | null {
  const e = (v ?? "").trim().toLowerCase();
  return e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}

/** Auto-detect column mapping from headers */
function detectContatoColumns(headers: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

  const patterns: Array<[string, RegExp]> = [
    ["documento", /cpf|cnpj|documento|doc/],
    ["nome", /nome|razao|razão|social/],
    ["celular1", /cel.*01|cel.*1|tel.*01|tel.*1|fone.*01|fone.*1|celular01|celular1/],
    ["celular2", /cel.*02|cel.*2|tel.*02|tel.*2|fone.*02|fone.*2|celular02|celular2/],
    ["celular3", /cel.*03|cel.*3|tel.*03|tel.*3|fone.*03|fone.*3|celular03|celular3/],
    ["celular4", /cel.*04|cel.*4|tel.*04|tel.*4|fone.*04|fone.*4|celular04|celular4/],
    ["email1", /e.?mail.*01|e.?mail.*1|email01|email1/],
    ["email2", /e.?mail.*02|e.?mail.*2|email02|email2/],
    ["email3", /e.?mail.*03|e.?mail.*3|email03|email3/],
  ];

  for (const [field, pattern] of patterns) {
    const found = headers.find(h => pattern.test(norm(h)));
    if (found) map[field] = found;
  }
  return map;
}

export interface ContatoMapping {
  documento?: string;
  nome?: string;
  celular1?: string;
  celular2?: string;
  celular3?: string;
  celular4?: string;
  email1?: string;
  email2?: string;
  email3?: string;
}

// ─── POST /api/contatos/parse ────────────────────────────────────────────────
router.post("/parse", upload.single("file"), async (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Nenhum arquivo enviado." });

    const parsed = parseFile(req.file.buffer, req.file.mimetype, req.file.originalname);
    const suggestions = detectContatoColumns(parsed.headers);

    return res.json({
      headers: parsed.headers,
      suggestions,
      totalRows: parsed.rows.length,
      previewRows: parsed.rows.slice(0, 10),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/contatos/import-progress/:jobId (SSE) ──────────────────────
router.get("/import-progress/:jobId", (req: Request, res: Response) => {
  const { jobId } = req.params;
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  // Send current state immediately
  const current = importProgressMap.get(jobId);
  if (current) {
    res.write(`data: ${JSON.stringify(current)}\n\n`);
    if (current.status === "done" || current.status === "error") {
      res.end();
      return;
    }
  }

  // Register SSE client
  if (!sseClientsMap.has(jobId)) sseClientsMap.set(jobId, new Set());
  sseClientsMap.get(jobId)!.add(res);

  req.on("close", () => {
    sseClientsMap.get(jobId)?.delete(res);
  });
});

function broadcastProgress(jobId: string, progress: ImportProgress) {
  importProgressMap.set(jobId, progress);
  const clients = sseClientsMap.get(jobId);
  if (clients) {
    const data = `data: ${JSON.stringify(progress)}\n\n`;
    for (const client of Array.from(clients)) {
      try { client.write(data); } catch {}
    }
    if (progress.status === "done" || progress.status === "error") {
      for (const client of Array.from(clients)) {
        try { client.end(); } catch {}
      }
      clients.clear();
      // Clean up after 60s
      setTimeout(() => importProgressMap.delete(jobId), 60_000);
    }
  }
}

// ─── POST /api/contatos/import ───────────────────────────────────────────────
router.post("/import", upload.single("file"), async (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Nenhum arquivo enviado." });

    let mapping: ContatoMapping;
    try {
      mapping = JSON.parse(req.body.mapping || "{}");
    } catch {
      return res.status(400).json({ error: "Mapeamento inválido." });
    }

    const duplicateMode: "merge" | "update" | "ignore" = req.body.duplicateMode || "merge";
    const jobId: string = (req.body.jobId as string) || `job_${Date.now()}`;
    const parsed = parseFile(req.file.buffer, req.file.mimetype, req.file.originalname);
    const fileName = req.file.originalname;

    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Banco de dados não disponível." });

    let totalLidos = 0;
    let totalImportados = 0;
    let totalAtualizados = 0;
    let totalIgnorados = 0;
    let totalErros = 0;
    let totalCpf = 0;
    let totalCnpj = 0;
    let totalCorrigidos = 0;
    const erros: Array<{ linha: number; motivo: string }> = [];
    const correcoes: Array<{ linha: number; original: string; corrigido: string; metodo: string }> = [];

    // Broadcast initial progress
    broadcastProgress(jobId, {
      status: "running",
      totalLidos: 0,
      totalProcessados: 0,
      totalImportados: 0,
      totalCorrigidos: 0,
      totalErros: 0,
      message: "Lendo e validando registros...",
    });

    const get = (row: Record<string, string>, col?: string) =>
      col ? (row[col] ?? "") : "";

    // ── Step 1: Parse and validate all rows ──────────────────────────────────
    type ValidRecord = {
      documento: string;
      tipoDoc: "CPF" | "CNPJ";
      nomeRazaoSocial: string | null;
      celular1: string | null;
      celular2: string | null;
      celular3: string | null;
      celular4: string | null;
      email1: string | null;
      email2: string | null;
      email3: string | null;
      origemArquivo: string;
    };

    const validRecords: ValidRecord[] = [];

    for (let i = 0; i < parsed.rows.length; i++) {
      totalLidos++;
      const row = parsed.rows[i];
      const linha = i + 2;

      const docRaw = get(row, mapping.documento);
      let docDigits = cleanDigits(docRaw);
      let tipoDoc = classifyDoc(docDigits);

      if (!docDigits) {
        totalErros++;
        erros.push({ linha, motivo: "CPF/CNPJ vazio" });
        continue;
      }

      // Try to auto-correct invalid documents
      if (tipoDoc === "INVALIDO") {
        const correction = tryCorrectDoc(docDigits);
        if (correction) {
          correcoes.push({
            linha,
            original: docRaw,
            corrigido: correction.corrected,
            metodo: correction.method,
          });
          docDigits = correction.corrected;
          tipoDoc = correction.tipo;
          totalCorrigidos++;
        } else {
          totalErros++;
          erros.push({ linha, motivo: `Documento inválido: "${docRaw}" (${docDigits.length} dígitos — não foi possível corrigir)` });
          continue;
        }
      }

      if (tipoDoc === "CPF") totalCpf++;
      else totalCnpj++;

      validRecords.push({
        documento: docDigits,
        tipoDoc,
        nomeRazaoSocial: get(row, mapping.nome).trim() || null,
        celular1: cleanPhone(get(row, mapping.celular1)),
        celular2: cleanPhone(get(row, mapping.celular2)),
        celular3: cleanPhone(get(row, mapping.celular3)),
        celular4: cleanPhone(get(row, mapping.celular4)),
        email1: cleanEmail(get(row, mapping.email1)),
        email2: cleanEmail(get(row, mapping.email2)),
        email3: cleanEmail(get(row, mapping.email3)),
        origemArquivo: fileName,
      });
    }

    // Broadcast after parsing
    broadcastProgress(jobId, {
      status: "running",
      totalLidos,
      totalProcessados: 0,
      totalImportados: 0,
      totalCorrigidos,
      totalErros,
      message: `${validRecords.length} registros válidos. Importando...`,
    });

    // ── Step 2: Bulk upsert in batches of 1000 using Drizzle onDuplicateKeyUpdate ──
    const BATCH_SIZE = 1000;

    for (let b = 0; b < validRecords.length; b += BATCH_SIZE) {
      const batch = validRecords.slice(b, b + BATCH_SIZE);

      if (duplicateMode === "ignore") {
        await db.insert(contatos).values(batch).onDuplicateKeyUpdate({
          set: { documento: sql`documento` },
        });
        totalImportados += batch.length;
      } else if (duplicateMode === "update") {
        // Overwrite existing fields with new values (use COALESCE to keep if new is null)
        await db.insert(contatos).values(batch).onDuplicateKeyUpdate({
          set: {
            tipoDoc: sql`VALUES(tipoDoc)`,
            nomeRazaoSocial: sql`COALESCE(VALUES(nomeRazaoSocial), nomeRazaoSocial)`,
            celular1: sql`COALESCE(VALUES(celular1), celular1)`,
            celular2: sql`COALESCE(VALUES(celular2), celular2)`,
            celular3: sql`COALESCE(VALUES(celular3), celular3)`,
            celular4: sql`COALESCE(VALUES(celular4), celular4)`,
            email1: sql`COALESCE(VALUES(email1), email1)`,
            email2: sql`COALESCE(VALUES(email2), email2)`,
            email3: sql`COALESCE(VALUES(email3), email3)`,
            origemArquivo: sql`VALUES(origemArquivo)`,
          },
        });
        totalImportados += batch.length;
        totalAtualizados += batch.length; // approximate
      } else {
        // merge: only fill empty fields, never overwrite existing data
        await db.insert(contatos).values(batch).onDuplicateKeyUpdate({
          set: {
            nomeRazaoSocial: sql`COALESCE(nomeRazaoSocial, VALUES(nomeRazaoSocial))`,
            celular1: sql`COALESCE(celular1, VALUES(celular1))`,
            celular2: sql`COALESCE(celular2, VALUES(celular2))`,
            celular3: sql`COALESCE(celular3, VALUES(celular3))`,
            celular4: sql`COALESCE(celular4, VALUES(celular4))`,
            email1: sql`COALESCE(email1, VALUES(email1))`,
            email2: sql`COALESCE(email2, VALUES(email2))`,
            email3: sql`COALESCE(email3, VALUES(email3))`,
          },
        });
        totalImportados += batch.length;
      }

      // Broadcast progress after each batch
      broadcastProgress(jobId, {
        status: "running",
        totalLidos,
        totalProcessados: Math.min(b + BATCH_SIZE, validRecords.length),
        totalImportados,
        totalCorrigidos,
        totalErros,
        message: `Importando... ${Math.min(b + BATCH_SIZE, validRecords.length)} de ${validRecords.length}`,
      });
    }

    const result = {
      totalLidos,
      totalImportados,
      totalAtualizados,
      totalIgnorados,
      totalErros,
      totalCorrigidos,
      totalCpf,
      totalCnpj,
      erros: erros.slice(0, 100),
      correcoes: correcoes.slice(0, 100),
    };

    // Broadcast completion
    broadcastProgress(jobId, {
      status: "done",
      totalLidos,
      totalProcessados: validRecords.length,
      totalImportados,
      totalCorrigidos,
      totalErros,
      message: "Importação concluída!",
      result,
    });

    return res.json({ ...result, jobId });
  } catch (err: any) {
    console.error("[contatos/import]", err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/contatos ───────────────────────────────────────────────────────
router.get("/", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.json({ data: [], total: 0 });

    const q = ((req.query.q as string) || "").trim();
    const tipo = (req.query.tipo as string) || "";
    const sort = (req.query.sort as string) || "recent"; // "az" | "za" | "recent"
    const page = Math.max(1, parseInt((req.query.page as string) || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) || "50", 10)));
    const offset = (page - 1) * limit;

    let whereClause: any = undefined;

    if (q) {
      const qDigits = q.replace(/\D/g, "");
      const conditions: any[] = [like(contatos.nomeRazaoSocial, `%${q}%`)];
      if (qDigits.length >= 8) {
        conditions.push(like(contatos.documento, `%${qDigits}%`));
        conditions.push(like(contatos.celular1, `%${qDigits}%`));
        conditions.push(like(contatos.celular2, `%${qDigits}%`));
        conditions.push(like(contatos.celular3, `%${qDigits}%`));
        conditions.push(like(contatos.celular4, `%${qDigits}%`));
      } else if (qDigits.length > 0) {
        conditions.push(like(contatos.documento, `%${qDigits}%`));
      }
      // email search
      if (q.includes("@")) {
        conditions.push(like(contatos.email1, `%${q}%`));
        conditions.push(like(contatos.email2, `%${q}%`));
        conditions.push(like(contatos.email3, `%${q}%`));
      }
      whereClause = or(...conditions);
    }

    if (tipo === "CPF") {
      whereClause = whereClause
        ? and(whereClause, eq(contatos.tipoDoc, "CPF"))
        : eq(contatos.tipoDoc, "CPF");
    } else if (tipo === "CNPJ") {
      whereClause = whereClause
        ? and(whereClause, eq(contatos.tipoDoc, "CNPJ"))
        : eq(contatos.tipoDoc, "CNPJ");
    }

    const { asc } = await import("drizzle-orm");
    const orderBy = sort === "az"
      ? asc(contatos.nomeRazaoSocial)
      : sort === "za"
        ? desc(contatos.nomeRazaoSocial)
        : desc(contatos.updatedAt);

    const [rows, countRows] = await Promise.all([
      whereClause
        ? db.select().from(contatos).where(whereClause).orderBy(orderBy).limit(limit).offset(offset)
        : db.select().from(contatos).orderBy(orderBy).limit(limit).offset(offset),
      whereClause
        ? db.select({ count: sql<number>`count(*)` }).from(contatos).where(whereClause)
        : db.select({ count: sql<number>`count(*)` }).from(contatos),
    ]);

    const total = Number(countRows[0]?.count ?? 0);

    return res.json({ data: rows, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (err: any) {
    console.error("[contatos/list]", err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/contatos/:documento ────────────────────────────────────────────
router.get("/:documento", async (req: Request, res: Response) => {
  try {
    const doc = req.params.documento.replace(/\D/g, "");
    if (!doc) return res.status(400).json({ error: "Documento inválido" });

    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Banco não disponível" });

    const rows = await db
      .select()
      .from(contatos)
      .where(eq(contatos.documento, doc))
      .limit(1);

    if (rows.length === 0) return res.status(404).json({ error: "Contato não encontrado" });
    return res.json(rows[0]);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /api/contatos/:documento ─────────────────────────────────────────
router.delete("/:documento", async (req: Request, res: Response) => {
  try {
    const doc = req.params.documento.replace(/\D/g, "");
    if (!doc) return res.status(400).json({ error: "Documento inválido" });

    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Banco não disponível" });

    await db.delete(contatos).where(eq(contatos.documento, doc));
    await db.delete(contatosHistorico).where(eq(contatosHistorico.documento, doc));
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/contatos (cadastro manual) ────────────────────────────────────
router.post("/", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Banco não disponível" });

    const body = req.body;
    const docDigits = cleanDigits(body.documento);
    if (!docDigits) return res.status(400).json({ error: "CPF/CNPJ é obrigatório" });

    let tipoDoc = classifyDoc(docDigits);
    if (tipoDoc === "INVALIDO") {
      const correction = tryCorrectDoc(docDigits);
      if (correction) {
        tipoDoc = correction.tipo;
      } else {
        return res.status(400).json({ error: `Documento inválido: ${docDigits.length} dígitos. CPF deve ter 11 e CNPJ 14.` });
      }
    }

    const nome = (body.nomeRazaoSocial || "").trim();
    if (!nome) return res.status(400).json({ error: "Nome / Razão Social é obrigatório" });

    const celular1 = cleanPhone(body.celular1);
    const celular2 = cleanPhone(body.celular2);
    const celular3 = cleanPhone(body.celular3);
    const celular4 = cleanPhone(body.celular4);
    const email1 = cleanEmail(body.email1);
    const email2 = cleanEmail(body.email2);
    const email3 = cleanEmail(body.email3);
    const telefonePrincipal = parseInt(body.telefonePrincipal || "0", 10);
    const emailPrincipal = parseInt(body.emailPrincipal || "0", 10);

    // Check if already exists
    const existing = await db.select({ id: contatos.id }).from(contatos).where(eq(contatos.documento, docDigits)).limit(1);
    if (existing.length > 0) {
      return res.status(409).json({ error: "Já existe um contato com este CPF/CNPJ. Use a função de edição para atualizar." });
    }

    await db.insert(contatos).values({
      documento: docDigits,
      tipoDoc,
      nomeRazaoSocial: nome,
      celular1, celular2, celular3, celular4,
      email1, email2, email3,
      origem: "manual",
      telefonePrincipal,
      emailPrincipal,
      ultimaEdicao: new Date(),
    });

    // Register history
    await db.insert(contatosHistorico).values({
      documento: docDigits,
      acao: "criado",
      descricao: "Contato criado manualmente",
      camposAlterados: null,
    });

    const created = await db.select().from(contatos).where(eq(contatos.documento, docDigits)).limit(1);
    return res.status(201).json(created[0]);
  } catch (err: any) {
    console.error("[contatos/create]", err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── PUT /api/contatos/:documento (editar) ───────────────────────────────────
router.put("/:documento", async (req: Request, res: Response) => {
  try {
    const doc = req.params.documento.replace(/\D/g, "");
    if (!doc) return res.status(400).json({ error: "Documento inválido" });

    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Banco não disponível" });

    const existing = await db.select().from(contatos).where(eq(contatos.documento, doc)).limit(1);
    if (existing.length === 0) return res.status(404).json({ error: "Contato não encontrado" });

    const old = existing[0];
    const body = req.body;

    const nome = (body.nomeRazaoSocial || "").trim() || old.nomeRazaoSocial;
    const celular1 = cleanPhone(body.celular1) ?? old.celular1;
    const celular2 = cleanPhone(body.celular2) ?? old.celular2;
    const celular3 = cleanPhone(body.celular3) ?? old.celular3;
    const celular4 = cleanPhone(body.celular4) ?? old.celular4;
    const email1 = cleanEmail(body.email1) ?? old.email1;
    const email2 = cleanEmail(body.email2) ?? old.email2;
    const email3 = cleanEmail(body.email3) ?? old.email3;

    // Track changed fields for history
    const camposAlterados: Array<{ campo: string; de: string | null; para: string | null }> = [];
    const trackChange = (campo: string, de: string | null | undefined, para: string | null | undefined) => {
      const deStr = de ?? null;
      const paraStr = para ?? null;
      if (deStr !== paraStr) camposAlterados.push({ campo, de: deStr, para: paraStr });
    };
    trackChange("Nome / Razão Social", old.nomeRazaoSocial, nome);
    trackChange("Celular 01", old.celular1, celular1);
    trackChange("Celular 02", old.celular2, celular2);
    trackChange("Celular 03", old.celular3, celular3);
    trackChange("Celular 04", old.celular4, celular4);
    trackChange("E-mail 01", old.email1, email1);
    trackChange("E-mail 02", old.email2, email2);
    trackChange("E-mail 03", old.email3, email3);

    await db.update(contatos).set({
      nomeRazaoSocial: nome,
      celular1, celular2, celular3, celular4,
      email1, email2, email3,
      ultimaEdicao: new Date(),
    }).where(eq(contatos.documento, doc));

    if (camposAlterados.length > 0) {
      await db.insert(contatosHistorico).values({
        documento: doc,
        acao: "editado",
        descricao: `${camposAlterados.length} campo(s) alterado(s)`,
        camposAlterados,
      });
    }

    const updated = await db.select().from(contatos).where(eq(contatos.documento, doc)).limit(1);
    return res.json(updated[0]);
  } catch (err: any) {
    console.error("[contatos/edit]", err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/contatos/:documento/favoritar ─────────────────────────────────
router.post("/:documento/favoritar", async (req: Request, res: Response) => {
  try {
    const doc = req.params.documento.replace(/\D/g, "");
    if (!doc) return res.status(400).json({ error: "Documento inválido" });

    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Banco não disponível" });

    const existing = await db.select().from(contatos).where(eq(contatos.documento, doc)).limit(1);
    if (existing.length === 0) return res.status(404).json({ error: "Contato não encontrado" });

    const old = existing[0];
    const tipo = req.body.tipo as "telefone" | "email"; // "telefone" or "email"
    const valor = parseInt(req.body.valor || "0", 10); // 1-4 for telefone, 1-3 for email, 0 to clear

    const updateData: Partial<typeof contatos.$inferInsert> = { ultimaEdicao: new Date() };
    let descricao = "";

    if (tipo === "telefone") {
      updateData.telefonePrincipal = valor;
      descricao = valor > 0 ? `Celular 0${valor} marcado como principal` : "Telefone principal removido";
    } else if (tipo === "email") {
      updateData.emailPrincipal = valor;
      descricao = valor > 0 ? `E-mail 0${valor} marcado como principal` : "E-mail principal removido";
    } else {
      return res.status(400).json({ error: "tipo deve ser 'telefone' ou 'email'" });
    }

    await db.update(contatos).set(updateData).where(eq(contatos.documento, doc));

    // Only log if changed
    const oldVal = tipo === "telefone" ? old.telefonePrincipal : old.emailPrincipal;
    if (oldVal !== valor) {
      await db.insert(contatosHistorico).values({
        documento: doc,
        acao: "favorito_alterado",
        descricao,
        camposAlterados: null,
      });
    }

    const updated = await db.select().from(contatos).where(eq(contatos.documento, doc)).limit(1);
    return res.json(updated[0]);
  } catch (err: any) {
    console.error("[contatos/favoritar]", err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/contatos/:documento/historico ──────────────────────────────────
router.get("/:documento/historico", async (req: Request, res: Response) => {
  try {
    const doc = req.params.documento.replace(/\D/g, "");
    if (!doc) return res.status(400).json({ error: "Documento inválido" });

    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Banco não disponível" });

    const rows = await db
      .select()
      .from(contatosHistorico)
      .where(eq(contatosHistorico.documento, doc))
      .orderBy(desc(contatosHistorico.criadoEm))
      .limit(100);

    return res.json(rows);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
