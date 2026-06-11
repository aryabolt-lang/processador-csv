import express from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { getDb } from "./db";
import { protocolos, configMensagemWhatsapp } from "../drizzle/schema";
import { eq, like, or, and, inArray, sql } from "drizzle-orm";
import { syncContatos } from "./syncContatos";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cleanDigits(v: string | null | undefined): string {
  if (!v) return "";
  return String(v).replace(/\D/g, "");
}

function classifyDoc(digits: string): "CPF" | "CNPJ" | "INVALIDO" {
  if (digits.length === 11) return "CPF";
  if (digits.length === 14) return "CNPJ";
  return "INVALIDO";
}

function formatDoc(digits: string): string {
  if (digits.length === 11) return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (digits.length === 14) return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return digits;
}

function cleanPhone(v: string | null | undefined): string {
  if (!v) return "";
  const d = String(v).replace(/\D/g, "");
  if (d.toLowerCase() === "sem contato" || d.length < 8) return "";
  return d;
}

/** Parse a date string like '6/3/26', '03/06/2025', '2025-06-03' into a YYYY-MM-DD string */
function parseDateStr(raw: string): string | null {
  if (!raw) return null;
  // Try ISO format first
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  // Try DD/MM/YYYY or MM/DD/YY or M/D/YY (XLSX exports dates as M/D/YY)
  const parts = raw.split(/[\/\-]/);
  if (parts.length === 3) {
    let [a, b, c] = parts.map(Number);
    // If year is 2-digit, assume 2000+
    if (c < 100) c += 2000;
    // XLSX uses M/D/YY format: month/day/year
    if (c > 31) {
      return `${c}-${String(a).padStart(2, "0")}-${String(b).padStart(2, "0")}`;
    }
    // DD/MM/YYYY
    return `${c}-${String(b).padStart(2, "0")}-${String(a).padStart(2, "0")}`;
  }
  return null;
}

/** Auto-detect column mapping from headers */
function detectColumns(headers: string[]) {
  const h = headers.map((x) => x.toLowerCase().trim());
  // Normalize: remove accents for comparison
  const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const hn = h.map(norm);
  const find = (...patterns: string[]) => {
    for (const p of patterns) {
      const pn = norm(p);
      // Exact match first
      let idx = hn.findIndex((x) => x === pn);
      if (idx !== -1) return headers[idx];
      // Then partial match
      idx = hn.findIndex((x) => x.includes(pn));
      if (idx !== -1) return headers[idx];
    }
    return null;
  };
  return {
    protocoloCol: find("protocolo"),
    nomeCol: find("devedor", "nome"),
    documentoCol: find("cpf/cnpj devedor", "cpf/cnpj", "cpf", "cnpj", "documento"),
    // Prefer the exact column names used in DILIGENCIAS exports
    numeroTituloCol: find(
      "numero_do_titulo",
      "número título",
      "numero titulo",
      "número do título",
      "numero do titulo",
      "nosso número",
      "nosso numero",
      "título",
      "titulo"
    ),
    credorCol: find("nome_do_credor", "credor", "cedente"),
    docCredorCol: find("cpf/cnpj_do_credor", "cpf/cnpj credor", "cnpj credor", "doc credor"),
    telefoneCol: find("telefone 01", "telefone devedor", "telefone 1", "telefone1", "celular"),
    valorCol: find("valor_total", "valor protesto", "valor"),
  };
}

// ─── Parse endpoint ────────────────────────────────────────────────────────────

router.post("/parse", upload.single("file"), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Arquivo não enviado." });
    const wb = XLSX.read(req.file.buffer, { type: "buffer", codepage: 65001 });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: "" });
    if (rows.length === 0) return res.status(400).json({ error: "Planilha vazia." });
    const headers = Object.keys(rows[0]);
    const suggestions = detectColumns(headers);
    res.json({
      headers,
      suggestions,
      totalRows: rows.length,
      previewRows: rows.slice(0, 5),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Erro ao ler arquivo." });
  }
});

// ─── Import endpoint ───────────────────────────────────────────────────────────

router.post("/import", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Arquivo não enviado." });
    const mapping = JSON.parse(req.body.mapping || "{}");
    const wb = XLSX.read(req.file.buffer, { type: "buffer", codepage: 65001 });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: "" });
    if (rows.length === 0) return res.status(400).json({ error: "Planilha vazia." });

    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Banco de dados não disponível." });
    const nomeArquivo = req.file.originalname;

    const toInsert: (typeof protocolos.$inferInsert)[] = [];

    // Auto-detect Situacao Atual column if not in mapping
    const situacaoColAuto = (() => {
      const norm = (s: string) => s.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const h = Object.keys(rows[0]);
      return h.find((col) =>
        norm(col).includes("situacao atual") ||
        norm(col) === "situacao" ||
        norm(col) === "situacao pesquisada"
      ) || null;
    })();

    // Auto-detect Data Protocolo column
    const dataProtocoloColAuto = (() => {
      const norm = (s: string) => s.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const h = Object.keys(rows[0]);
      return h.find((col) => {
        const n = norm(col);
        return n === "data protocolo" || n === "data_protocolo" || n === "dataprotocolo" || n.includes("data prot");
      }) || null;
    })();

    for (const row of rows) {
      const protocoloVal = String(row[mapping.protocoloCol] || "").trim();
      if (!protocoloVal) continue;

      const docRaw = cleanDigits(row[mapping.documentoCol]);
      const tipoDoc = classifyDoc(docRaw);
      const telefoneClean = cleanPhone(row[mapping.telefoneCol]);

      // Process situacao if column detected
      const situacaoRaw = situacaoColAuto ? String(row[situacaoColAuto] || "").trim().toUpperCase() : null;
      const encerrado = situacaoRaw ? isSituacaoEncerrada(situacaoRaw) : false;
      const isEdital = situacaoRaw === "EDITAL";

      const dataProtocoloRaw = dataProtocoloColAuto ? String(row[dataProtocoloColAuto] || "").trim() : "";
      const dataProtocoloParsed = parseDateStr(dataProtocoloRaw);

      toInsert.push({
        protocolo: protocoloVal,
        nomeDevedor: String(row[mapping.nomeCol] || "").trim() || null,
        documento: docRaw || null,
        tipoDoc,
        numeroTitulo: String(row[mapping.numeroTituloCol] || "").trim() || null,
        credor: String(row[mapping.credorCol] || "").trim() || null,
        docCredor: cleanDigits(row[mapping.docCredorCol]) || null,
        telefone: telefoneClean || null,
        valorProtesto: String(row[mapping.valorCol] || "").trim() || null,
        nomeArquivo,
        dataProtocolo: dataProtocoloParsed as any,
        situacaoTitulo: situacaoRaw || null,
        tituloEncerrado: encerrado ? 1 : 0,
        statusIntimacao: isEdital ? "intimado" : "pendente",
        canalIntimacao: isEdital ? "Edital" : null,
        intimadoEm: isEdital ? new Date() : null,
      });
    }

    // Batch upsert in chunks of 500
    // Unique key is (protocolo, documento) — same protocol+debtor is merged, new debtors are inserted
    let imported = 0;
    const CHUNK = 500;
    for (let i = 0; i < toInsert.length; i += CHUNK) {
      const chunk = toInsert.slice(i, i + CHUNK);
      await db.insert(protocolos).values(chunk).onDuplicateKeyUpdate({
        set: {
          nomeDevedor: sql`IF(nomeDevedor IS NULL OR nomeDevedor = '', VALUES(nomeDevedor), nomeDevedor)`,
          tipoDoc: sql`IF(tipoDoc = 'INVALIDO', VALUES(tipoDoc), tipoDoc)`,
          numeroTitulo: sql`IF(numeroTitulo IS NULL OR numeroTitulo = '', VALUES(numeroTitulo), numeroTitulo)`,
          credor: sql`IF(credor IS NULL OR credor = '', VALUES(credor), credor)`,
          docCredor: sql`IF(docCredor IS NULL OR docCredor = '', VALUES(docCredor), docCredor)`,
          telefone: sql`IF(telefone IS NULL OR telefone = '', VALUES(telefone), telefone)`,
          valorProtesto: sql`IF(valorProtesto IS NULL OR valorProtesto = '', VALUES(valorProtesto), valorProtesto)`,
          nomeArquivo: sql`VALUES(nomeArquivo)`,
        },
      });
      imported += chunk.length;
    }

    // Sync contacts from imported protocols
    const contactsToSync = toInsert
      .filter((p) => p.documento && p.tipoDoc !== "INVALIDO")
      .map((p) => ({
        documento: p.documento!,
        tipoDoc: p.tipoDoc as "CPF" | "CNPJ" | "INVALIDO",
        nomeRazaoSocial: p.nomeDevedor || undefined,
        celular1: p.telefone || undefined,
        origemArquivo: nomeArquivo,
      }));

    let contatosSynced = { total: 0, upserted: 0, skipped: 0 };
    if (contactsToSync.length > 0) {
      contatosSynced = await syncContatos(contactsToSync, nomeArquivo);
    }

    res.json({
      success: true,
      total: rows.length,
      imported,
      contatosSynced,
    });
  } catch (err: any) {
    console.error("[protocolos/import]", err);
    res.status(500).json({ error: err.message || "Erro ao importar protocolos." });
  }
});

// ─── Enrich endpoint ─────────────────────────────────────────────────────────────
/**
 * POST /api/protocolos/enriquecer
 * Reads a CSV/XLSX file and enriches existing records in the database.
 * Identifies records by (protocolo, documento) composite key.
 * Only fills in fields that are currently NULL or empty — never overwrites existing data.
 * Fields enriched: nomeDevedor, numeroTitulo, credor, docCredor, telefone,
 *                  valorProtesto, dataProtocolo, situacaoTitulo, tituloEncerrado
 */
router.post("/enriquecer", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Arquivo não enviado." });
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Banco de dados não disponível." });

    const wb = XLSX.read(req.file.buffer, { type: "buffer", codepage: 65001 });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: "" });
    if (rawRows.length === 0) return res.status(400).json({ error: "Planilha vazia." });

    const headers = Object.keys(rawRows[0]);
    const norm = (s: string) => s.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const hn = headers.map(norm);
    const findCol = (...patterns: string[]) => {
      for (const p of patterns) {
        const pn = norm(p);
        let idx = hn.findIndex((x) => x === pn);
        if (idx !== -1) return headers[idx];
        idx = hn.findIndex((x) => x.includes(pn));
        if (idx !== -1) return headers[idx];
      }
      return null;
    };

    // Auto-detect columns from this CSV format
    const cols = {
      protocolo:    findCol("protocolo"),
      dataProtocolo: findCol("data protocolo", "data_protocolo"),
      numeroTitulo: findCol("numero titulo", "número título", "numero do titulo", "número do título", "nosso numero"),
      devedor:      findCol("devedor", "nome devedor", "nome"),
      docDevedor:   findCol("cpf/cnpj devedor", "cpf/cnpj", "documento devedor", "cpf", "cnpj"),
      telefone:     findCol("telefone devedor", "telefone 01", "telefone1", "telefone"),
      credor:       findCol("credor", "nome credor", "cedente"),
      docCredor:    findCol("cpf/cnpj credor", "cnpj credor", "doc credor"),
      valor:        findCol("valor protesto", "valor total", "valor"),
      situacao:     findCol("situacao", "situação", "situacao atual"),
    };

    if (!cols.protocolo) return res.status(400).json({ error: "Coluna 'Protocolo' não encontrada no arquivo." });
    if (!cols.docDevedor) return res.status(400).json({ error: "Coluna de CPF/CNPJ do devedor não encontrada." });

    // Build a map of (protocolo|documento) → enrichment data from the file
    type EnrichData = {
      nomeDevedor?: string;
      numeroTitulo?: string;
      credor?: string;
      docCredor?: string;
      telefone?: string;
      valorProtesto?: string;
      dataProtocolo?: string;
      situacaoTitulo?: string;
      tituloEncerrado?: number;
      statusIntimacao?: string;
      canalIntimacao?: string;
      intimadoEm?: Date;
    };
    const enrichMap = new Map<string, EnrichData>();

    for (const row of rawRows) {
      const protocoloVal = String(row[cols.protocolo!] || "").trim();
      if (!protocoloVal) continue;

      const docRaw = cleanDigits(cols.docDevedor ? row[cols.docDevedor] : "");
      if (!docRaw) continue;

      const key = `${protocoloVal}|${docRaw}`;

      const situacaoRaw = cols.situacao ? String(row[cols.situacao] || "").trim().toUpperCase() : null;
      const encerrado = situacaoRaw ? isSituacaoEncerrada(situacaoRaw) : false;
      const isEdital = situacaoRaw === "EDITAL";

      const dataProtocoloRaw = cols.dataProtocolo ? String(row[cols.dataProtocolo] || "").trim() : "";
      const dataProtocoloParsed = parseDateStr(dataProtocoloRaw);

      const entry: EnrichData = {};
      if (cols.devedor) { const v = String(row[cols.devedor] || "").trim(); if (v) entry.nomeDevedor = v; }
      if (cols.numeroTitulo) { const v = String(row[cols.numeroTitulo] || "").trim(); if (v) entry.numeroTitulo = v; }
      if (cols.credor) { const v = String(row[cols.credor] || "").trim(); if (v) entry.credor = v; }
      if (cols.docCredor) { const v = cleanDigits(row[cols.docCredor]); if (v) entry.docCredor = v; }
      if (cols.telefone) { const v = cleanPhone(row[cols.telefone]); if (v) entry.telefone = v; }
      if (cols.valor) { const v = String(row[cols.valor] || "").trim(); if (v) entry.valorProtesto = v; }
      if (dataProtocoloParsed) entry.dataProtocolo = dataProtocoloParsed;
      if (situacaoRaw) {
        entry.situacaoTitulo = situacaoRaw;
        entry.tituloEncerrado = encerrado ? 1 : 0;
        if (isEdital) {
          entry.statusIntimacao = "intimado";
          entry.canalIntimacao = "Edital";
          entry.intimadoEm = new Date();
        }
      }

      enrichMap.set(key, entry);
    }

    if (enrichMap.size === 0) return res.status(400).json({ error: "Nenhum registro válido encontrado no arquivo." });

    // Fetch existing records that match any of the (protocolo, documento) pairs
    const allKeys = Array.from(enrichMap.keys());
    const CHUNK = 500;
    let found = 0;
    let enriched = 0;
    let skipped = 0;
    let notFound = 0;

    // Process in chunks to avoid huge IN clauses
    for (let i = 0; i < allKeys.length; i += CHUNK) {
      const chunkKeys = allKeys.slice(i, i + CHUNK);
      // Extract unique protocolo values for this chunk
      const chunkProtos = Array.from(new Set(chunkKeys.map((k) => k.split("|")[0])));

      // Fetch existing rows for these protocols
      const existing = await db
        .select({
          id: protocolos.id,
          protocolo: protocolos.protocolo,
          documento: protocolos.documento,
          nomeDevedor: protocolos.nomeDevedor,
          numeroTitulo: protocolos.numeroTitulo,
          credor: protocolos.credor,
          docCredor: protocolos.docCredor,
          telefone: protocolos.telefone,
          valorProtesto: protocolos.valorProtesto,
          dataProtocolo: protocolos.dataProtocolo,
          situacaoTitulo: protocolos.situacaoTitulo,
          tituloEncerrado: protocolos.tituloEncerrado,
          statusIntimacao: protocolos.statusIntimacao,
        })
        .from(protocolos)
        .where(inArray(protocolos.protocolo, chunkProtos));

      for (const row of existing) {
        const key = `${row.protocolo}|${row.documento}`;
        const enrichData = enrichMap.get(key);
        if (!enrichData) { notFound++; continue; }
        found++;

        // Build update set: only fill fields that are null/empty in the DB
        const updateSet: Record<string, unknown> = {};

        if (enrichData.nomeDevedor && !row.nomeDevedor) updateSet.nomeDevedor = enrichData.nomeDevedor;
        if (enrichData.numeroTitulo && !row.numeroTitulo) updateSet.numeroTitulo = enrichData.numeroTitulo;
        if (enrichData.credor && !row.credor) updateSet.credor = enrichData.credor;
        if (enrichData.docCredor && !row.docCredor) updateSet.docCredor = enrichData.docCredor;
        if (enrichData.telefone && !row.telefone) updateSet.telefone = enrichData.telefone;
        if (enrichData.valorProtesto && !row.valorProtesto) updateSet.valorProtesto = enrichData.valorProtesto;
        if (enrichData.dataProtocolo && !row.dataProtocolo) updateSet.dataProtocolo = enrichData.dataProtocolo as any;
        // Situacao: always update if file has a value (more recent data wins for situacao)
        if (enrichData.situacaoTitulo) {
          updateSet.situacaoTitulo = enrichData.situacaoTitulo;
          updateSet.tituloEncerrado = enrichData.tituloEncerrado;
          // EDITAL: mark as intimado only if not already intimado
          if (enrichData.statusIntimacao === "intimado" && row.statusIntimacao !== "intimado") {
            updateSet.statusIntimacao = enrichData.statusIntimacao;
            updateSet.canalIntimacao = enrichData.canalIntimacao;
            updateSet.intimadoEm = enrichData.intimadoEm;
          }
        }

        if (Object.keys(updateSet).length === 0) { skipped++; continue; }

        await db.update(protocolos).set(updateSet as any).where(eq(protocolos.id, row.id));
        enriched++;
      }
    }

    // Count keys from file that had no match in DB
    notFound = enrichMap.size - found;

    res.json({
      success: true,
      totalNoArquivo: rawRows.length,
      registrosUnicos: enrichMap.size,
      encontrados: found,
      enriquecidos: enriched,
      semAlteracao: skipped,
      naoEncontrados: notFound,
      colunasDetectadas: cols,
    });
  } catch (err: any) {
    console.error("[protocolos/enriquecer]", err);
    res.status(500).json({ error: err.message || "Erro ao enriquecer protocolos." });
  }
});

// ─── List endpoint ─────────────────────────────────────────────────────────────

router.get("/", async (req, res) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Banco de dados não disponível." });
    const page = Math.max(1, parseInt(String(req.query.page || "1")));
    const limit = Math.min(99999, Math.max(1, parseInt(String(req.query.limit || "50"))));
    const offset = (page - 1) * limit;
    const q = String(req.query.q || "").trim();
    const status = String(req.query.status || "");
    const documento = String(req.query.documento || "").trim();
    // Advanced filters
    const orderByCol = String(req.query.orderBy || "createdAt").trim();
    const orderDir = String(req.query.orderDir || "desc").trim().toLowerCase() === "asc" ? "asc" : "desc";
    const filterCol = String(req.query.filterCol || "").trim();
    const filterVal = String(req.query.filterVal || "").trim();
    const dataInicio = String(req.query.dataInicio || "").trim();
    const dataFim = String(req.query.dataFim || "").trim();
    const competencia = String(req.query.competencia || "").trim(); // format: YYYY-MM
    const telefone = String(req.query.telefone || "").replace(/\D/g, "").trim();

    const conditions: ReturnType<typeof like>[] = [];

    if (q) {
      const likeQ = `%${q}%`;
      const qDigits = q.replace(/\D/g, "");
      const likeDigits = qDigits ? `%${qDigits}%` : null;

      // Phone normalization: strip country code (+55 or 55) and leading zeros to allow
      // partial matches regardless of how the user types the number.
      // e.g. "5563992551234" → also try "63992551234" and "992551234"
      let phoneVariants: string[] = [];
      if (qDigits && qDigits.length >= 8) {
        phoneVariants.push(`%${qDigits}%`);
        // strip country code 55
        if (qDigits.startsWith("55") && qDigits.length > 10) {
          const withoutCountry = qDigits.slice(2);
          phoneVariants.push(`%${withoutCountry}%`);
          // strip DDD (2 digits) after country code
          if (withoutCountry.length >= 9) {
            phoneVariants.push(`%${withoutCountry.slice(2)}%`);
          }
        }
        // strip leading DDD if no country code (e.g. "63992551234" → "992551234")
        if (qDigits.length >= 10 && !qDigits.startsWith("55")) {
          phoneVariants.push(`%${qDigits.slice(2)}%`);
        }
      }
      // deduplicate
      phoneVariants = Array.from(new Set(phoneVariants));

      conditions.push(
        or(
          like(protocolos.protocolo, likeQ),
          like(protocolos.nomeDevedor, likeQ),
          like(protocolos.documento, likeQ),
          ...(likeDigits ? [like(protocolos.documento, likeDigits)] : []),
          like(protocolos.numeroTitulo, likeQ),
          like(protocolos.credor, likeQ),
          like(protocolos.telefone, likeQ),
          // phone variants (normalized)
          ...phoneVariants.map(v => like(protocolos.telefone, v))
        ) as any
      );
    }

    if (documento) {
      const docDigits = cleanDigits(documento);
      conditions.push(eq(protocolos.documento, docDigits) as any);
    }

    if (status === "pendente" || status === "intimado") {
      conditions.push(eq(protocolos.statusIntimacao, status) as any);
      conditions.push(eq(protocolos.tituloEncerrado, 0) as any);
    } else if (status === "encerrado") {
      conditions.push(eq(protocolos.tituloEncerrado, 1) as any);
    } else if (status === "edital") {
      conditions.push(like(protocolos.canalIntimacao, "Edital") as any);
      conditions.push(eq(protocolos.tituloEncerrado, 0) as any);
    }

    // Column-specific filter (spreadsheet-style)
    if (filterCol && filterVal) {
      const colMap: Record<string, any> = {
        protocolo: protocolos.protocolo,
        nomeDevedor: protocolos.nomeDevedor,
        documento: protocolos.documento,
        numeroTitulo: protocolos.numeroTitulo,
        credor: protocolos.credor,
        telefone: protocolos.telefone,
        valorProtesto: protocolos.valorProtesto,
        situacaoTitulo: protocolos.situacaoTitulo,
        nomeArquivo: protocolos.nomeArquivo,
        canalIntimacao: protocolos.canalIntimacao,
      };
      if (colMap[filterCol]) {
        conditions.push(like(colMap[filterCol], `%${filterVal}%`) as any);
      }
    }

    // Date range filter on dataProtocolo
    if (dataInicio) {
      conditions.push(sql`${protocolos.dataProtocolo} >= ${dataInicio}` as any);
    }
    if (dataFim) {
      conditions.push(sql`${protocolos.dataProtocolo} <= ${dataFim}` as any);
    }

    // Competencia filter (YYYY-MM → match dataProtocolo in that month)
    if (competencia && /^\d{4}-\d{2}$/.test(competencia)) {
      conditions.push(sql`DATE_FORMAT(${protocolos.dataProtocolo}, '%Y-%m') = ${competencia}` as any);
    }

    // Phone search (digits only, partial match)
    if (telefone) {
      conditions.push(like(protocolos.telefone, `%${telefone}%`) as any);
    }

    const where = conditions.length === 0
      ? undefined
      : conditions.length === 1
        ? conditions[0]
        : and(conditions[0], conditions[1], ...conditions.slice(2));

    // Build ORDER BY
    const colOrderMap: Record<string, any> = {
      protocolo: protocolos.protocolo,
      nomeDevedor: protocolos.nomeDevedor,
      documento: protocolos.documento,
      numeroTitulo: protocolos.numeroTitulo,
      credor: protocolos.credor,
      dataProtocolo: protocolos.dataProtocolo,
      statusIntimacao: protocolos.statusIntimacao,
      situacaoTitulo: protocolos.situacaoTitulo,
      valorProtesto: protocolos.valorProtesto,
      createdAt: protocolos.createdAt,
    };
    const orderCol = colOrderMap[orderByCol] ?? protocolos.createdAt;
    const orderExpr = orderDir === "asc" ? sql`${orderCol} ASC` : sql`${orderCol} DESC`;

    const [rows, countResult] = await Promise.all([
      db.select().from(protocolos).where(where).orderBy(orderExpr as any).limit(limit).offset(offset),
      db.select({ count: sql<number>`COUNT(*)` }).from(protocolos).where(where),
    ]);

    const total = Number(countResult[0]?.count ?? 0);

    res.json({
      data: rows,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Get by documento ──────────────────────────────────────────────────────────

router.get("/por-documento/:doc", async (req, res) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Banco de dados não disponível." });
    const docDigits = cleanDigits(req.params.doc);
    if (!docDigits) return res.status(400).json({ error: "Documento inválido." });
    const rows = await db
      .select()
      .from(protocolos)
      .where(eq(protocolos.documento, docDigits))
      .orderBy(protocolos.createdAt);
    res.json({ data: rows, documento: docDigits, documentoFmt: formatDoc(docDigits) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Mark as intimated ─────────────────────────────────────────────────────────

router.patch("/marcar-intimado", async (req, res) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Banco de dados não disponível." });
    const { ids, status, canal } = req.body as { ids: number[]; status: "pendente" | "intimado"; canal?: string };
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: "IDs inválidos." });
    if (status !== "pendente" && status !== "intimado") return res.status(400).json({ error: "Status inválido." });

    await db
      .update(protocolos)
      .set({
        statusIntimacao: status,
        intimadoEm: status === "intimado" ? new Date() : null,
        canalIntimacao: status === "intimado" ? (canal || null) : null,
      })
      .where(inArray(protocolos.id, ids));

    res.json({ success: true, updated: ids.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Delete ────────────────────────────────────────────────────────────────────

router.delete("/:id", async (req, res) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Banco de dados não disponível." });
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "ID inválido." });
    await db.delete(protocolos).where(eq(protocolos.id, id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Message template ──────────────────────────────────────────────────────────

router.get("/config/mensagem", async (_req, res) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Banco de dados não disponível." });
    const rows = await db.select().from(configMensagemWhatsapp).where(eq(configMensagemWhatsapp.id, 1));
    res.json({ template: rows[0]?.template || "" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/config/mensagem", async (req, res) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Banco de dados não disponível." });
    const { template } = req.body as { template: string };
    await db
      .insert(configMensagemWhatsapp)
      .values({ id: 1, template })
      .onDuplicateKeyUpdate({ set: { template } });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Import intimados realizados ──────────────────────────────────────────────────────────────────────────────

/**
 * Intimadores pessoais a ignorar (não são devedores).
 * Comparação case-insensitive e parcial.
 */
const INTIMADORES_IGNORAR = [
  "thaiana vieira",
  "thaiana",
  "s/n",
  "wesley",
  "tadeu",
];

function isIntimadorIgnorado(nome: string): boolean {
  const lower = nome.toLowerCase().trim();
  return INTIMADORES_IGNORAR.some((ig) => lower.includes(ig));
}

/**
 * Detect which format the uploaded file is:
 * - "diligencias" → DILIGÊNCIAS-INTIMADOS.csv (PROTOCOLO, CPF_COMPLETO, NUMERO/MEIO, PESSOAL/ELETRÔNICA)
 * - "campaign"   → campaign_report.csv (PROTOCOLO, NUMERO, STATUS, CPF_COMPLETO)
 * - "pesquisar"  → PesquisarTítulos.csv (Protocolo, Devedor, Documento, Notificador, Data Notificação)
 */
function detectImportFormat(headers: string[]): "diligencias" | "campaign" | "pesquisar" | "unknown" {
  const h = headers.map((x) => x.toLowerCase().trim());
  if (h.some((x) => x.includes("pessoal") || x.includes("eletrônica"))) return "diligencias";
  if (h.some((x) => x.includes("campanha") || x.includes("status") || x.includes("cliques"))) return "campaign";
  if (h.some((x) => x.includes("notificador") || x.includes("alegação") || x.includes("alegacao"))) return "pesquisar";
  return "unknown";
}

// Batch update protocols by protocol number (used by import-intimados)
async function batchUpdateProtocolos(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  byProtocolo: Map<string, { canal: string }>
): Promise<{ processed: number; notFound: number }> {
  const allProts = Array.from(byProtocolo.keys());
  if (allProts.length === 0) return { processed: 0, notFound: 0 };

  const CHUNK = 500;
  const existingMap = new Map<string, number>();
  for (let i = 0; i < allProts.length; i += CHUNK) {
    const chunk = allProts.slice(i, i + CHUNK);
    const rows = await db
      .select({ id: protocolos.id, protocolo: protocolos.protocolo })
      .from(protocolos)
      .where(inArray(protocolos.protocolo, chunk));
    for (const r of rows) existingMap.set(r.protocolo, r.id);
  }

  const byCanalIds = new Map<string, number[]>();
  let nf = 0;
  for (const [prot, info] of Array.from(byProtocolo.entries())) {
    const id = existingMap.get(prot);
    if (!id) { nf++; continue; }
    if (!byCanalIds.has(info.canal)) byCanalIds.set(info.canal, []);
    byCanalIds.get(info.canal)!.push(id);
  }

  let proc = 0;
  const now = new Date();
  for (const [canal, ids] of Array.from(byCanalIds.entries())) {
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK);
      await db.update(protocolos).set({
        statusIntimacao: "intimado",
        canalIntimacao: canal,
        intimadoEm: now,
      }).where(inArray(protocolos.id, chunk));
      proc += chunk.length;
    }
  }
  return { processed: proc, notFound: nf };
}

router.post("/import-intimados", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Arquivo não enviado." });
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Banco de dados não disponível." });

    // Parse file
    const wb = XLSX.read(req.file.buffer, { type: "buffer", codepage: 65001 });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: "", raw: false });
    if (rawRows.length === 0) return res.status(400).json({ error: "Arquivo vazio." });

    const headers = Object.keys(rawRows[0]);
    const format = detectImportFormat(headers);

    let processed = 0;
    let skipped = 0;
    let notFound = 0;

    const dbConn = db;

    if (format === "diligencias") {
      // DILIGÊNCIAS-INTIMADOS.csv
      const protocoloKey = headers.find((h) => h.toLowerCase().includes("protocolo")) || "PROTOCOLO";
      const tipoKey = headers.find((h) => h.toLowerCase().includes("eletrônica") || h.toLowerCase().includes("pessoal")) || "PESSOAL/ELETRÔNICA";

      const byProtocolo = new Map<string, { canal: string }>();
      for (const row of rawRows) {
        const prot = String(row[protocoloKey] || "").trim();
        if (!prot) continue;
        const tipo = String(row[tipoKey] || "").trim().toLowerCase();
        let canal = "WhatsApp";
        if (tipo.includes("pessoal")) canal = "Pessoal";
        else if (tipo.includes("email") || tipo.includes("e-mail")) canal = "E-mail";
        if (!byProtocolo.has(prot)) byProtocolo.set(prot, { canal });
      }

      const r = await batchUpdateProtocolos(dbConn, byProtocolo);
      processed = r.processed;
      notFound = r.notFound;

    } else if (format === "campaign") {
      // campaign_report.csv
      const protocoloKey = headers.find((h) => h.toLowerCase().includes("protocolo")) || "PROTOCOLO";
      const statusKey = headers.find((h) => h.toLowerCase() === "status") || "STATUS";

      const byProtocolo = new Map<string, { canal: string }>();
      // Only statuses that confirm actual delivery/reading count as intimado.
      // "ENVIADO" (sent but not confirmed) and error statuses are excluded.
      const SUCCESS_STATUSES = ["CONFIRMADO", "ENTREGUE", "LIDO"];
      for (const row of rawRows) {
        const prot = String(row[protocoloKey] || "").trim();
        const status = String(row[statusKey] || "").trim().toUpperCase();
        if (!prot) continue;
        // ENVIADO/ENVIADA = sent but not confirmed delivered — skip
        if (!SUCCESS_STATUSES.includes(status)) { skipped++; continue; }
        if (!byProtocolo.has(prot)) byProtocolo.set(prot, { canal: "WhatsApp" });
      }

      const r = await batchUpdateProtocolos(dbConn, byProtocolo);
      processed = r.processed;
      notFound = r.notFound;

    } else if (format === "pesquisar") {
      // PesquisarTítulos.csv — ignora intimadores internos
      const protocoloKey = headers.find((h) => h.toLowerCase().includes("protocolo")) || "Protocolo";
      const notificadorKey = headers.find((h) => h.toLowerCase().includes("notificador")) || "Notificador";

      const byProtocolo = new Map<string, { canal: string }>();
      for (const row of rawRows) {
        const prot = String(row[protocoloKey] || "").replace(/"/g, "").trim();
        if (!prot) continue;
        const notificador = String(row[notificadorKey] || "").replace(/"/g, "").trim();
        if (isIntimadorIgnorado(notificador)) { skipped++; continue; }
        if (!byProtocolo.has(prot)) byProtocolo.set(prot, { canal: "Pessoal" });
      }

      const r = await batchUpdateProtocolos(dbConn, byProtocolo);
      processed = r.processed;
      notFound = r.notFound;

    } else {
      return res.status(400).json({ error: "Formato de arquivo não reconhecido. Envie DILIGÊNCIAS-INTIMADOS, campaign_report ou PesquisarTítulos." });
    }

    res.json({
      success: true,
      format,
      processed,
      skipped,
      notFound,
      total: rawRows.length,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Situação do Título ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Situations that definitively close a title — no more intimation needed.
 * EDITAL is NOT here: it's active but already intimated by public notice.
 */
const SITUACOES_ENCERRADAS = new Set([
  "PAGO",
  "CANCELADO",
  "CANCELADO SEM ONUS",
  "CANCELADO SEM ÔNUS",
  "DEVOLVIDO",
  "RETIRADO",
  "PROTESTADO",
]);

function isSituacaoEncerrada(situacao: string): boolean {
  const s = situacao.trim().toUpperCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return SITUACOES_ENCERRADAS.has(situacao.trim().toUpperCase()) ||
    SITUACOES_ENCERRADAS.has(s);
}

/**
 * POST /api/protocolos/importar-situacoes
 * Accepts a CSV/XLSX with at minimum: Protocolo + Situacao Atual
 * Updates situacaoTitulo and tituloEncerrado for matching protocols.
 * If EDITAL: marks as intimado via Edital (but not encerrado).
 */
router.post("/importar-situacoes", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Arquivo não enviado." });
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Banco de dados não disponível." });

    const wb = XLSX.read(req.file.buffer, { type: "buffer", codepage: 65001 });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: "", raw: false });
    if (rawRows.length === 0) return res.status(400).json({ error: "Arquivo vazio." });

    const headers = Object.keys(rawRows[0]);
    const norm = (s: string) => s.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    // Auto-detect columns
    const protocoloKey = headers.find((h) => norm(h).includes("protocolo")) || "";
    const situacaoKey = headers.find((h) =>
      norm(h).includes("situacao atual") ||
      norm(h).includes("situação atual") ||
      norm(h) === "situacao" ||
      norm(h) === "situação" ||
      norm(h).includes("status")
    ) || "";

    if (!protocoloKey) return res.status(400).json({ error: "Coluna de protocolo não encontrada." });
    if (!situacaoKey) return res.status(400).json({ error: "Coluna de situação não encontrada. Esperado: 'Situacao Atual' ou similar." });

    // Build update map: protocolo → { situacao, encerrado, edital }
    const updates = new Map<string, { situacao: string; encerrado: boolean; edital: boolean }>();
    for (const row of rawRows) {
      const prot = String(row[protocoloKey] || "").trim();
      const situacao = String(row[situacaoKey] || "").trim().toUpperCase();
      if (!prot || !situacao) continue;
      if (!updates.has(prot)) {
        updates.set(prot, {
          situacao,
          encerrado: isSituacaoEncerrada(situacao),
          edital: situacao === "EDITAL",
        });
      }
    }

    if (updates.size === 0) return res.status(400).json({ error: "Nenhum protocolo válido encontrado no arquivo." });

    // Fetch existing protocols to get their IDs
    const allProts = Array.from(updates.keys());
    const CHUNK = 500;
    const existingMap = new Map<string, number[]>(); // protocolo → [ids]
    for (let i = 0; i < allProts.length; i += CHUNK) {
      const chunk = allProts.slice(i, i + CHUNK);
      const rows = await db
        .select({ id: protocolos.id, protocolo: protocolos.protocolo })
        .from(protocolos)
        .where(inArray(protocolos.protocolo, chunk));
      for (const r of rows) {
        if (!existingMap.has(r.protocolo)) existingMap.set(r.protocolo, []);
        existingMap.get(r.protocolo)!.push(r.id);
      }
    }

    let updated = 0;
    let notFound = 0;
    let encerrados = 0;
    let editais = 0;
    const now = new Date();

    // Group updates by (situacao, encerrado, edital) for batch efficiency
    type UpdateGroup = { ids: number[]; situacao: string; encerrado: boolean; edital: boolean };
    const groups: UpdateGroup[] = [];
    for (const [prot, info] of Array.from(updates.entries())) {
      const ids = existingMap.get(prot);
      if (!ids || ids.length === 0) { notFound++; continue; }
      groups.push({ ids, ...info });
      if (info.encerrado) encerrados += ids.length;
      if (info.edital) editais += ids.length;
      updated += ids.length;
    }

    // Execute updates in chunks
    for (const group of groups) {
      for (let i = 0; i < group.ids.length; i += CHUNK) {
        const chunk = group.ids.slice(i, i + CHUNK);
        const updateSet: Record<string, unknown> = {
          situacaoTitulo: group.situacao,
          tituloEncerrado: group.encerrado ? 1 : 0,
        };
        // EDITAL: mark as intimado via Edital (only if not already intimado)
        if (group.edital) {
          updateSet.statusIntimacao = "intimado";
          updateSet.canalIntimacao = "Edital";
          updateSet.intimadoEm = now;
        }
        await db.update(protocolos).set(updateSet as any).where(inArray(protocolos.id, chunk));
      }
    }

    res.json({
      success: true,
      total: rawRows.length,
      updated,
      notFound,
      encerrados,
      editais,
      detectedColumns: { protocolo: protocoloKey, situacao: situacaoKey },
    });
  } catch (err: any) {
    console.error("[protocolos/importar-situacoes]", err);
    res.status(500).json({ error: err.message || "Erro ao importar situações." });
  }
});

/**
 * PATCH /api/protocolos/atualizar-situacao
 * Manually update the situation of one or more protocols.
 * Body: { ids: number[], situacao: string }
 */
router.patch("/atualizar-situacao", async (req, res) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Banco de dados não disponível." });
    const { ids, situacao } = req.body as { ids: number[]; situacao: string };
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: "IDs inválidos." });
    if (!situacao) return res.status(400).json({ error: "Situação inválida." });

    const situacaoUp = situacao.trim().toUpperCase();
    const encerrado = isSituacaoEncerrada(situacaoUp);
    const edital = situacaoUp === "EDITAL";
    const now = new Date();

    const updateSet: Record<string, unknown> = {
      situacaoTitulo: situacaoUp,
      tituloEncerrado: encerrado ? 1 : 0,
    };
    if (edital) {
      updateSet.statusIntimacao = "intimado";
      updateSet.canalIntimacao = "Edital";
      updateSet.intimadoEm = now;
    }

    const CHUNK = 500;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK);
      await db.update(protocolos).set(updateSet as any).where(inArray(protocolos.id, chunk));
    }

    res.json({ success: true, updated: ids.length, encerrado, edital });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Gaps / Stats ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Compute gap analysis: which integer protocol numbers are missing
 * between the min and max protocol stored in the database.
 * Only works when protocols are pure integers (which they always are).
 *
 * @param dataCorte ISO date string (YYYY-MM-DD). When provided, only protocols
 *   with dataProtocolo >= dataCorte are considered. Protocols without a date
 *   are also excluded when dataCorte is set.
 */
async function computeGaps(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  dataCorte?: string | null
) {
  // Base filter: exclude encerrados
  const baseWhere = dataCorte
    ? and(
        eq(protocolos.tituloEncerrado, 0) as any,
        sql`dataProtocolo IS NOT NULL AND dataProtocolo >= ${dataCorte}`
      )
    : (eq(protocolos.tituloEncerrado, 0) as any);

  // Exclude encerrados from gap analysis — they are intentionally absent from the sequence
  const result = await db.select({
    minProto: sql<string>`MIN(CAST(protocolo AS UNSIGNED))`,
    maxProto: sql<string>`MAX(CAST(protocolo AS UNSIGNED))`,
    total: sql<number>`COUNT(DISTINCT protocolo)`,
  }).from(protocolos).where(baseWhere);

  const row = result[0];
  if (!row || !row.minProto || !row.maxProto) {
    return { min: null, max: null, total: 0, gapsCount: 0, gaps: [] as number[] };
  }

  const minP = Number(row.minProto);
  const maxP = Number(row.maxProto);
  const total = Number(row.total);
  const expected = maxP - minP + 1;
  const gapsCount = expected - total;

  if (gapsCount <= 0) {
    return { min: minP, max: maxP, total, gapsCount: 0, gaps: [] as number[] };
  }

  // Fetch all distinct protocol numbers in range to find gaps (excluding encerrados)
  const BATCH = 10000;
  const existing = new Set<number>();
  for (let offset = 0; offset < total + gapsCount + 1; offset += BATCH) {
    const rows = await db
      .selectDistinct({ p: protocolos.protocolo })
      .from(protocolos)
      .where(baseWhere)
      .orderBy(sql`CAST(protocolo AS UNSIGNED)`)
      .limit(BATCH)
      .offset(offset);
    if (rows.length === 0) break;
    for (const r of rows) {
      const n = Number(r.p);
      if (!isNaN(n)) existing.add(n);
    }
    if (rows.length < BATCH) break;
  }

  const gaps: number[] = [];
  for (let i = minP; i <= maxP; i++) {
    if (!existing.has(i)) gaps.push(i);
  }

  return { min: minP, max: maxP, total, gapsCount: gaps.length, gaps };
}

/** GET /api/protocolos/stats — lightweight stats for the notification bell */
router.get("/stats", async (req, res) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Banco de dados não disponível." });
    const dataCorte = String(req.query.dataCorte || "").trim() || null;
    const dataInicio = String(req.query.dataInicio || "").trim() || null;
    const dataFim = String(req.query.dataFim || "").trim() || null;
    const competencia = String(req.query.competencia || "").trim() || null;
    const q = String(req.query.q || "").trim();
    const status = String(req.query.status || "").trim();
    const filterCol = String(req.query.filterCol || "").trim();
    const filterVal = String(req.query.filterVal || "").trim();
    const telefone = String(req.query.telefone || "").replace(/\D/g, "").trim();
    const { min, max, total, gapsCount } = await computeGaps(db, dataCorte);

    // Build the same WHERE conditions as the list endpoint
    const conditions: any[] = [];

    if (q) {
      const likeQ = `%${q}%`;
      const qDigits = q.replace(/\D/g, "");
      const likeDigits = qDigits ? `%${qDigits}%` : null;
      let phoneVariants: string[] = [];
      if (qDigits && qDigits.length >= 8) {
        phoneVariants.push(`%${qDigits}%`);
        if (qDigits.startsWith("55") && qDigits.length > 10) {
          const withoutCountry = qDigits.slice(2);
          phoneVariants.push(`%${withoutCountry}%`);
          if (withoutCountry.length >= 9) phoneVariants.push(`%${withoutCountry.slice(2)}%`);
        }
        if (qDigits.length >= 10 && !qDigits.startsWith("55")) {
          phoneVariants.push(`%${qDigits.slice(2)}%`);
        }
      }
      phoneVariants = Array.from(new Set(phoneVariants));
      conditions.push(or(
        like(protocolos.protocolo, likeQ),
        like(protocolos.nomeDevedor, likeQ),
        like(protocolos.documento, likeQ),
        ...(likeDigits ? [like(protocolos.documento, likeDigits)] : []),
        like(protocolos.numeroTitulo, likeQ),
        like(protocolos.credor, likeQ),
        like(protocolos.telefone, likeQ),
        ...phoneVariants.map(v => like(protocolos.telefone, v))
      ) as any);
    }

    if (status === "pendente" || status === "intimado") {
      conditions.push(eq(protocolos.statusIntimacao, status) as any);
      conditions.push(eq(protocolos.tituloEncerrado, 0) as any);
    } else if (status === "encerrado") {
      conditions.push(eq(protocolos.tituloEncerrado, 1) as any);
    } else if (status === "edital") {
      conditions.push(like(protocolos.canalIntimacao, "Edital") as any);
      conditions.push(eq(protocolos.tituloEncerrado, 0) as any);
    }

    if (filterCol && filterVal) {
      const colMap: Record<string, any> = {
        protocolo: protocolos.protocolo, nomeDevedor: protocolos.nomeDevedor,
        documento: protocolos.documento, numeroTitulo: protocolos.numeroTitulo,
        credor: protocolos.credor, telefone: protocolos.telefone,
        valorProtesto: protocolos.valorProtesto, situacaoTitulo: protocolos.situacaoTitulo,
        nomeArquivo: protocolos.nomeArquivo, canalIntimacao: protocolos.canalIntimacao,
      };
      if (colMap[filterCol]) conditions.push(like(colMap[filterCol], `%${filterVal}%`) as any);
    }

    const hasDateFilter = !!(dataInicio || dataFim || competencia);
    if (hasDateFilter) conditions.push(sql`${protocolos.dataProtocolo} IS NOT NULL` as any);
    if (dataInicio) conditions.push(sql`${protocolos.dataProtocolo} >= ${dataInicio}` as any);
    if (dataFim) conditions.push(sql`${protocolos.dataProtocolo} <= ${dataFim}` as any);
    if (competencia && /^\d{4}-\d{2}$/.test(competencia)) {
      conditions.push(sql`DATE_FORMAT(${protocolos.dataProtocolo}, '%Y-%m') = ${competencia}` as any);
    }
    if (telefone) conditions.push(like(protocolos.telefone, `%${telefone}%`) as any);

    const whereClause = conditions.length === 0 ? undefined
      : conditions.length === 1 ? conditions[0]
      : and(conditions[0], conditions[1], ...conditions.slice(2));

    const aggQuery = db.select({
      totalFiltrado: sql<number>`COUNT(*)`,
      totalPendentes: sql<number>`SUM(CASE WHEN ${protocolos.statusIntimacao} = 'pendente' AND ${protocolos.tituloEncerrado} = 0 THEN 1 ELSE 0 END)`,
      totalIntimados: sql<number>`SUM(CASE WHEN ${protocolos.statusIntimacao} = 'intimado' THEN 1 ELSE 0 END)`,
      totalEncerrados: sql<number>`SUM(CASE WHEN ${protocolos.tituloEncerrado} = 1 THEN 1 ELSE 0 END)`,
    }).from(protocolos);
    const aggResult = whereClause ? await aggQuery.where(whereClause) : await aggQuery;
    const agg = aggResult[0] || { totalFiltrado: 0, totalPendentes: 0, totalIntimados: 0, totalEncerrados: 0 };
    const hasFilter = !!(q || status || filterCol || dataInicio || dataFim || competencia || telefone);
    res.json({ min, max, total, gapsCount, totalPendentes: Number(agg.totalPendentes), totalIntimados: Number(agg.totalIntimados), totalEncerrados: Number(agg.totalEncerrados), totalFiltrado: Number(agg.totalFiltrado), hasFilter });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/protocolos/gaps — full gap list (paginated, max 5000 per call) */
router.get("/gaps", async (req, res) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Banco de dados não disponível." });
    const page = Math.max(1, parseInt(String(req.query.page || "1")));
    const limit = Math.min(5000, Math.max(1, parseInt(String(req.query.limit || "500"))));
    const dataCorte = String(req.query.dataCorte || "").trim() || null;
    const { min, max, total, gapsCount, gaps } = await computeGaps(db, dataCorte);
    const start = (page - 1) * limit;
    const pageGaps = gaps.slice(start, start + limit);
    res.json({
      min, max, total, gapsCount,
      gaps: pageGaps,
      dataCorte,
      pagination: { page, limit, total: gapsCount, pages: Math.ceil(gapsCount / limit) },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/protocolos/gaps/export — download all gaps as CSV */
router.get("/gaps/export", async (req, res) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Banco de dados não disponível." });
    const dataCorte = String(req.query.dataCorte || "").trim() || null;
    const { min, max, gapsCount, gaps } = await computeGaps(db, dataCorte);
    if (gapsCount === 0) {
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", 'attachment; filename="protocolos_faltantes.csv"');
      return res.send("\uFEFFProtocolo\nNenhum protocolo faltante no intervalo.");
    }
    const lines = ["\uFEFFProtocolo", ...gaps.map(String)];
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="protocolos_faltantes_${min}_${max}.csv"`);
    res.send(lines.join("\n"));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
