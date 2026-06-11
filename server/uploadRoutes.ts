import { Router, Request, Response } from "express";
import multer from "multer";
import { parseFile, processData, detectColumns, ColMapping } from "./processador";
import { getDb } from "./db";
import { processamentos, registrosProcessados } from "../drizzle/schema";
import { eq, or, like, and, desc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { authMiddleware, AuthRequest } from "./_core/auth";
import { stringify } from "csv-stringify/sync";

const router = Router();

// Memory storage for uploads (files processed in-memory)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "text/csv",
      "application/csv",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/plain",
    ];
    const ext = file.originalname.toLowerCase();
    if (allowed.includes(file.mimetype) || ext.endsWith(".csv") || ext.endsWith(".xlsx") || ext.endsWith(".xls")) {
      cb(null, true);
    } else {
      cb(new Error("Formato de arquivo não suportado. Use CSV ou XLSX."));
    }
  },
});

// POST /api/upload/parse
// Parse file and return headers + auto-detected column suggestions
router.post("/parse", authMiddleware, upload.single("file"), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Nenhum arquivo enviado." });
    }

    const parsed = parseFile(req.file.buffer, req.file.mimetype, req.file.originalname);

    return res.json({
      headers: parsed.headers,
      suggestions: parsed.suggestions,
      totalRows: parsed.rows.length,
      previewRows: parsed.rows.slice(0, 10),
    });
  } catch (err: any) {
    console.error("[upload/parse]", err);
    return res.status(500).json({ error: err.message || "Erro ao processar arquivo." });
  }
});

// POST /api/upload/process
// Full processing: parse + apply mapping + save to DB
router.post("/process", authMiddleware, upload.single("file"), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Nenhum arquivo enviado." });
    }

    let mapping: ColMapping;
    try {
      mapping = JSON.parse(req.body.mapping || "{}");
    } catch {
      return res.status(400).json({ error: "Mapeamento de colunas inválido." });
    }

    const parsed = parseFile(req.file.buffer, req.file.mimetype, req.file.originalname);
    const result = processData(parsed.rows, mapping, parsed.headers);

    // Save to DB
    const db = await getDb();
    let processamentoId: number | null = null;
    if (db) {
      const inserted = await db.insert(processamentos).values({
        nomeArquivo: req.file.originalname,
        totalRegistros: result.totalRegistros,
        totalComContato: result.totalComContato,
        totalSemContato: result.totalSemContato,
        totalCpf: result.totalCpf,
        totalCnpj: result.totalCnpj,
        totalInvalidos: result.totalInvalidos,
        totalLinhasGeradas: result.totalLinhasGeradas,
        mapeamento: mapping as any,
        status: "concluido",
      });
      
      // Get the ID from the returned object
      const insertedRecord = Array.isArray(inserted) ? inserted[0] : inserted;
      processamentoId = (insertedRecord as any)?.id ?? null;

      // Save expanded records in batches of 500 for the search module
      if (processamentoId && result.expandedRecords.length > 0) {
        const BATCH = 500;
        for (let i = 0; i < result.expandedRecords.length; i += BATCH) {
          const batch = result.expandedRecords.slice(i, i + BATCH).map((r) => ({
            processamentoId: processamentoId as number,
            nome: r.nome || null,
            documento: r.documento || null,
            tipoDoc: r.tipoDoc,
            telefone: r.telefone || null,
            origemTelefone: r.origemTelefone || null,
            tipoDisparo: r.tipoDisparo,
            protocolo: r.protocolo || null,
            nomeArquivo: req.file!.originalname,
          }));
          await db.insert(registrosProcessados).values(batch);
        }
      }
    }

    return res.json({
      id: processamentoId,
      metrics: {
        totalRegistros: result.totalRegistros,
        totalComContato: result.totalComContato,
        totalSemContato: result.totalSemContato,
        totalCpf: result.totalCpf,
        totalCnpj: result.totalCnpj,
        totalInvalidos: result.totalInvalidos,
        totalLinhasGeradas: result.totalLinhasGeradas,
      },
      preview: {
        cpfLigacao: result.previewCpfLigacao,
        cpfSms: result.previewCpfSms,
        cnpjLigacao: result.previewCnpjLigacao,
        cnpjSms: result.previewCnpjSms,
      },
    });
  } catch (err: any) {
    console.error("[upload/process]", err);
    return res.status(500).json({ error: err.message || "Erro ao processar arquivo." });
  }
});

// POST /api/upload/download-csv
// Gerar e baixar CSV sob demanda
router.post("/download-csv", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { processamentoId, tipo } = req.body as {
      processamentoId: number;
      tipo: "cpf-ligacao" | "cpf-sms" | "cnpj-ligacao" | "cnpj-sms";
    };

    if (!processamentoId || !tipo) {
      return res.status(400).json({ error: "processamentoId e tipo são obrigatórios." });
    }

    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Banco de dados não disponível." });

    // Buscar registros do processamento
    const records = await db
      .select()
      .from(registrosProcessados)
      .where(eq(registrosProcessados.processamentoId, processamentoId));

    // Filtrar por tipo
    let filtered = records;
    if (tipo === "cpf-ligacao") {
      filtered = records.filter(r => r.tipoDoc === "CPF" && r.tipoDisparo === "ligacao");
    } else if (tipo === "cpf-sms") {
      filtered = records.filter(r => r.tipoDoc === "CPF" && r.tipoDisparo === "sms");
    } else if (tipo === "cnpj-ligacao") {
      filtered = records.filter(r => r.tipoDoc === "CNPJ" && r.tipoDisparo === "ligacao");
    } else if (tipo === "cnpj-sms") {
      filtered = records.filter(r => r.tipoDoc === "CNPJ" && r.tipoDisparo === "sms");
    }

    // Gerar CSV
    const csv = stringify(filtered, {
      header: true,
      columns: ["nome", "documento", "telefone", "protocolo"],
    });

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${tipo}.csv"`);
    return res.send(csv);
  } catch (err: any) {
    console.error("[upload/download-csv]", err);
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/upload/historico
// Return last 20 processamentos
router.get("/historico", authMiddleware, async (_req: AuthRequest, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.json([]);

    const rows = await db
      .select()
      .from(processamentos)
      .orderBy(desc(processamentos.createdAt))
      .limit(20);

    return res.json(rows);
  } catch (err: any) {
    console.error("[upload/historico]", err);
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/upload/consulta/search?q=...
// Intelligent search across all processed records
router.get("/consulta/search", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const q = ((req.query.q as string) || "").trim();
    const tipoFilter = (req.query.tipo as string) || "";
    const disparoFilter = (req.query.disparo as string) || "";

    if (!q || q.length < 2) {
      return res.json({ results: [], total: 0, query: q });
    }

    const db = await getDb();
    if (!db) return res.json({ results: [], total: 0, query: q });

    // Normalize query: strip non-digits for numeric searches
    const qDigits = q.replace(/\D/g, "");
    const isNumeric = qDigits.length > 0 && /^\d+$/.test(q.replace(/[.\-\/()\s]/g, ""));

    // Build conditions
    const conditions: any[] = [];

    if (isNumeric && qDigits.length >= 11) {
      // CPF or CNPJ exact match
      conditions.push(like(registrosProcessados.documento, `%${qDigits}%`));
    } else if (isNumeric && qDigits.length >= 8) {
      // Phone search
      conditions.push(like(registrosProcessados.telefone, `%${qDigits}%`));
    } else if (isNumeric) {
      // Short number — search both phone and doc
      conditions.push(like(registrosProcessados.telefone, `%${qDigits}%`));
      conditions.push(like(registrosProcessados.documento, `%${qDigits}%`));
    } else {
      // Text search — name
      conditions.push(like(registrosProcessados.nome, `%${q}%`));
    }

    let whereClause: any = conditions.length === 1 ? conditions[0] : or(...conditions);

    if (tipoFilter === "CPF") {
      whereClause = and(whereClause, eq(registrosProcessados.tipoDoc, "CPF"));
    } else if (tipoFilter === "CNPJ") {
      whereClause = and(whereClause, eq(registrosProcessados.tipoDoc, "CNPJ"));
    }
    if (disparoFilter === "ligacao") {
      whereClause = and(whereClause, eq(registrosProcessados.tipoDisparo, "ligacao"));
    } else if (disparoFilter === "sms") {
      whereClause = and(whereClause, eq(registrosProcessados.tipoDisparo, "sms"));
    }

    const rows = await db
      .select()
      .from(registrosProcessados)
      .where(whereClause)
      .limit(500);

    return res.json({ results: rows, total: rows.length, query: q });
  } catch (err: any) {
    console.error("[consulta/search]", err);
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/upload/consulta/pessoa/:documento
// Get all records for a specific document (CPF or CNPJ)
router.get("/consulta/pessoa/:documento", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const doc = req.params.documento.replace(/\D/g, "");
    if (!doc) return res.status(400).json({ error: "Documento inválido" });

    const db = await getDb();
    if (!db) return res.json({ records: [], doc });

    const rows = await db
      .select()
      .from(registrosProcessados)
      .where(eq(registrosProcessados.documento, doc))
      .limit(1000);

    return res.json({ records: rows, doc });
  } catch (err: any) {
    console.error("[consulta/pessoa]", err);
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/upload/consulta/export-csv?q=...
// Export search results as CSV
router.get("/consulta/export-csv", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const q = ((req.query.q as string) || "").trim();
    if (!q) return res.status(400).json({ error: "Query obrigatória" });

    const db = await getDb();
    if (!db) return res.status(503).json({ error: "Banco indisponível" });

    const qDigits = q.replace(/\D/g, "");
    const isNumeric = qDigits.length > 0 && /^\d+$/.test(q.replace(/[.\-\/()\s]/g, ""));
    let whereClause: any;
    if (isNumeric && qDigits.length >= 11) {
      whereClause = like(registrosProcessados.documento, `%${qDigits}%`);
    } else if (isNumeric && qDigits.length >= 8) {
      whereClause = like(registrosProcessados.telefone, `%${qDigits}%`);
    } else {
      whereClause = like(registrosProcessados.nome, `%${q}%`);
    }

    const rows = await db.select().from(registrosProcessados).where(whereClause).limit(5000);

    const csv = stringify(rows, {
      header: true,
      columns: ["id", "processamentoId", "nome", "documento", "tipoDoc", "telefone", "origemTelefone", "tipoDisparo", "protocolo", "nomeArquivo", "createdAt"],
    });

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="consulta_${q.slice(0, 20)}.csv"`);
    return res.send(csv);
  } catch (err: any) {
    console.error("[consulta/export-csv]", err);
    return res.status(500).json({ error: err.message });
  }
});

export default router;
