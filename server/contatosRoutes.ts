import { Router, Request, Response } from "express";
import multer from "multer";
import { parseFile } from "./processador";
import { getDb } from "./db";
import { contatos, contatosBase } from "../drizzle/schema";
import { eq, or, like, and, desc } from "drizzle-orm";
import { authMiddleware, AuthRequest } from "./_core/auth";

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

function tryCorrectDoc(digits: string): { corrected: string; tipo: "CPF" | "CNPJ"; method: string } | null {
  const len = digits.length;
  if (len === 13) {
    const corrected = digits.padStart(14, "0");
    return { corrected, tipo: "CNPJ", method: "zero à esquerda adicionado (13→14 dígitos)" };
  }
  if (len === 12) {
    const corrected = digits.padStart(14, "0");
    return { corrected, tipo: "CNPJ", method: "zeros à esquerda adicionados (12→14 dígitos)" };
  }
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
router.post("/parse", authMiddleware, upload.single("file"), async (req: AuthRequest, res: Response) => {
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

  const current = importProgressMap.get(jobId);
  if (current) {
    res.write(`data: ${JSON.stringify(current)}\n\n`);
    if (current.status === "done" || current.status === "error") {
      res.end();
      return;
    }
  }

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
      setTimeout(() => importProgressMap.delete(jobId), 60_000);
    }
  }
}

// ─── POST /api/contatos/import ───────────────────────────────────────────────
router.post("/import", authMiddleware, upload.single("file"), async (req: AuthRequest, res: Response) => {
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
          erros.push({ linha, motivo: `Documento inválido: "${docRaw}" (${docDigits.length} dígitos)` });
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

    broadcastProgress(jobId, {
      status: "running",
      totalLidos,
      totalProcessados: 0,
      totalImportados: 0,
      totalCorrigidos,
      totalErros,
      message: `${validRecords.length} registros válidos. Importando...`,
    });

    const BATCH_SIZE = 1000;

    for (let b = 0; b < validRecords.length; b += BATCH_SIZE) {
      const batch = validRecords.slice(b, b + BATCH_SIZE);

      if (duplicateMode === "ignore") {
        await db.insert(contatosBase).values(batch).onConflictDoNothing();
        totalImportados += batch.length;
      } else if (duplicateMode === "update") {
        for (const record of batch) {
          await db.insert(contatosBase).values(record).onConflictDoUpdate({
            target: contatosBase.documento,
            set: {
              nomeRazaoSocial: record.nomeRazaoSocial,
              celular1: record.celular1,
              celular2: record.celular2,
              celular3: record.celular3,
              celular4: record.celular4,
              email1: record.email1,
              email2: record.email2,
              email3: record.email3,
              updatedAt: new Date(),
            },
          });
        }
        totalImportados += batch.length;
        totalAtualizados += batch.length;
      } else {
        for (const record of batch) {
          await db.insert(contatosBase).values(record).onConflictDoNothing();
        }
        totalImportados += batch.length;
      }

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

// ─── GET /api/contatos ─────────────────────────────────────
router.get("/", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Banco de dados não disponível." });

    const allContatos = await db.select().from(contatosBase).limit(1000);
    return res.json(allContatos);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/contatos/search ──────────────────────────────────
router.get("/search", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { q } = req.query;
    if (!q || typeof q !== "string") {
      return res.status(400).json({ error: "Query parameter 'q' é obrigatório." });
    }

    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Banco de dados não disponível." });

    const results = await db
      .select()
      .from(contatosBase)
      .where(
        or(
          like(contatosBase.documento, `%${q}%`),
          like(contatosBase.nomeRazaoSocial, `%${q}%`)
        )
      )
      .limit(50);

    return res.json(results);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
