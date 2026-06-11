/**
 * emailRoutes.ts
 * Express router for the Email processing module.
 *
 * Endpoints:
 *   POST /api/email/parse     — upload file, return headers + suggestions
 *   POST /api/email/process   — upload file + mapping, return stats + S3 URLs
 *   GET  /api/email/download  — download a previously generated file by key
 */

import { Router, Request, Response } from "express";
import multer from "multer";
import archiver from "archiver";
import { parseEmailFile, processEmailData, EmailColMapping } from "./processadorEmail";
import { storagePut } from "./storage";
import { nanoid } from "nanoid";
import { syncContatos, buildContactsFromEmailRecords } from "./syncContatos";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter: (_req, file, cb) => {
    const ext = file.originalname.toLowerCase();
    const allowed = [
      "text/csv",
      "application/csv",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/plain",
    ];
    if (allowed.includes(file.mimetype) || ext.endsWith(".csv") || ext.endsWith(".xlsx") || ext.endsWith(".xls")) {
      cb(null, true);
    } else {
      cb(new Error("Formato não suportado. Use CSV ou XLSX."));
    }
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/email/parse
// Upload file → return headers, auto-detected column suggestions, preview rows
// ─────────────────────────────────────────────────────────────────────────────
router.post("/parse", upload.single("file"), async (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Nenhum arquivo enviado." });

    const result = parseEmailFile(req.file.buffer, req.file.mimetype, req.file.originalname);
    return res.json(result);
  } catch (err: any) {
    console.error("[email/parse]", err);
    return res.status(500).json({ error: err.message || "Erro ao ler arquivo." });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/email/process
// Upload file + mapping JSON → process, upload 3 CSVs to S3, return stats + URLs
// ─────────────────────────────────────────────────────────────────────────────
router.post("/process", upload.single("file"), async (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Nenhum arquivo enviado." });

    let mapping: EmailColMapping;
    try {
      mapping = JSON.parse(req.body.mapping || "{}") as EmailColMapping;
    } catch {
      return res.status(400).json({ error: "Mapeamento inválido." });
    }

    if (!mapping.emailCols || mapping.emailCols.length === 0) {
      return res.status(400).json({ error: "Nenhuma coluna de e-mail selecionada." });
    }

    const result = processEmailData(
      req.file.buffer,
      req.file.mimetype,
      req.file.originalname,
      mapping
    );

    // Upload to S3
    const id = nanoid(10);
    const [normalUpload, alertaUpload, semEmailUpload] = await Promise.all([
      storagePut(`email-exports/${id}/EMAIL_NORMAL.csv`, result.normalCsv, "text/csv"),
      storagePut(`email-exports/${id}/EMAIL_ALERTA_SPAM.csv`, result.alertaCsv, "text/csv"),
      storagePut(`email-exports/${id}/SEM_EMAIL.csv`, result.semEmailCsv, "text/csv"),
    ]);

    // ── Auto-sync contacts to internal agenda ──────────────────────────────
    let contatosSyncResult = { total: 0, upserted: 0, skipped: 0 };
    try {
      const contactRecords = buildContactsFromEmailRecords(result.emailEntries);
      contatosSyncResult = await syncContatos(contactRecords, req.file!.originalname);
    } catch (syncErr) {
      console.error("[email/process] syncContatos error:", syncErr);
    }

    return res.json({
      stats: {
        totalRows: result.totalRows,
        rowsWithEmail: result.rowsWithEmail,
        rowsWithoutEmail: result.rowsWithoutEmail,
        uniqueEmails: result.uniqueEmails,
        normalEmails: result.normalEmails,
        flaggedEmails: result.flaggedEmails,
        spamThreshold: result.spamThreshold,
      },
      contatosSynced: contatosSyncResult,
      files: {
        normal: { url: normalUpload.url, name: "EMAIL_NORMAL.csv" },
        alerta: { url: alertaUpload.url, name: "EMAIL_ALERTA_SPAM.csv" },
        semEmail: { url: semEmailUpload.url, name: "SEM_EMAIL.csv" },
      },
    });
  } catch (err: any) {
    console.error("[email/process]", err);
    return res.status(500).json({ error: err.message || "Erro ao processar arquivo." });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/email/download-zip
// Body: { files: { normal: string, alerta: string, semEmail: string } }
// Fetches the 3 S3 URLs and streams a ZIP back to the client
// ─────────────────────────────────────────────────────────────────────────────
router.post("/download-zip", async (req: Request, res: Response) => {
  try {
    const { files } = req.body as {
      files: { normal: string; alerta: string; semEmail: string };
    };

    if (!files?.normal || !files?.alerta || !files?.semEmail) {
      return res.status(400).json({ error: "URLs dos arquivos ausentes." });
    }

    const [normalBuf, alertaBuf, semEmailBuf] = await Promise.all([
      fetch(files.normal).then((r) => r.arrayBuffer()),
      fetch(files.alerta).then((r) => r.arrayBuffer()),
      fetch(files.semEmail).then((r) => r.arrayBuffer()),
    ]);

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="EMAIL_DISPAROS.zip"`);

    const archive = archiver("zip", { zlib: { level: 6 } });
    archive.pipe(res);
    archive.append(Buffer.from(normalBuf), { name: "EMAIL_NORMAL.csv" });
    archive.append(Buffer.from(alertaBuf), { name: "EMAIL_ALERTA_SPAM.csv" });
    archive.append(Buffer.from(semEmailBuf), { name: "SEM_EMAIL.csv" });
    await archive.finalize();
  } catch (err: any) {
    console.error("[email/download-zip]", err);
    if (!res.headersSent) {
      return res.status(500).json({ error: err.message });
    }
  }
});

export default router;
