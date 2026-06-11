/**
 * processadorEmail.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Email processing module for the Processador CSV Inteligente.
 *
 * Rules:
 *  - Detect email columns automatically (up to N columns)
 *  - Deduplicate by email address: one email = one row in the output
 *  - Merge all protocols linked to the same email with " | "
 *  - Flag emails that appear in >= SPAM_THRESHOLD protocols (configurable)
 *  - Output 3 CSVs:
 *      EMAIL_NORMAL   — emails below threshold, ready to send
 *      EMAIL_ALERTA   — emails at/above threshold, needs review
 *      SEM_EMAIL      — original rows that had no valid email
 *  - All output CSVs use comma separator (email systems don't have the
 *    semicolon restriction that URA/Linksys has)
 *  - Output columns (EMAIL_NORMAL and EMAIL_ALERTA):
 *      E-MAIL | QTDE_PROTOCOLOS | PROTOCOLOS | DEVEDOR | CPF_CNPJ |
 *      VALOR_TOTAL | NOME_CREDOR | CPF_CNPJ_CREDOR | TIPO_DOC
 * ─────────────────────────────────────────────────────────────────────────────
 */

import * as XLSX from "xlsx";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EmailColMapping {
  /** Column name identified as "Devedor / Nome" */
  nomeCol: string | null;
  /** Column name identified as "CPF/CNPJ Devedor" */
  documentoCol: string | null;
  /** Column name identified as "Protocolo" */
  protocoloCol: string | null;
  /** Column name identified as "Valor" */
  valorCol: string | null;
  /** Column name identified as "Nome do Credor" */
  nomeCredorCol: string | null;
  /** Column name identified as "CPF/CNPJ Credor" */
  docCredorCol: string | null;
  /** Up to 5 email columns */
  emailCols: string[];
  /** Spam threshold (default 5) */
  spamThreshold: number;
}

export interface EmailParseResult {
  headers: string[];
  suggestions: EmailColMapping;
  totalRows: number;
  previewRows: Array<Record<string, string>>;
}

export interface EmailEntry {
  devedor: string;
  cpfCnpj: string;
  tipoDoc: string;
  nomeCreador: string;
  docCreador: string;
  protocolos: string[];
  valores: string[];
}

export interface EmailProcessResult {
  totalRows: number;
  rowsWithEmail: number;
  rowsWithoutEmail: number;
  uniqueEmails: number;
  normalEmails: number;
  flaggedEmails: number;
  spamThreshold: number;
  normalCsv: Buffer;
  alertaCsv: Buffer;
  semEmailCsv: Buffer;
  /** All email entries (normal + flagged) for contact sync */
  emailEntries: Array<{ email: string } & EmailEntry>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_SPAM_THRESHOLD = 5;

// Patterns for auto-detection
const NOME_PATTERNS = [
  /^devedor$/i, /nome.?devedor/i, /^nome$/i, /^razao.?social/i, /^cliente$/i,
];
const DOC_PATTERNS = [
  /cpf.?cnpj.?devedor/i, /^cpf.?cnpj$/i, /^documento$/i, /^cpf$/i, /^cnpj$/i,
];
const PROTOCOLO_PATTERNS = [
  /^protocolo$/i, /^prot$/i, /protocolo.?intimado/i, /^numero.?protocolo/i,
];
const VALOR_PATTERNS = [
  /^valor.?protesto$/i, /^valor$/i, /^valor.?total$/i, /^vl.?protesto/i,
];
const CREDOR_NOME_PATTERNS = [
  /nome.?credor/i, /^credor$/i, /^nome.?do.?credor$/i,
];
const CREDOR_DOC_PATTERNS = [
  /cpf.?cnpj.?credor/i, /doc.?credor/i,
];
const EMAIL_PATTERNS = [
  /e.?mail/i, /email/i, /^mail$/i, /^e-mail/i,
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function matchesAny(col: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(col.trim()));
}

function findFirst(headers: string[], patterns: RegExp[]): string | null {
  return headers.find((h) => matchesAny(h, patterns)) ?? null;
}

function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

function serializeRow(cells: string[]): string {
  return cells
    .map((c) => {
      const v = String(c ?? "");
      if (v.includes(",") || v.includes('"') || v.includes("\n")) {
        return '"' + v.replace(/"/g, '""') + '"';
      }
      return v;
    })
    .join(",");
}

function detectDocType(doc: string): "CPF" | "CNPJ" | "INVALIDO" {
  const d = doc.replace(/\D/g, "");
  if (d.length === 11) return "CPF";
  if (d.length === 14) return "CNPJ";
  return "INVALIDO";
}

// ─── Parse ────────────────────────────────────────────────────────────────────

export function parseEmailFile(
  buffer: Buffer,
  mimetype: string,
  filename: string
): EmailParseResult {
  let rows: Array<Record<string, string>>;
  let headers: string[];

  const isXlsx =
    mimetype.includes("spreadsheetml") ||
    filename.toLowerCase().endsWith(".xlsx") ||
    filename.toLowerCase().endsWith(".xls");

  if (isXlsx) {
    const wb = XLSX.read(buffer, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: "" });
    if (!data.length) throw new Error("Planilha vazia.");
    headers = (data[0] as string[]).map((h) => String(h ?? "").trim());
    rows = (data.slice(1) as string[][]).map((r) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => (obj[h] = String(r[i] ?? "").trim()));
      return obj;
    });
  } else {
    // CSV — detect separator
    const text = buffer.toString("utf-8").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const firstLine = text.split("\n")[0];
    const sep = firstLine.includes(";") ? ";" : ",";
    const wb = XLSX.read(buffer, { type: "buffer", FS: sep, codepage: 65001 });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: "" });
    if (!data.length) throw new Error("Arquivo vazio.");
    headers = (data[0] as string[]).map((h) => String(h ?? "").trim());
    rows = (data.slice(1) as string[][]).map((r) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => (obj[h] = String(r[i] ?? "").trim()));
      return obj;
    });
  }

  // Auto-detect columns
  const emailCols = headers.filter((h) => matchesAny(h, EMAIL_PATTERNS)).slice(0, 5);

  const suggestions: EmailColMapping = {
    nomeCol: findFirst(headers, NOME_PATTERNS),
    documentoCol: findFirst(headers, DOC_PATTERNS),
    protocoloCol: findFirst(headers, PROTOCOLO_PATTERNS),
    valorCol: findFirst(headers, VALOR_PATTERNS),
    nomeCredorCol: findFirst(headers, CREDOR_NOME_PATTERNS),
    docCredorCol: findFirst(headers, CREDOR_DOC_PATTERNS),
    emailCols,
    spamThreshold: DEFAULT_SPAM_THRESHOLD,
  };

  return {
    headers,
    suggestions,
    totalRows: rows.length,
    previewRows: rows.slice(0, 10),
  };
}

// ─── Process ─────────────────────────────────────────────────────────────────

export function processEmailData(
  buffer: Buffer,
  mimetype: string,
  filename: string,
  mapping: EmailColMapping
): EmailProcessResult {
  // Re-parse the file
  const isXlsx =
    mimetype.includes("spreadsheetml") ||
    filename.toLowerCase().endsWith(".xlsx") ||
    filename.toLowerCase().endsWith(".xls");

  let rows: Array<Record<string, string>>;
  let headers: string[];

  if (isXlsx) {
    const wb = XLSX.read(buffer, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: "" });
    headers = (data[0] as string[]).map((h) => String(h ?? "").trim());
    rows = (data.slice(1) as string[][]).map((r) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => (obj[h] = String(r[i] ?? "").trim()));
      return obj;
    });
  } else {
    const text = buffer.toString("utf-8").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const firstLine = text.split("\n")[0];
    const sep = firstLine.includes(";") ? ";" : ",";
    const wb = XLSX.read(buffer, { type: "buffer", FS: sep, codepage: 65001 });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: "" });
    headers = (data[0] as string[]).map((h) => String(h ?? "").trim());
    rows = (data.slice(1) as string[][]).map((r) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => (obj[h] = String(r[i] ?? "").trim()));
      return obj;
    });
  }

  const {
    nomeCol,
    documentoCol,
    protocoloCol,
    valorCol,
    nomeCredorCol,
    docCredorCol,
    emailCols,
    spamThreshold = DEFAULT_SPAM_THRESHOLD,
  } = mapping;

  // ── Build email → aggregated data map ──────────────────────────────────────
  interface EmailEntry {
    devedor: string;
    cpfCnpj: string;
    tipoDoc: string;
    nomeCreador: string;
    docCreador: string;
    protocolos: string[];
    valores: string[];
  }

  const emailMap = new Map<string, EmailEntry>();
  const semEmailRows: Array<Record<string, string>> = [];

  for (const row of rows) {
    // Collect unique valid emails from this row
    const emailsInRow = new Set<string>();
    for (const col of emailCols) {
      const v = (row[col] ?? "").trim().toLowerCase();
      if (v && isValidEmail(v)) emailsInRow.add(v);
    }

    if (emailsInRow.size === 0) {
      semEmailRows.push(row);
      continue;
    }

    const devedor = nomeCol ? (row[nomeCol] ?? "").trim() : "";
    const rawDoc = documentoCol ? (row[documentoCol] ?? "").trim() : "";
    const tipoDoc = detectDocType(rawDoc);
    const protocolo = protocoloCol ? (row[protocoloCol] ?? "").trim() : "";
    const valor = valorCol ? (row[valorCol] ?? "").trim() : "";
    const nomeCreador = nomeCredorCol ? (row[nomeCredorCol] ?? "").trim() : "";
    const docCreador = docCredorCol ? (row[docCredorCol] ?? "").trim() : "";

    for (const email of Array.from(emailsInRow)) {
      if (emailMap.has(email)) {
        const entry = emailMap.get(email)!;
        if (protocolo && !entry.protocolos.includes(protocolo)) {
          entry.protocolos.push(protocolo);
        }
        if (valor && !entry.valores.includes(valor)) {
          entry.valores.push(valor);
        }
      } else {
        emailMap.set(email, {
          devedor,
          cpfCnpj: rawDoc,
          tipoDoc,
          nomeCreador,
          docCreador,
          protocolos: protocolo ? [protocolo] : [],
          valores: valor ? [valor] : [],
        });
      }
    }
  }

  // ── Split into normal vs flagged ───────────────────────────────────────────
  const normalEntries: Array<[string, EmailEntry]> = [];
  const flaggedEntries: Array<[string, EmailEntry]> = [];

  for (const [email, entry] of Array.from(emailMap.entries())) {
    if (entry.protocolos.length >= spamThreshold) {
      flaggedEntries.push([email, entry]);
    } else {
      normalEntries.push([email, entry]);
    }
  }

  // Sort flagged by protocol count desc
  flaggedEntries.sort((a, b) => b[1].protocolos.length - a[1].protocolos.length);

  // ── Build output CSVs ──────────────────────────────────────────────────────
  const OUTPUT_HEADERS = [
    "E-MAIL",
    "QTDE_PROTOCOLOS",
    "PROTOCOLOS",
    "DEVEDOR",
    "CPF_CNPJ",
    "TIPO_DOC",
    "VALOR_TOTAL",
    "NOME_CREDOR",
    "CPF_CNPJ_CREDOR",
  ];

  function buildOutputRow(email: string, entry: EmailEntry): string[] {
    return [
      email,
      String(entry.protocolos.length),
      entry.protocolos.join(" | "),
      entry.devedor,
      entry.cpfCnpj,
      entry.tipoDoc,
      entry.valores.join(" | "),
      entry.nomeCreador,
      entry.docCreador,
    ];
  }

  function buildCsv(entries: Array<[string, EmailEntry]>): Buffer {
    const lines = [
      serializeRow(OUTPUT_HEADERS),
      ...entries.map(([email, entry]) => serializeRow(buildOutputRow(email, entry))),
    ];
    const BOM = "\uFEFF";
    return Buffer.from(BOM + lines.join("\r\n"), "utf-8");
  }

  const normalCsv = buildCsv(normalEntries);
  const alertaCsv = buildCsv(flaggedEntries);

  // SEM_EMAIL: original rows without any email — keep original columns
  function buildSemEmailCsv(): Buffer {
    if (semEmailRows.length === 0) {
      return Buffer.from(serializeRow(headers) + "\r\n", "utf-8");
    }
    const lines = [
      serializeRow(headers),
      ...semEmailRows.map((r) => serializeRow(headers.map((h) => r[h] ?? ""))),
    ];
    const BOM = "\uFEFF";
    return Buffer.from(BOM + lines.join("\r\n"), "utf-8");
  }

  const semEmailCsv = buildSemEmailCsv();

  // Build flat emailEntries list for contact sync (normal + flagged)
  const emailEntries = Array.from(emailMap.entries()).map(([email, entry]) => ({
    email,
    ...entry,
  }));

  return {
    totalRows: rows.length,
    rowsWithEmail: rows.length - semEmailRows.length,
    rowsWithoutEmail: semEmailRows.length,
    uniqueEmails: emailMap.size,
    normalEmails: normalEntries.length,
    flaggedEmails: flaggedEntries.length,
    spamThreshold,
    normalCsv,
    alertaCsv,
    semEmailCsv,
    emailEntries,
  };
}
