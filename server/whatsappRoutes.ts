import { Router, Request, Response } from "express";
import { getDb } from "./db";
import { whatsappTemplates } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import fetch from "node-fetch";

const router = Router();

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface TemplateColuna {
  variavel: string;   // e.g. "{{telefone}}"
  cabecalho: string;  // e.g. "Telefone"
}

/**
 * Available built-in variables for WhatsApp templates.
 * These are resolved per row when generating the CSV.
 */
export const VARIAVEIS_DISPONIVEIS: Array<{ variavel: string; descricao: string }> = [
  { variavel: "{{telefone}}",      descricao: "Número de telefone (somente dígitos)" },
  { variavel: "{{nome}}",          descricao: "Nome completo do devedor" },
  { variavel: "{{documento}}",     descricao: "CPF ou CNPJ (somente dígitos)" },
  { variavel: "{{documento_fmt}}", descricao: "CPF ou CNPJ formatado (XXX.XXX.XXX-XX)" },
  { variavel: "{{tipo_doc}}",      descricao: "Tipo do documento: CPF ou CNPJ" },
  { variavel: "{{protocolo}}",     descricao: "Número do protocolo" },
];

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function formatDocument(doc: string, tipo: "CPF" | "CNPJ" | "INVALIDO"): string {
  const d = doc.replace(/\D/g, "");
  if (tipo === "CPF" && d.length === 11) {
    return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
  }
  if (tipo === "CNPJ" && d.length === 14) {
    return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`;
  }
  return d;
}

function resolveVariavel(
  variavel: string,
  ctx: {
    telefone: string;
    nome: string;
    documento: string;
    tipoDoc: "CPF" | "CNPJ" | "INVALIDO";
    protocolo: string;
  }
): string {
  switch (variavel) {
    case "{{telefone}}":      return ctx.telefone;
    case "{{nome}}":          return ctx.nome;
    case "{{documento}}":     return ctx.documento;
    case "{{documento_fmt}}": return formatDocument(ctx.documento, ctx.tipoDoc);
    case "{{tipo_doc}}":      return ctx.tipoDoc;
    case "{{protocolo}}":     return ctx.protocolo;
    default:                  return variavel; // literal text passthrough
  }
}

function serializeCsvRow(cells: string[]): string {
  return cells.map((c) => {
    const v = String(c ?? "");
    if (v.includes(",") || v.includes('"') || v.includes("\n")) {
      return '"' + v.replace(/"/g, '""') + '"';
    }
    return v;
  }).join(",");
}

// ─────────────────────────────────────────────
// GET /api/whatsapp/variaveis
// Returns the list of available template variables
// ─────────────────────────────────────────────
router.get("/variaveis", (_req: Request, res: Response) => {
  return res.json(VARIAVEIS_DISPONIVEIS);
});

// ─────────────────────────────────────────────
// GET /api/whatsapp/templates
// List all templates
// ─────────────────────────────────────────────
router.get("/templates", async (_req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(503).json({ error: "Banco de dados indisponível." });
    const rows = await db.select().from(whatsappTemplates).orderBy(whatsappTemplates.id);
    return res.json(rows);
  } catch (err: any) {
    console.error("[whatsapp/templates GET]", err);
    return res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
// POST /api/whatsapp/templates
// Create a new template
// ─────────────────────────────────────────────
router.post("/templates", async (req: Request, res: Response) => {
  try {
    const { nome, descricao, colunas, padrao } = req.body as {
      nome: string;
      descricao?: string;
      colunas: TemplateColuna[];
      padrao?: boolean;
    };
    if (!nome || !Array.isArray(colunas) || colunas.length === 0) {
      return res.status(400).json({ error: "Nome e pelo menos uma coluna são obrigatórios." });
    }
    const db = await getDb();
    if (!db) return res.status(503).json({ error: "Banco de dados indisponível." });

    // If setting as default, clear existing default first
    if (padrao) {
      await db.update(whatsappTemplates).set({ padrao: false }).where(eq(whatsappTemplates.padrao, true));
    }

    const result = await db.insert(whatsappTemplates).values({
      nome,
      descricao: descricao || null,
      colunas: colunas as any,
      padrao: padrao ? true : false,
    });
    const id = (result as any).insertId;
    const created = await db.select().from(whatsappTemplates).where(eq(whatsappTemplates.id, id));
    return res.status(201).json(created[0]);
  } catch (err: any) {
    console.error("[whatsapp/templates POST]", err);
    return res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
// PUT /api/whatsapp/templates/:id
// Update an existing template
// ─────────────────────────────────────────────
router.put("/templates/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "ID inválido." });

    const { nome, descricao, colunas, padrao } = req.body as {
      nome?: string;
      descricao?: string;
      colunas?: TemplateColuna[];
      padrao?: boolean;
    };
    const db = await getDb();
    if (!db) return res.status(503).json({ error: "Banco de dados indisponível." });

    // If setting as default, clear existing default first
    if (padrao) {
      await db.update(whatsappTemplates).set({ padrao: false }).where(eq(whatsappTemplates.padrao, true));
    }

    const updates: Record<string, any> = {};
    if (nome !== undefined) updates.nome = nome;
    if (descricao !== undefined) updates.descricao = descricao;
    if (colunas !== undefined) updates.colunas = colunas;
    if (padrao !== undefined) updates.padrao = padrao ? true : false;

    await db.update(whatsappTemplates).set(updates).where(eq(whatsappTemplates.id, id));
    const updated = await db.select().from(whatsappTemplates).where(eq(whatsappTemplates.id, id));
    if (!updated.length) return res.status(404).json({ error: "Template não encontrado." });
    return res.json(updated[0]);
  } catch (err: any) {
    console.error("[whatsapp/templates PUT]", err);
    return res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
// DELETE /api/whatsapp/templates/:id
// Delete a template
// ─────────────────────────────────────────────
router.delete("/templates/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "ID inválido." });
    const db = await getDb();
    if (!db) return res.status(503).json({ error: "Banco de dados indisponível." });
    await db.delete(whatsappTemplates).where(eq(whatsappTemplates.id, id));
    return res.json({ ok: true });
  } catch (err: any) {
    console.error("[whatsapp/templates DELETE]", err);
    return res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
// POST /api/whatsapp/templates/:id/padrao
// Set a template as default
// ─────────────────────────────────────────────
router.post("/templates/:id/padrao", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "ID inválido." });
    const db = await getDb();
    if (!db) return res.status(503).json({ error: "Banco de dados indisponível." });
    await db.update(whatsappTemplates).set({ padrao: false }).where(eq(whatsappTemplates.padrao, true));
    await db.update(whatsappTemplates).set({ padrao: true }).where(eq(whatsappTemplates.id, id));
    return res.json({ ok: true });
  } catch (err: any) {
    console.error("[whatsapp/templates padrao]", err);
    return res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
// POST /api/whatsapp/exportar
// Generate WhatsApp CSV from a processed file URL + template
//
// Body:
//   templateId: number         — which template to use
//   fileUrl: string            — S3 URL of CPF_SMS or CNPJ_SMS CSV
//   tipoDoc: "CPF"|"CNPJ"|"TODOS"  — filter by doc type (default: TODOS)
// ─────────────────────────────────────────────
router.post("/exportar", async (req: Request, res: Response) => {
  try {
    const { templateId, fileUrl, tipoDoc = "TODOS" } = req.body as {
      templateId: number;
      fileUrl: string;
      tipoDoc?: "CPF" | "CNPJ" | "TODOS";
    };

    if (!templateId || !fileUrl) {
      return res.status(400).json({ error: "templateId e fileUrl são obrigatórios." });
    }

    const db = await getDb();
    if (!db) return res.status(503).json({ error: "Banco de dados indisponível." });

    // Load template
    const [template] = await db.select().from(whatsappTemplates).where(eq(whatsappTemplates.id, templateId));
    if (!template) return res.status(404).json({ error: "Template não encontrado." });

    const colunas = template.colunas as TemplateColuna[];

    // Fetch the source CSV from S3
    const fetchResp = await fetch(fileUrl);
    if (!fetchResp.ok) {
      return res.status(502).json({ error: "Não foi possível baixar o arquivo de origem." });
    }
    const csvText = await fetchResp.text();
    const lines = csvText.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) {
      return res.status(400).json({ error: "Arquivo de origem vazio ou sem dados." });
    }

    // Parse source CSV (semicolon-separated, as generated by the system)
    const headers = lines[0].split(";").map((h) => h.replace(/^"|"$/g, "").trim());

    // ── Locate key columns by header name ──────────────────────────────────
    // SMS files: col A (0) = nome, col B (1) = protocolo, col U (20) = TELEFONE
    // But we detect dynamically to be safe.
    const SMS_PHONE_COL = 20; // col U (0-indexed) — matches processador.ts

    // Find TELEFONE column: prefer header named "TELEFONE", fallback to col U
    const telefoneIdx = (() => {
      const byName = headers.findIndex((h) => /^telefone$/i.test(h.trim()));
      return byName >= 0 ? byName : SMS_PHONE_COL;
    })();

    const tipoDocIdx = headers.findIndex((h) =>
      /cpf.?ou.?cnpj/i.test(h) || /tipo.?doc/i.test(h) || /tipo_doc/i.test(h)
    );
    const documentoIdx = headers.findIndex((h) =>
      /cpf.?cnpj.?devedor/i.test(h) || /cpf.?cnpj/i.test(h) || /documento/i.test(h)
    );

    // ── First pass: collect rows, deduplicate by phone number ───────────────
    // Same rule as LIGACAO: one phone = one WhatsApp message.
    // If the same phone appears in multiple rows (different protocols), merge
    // protocols with " / " and keep the first row's other data.
    const phoneMap = new Map<string, {
      nome: string;
      documento: string;
      docTipo: "CPF" | "CNPJ" | "INVALIDO";
      protocolo: string;
    }>();

    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i].split(";").map((c) => c.replace(/^"|"$/g, "").trim());

      const nome = cells[0] ?? "";
      const protocolo = cells[1] ?? "";
      const telefone = (cells[telefoneIdx] ?? "").replace(/\D/g, "");

      // Raw document from source
      const rawDoc = documentoIdx >= 0 ? (cells[documentoIdx] ?? "") : "";
      const documento = rawDoc.replace(/\D/g, "");

      // Determine doc type
      let docTipo: "CPF" | "CNPJ" | "INVALIDO" = "INVALIDO";
      if (tipoDocIdx >= 0) {
        const v = (cells[tipoDocIdx] ?? "").toUpperCase().trim();
        if (v === "CPF") docTipo = "CPF";
        else if (v === "CNPJ") docTipo = "CNPJ";
      } else {
        if (documento.length === 11) docTipo = "CPF";
        else if (documento.length === 14) docTipo = "CNPJ";
      }

      // Apply tipoDoc filter
      if (tipoDoc !== "TODOS" && docTipo !== tipoDoc) continue;

      // Skip rows without phone
      if (!telefone) continue;

      if (phoneMap.has(telefone)) {
        // Merge protocol into existing entry
        const existing = phoneMap.get(telefone)!;
        if (protocolo && !existing.protocolo.split(" / ").includes(protocolo)) {
          existing.protocolo = existing.protocolo
            ? `${existing.protocolo} / ${protocolo}`
            : protocolo;
        }
      } else {
        phoneMap.set(telefone, { nome, documento, docTipo, protocolo });
      }
    }

    // ── Second pass: build output rows from deduplicated map ───────────────
    const outputLines: string[] = [];

    // Header row
    outputLines.push(serializeCsvRow(colunas.map((c) => c.cabecalho)));

    for (const [telefone, { nome, documento, docTipo, protocolo }] of Array.from(phoneMap.entries())) {
      const ctx = { telefone, nome, documento, tipoDoc: docTipo, protocolo };
      const rowCells = colunas.map((col) => resolveVariavel(col.variavel, ctx));
      outputLines.push(serializeCsvRow(rowCells));
    }

    const csvBuffer = Buffer.from(outputLines.join("\r\n"), "utf-8");
    const filename = `WHATSAPP_${tipoDoc}_${Date.now()}.csv`;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(csvBuffer);
  } catch (err: any) {
    console.error("[whatsapp/exportar]", err);
    return res.status(500).json({ error: err.message });
  }
});

export default router;
