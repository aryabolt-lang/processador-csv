import * as XLSX from "xlsx";
import { stringify } from "csv-stringify/sync";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface ColMapping {
  nome: string | null;
  documento: string | null;
  telefone1: string | null;
  telefone2: string | null;
  telefone3: string | null;
  telefone4: string | null;
  // semContato is no longer a separate column — detected directly in phone cells
  semContato?: string | null;
}

export interface ColSuggestion {
  field: keyof ColMapping;
  column: string | null;
  confidence: number; // 0-100
}

export interface ParsedFile {
  headers: string[];
  rows: Record<string, string>[];
  suggestions: ColSuggestion[];
}

/**
 * Entry for LIGACAO CSV generation.
 * For deduplication, multiple rows with the same phone are merged:
 * the `protocolosMerged` field holds all protocols joined by "/".
 */
export interface LigacaoEntry {
  originalRow: Record<string, string>;
  telefone: string;
  /** All protocols for this phone number, joined by "/" */
  protocolosMerged: string;
}

export interface ExpandedRecord {
  nome: string;
  documento: string;
  tipoDoc: "CPF" | "CNPJ" | "INVALIDO";
  telefone: string;
  origemTelefone: string;
  tipoDisparo: "ligacao" | "sms";
  protocolo: string;
}

export interface ProcessResult {
  totalRegistros: number;
  totalComContato: number;
  totalSemContato: number;
  totalCpf: number;
  totalCnpj: number;
  totalInvalidos: number;
  totalLinhasGeradas: number;
  cpfLigacaoCsv: Buffer;
  cpfSmsCsv: Buffer;
  cnpjLigacaoCsv: Buffer;
  cnpjSmsCsv: Buffer;
  previewCpfLigacao: Record<string, string>[];
  previewCpfSms: Record<string, string>[];
  previewCnpjLigacao: Record<string, string>[];
  previewCnpjSms: Record<string, string>[];
  /** All expanded records for DB storage (powers search module) */
  expandedRecords: ExpandedRecord[];
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function cleanPhone(phone: string): string {
  return phone.replace(/\D/g, "").trim();
}

function isValidPhone(phone: string): boolean {
  const clean = cleanPhone(phone);
  return clean.length >= 8 && clean.length <= 13;
}

function cleanDocument(doc: string): string {
  return doc.replace(/\D/g, "").trim();
}

function classifyDocument(doc: string): "CPF" | "CNPJ" | "INVALIDO" {
  const clean = cleanDocument(doc);
  if (clean.length === 11) return "CPF";
  if (clean.length === 14) return "CNPJ";
  return "INVALIDO";
}

/** Returns true if a phone cell value indicates "no contact" (not a real phone number) */
function isPhoneSemContato(value: string): boolean {
  if (!value || !value.trim()) return false;
  const v = value.toLowerCase().trim();
  return (
    v === "sem contato" ||
    v.startsWith("sem contato") ||
    v.includes("sem contato") ||
    v === "s/contato" ||
    v === "sc" ||
    v === "sem" ||
    v === "n/a" ||
    v === "na" ||
    v === "não localizado" ||
    v === "nao localizado" ||
    v.includes("não localiz") ||
    v.includes("nao localiz") ||
    v.includes("intimação") ||
    v.includes("intimacao")
  );
}

/** Legacy: used only if semContato column is still mapped (backward compat) */
function isSemContato(value: string): boolean {
  if (!value) return false;
  const v = value.toLowerCase().trim();
  return (
    v === "s" || v === "sim" || v === "yes" || v === "1" || v === "true" ||
    isPhoneSemContato(v)
  );
}

// ─────────────────────────────────────────────
// Auto-detect column mapping
// ─────────────────────────────────────────────

const NOME_PATTERNS = [
  /devedor/i, /nome/i, /cliente/i, /sacado/i, /razao.?social/i, /raz.o.?social/i,
];
const DOC_PATTERNS = [
  /cpf.?cnpj/i, /cnpj.?cpf/i, /cpf/i, /cnpj/i, /documento/i, /doc/i,
];
const PHONE_PATTERNS = [
  [/telefone.?0?1/i, /tel.?0?1/i, /fone.?0?1/i, /phone.?1/i],
  [/telefone.?0?2/i, /tel.?0?2/i, /fone.?0?2/i, /phone.?2/i],
  [/telefone.?0?3/i, /tel.?0?3/i, /fone.?0?3/i, /phone.?3/i],
  [/telefone.?0?4/i, /tel.?0?4/i, /fone.?0?4/i, /phone.?4/i],
];
const SEM_CONTATO_PATTERNS = [
  /sem.?contato/i, /s.?contato/i, /sem_contato/i, /protocolo.?intimado/i,
  /intimado/i, /sem.?fone/i, /bloqueado/i,
];

function scoreHeader(header: string, patterns: RegExp[]): number {
  for (let i = 0; i < patterns.length; i++) {
    if (patterns[i].test(header)) return 100 - i * 10;
  }
  return 0;
}

export function detectColumns(headers: string[], rows: Record<string, string>[]): ColSuggestion[] {
  const suggestions: ColSuggestion[] = [];
  const used = new Set<string>();

  function best(patterns: RegExp[]): { column: string | null; confidence: number } {
    let bestCol: string | null = null;
    let bestScore = 0;
    for (const h of headers) {
      if (used.has(h)) continue;
      const score = scoreHeader(h, patterns);
      if (score > bestScore) {
        bestScore = score;
        bestCol = h;
      }
    }
    return { column: bestCol, confidence: bestScore };
  }

  // Nome
  const nome = best(NOME_PATTERNS);
  if (nome.column) used.add(nome.column);
  suggestions.push({ field: "nome", ...nome });

  // Documento
  const doc = best(DOC_PATTERNS);
  if (doc.column) used.add(doc.column);
  suggestions.push({ field: "documento", ...doc });

  // Telefones 1-4
  for (let i = 0; i < 4; i++) {
    const tel = best(PHONE_PATTERNS[i]);
    if (tel.column) used.add(tel.column);
    suggestions.push({ field: `telefone${i + 1}` as keyof ColMapping, ...tel });
  }

  // semContato column detection removed — "Sem contato" is now detected directly in phone cells
  suggestions.push({ field: "semContato", column: null, confidence: 0 });

  return suggestions;
}

// ─────────────────────────────────────────────
// Parse uploaded file
// ─────────────────────────────────────────────

export function parseFile(buffer: Buffer, mimetype: string, originalname: string): ParsedFile {
  let rows: Record<string, string>[] = [];
  let headers: string[] = [];

  const isXlsx =
    mimetype.includes("spreadsheet") ||
    mimetype.includes("excel") ||
    originalname.endsWith(".xlsx") ||
    originalname.endsWith(".xls");

  if (isXlsx) {
    const wb = XLSX.read(buffer, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
    if (data.length > 0) {
      headers = Object.keys(data[0]);
      rows = data.map((r) =>
        Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v ?? "")]))
      );
    }
  } else {
    // CSV: detect delimiter
    const text = buffer.toString("utf-8");
    const firstLine = text.split("\n")[0] || "";
    const delimiter = firstLine.includes(";") ? ";" : ",";

    const lines = text.split("\n").filter((l) => l.trim());
    if (lines.length === 0) return { headers: [], rows: [], suggestions: [] };

    headers = lines[0].split(delimiter).map((h) => h.trim().replace(/^"|"$/g, ""));

    for (let i = 1; i < lines.length; i++) {
      const cells = splitCsvLine(lines[i], delimiter);
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => {
        row[h] = (cells[idx] ?? "").trim().replace(/^"|"$/g, "");
      });
      rows.push(row);
    }
  }

  const suggestions = detectColumns(headers, rows);
  return { headers, rows, suggestions };
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

// ─────────────────────────────────────────────
// Shared: detect protocol column index from headers
// Patterns: Protocolo, Num Protocolo, Número Protocolo, Protocol, etc.
// ─────────────────────────────────────────────

const PROTOCOLO_PATTERNS = [
  /^protocolo$/i,
  /^n[uú]mero.?t[ií]tulo$/i,
  /^n[uú]m.?protocolo$/i,
  /protocolo/i,
  /^protocol$/i,
];

function findProtocoloIndex(headers: string[]): number {
  for (const pat of PROTOCOLO_PATTERNS) {
    const idx = headers.findIndex((h) => pat.test(h));
    if (idx !== -1) return idx;
  }
  return -1; // not found
}

// ─────────────────────────────────────────────
// Generate LIGACAO / SMS CSV (shared structure)
// Rules:
//   - Separator: semicolon (;)
//   - First row: original header names (unchanged)
//   - Col A (index 0): nome do devedor
//   - Col B (index 1): protocolo (auto-detected from headers)
//   - Col AD (index 29): telefone limpo (1 per row)
//   - All other original columns preserved in their original positions
//   - LIGACAO only: all commas stripped from every cell value
//   - SMS: identical structure, commas kept
// ─────────────────────────────────────────────

/**
 * Apply column reordering to a cells/headers array:
 *   - nomeIdx → index 0 (col A)
 *   - protocoloIdx → index 1 (col B)
 * Both swaps are done independently; if either is already in place, no swap.
 */
function applyColumnOrder(
  cells: string[],
  nomeIdx: number,
  protocoloIdx: number
): void {
  // Step 1: move nome to col A (index 0)
  if (nomeIdx > 0) {
    const tmp = cells[nomeIdx];
    cells[nomeIdx] = cells[0];
    cells[0] = tmp;
    // If protocolo was at index 0, it just moved to nomeIdx
    if (protocoloIdx === 0) {
      // protocoloIdx effectively moved to nomeIdx after the swap
      // We'll handle this in step 2 by recalculating
    }
  }

  // Recalculate where protocolo ended up after step 1
  // If protocolo was at index 0 and nome was at nomeIdx, they swapped
  let effectiveProtIdx = protocoloIdx;
  if (nomeIdx > 0 && protocoloIdx === 0) {
    effectiveProtIdx = nomeIdx; // protocolo moved to where nome was
  }

  // Step 2: move protocolo to col B (index 1)
  if (effectiveProtIdx > 1) {
    const tmp = cells[effectiveProtIdx];
    cells[effectiveProtIdx] = cells[1];
    cells[1] = tmp;
  }
}

function buildDataRow(
  originalRow: Record<string, string>,
  headers: string[],
  nomeCol: string | null,
  protocoloIdx: number,
  telefone: string,
  removeCommas: boolean
): string[] {
  // Build cells from original row preserving column order
  const cells = headers.map((h) => {
    let v = originalRow[h] ?? "";
    if (removeCommas) v = v.replace(/,/g, " ").trim();
    return v;
  });

  // Ensure at least 30 columns (A=0 ... AD=29)
  while (cells.length < 30) cells.push("");

  // Find nome column index in headers
  const nomeIdx = nomeCol ? headers.indexOf(nomeCol) : -1;

  // Apply nome → col A, protocolo → col B reordering
  applyColumnOrder(cells, nomeIdx >= 0 ? nomeIdx : 0, protocoloIdx);

  // Col AD (index 29) = telefone limpo
  cells[29] = telefone;

  return cells;
}

function buildHeaderRow(
  headers: string[],
  nomeCol: string | null,
  protocoloIdx: number
): string[] {
  // Build header row applying the same column reordering as data rows
  const h = [...headers];
  while (h.length < 30) h.push("");

  const nomeIdx = nomeCol ? headers.indexOf(nomeCol) : -1;
  applyColumnOrder(h, nomeIdx >= 0 ? nomeIdx : 0, protocoloIdx);

  // Col AD (index 29) always holds the phone — label it clearly
  h[29] = "TELEFONE";

  return h;
}

function serializeRow(cells: string[], removeCommas: boolean): string {
  return cells.map((cell) => {
    let v = cell;
    if (removeCommas) v = v.replace(/,/g, " ").trim();
    // Quote cells that contain semicolons, newlines, or double-quotes
    if (v.includes(";") || v.includes("\n") || v.includes('"')) {
      return '"' + v.replace(/"/g, '""') + '"';
    }
    return v;
  }).join(";");
}

function generateLigacaoCsv(
  entries: LigacaoEntry[],
  headers: string[],
  nomeCol: string | null
): Buffer {
  const protocoloIdx = findProtocoloIndex(headers);
  const headerRow = buildHeaderRow(headers, nomeCol, protocoloIdx);
  const dataRows = entries.map(({ originalRow, telefone, protocolosMerged }) => {
    const row = buildDataRow(originalRow, headers, nomeCol, protocoloIdx, telefone, true);
    // Override col B (index 1) with the merged protocols string (commas already removed)
    if (protocoloIdx !== -1 && protocolosMerged) {
      row[1] = protocolosMerged.replace(/,/g, " ");
    }
    return row;
  });
  const lines = [
    serializeRow(headerRow, false),
    ...dataRows.map((r) => serializeRow(r, false)),
  ];
  return Buffer.from(lines.join("\r\n"), "utf-8");
}

/**
 * Deduplicate LIGACAO entries by phone number.
 * If the same phone appears in multiple rows (different protocols/debtors),
 * keep only ONE row and concatenate all protocols with "/" in col B.
 * The first occurrence's originalRow is used as the base row for all other columns.
 */
function deduplicateLigacaoEntries(
  entries: Array<{ originalRow: Record<string, string>; telefone: string }>,
  headers: string[]
): LigacaoEntry[] {
  const protocoloIdx = findProtocoloIndex(headers);
  const protocoloCol = protocoloIdx >= 0 ? headers[protocoloIdx] : null;

  // Map: phone → { firstRow, protocols[] }
  const phoneMap = new Map<string, { originalRow: Record<string, string>; protocols: string[] }>();

  for (const { originalRow, telefone } of entries) {
    const proto = protocoloCol ? (originalRow[protocoloCol] ?? "").trim() : "";
    if (phoneMap.has(telefone)) {
      const existing = phoneMap.get(telefone)!;
      // Only add protocol if not already present
      if (proto && !existing.protocols.includes(proto)) {
        existing.protocols.push(proto);
      }
    } else {
      phoneMap.set(telefone, {
        originalRow,
        protocols: proto ? [proto] : [],
      });
    }
  }

  return Array.from(phoneMap.entries()).map(([telefone, { originalRow, protocols }]) => ({
    originalRow,
    telefone,
    protocolosMerged: protocols.join(" / "),
  }));
}

// ─────────────────────────────────────────────
// Generate SMS CSV
//   - Same structure as ligacao (col A=nome, col B=protocolo)
//   - Phone goes to col U (index 20) instead of col AD
//   - Commas kept in all cells
// ─────────────────────────────────────────────

const SMS_PHONE_COL = 20; // col U (0-indexed)

function buildSmsDataRow(
  originalRow: Record<string, string>,
  headers: string[],
  nomeCol: string | null,
  protocoloIdx: number,
  telefone: string
): string[] {
  // Build cells from original row (commas kept)
  const cells = headers.map((h) => originalRow[h] ?? "");

  // Ensure at least SMS_PHONE_COL+1 columns
  while (cells.length <= SMS_PHONE_COL) cells.push("");

  // Find nome column index in headers
  const nomeIdx = nomeCol ? headers.indexOf(nomeCol) : -1;

  // Apply nome → col A, protocolo → col B reordering
  applyColumnOrder(cells, nomeIdx >= 0 ? nomeIdx : 0, protocoloIdx);

  // Col U (index 20) = telefone limpo
  cells[SMS_PHONE_COL] = telefone;

  return cells;
}

function buildSmsHeaderRow(
  headers: string[],
  nomeCol: string | null,
  protocoloIdx: number
): string[] {
  const h = [...headers];
  while (h.length <= SMS_PHONE_COL) h.push("");

  const nomeIdx = nomeCol ? headers.indexOf(nomeCol) : -1;
  applyColumnOrder(h, nomeIdx >= 0 ? nomeIdx : 0, protocoloIdx);

  // Col U (index 20) = TELEFONE label
  h[SMS_PHONE_COL] = "TELEFONE";

  return h;
}

function generateSmsCsv(
  entries: Array<{ originalRow: Record<string, string>; telefone: string }>,
  headers: string[],
  nomeCol: string | null
): Buffer {
  const protocoloIdx = findProtocoloIndex(headers);
  const headerRow = buildSmsHeaderRow(headers, nomeCol, protocoloIdx);
  const dataRows = entries.map(({ originalRow, telefone }) =>
    buildSmsDataRow(originalRow, headers, nomeCol, protocoloIdx, telefone)
  );
  const lines = [
    serializeRow(headerRow, false),
    ...dataRows.map((r) => serializeRow(r, false)),
  ];
  return Buffer.from(lines.join("\r\n"), "utf-8");
}

// ─────────────────────────────────────────────
// Main processing function
// ─────────────────────────────────────────────

export function processData(rows: Record<string, string>[], mapping: ColMapping, headers: string[] = []): ProcessResult {
  const phoneFields: Array<{ field: keyof ColMapping; label: string }> = [
    { field: "telefone1", label: "TELEFONE 1" },
    { field: "telefone2", label: "TELEFONE 2" },
    { field: "telefone3", label: "TELEFONE 3" },
    { field: "telefone4", label: "TELEFONE 4" },
  ];

  let totalRegistros = rows.length;
  let totalComContato = 0;
  let totalSemContato = 0;
  let totalCpf = 0;
  let totalCnpj = 0;
  let totalInvalidos = 0;
  let totalLinhasGeradas = 0;

  const cpfLigacaoEntriesRaw: Array<{ originalRow: Record<string, string>; telefone: string }> = [];
  const cpfSmsEntries: Array<{ originalRow: Record<string, string>; telefone: string }> = [];
  const cnpjLigacaoEntriesRaw: Array<{ originalRow: Record<string, string>; telefone: string }> = [];
  const cnpjSmsEntries: Array<{ originalRow: Record<string, string>; telefone: string }> = [];
  const expandedRecords: ExpandedRecord[] = [];

  for (const row of rows) {
    const nome = mapping.nome ? (row[mapping.nome] ?? "").trim() : "";
    const docRaw = mapping.documento ? (row[mapping.documento] ?? "").trim() : "";
    // Legacy: skip if a dedicated semContato column is mapped and flagged
    const semContatoVal = mapping.semContato ? (row[mapping.semContato] ?? "").trim() : "";
    if (semContatoVal && isSemContato(semContatoVal)) {
      totalSemContato++;
      continue;
    }

    // Collect valid phones — skip cells that contain "Sem contato" text
    const validPhones: Array<{ phone: string; label: string }> = [];
    for (const { field, label } of phoneFields) {
      const col = mapping[field];
      if (!col) continue;
      const raw = (row[col] ?? "").trim();
      // If the cell says "Sem contato" or similar, skip this phone slot
      if (isPhoneSemContato(raw)) continue;
      const clean = cleanPhone(raw);
      if (isValidPhone(clean)) {
        validPhones.push({ phone: clean, label });
      }
    }

    if (validPhones.length === 0) {
      totalSemContato++;
      continue;
    }

    totalComContato++;

    const docType = classifyDocument(docRaw);
    const docClean = cleanDocument(docRaw);

    if (docType === "CPF") totalCpf++;
    else if (docType === "CNPJ") totalCnpj++;
    else totalInvalidos++;

    // Detect protocolo for search records
    const protocoloIdx = findProtocoloIndex(headers);
    const protocoloCol = protocoloIdx >= 0 ? headers[protocoloIdx] : null;
    const protocoloVal = protocoloCol ? (row[protocoloCol] ?? "").trim() : "";

    // Expand one row per phone
    for (const { phone, label } of validPhones) {
      totalLinhasGeradas++;

      if (docType === "CPF") {
        cpfLigacaoEntriesRaw.push({ originalRow: row, telefone: phone });
        cpfSmsEntries.push({ originalRow: row, telefone: phone });
      } else if (docType === "CNPJ") {
        cnpjLigacaoEntriesRaw.push({ originalRow: row, telefone: phone });
        cnpjSmsEntries.push({ originalRow: row, telefone: phone });
      } else {
        // Invalid doc: still add to CPF bucket (by convention) if phone exists
        cpfLigacaoEntriesRaw.push({ originalRow: row, telefone: phone });
        cpfSmsEntries.push({ originalRow: row, telefone: phone });
      }

      // Store for search module (ligacao)
      expandedRecords.push({
        nome,
        documento: docClean,
        tipoDoc: docType,
        telefone: phone,
        origemTelefone: label,
        tipoDisparo: "ligacao",
        protocolo: protocoloVal,
      });
      // Store for search module (sms)
      expandedRecords.push({
        nome,
        documento: docClean,
        tipoDoc: docType,
        telefone: phone,
        origemTelefone: label,
        tipoDisparo: "sms",
        protocolo: protocoloVal,
      });
    }
  }

  // Deduplicate LIGACAO entries: same phone number → one row, protocols merged with " / "
  const cpfLigacaoEntries = deduplicateLigacaoEntries(cpfLigacaoEntriesRaw, headers);
  const cnpjLigacaoEntries = deduplicateLigacaoEntries(cnpjLigacaoEntriesRaw, headers);

  const cpfLigacaoCsv = generateLigacaoCsv(cpfLigacaoEntries, headers, mapping.nome);
  const cpfSmsCsv = generateSmsCsv(cpfSmsEntries, headers, mapping.nome);
  const cnpjLigacaoCsv = generateLigacaoCsv(cnpjLigacaoEntries, headers, mapping.nome);
  const cnpjSmsCsv = generateSmsCsv(cnpjSmsEntries, headers, mapping.nome);

  // Preview (first 50 rows) — show nome, telefone and merged protocols
  const previewCpfLigacao = cpfLigacaoEntries.slice(0, 50).map((e) => ({
    NOME: mapping.nome ? (e.originalRow[mapping.nome] ?? "") : "",
    TELEFONE: e.telefone,
    PROTOCOLOS: e.protocolosMerged,
  }));
  const previewCpfSms = cpfSmsEntries.slice(0, 50).map((e) => ({
    NOME: mapping.nome ? (e.originalRow[mapping.nome] ?? "") : "",
    TELEFONE: e.telefone,
  }));
  const previewCnpjLigacao = cnpjLigacaoEntries.slice(0, 50).map((e) => ({
    NOME: mapping.nome ? (e.originalRow[mapping.nome] ?? "") : "",
    TELEFONE: e.telefone,
    PROTOCOLOS: e.protocolosMerged,
  }));
  const previewCnpjSms = cnpjSmsEntries.slice(0, 50).map((e) => ({
    NOME: mapping.nome ? (e.originalRow[mapping.nome] ?? "") : "",
    TELEFONE: e.telefone,
  }));

  return {
    totalRegistros,
    totalComContato,
    totalSemContato,
    totalCpf,
    totalCnpj,
    totalInvalidos,
    totalLinhasGeradas,
    cpfLigacaoCsv,
    cpfSmsCsv,
    cnpjLigacaoCsv,
    cnpjSmsCsv,
    previewCpfLigacao,
    previewCpfSms,
    previewCnpjLigacao,
    previewCnpjSms,
    expandedRecords,
  };
}
