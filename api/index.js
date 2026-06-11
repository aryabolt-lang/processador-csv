// api/index.ts
import "dotenv/config";
import express2 from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

// shared/const.ts
var COOKIE_NAME = "app_session_id";
var ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;
var UNAUTHED_ERR_MSG = "Please login (10001)";
var NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";

// server/routers.ts
import { TRPCError as TRPCError3 } from "@trpc/server";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { z as z2 } from "zod";

// server/_core/cookies.ts
function isSecureRequest(req) {
  if (req.protocol === "https") return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;
  const protoList = Array.isArray(forwardedProto) ? forwardedProto : forwardedProto.split(",");
  return protoList.some((proto) => proto.trim().toLowerCase() === "https");
}
function getSessionCookieOptions(req) {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "none",
    secure: isSecureRequest(req)
  };
}

// server/_core/jwt.ts
import { parse as parseCookieHeader } from "cookie";
import { SignJWT, jwtVerify } from "jose";

// server/db.ts
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

// drizzle/schema.ts
import {
  pgTable,
  pgEnum,
  text,
  timestamp,
  varchar,
  json,
  bigint,
  integer,
  boolean,
  uniqueIndex,
  date,
  serial
} from "drizzle-orm/pg-core";
var roleEnum = pgEnum("role", ["user", "admin"]);
var tipoDocEnum = pgEnum("tipo_doc", ["CPF", "CNPJ", "INVALIDO"]);
var tipoDisparoEnum = pgEnum("tipo_disparo", ["ligacao", "sms"]);
var origemEnum = pgEnum("origem", ["importacao", "manual"]);
var acaoEnum = pgEnum("acao", [
  "criado",
  "importado",
  "editado",
  "atualizado_importacao",
  "favorito_alterado"
]);
var statusProcessamentoEnum = pgEnum("status_processamento", [
  "processando",
  "concluido",
  "erro"
]);
var statusIntimacaoEnum = pgEnum("status_intimacao", [
  "pendente",
  "intimado"
]);
var users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("open_id", { length: 64 }).unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("login_method", { length: 64 }),
  passwordHash: text("password_hash"),
  role: roleEnum("role").default("user").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  lastSignedIn: timestamp("last_signed_in").defaultNow().notNull()
});
var processamentos = pgTable("processamentos", {
  id: serial("id").primaryKey(),
  nomeArquivo: varchar("nome_arquivo", { length: 255 }).notNull(),
  totalRegistros: integer("total_registros").notNull().default(0),
  totalComContato: integer("total_com_contato").notNull().default(0),
  totalSemContato: integer("total_sem_contato").notNull().default(0),
  totalCpf: integer("total_cpf").notNull().default(0),
  totalCnpj: integer("total_cnpj").notNull().default(0),
  totalInvalidos: integer("total_invalidos").notNull().default(0),
  totalLinhasGeradas: integer("total_linhas_geradas").notNull().default(0),
  cpfLigacaoUrl: text("cpf_ligacao_url"),
  cpfSmsUrl: text("cpf_sms_url"),
  cnpjLigacaoUrl: text("cnpj_ligacao_url"),
  cnpjSmsUrl: text("cnpj_sms_url"),
  zipUrl: text("zip_url"),
  mapeamento: json("mapeamento"),
  status: statusProcessamentoEnum("status").default("processando").notNull(),
  erroMsg: text("erro_msg"),
  createdAt: timestamp("created_at").defaultNow().notNull()
});
var registrosProcessados = pgTable("registros_processados", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  processamentoId: integer("processamento_id").notNull(),
  nome: varchar("nome", { length: 512 }),
  documento: varchar("documento", { length: 20 }),
  tipoDoc: tipoDocEnum("tipo_doc").notNull().default("INVALIDO"),
  telefone: varchar("telefone", { length: 20 }),
  origemTelefone: varchar("origem_telefone", { length: 64 }),
  tipoDisparo: tipoDisparoEnum("tipo_disparo").notNull(),
  protocolo: varchar("protocolo", { length: 255 }),
  nomeArquivo: varchar("nome_arquivo", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull()
});
var contatos = pgTable("contatos", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  documento: varchar("documento", { length: 20 }).notNull().unique(),
  tipoDoc: tipoDocEnum("tipo_doc").notNull().default("INVALIDO"),
  nomeRazaoSocial: varchar("nome_razao_social", { length: 512 }),
  celular1: varchar("celular1", { length: 20 }),
  celular2: varchar("celular2", { length: 20 }),
  celular3: varchar("celular3", { length: 20 }),
  celular4: varchar("celular4", { length: 20 }),
  email1: varchar("email1", { length: 320 }),
  email2: varchar("email2", { length: 320 }),
  email3: varchar("email3", { length: 320 }),
  origemArquivo: varchar("origem_arquivo", { length: 255 }),
  origem: origemEnum("origem").default("importacao").notNull(),
  telefonePrincipal: integer("telefone_principal").default(0),
  emailPrincipal: integer("email_principal").default(0),
  ultimaEdicao: timestamp("ultima_edicao"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});
var contatosHistorico = pgTable("contatos_historico", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  documento: varchar("documento", { length: 20 }).notNull(),
  acao: acaoEnum("acao").notNull(),
  camposAlterados: json("campos_alterados"),
  descricao: text("descricao"),
  criadoEm: timestamp("criado_em").defaultNow().notNull()
});
var whatsappTemplates = pgTable("whatsapp_templates", {
  id: serial("id").primaryKey(),
  nome: varchar("nome", { length: 255 }).notNull(),
  descricao: text("descricao"),
  colunas: json("colunas").notNull(),
  padrao: boolean("padrao").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});
var protocolos = pgTable(
  "protocolos",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    protocolo: varchar("protocolo", { length: 255 }).notNull(),
    nomeDevedor: varchar("nome_devedor", { length: 512 }),
    documento: varchar("documento", { length: 20 }),
    tipoDoc: tipoDocEnum("tipo_doc").notNull().default("INVALIDO"),
    numeroTitulo: varchar("numero_titulo", { length: 255 }),
    credor: varchar("credor", { length: 512 }),
    docCredor: varchar("doc_credor", { length: 20 }),
    telefone: varchar("telefone", { length: 20 }),
    valorProtesto: varchar("valor_protesto", { length: 50 }),
    statusIntimacao: statusIntimacaoEnum("status_intimacao").notNull().default("pendente"),
    intimadoEm: timestamp("intimado_em"),
    canalIntimacao: varchar("canal_intimacao", { length: 100 }),
    nomeArquivo: varchar("nome_arquivo", { length: 255 }),
    dataProtocolo: date("data_protocolo"),
    situacaoTitulo: varchar("situacao_titulo", { length: 100 }),
    tituloEncerrado: boolean("titulo_encerrado").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull()
  },
  (table) => ({
    protocoloDocumentoIdx: uniqueIndex("protocolos_protocolo_documento_unique").on(
      table.protocolo,
      table.documento
    )
  })
);
var configMensagemWhatsapp = pgTable("config_mensagem_whatsapp", {
  id: serial("id").primaryKey(),
  template: text("template"),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

// server/db.ts
neonConfig.webSocketConstructor = ws;
var _db = null;
var _pool = null;
async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _pool = new Pool({ connectionString: process.env.DATABASE_URL });
      _db = drizzle(_pool);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}
async function upsertUser(user) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }
  try {
    const values = { lastSignedIn: user.lastSignedIn ?? /* @__PURE__ */ new Date() };
    if (user.openId) values.openId = user.openId;
    const updateSet = {};
    const fields = ["name", "email", "loginMethod", "passwordHash", "role"];
    for (const field of fields) {
      const value = user[field];
      if (value !== void 0) {
        values[field] = value ?? null;
        updateSet[field] = value ?? null;
      }
    }
    if (user.lastSignedIn !== void 0) {
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = /* @__PURE__ */ new Date();
    }
    if (values.email) {
      await db.insert(users).values(values).onConflictDoUpdate({
        target: users.email,
        set: updateSet
      });
    } else if (values.openId) {
      await db.insert(users).values(values).onConflictDoUpdate({
        target: users.openId,
        set: updateSet
      });
    } else {
      await db.insert(users).values(values);
    }
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}
async function getUserByOpenId(openId) {
  const db = await getDb();
  if (!db) return void 0;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}
async function getUserByEmail(email) {
  const db = await getDb();
  if (!db) return void 0;
  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}

// server/_core/jwt.ts
function getSecretKey() {
  const secret = process.env.JWT_SECRET ?? "mude-em-producao";
  return new TextEncoder().encode(secret);
}
async function signSession(payload, expiresInMs = ONE_YEAR_MS) {
  return new SignJWT({ userId: payload.userId, openId: payload.openId }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime(Math.floor((Date.now() + expiresInMs) / 1e3)).sign(getSecretKey());
}
async function verifySession(token) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), { algorithms: ["HS256"] });
    const { userId, openId } = payload;
    if (typeof userId !== "number" || typeof openId !== "string") return null;
    return { userId, openId };
  } catch {
    return null;
  }
}
async function authenticateRequest(req) {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;
  const cookies = parseCookieHeader(cookieHeader);
  const token = cookies[COOKIE_NAME];
  const session = await verifySession(token);
  if (!session) return null;
  const user = await getUserByOpenId(session.openId);
  return user ?? null;
}

// server/_core/systemRouter.ts
import { z } from "zod";

// server/_core/notification.ts
import { TRPCError } from "@trpc/server";

// server/_core/env.ts
var ENV = {
  jwtSecret: process.env.JWT_SECRET ?? "mude-em-producao",
  databaseUrl: process.env.DATABASE_URL ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? ""
};

// server/_core/notification.ts
var TITLE_MAX_LENGTH = 1200;
var CONTENT_MAX_LENGTH = 2e4;
var trimValue = (value) => value.trim();
var isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;
var buildEndpointUrl = (baseUrl) => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(
    "webdevtoken.v1.WebDevService/SendNotification",
    normalizedBase
  ).toString();
};
var validatePayload = (input) => {
  if (!isNonEmptyString(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required."
    });
  }
  if (!isNonEmptyString(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required."
    });
  }
  const title = trimValue(input.title);
  const content = trimValue(input.content);
  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`
    });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`
    });
  }
  return { title, content };
};
async function notifyOwner(payload) {
  const { title, content } = validatePayload(payload);
  if (!ENV.forgeApiUrl) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service URL is not configured."
    });
  }
  if (!ENV.forgeApiKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service API key is not configured."
    });
  }
  const endpoint = buildEndpointUrl(ENV.forgeApiUrl);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1"
      },
      body: JSON.stringify({ title, content })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Notification] Failed to notify owner (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Notification] Error calling notification service:", error);
    return false;
  }
}

// server/_core/trpc.ts
import { initTRPC, TRPCError as TRPCError2 } from "@trpc/server";
import superjson from "superjson";
var t = initTRPC.context().create({
  transformer: superjson
});
var router = t.router;
var publicProcedure = t.procedure;
var requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError2({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user
    }
  });
});
var protectedProcedure = t.procedure.use(requireUser);
var adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError2({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({
      ctx: {
        ...ctx,
        user: ctx.user
      }
    });
  })
);

// server/_core/systemRouter.ts
var systemRouter = router({
  health: publicProcedure.input(
    z.object({
      timestamp: z.number().min(0, "timestamp cannot be negative")
    })
  ).query(() => ({
    ok: true
  })),
  notifyOwner: adminProcedure.input(
    z.object({
      title: z.string().min(1, "title is required"),
      content: z.string().min(1, "content is required")
    })
  ).mutation(async ({ input }) => {
    const delivered = await notifyOwner(input);
    return {
      success: delivered
    };
  })
});

// server/routers.ts
var appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    register: publicProcedure.input(z2.object({
      name: z2.string().min(2, "Nome obrigat\xF3rio"),
      email: z2.string().email("E-mail inv\xE1lido"),
      password: z2.string().min(6, "Senha deve ter ao menos 6 caracteres")
    })).mutation(async ({ input, ctx }) => {
      const existing = await getUserByEmail(input.email);
      if (existing) throw new TRPCError3({ code: "CONFLICT", message: "E-mail j\xE1 cadastrado" });
      const passwordHash = await bcrypt.hash(input.password, 10);
      const openId = `local_${crypto.randomUUID()}`;
      await upsertUser({ openId, name: input.name, email: input.email, passwordHash, loginMethod: "email", lastSignedIn: /* @__PURE__ */ new Date() });
      const user = await getUserByEmail(input.email);
      if (!user) throw new TRPCError3({ code: "INTERNAL_SERVER_ERROR" });
      const token = await signSession({ userId: user.id, openId: user.openId });
      ctx.res.cookie(COOKIE_NAME, token, { ...getSessionCookieOptions(ctx.req), maxAge: ONE_YEAR_MS });
      return { success: true };
    }),
    login: publicProcedure.input(z2.object({
      email: z2.string().email("E-mail inv\xE1lido"),
      password: z2.string().min(1, "Senha obrigat\xF3ria")
    })).mutation(async ({ input, ctx }) => {
      const user = await getUserByEmail(input.email);
      if (!user || !user.passwordHash) throw new TRPCError3({ code: "UNAUTHORIZED", message: "E-mail ou senha inv\xE1lidos" });
      const valid = await bcrypt.compare(input.password, user.passwordHash);
      if (!valid) throw new TRPCError3({ code: "UNAUTHORIZED", message: "E-mail ou senha inv\xE1lidos" });
      await upsertUser({ openId: user.openId, lastSignedIn: /* @__PURE__ */ new Date() });
      const token = await signSession({ userId: user.id, openId: user.openId });
      ctx.res.cookie(COOKIE_NAME, token, { ...getSessionCookieOptions(ctx.req), maxAge: ONE_YEAR_MS });
      return { success: true };
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      ctx.res.clearCookie(COOKIE_NAME, { ...getSessionCookieOptions(ctx.req), maxAge: -1 });
      return { success: true };
    })
  })
});

// server/_core/context.ts
async function createContext(opts) {
  let user = null;
  try {
    user = await authenticateRequest(opts.req);
  } catch {
    user = null;
  }
  return { req: opts.req, res: opts.res, user };
}

// server/uploadRoutes.ts
import { Router } from "express";
import fetch2 from "node-fetch";
import multer from "multer";
import archiver from "archiver";

// server/processador.ts
import * as XLSX from "xlsx";
function cleanPhone(phone) {
  return phone.replace(/\D/g, "").trim();
}
function isValidPhone(phone) {
  const clean = cleanPhone(phone);
  return clean.length >= 8 && clean.length <= 13;
}
function cleanDocument(doc) {
  return doc.replace(/\D/g, "").trim();
}
function classifyDocument(doc) {
  const clean = cleanDocument(doc);
  if (clean.length === 11) return "CPF";
  if (clean.length === 14) return "CNPJ";
  return "INVALIDO";
}
function isPhoneSemContato(value) {
  if (!value || !value.trim()) return false;
  const v = value.toLowerCase().trim();
  return v === "sem contato" || v.startsWith("sem contato") || v.includes("sem contato") || v === "s/contato" || v === "sc" || v === "sem" || v === "n/a" || v === "na" || v === "n\xE3o localizado" || v === "nao localizado" || v.includes("n\xE3o localiz") || v.includes("nao localiz") || v.includes("intima\xE7\xE3o") || v.includes("intimacao");
}
function isSemContato(value) {
  if (!value) return false;
  const v = value.toLowerCase().trim();
  return v === "s" || v === "sim" || v === "yes" || v === "1" || v === "true" || isPhoneSemContato(v);
}
var NOME_PATTERNS = [
  /devedor/i,
  /nome/i,
  /cliente/i,
  /sacado/i,
  /razao.?social/i,
  /raz.o.?social/i
];
var DOC_PATTERNS = [
  /cpf.?cnpj/i,
  /cnpj.?cpf/i,
  /cpf/i,
  /cnpj/i,
  /documento/i,
  /doc/i
];
var PHONE_PATTERNS = [
  [/telefone.?0?1/i, /tel.?0?1/i, /fone.?0?1/i, /phone.?1/i],
  [/telefone.?0?2/i, /tel.?0?2/i, /fone.?0?2/i, /phone.?2/i],
  [/telefone.?0?3/i, /tel.?0?3/i, /fone.?0?3/i, /phone.?3/i],
  [/telefone.?0?4/i, /tel.?0?4/i, /fone.?0?4/i, /phone.?4/i]
];
function scoreHeader(header, patterns) {
  for (let i = 0; i < patterns.length; i++) {
    if (patterns[i].test(header)) return 100 - i * 10;
  }
  return 0;
}
function detectColumns(headers, rows) {
  const suggestions = [];
  const used = /* @__PURE__ */ new Set();
  function best(patterns) {
    let bestCol = null;
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
  const nome = best(NOME_PATTERNS);
  if (nome.column) used.add(nome.column);
  suggestions.push({ field: "nome", ...nome });
  const doc = best(DOC_PATTERNS);
  if (doc.column) used.add(doc.column);
  suggestions.push({ field: "documento", ...doc });
  for (let i = 0; i < 4; i++) {
    const tel = best(PHONE_PATTERNS[i]);
    if (tel.column) used.add(tel.column);
    suggestions.push({ field: `telefone${i + 1}`, ...tel });
  }
  suggestions.push({ field: "semContato", column: null, confidence: 0 });
  return suggestions;
}
function parseFile(buffer, mimetype, originalname) {
  let rows = [];
  let headers = [];
  const isXlsx = mimetype.includes("spreadsheet") || mimetype.includes("excel") || originalname.endsWith(".xlsx") || originalname.endsWith(".xls");
  if (isXlsx) {
    const wb = XLSX.read(buffer, { type: "buffer" });
    const ws2 = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(ws2, { defval: "" });
    if (data.length > 0) {
      headers = Object.keys(data[0]);
      rows = data.map(
        (r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v ?? "")]))
      );
    }
  } else {
    const text2 = buffer.toString("utf-8");
    const firstLine = text2.split("\n")[0] || "";
    const delimiter = firstLine.includes(";") ? ";" : ",";
    const lines = text2.split("\n").filter((l) => l.trim());
    if (lines.length === 0) return { headers: [], rows: [], suggestions: [] };
    headers = lines[0].split(delimiter).map((h) => h.trim().replace(/^"|"$/g, ""));
    for (let i = 1; i < lines.length; i++) {
      const cells = splitCsvLine(lines[i], delimiter);
      const row = {};
      headers.forEach((h, idx) => {
        row[h] = (cells[idx] ?? "").trim().replace(/^"|"$/g, "");
      });
      rows.push(row);
    }
  }
  const suggestions = detectColumns(headers, rows);
  return { headers, rows, suggestions };
}
function splitCsvLine(line, delimiter) {
  const result = [];
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
var PROTOCOLO_PATTERNS = [
  /^protocolo$/i,
  /^n[uú]mero.?t[ií]tulo$/i,
  /^n[uú]m.?protocolo$/i,
  /protocolo/i,
  /^protocol$/i
];
function findProtocoloIndex(headers) {
  for (const pat of PROTOCOLO_PATTERNS) {
    const idx = headers.findIndex((h) => pat.test(h));
    if (idx !== -1) return idx;
  }
  return -1;
}
function applyColumnOrder(cells, nomeIdx, protocoloIdx) {
  if (nomeIdx > 0) {
    const tmp = cells[nomeIdx];
    cells[nomeIdx] = cells[0];
    cells[0] = tmp;
    if (protocoloIdx === 0) {
    }
  }
  let effectiveProtIdx = protocoloIdx;
  if (nomeIdx > 0 && protocoloIdx === 0) {
    effectiveProtIdx = nomeIdx;
  }
  if (effectiveProtIdx > 1) {
    const tmp = cells[effectiveProtIdx];
    cells[effectiveProtIdx] = cells[1];
    cells[1] = tmp;
  }
}
function buildDataRow(originalRow, headers, nomeCol, protocoloIdx, telefone, removeCommas) {
  const cells = headers.map((h) => {
    let v = originalRow[h] ?? "";
    if (removeCommas) v = v.replace(/,/g, " ").trim();
    return v;
  });
  while (cells.length < 30) cells.push("");
  const nomeIdx = nomeCol ? headers.indexOf(nomeCol) : -1;
  applyColumnOrder(cells, nomeIdx >= 0 ? nomeIdx : 0, protocoloIdx);
  cells[29] = telefone;
  return cells;
}
function buildHeaderRow(headers, nomeCol, protocoloIdx) {
  const h = [...headers];
  while (h.length < 30) h.push("");
  const nomeIdx = nomeCol ? headers.indexOf(nomeCol) : -1;
  applyColumnOrder(h, nomeIdx >= 0 ? nomeIdx : 0, protocoloIdx);
  h[29] = "TELEFONE";
  return h;
}
function serializeRow(cells, removeCommas) {
  return cells.map((cell) => {
    let v = cell;
    if (removeCommas) v = v.replace(/,/g, " ").trim();
    if (v.includes(";") || v.includes("\n") || v.includes('"')) {
      return '"' + v.replace(/"/g, '""') + '"';
    }
    return v;
  }).join(";");
}
function generateLigacaoCsv(entries, headers, nomeCol) {
  const protocoloIdx = findProtocoloIndex(headers);
  const headerRow = buildHeaderRow(headers, nomeCol, protocoloIdx);
  const dataRows = entries.map(({ originalRow, telefone, protocolosMerged }) => {
    const row = buildDataRow(originalRow, headers, nomeCol, protocoloIdx, telefone, true);
    if (protocoloIdx !== -1 && protocolosMerged) {
      row[1] = protocolosMerged.replace(/,/g, " ");
    }
    return row;
  });
  const lines = [
    serializeRow(headerRow, false),
    ...dataRows.map((r) => serializeRow(r, false))
  ];
  return Buffer.from(lines.join("\r\n"), "utf-8");
}
function deduplicateLigacaoEntries(entries, headers) {
  const protocoloIdx = findProtocoloIndex(headers);
  const protocoloCol = protocoloIdx >= 0 ? headers[protocoloIdx] : null;
  const phoneMap = /* @__PURE__ */ new Map();
  for (const { originalRow, telefone } of entries) {
    const proto = protocoloCol ? (originalRow[protocoloCol] ?? "").trim() : "";
    if (phoneMap.has(telefone)) {
      const existing = phoneMap.get(telefone);
      if (proto && !existing.protocols.includes(proto)) {
        existing.protocols.push(proto);
      }
    } else {
      phoneMap.set(telefone, {
        originalRow,
        protocols: proto ? [proto] : []
      });
    }
  }
  return Array.from(phoneMap.entries()).map(([telefone, { originalRow, protocols }]) => ({
    originalRow,
    telefone,
    protocolosMerged: protocols.join(" / ")
  }));
}
var SMS_PHONE_COL = 20;
function buildSmsDataRow(originalRow, headers, nomeCol, protocoloIdx, telefone) {
  const cells = headers.map((h) => originalRow[h] ?? "");
  while (cells.length <= SMS_PHONE_COL) cells.push("");
  const nomeIdx = nomeCol ? headers.indexOf(nomeCol) : -1;
  applyColumnOrder(cells, nomeIdx >= 0 ? nomeIdx : 0, protocoloIdx);
  cells[SMS_PHONE_COL] = telefone;
  return cells;
}
function buildSmsHeaderRow(headers, nomeCol, protocoloIdx) {
  const h = [...headers];
  while (h.length <= SMS_PHONE_COL) h.push("");
  const nomeIdx = nomeCol ? headers.indexOf(nomeCol) : -1;
  applyColumnOrder(h, nomeIdx >= 0 ? nomeIdx : 0, protocoloIdx);
  h[SMS_PHONE_COL] = "TELEFONE";
  return h;
}
function generateSmsCsv(entries, headers, nomeCol) {
  const protocoloIdx = findProtocoloIndex(headers);
  const headerRow = buildSmsHeaderRow(headers, nomeCol, protocoloIdx);
  const dataRows = entries.map(
    ({ originalRow, telefone }) => buildSmsDataRow(originalRow, headers, nomeCol, protocoloIdx, telefone)
  );
  const lines = [
    serializeRow(headerRow, false),
    ...dataRows.map((r) => serializeRow(r, false))
  ];
  return Buffer.from(lines.join("\r\n"), "utf-8");
}
function processData(rows, mapping, headers = []) {
  const phoneFields = [
    { field: "telefone1", label: "TELEFONE 1" },
    { field: "telefone2", label: "TELEFONE 2" },
    { field: "telefone3", label: "TELEFONE 3" },
    { field: "telefone4", label: "TELEFONE 4" }
  ];
  let totalRegistros = rows.length;
  let totalComContato = 0;
  let totalSemContato = 0;
  let totalCpf = 0;
  let totalCnpj = 0;
  let totalInvalidos = 0;
  let totalLinhasGeradas = 0;
  const cpfLigacaoEntriesRaw = [];
  const cpfSmsEntries = [];
  const cnpjLigacaoEntriesRaw = [];
  const cnpjSmsEntries = [];
  const expandedRecords = [];
  for (const row of rows) {
    const nome = mapping.nome ? (row[mapping.nome] ?? "").trim() : "";
    const docRaw = mapping.documento ? (row[mapping.documento] ?? "").trim() : "";
    const semContatoVal = mapping.semContato ? (row[mapping.semContato] ?? "").trim() : "";
    if (semContatoVal && isSemContato(semContatoVal)) {
      totalSemContato++;
      continue;
    }
    const validPhones = [];
    for (const { field, label } of phoneFields) {
      const col = mapping[field];
      if (!col) continue;
      const raw = (row[col] ?? "").trim();
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
    const protocoloIdx = findProtocoloIndex(headers);
    const protocoloCol = protocoloIdx >= 0 ? headers[protocoloIdx] : null;
    const protocoloVal = protocoloCol ? (row[protocoloCol] ?? "").trim() : "";
    for (const { phone, label } of validPhones) {
      totalLinhasGeradas++;
      if (docType === "CPF") {
        cpfLigacaoEntriesRaw.push({ originalRow: row, telefone: phone });
        cpfSmsEntries.push({ originalRow: row, telefone: phone });
      } else if (docType === "CNPJ") {
        cnpjLigacaoEntriesRaw.push({ originalRow: row, telefone: phone });
        cnpjSmsEntries.push({ originalRow: row, telefone: phone });
      } else {
        cpfLigacaoEntriesRaw.push({ originalRow: row, telefone: phone });
        cpfSmsEntries.push({ originalRow: row, telefone: phone });
      }
      expandedRecords.push({
        nome,
        documento: docClean,
        tipoDoc: docType,
        telefone: phone,
        origemTelefone: label,
        tipoDisparo: "ligacao",
        protocolo: protocoloVal
      });
      expandedRecords.push({
        nome,
        documento: docClean,
        tipoDoc: docType,
        telefone: phone,
        origemTelefone: label,
        tipoDisparo: "sms",
        protocolo: protocoloVal
      });
    }
  }
  const cpfLigacaoEntries = deduplicateLigacaoEntries(cpfLigacaoEntriesRaw, headers);
  const cnpjLigacaoEntries = deduplicateLigacaoEntries(cnpjLigacaoEntriesRaw, headers);
  const cpfLigacaoCsv = generateLigacaoCsv(cpfLigacaoEntries, headers, mapping.nome);
  const cpfSmsCsv = generateSmsCsv(cpfSmsEntries, headers, mapping.nome);
  const cnpjLigacaoCsv = generateLigacaoCsv(cnpjLigacaoEntries, headers, mapping.nome);
  const cnpjSmsCsv = generateSmsCsv(cnpjSmsEntries, headers, mapping.nome);
  const previewCpfLigacao = cpfLigacaoEntries.slice(0, 50).map((e) => ({
    NOME: mapping.nome ? e.originalRow[mapping.nome] ?? "" : "",
    TELEFONE: e.telefone,
    PROTOCOLOS: e.protocolosMerged
  }));
  const previewCpfSms = cpfSmsEntries.slice(0, 50).map((e) => ({
    NOME: mapping.nome ? e.originalRow[mapping.nome] ?? "" : "",
    TELEFONE: e.telefone
  }));
  const previewCnpjLigacao = cnpjLigacaoEntries.slice(0, 50).map((e) => ({
    NOME: mapping.nome ? e.originalRow[mapping.nome] ?? "" : "",
    TELEFONE: e.telefone,
    PROTOCOLOS: e.protocolosMerged
  }));
  const previewCnpjSms = cnpjSmsEntries.slice(0, 50).map((e) => ({
    NOME: mapping.nome ? e.originalRow[mapping.nome] ?? "" : "",
    TELEFONE: e.telefone
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
    expandedRecords
  };
}

// server/storage.ts
function getStorageConfig() {
  const baseUrl = ENV.forgeApiUrl;
  const apiKey = ENV.forgeApiKey;
  if (!baseUrl || !apiKey) {
    throw new Error(
      "Storage proxy credentials missing: set BUILT_IN_FORGE_API_URL and BUILT_IN_FORGE_API_KEY"
    );
  }
  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey };
}
function buildUploadUrl(baseUrl, relKey) {
  const url = new URL("v1/storage/upload", ensureTrailingSlash(baseUrl));
  url.searchParams.set("path", normalizeKey(relKey));
  return url;
}
function ensureTrailingSlash(value) {
  return value.endsWith("/") ? value : `${value}/`;
}
function normalizeKey(relKey) {
  return relKey.replace(/^\/+/, "");
}
function toFormData(data, contentType, fileName) {
  const blob = typeof data === "string" ? new Blob([data], { type: contentType }) : new Blob([data], { type: contentType });
  const form = new FormData();
  form.append("file", blob, fileName || "file");
  return form;
}
function buildAuthHeaders(apiKey) {
  return { Authorization: `Bearer ${apiKey}` };
}
async function storagePut(relKey, data, contentType = "application/octet-stream") {
  const { baseUrl, apiKey } = getStorageConfig();
  const key = normalizeKey(relKey);
  const uploadUrl = buildUploadUrl(baseUrl, key);
  const formData = toFormData(data, contentType, key.split("/").pop() ?? key);
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: buildAuthHeaders(apiKey),
    body: formData
  });
  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(
      `Storage upload failed (${response.status} ${response.statusText}): ${message}`
    );
  }
  const url = (await response.json()).url;
  return { key, url };
}

// server/uploadRoutes.ts
import { eq as eq2, or, like, and } from "drizzle-orm";
import { nanoid } from "nanoid";

// server/syncContatos.ts
import { sql } from "drizzle-orm";
async function syncContatos(records, fileName) {
  if (!records.length) return { total: 0, upserted: 0, skipped: 0 };
  const db = await getDb();
  if (!db) return { total: records.length, upserted: 0, skipped: records.length };
  const valid = records.filter(
    (r) => r.tipoDoc !== "INVALIDO" && r.documento && r.documento.length >= 11
  );
  const skipped = records.length - valid.length;
  if (!valid.length) return { total: records.length, upserted: 0, skipped };
  const merged = /* @__PURE__ */ new Map();
  for (const r of valid) {
    const existing = merged.get(r.documento);
    if (!existing) {
      merged.set(r.documento, { ...r, origemArquivo: fileName });
    } else {
      const phones = [
        existing.celular1,
        existing.celular2,
        existing.celular3,
        existing.celular4
      ];
      const newPhones = [r.celular1, r.celular2, r.celular3, r.celular4].filter((p) => !!p && p.length >= 8);
      for (const phone of newPhones) {
        if (!phones.includes(phone)) {
          const emptySlot = phones.findIndex((p) => !p);
          if (emptySlot >= 0) phones[emptySlot] = phone;
        }
      }
      [existing.celular1, existing.celular2, existing.celular3, existing.celular4] = phones;
      const emails = [existing.email1, existing.email2, existing.email3];
      const newEmails = [r.email1, r.email2, r.email3].filter((e) => !!e && e.includes("@"));
      for (const email of newEmails) {
        if (!emails.includes(email)) {
          const emptySlot = emails.findIndex((e) => !e);
          if (emptySlot >= 0) emails[emptySlot] = email;
        }
      }
      [existing.email1, existing.email2, existing.email3] = emails;
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
    origemArquivo: fileName
  }));
  const BATCH_SIZE = 1e3;
  let upserted = 0;
  for (let i = 0; i < batch.length; i += BATCH_SIZE) {
    const chunk = batch.slice(i, i + BATCH_SIZE);
    await db.insert(contatos).values(chunk).onConflictDoUpdate({
      target: contatos.documento,
      set: {
        // Merge: only fill empty fields, never overwrite existing data
        nomeRazaoSocial: sql`COALESCE(${contatos.nomeRazaoSocial}, EXCLUDED.nome_razao_social)`,
        celular1: sql`COALESCE(${contatos.celular1}, EXCLUDED.celular1)`,
        celular2: sql`COALESCE(${contatos.celular2}, EXCLUDED.celular2)`,
        celular3: sql`COALESCE(${contatos.celular3}, EXCLUDED.celular3)`,
        celular4: sql`COALESCE(${contatos.celular4}, EXCLUDED.celular4)`,
        email1: sql`COALESCE(${contatos.email1}, EXCLUDED.email1)`,
        email2: sql`COALESCE(${contatos.email2}, EXCLUDED.email2)`,
        email3: sql`COALESCE(${contatos.email3}, EXCLUDED.email3)`,
        origemArquivo: sql`EXCLUDED.origem_arquivo`
      }
    });
    upserted += chunk.length;
  }
  return { total: records.length, upserted, skipped };
}
function buildContactsFromPhoneRecords(expandedRecords) {
  const map = /* @__PURE__ */ new Map();
  for (const r of expandedRecords) {
    if (!r.documento || r.tipoDoc === "INVALIDO") continue;
    const doc = r.documento.replace(/\D/g, "");
    if (!doc) continue;
    const existing = map.get(doc);
    if (!existing) {
      map.set(doc, {
        documento: doc,
        tipoDoc: r.tipoDoc,
        nomeRazaoSocial: r.nome || void 0,
        celular1: r.telefone || void 0
      });
    } else {
      if (!existing.celular1 && r.telefone) existing.celular1 = r.telefone;
      else if (!existing.celular2 && r.telefone && r.telefone !== existing.celular1)
        existing.celular2 = r.telefone;
      else if (!existing.celular3 && r.telefone && r.telefone !== existing.celular1 && r.telefone !== existing.celular2)
        existing.celular3 = r.telefone;
      else if (!existing.celular4 && r.telefone && r.telefone !== existing.celular1 && r.telefone !== existing.celular2 && r.telefone !== existing.celular3)
        existing.celular4 = r.telefone;
    }
  }
  return Array.from(map.values());
}
function buildContactsFromEmailRecords(emailEntries) {
  const map = /* @__PURE__ */ new Map();
  for (const r of emailEntries) {
    const doc = r.cpfCnpj.replace(/\D/g, "");
    if (!doc || doc.length < 11) continue;
    const tipoDoc = doc.length === 11 ? "CPF" : doc.length === 14 ? "CNPJ" : "INVALIDO";
    if (tipoDoc === "INVALIDO") continue;
    const existing = map.get(doc);
    if (!existing) {
      map.set(doc, {
        documento: doc,
        tipoDoc,
        nomeRazaoSocial: r.devedor || void 0,
        email1: r.email || void 0
      });
    } else {
      if (!existing.email1 && r.email) existing.email1 = r.email;
      else if (!existing.email2 && r.email && r.email !== existing.email1)
        existing.email2 = r.email;
      else if (!existing.email3 && r.email && r.email !== existing.email1 && r.email !== existing.email2)
        existing.email3 = r.email;
    }
  }
  return Array.from(map.values());
}

// server/uploadRoutes.ts
var router2 = Router();
var upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  // 50MB
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "text/csv",
      "application/csv",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/plain"
    ];
    const ext = file.originalname.toLowerCase();
    if (allowed.includes(file.mimetype) || ext.endsWith(".csv") || ext.endsWith(".xlsx") || ext.endsWith(".xls")) {
      cb(null, true);
    } else {
      cb(new Error("Formato de arquivo n\xE3o suportado. Use CSV ou XLSX."));
    }
  }
});
router2.post("/parse", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Nenhum arquivo enviado." });
    }
    const parsed = parseFile(req.file.buffer, req.file.mimetype, req.file.originalname);
    return res.json({
      headers: parsed.headers,
      suggestions: parsed.suggestions,
      totalRows: parsed.rows.length,
      previewRows: parsed.rows.slice(0, 10)
    });
  } catch (err) {
    console.error("[upload/parse]", err);
    return res.status(500).json({ error: err.message || "Erro ao processar arquivo." });
  }
});
router2.post("/process", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Nenhum arquivo enviado." });
    }
    let mapping;
    try {
      mapping = JSON.parse(req.body.mapping || "{}");
    } catch {
      return res.status(400).json({ error: "Mapeamento de colunas inv\xE1lido." });
    }
    const parsed = parseFile(req.file.buffer, req.file.mimetype, req.file.originalname);
    const result = processData(parsed.rows, mapping, parsed.headers);
    const suffix = nanoid(8);
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const uploadWithRetry = async (key, data, ct, retries = 3) => {
      for (let i = 0; i < retries; i++) {
        try {
          return await storagePut(key, data, ct);
        } catch (e) {
          if (i < retries - 1 && (e.message?.includes("Rate") || e.message?.includes("429"))) {
            await sleep(1200 * (i + 1));
            continue;
          }
          throw e;
        }
      }
      throw new Error("Upload falhou ap\xF3s m\xFAltiplas tentativas");
    };
    const cpfLig = await uploadWithRetry(`processamentos/${suffix}/CPF_LIGACAO.csv`, result.cpfLigacaoCsv, "text/csv");
    const cpfSms = await uploadWithRetry(`processamentos/${suffix}/CPF_SMS.csv`, result.cpfSmsCsv, "text/csv");
    const cnpjLig = await uploadWithRetry(`processamentos/${suffix}/CNPJ_LIGACAO.csv`, result.cnpjLigacaoCsv, "text/csv");
    const cnpjSms = await uploadWithRetry(`processamentos/${suffix}/CNPJ_SMS.csv`, result.cnpjSmsCsv, "text/csv");
    const db = await getDb();
    let processamentoId = null;
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
        cpfLigacaoUrl: cpfLig.url,
        cpfSmsUrl: cpfSms.url,
        cnpjLigacaoUrl: cnpjLig.url,
        cnpjSmsUrl: cnpjSms.url,
        mapeamento: mapping,
        status: "concluido"
      });
      processamentoId = inserted.insertId ?? null;
      if (processamentoId && result.expandedRecords.length > 0) {
        const BATCH = 500;
        for (let i = 0; i < result.expandedRecords.length; i += BATCH) {
          const batch = result.expandedRecords.slice(i, i + BATCH).map((r) => ({
            processamentoId,
            nome: r.nome || null,
            documento: r.documento || null,
            tipoDoc: r.tipoDoc,
            telefone: r.telefone || null,
            origemTelefone: r.origemTelefone || null,
            tipoDisparo: r.tipoDisparo,
            protocolo: r.protocolo || null,
            nomeArquivo: req.file.originalname
          }));
          await db.insert(registrosProcessados).values(batch);
        }
      }
    }
    let contatosSyncResult = { total: 0, upserted: 0, skipped: 0 };
    try {
      const contactRecords = buildContactsFromPhoneRecords(result.expandedRecords);
      contatosSyncResult = await syncContatos(contactRecords, req.file.originalname);
    } catch (syncErr) {
      console.error("[upload/process] syncContatos error:", syncErr);
    }
    return res.json({
      id: processamentoId,
      suffix,
      contatosSynced: contatosSyncResult,
      metrics: {
        totalRegistros: result.totalRegistros,
        totalComContato: result.totalComContato,
        totalSemContato: result.totalSemContato,
        totalCpf: result.totalCpf,
        totalCnpj: result.totalCnpj,
        totalInvalidos: result.totalInvalidos,
        totalLinhasGeradas: result.totalLinhasGeradas
      },
      files: {
        cpfLigacao: { url: cpfLig.url, key: cpfLig.key, name: "CPF_LIGACAO.csv" },
        cpfSms: { url: cpfSms.url, key: cpfSms.key, name: "CPF_SMS.csv" },
        cnpjLigacao: { url: cnpjLig.url, key: cnpjLig.key, name: "CNPJ_LIGACAO.csv" },
        cnpjSms: { url: cnpjSms.url, key: cnpjSms.key, name: "CNPJ_SMS.csv" }
      },
      preview: {
        cpfLigacao: result.previewCpfLigacao,
        cpfSms: result.previewCpfSms,
        cnpjLigacao: result.previewCnpjLigacao,
        cnpjSms: result.previewCnpjSms
      }
    });
  } catch (err) {
    console.error("[upload/process]", err);
    return res.status(500).json({ error: err.message || "Erro ao processar arquivo." });
  }
});
router2.post("/download-zip", async (req, res) => {
  try {
    const { files } = req.body;
    if (!files) {
      return res.status(400).json({ error: "URLs dos arquivos n\xE3o fornecidas." });
    }
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="processamento.zip"`);
    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.pipe(res);
    const fileList = [
      { url: files.cpfLigacao.url, name: files.cpfLigacao.name },
      { url: files.cpfSms.url, name: files.cpfSms.name },
      { url: files.cnpjLigacao.url, name: files.cnpjLigacao.name },
      { url: files.cnpjSms.url, name: files.cnpjSms.name }
    ];
    for (const f of fileList) {
      const resp = await fetch2(f.url);
      if (resp.ok && resp.body) {
        archive.append(resp.body, { name: f.name });
      }
    }
    await archive.finalize();
  } catch (err) {
    console.error("[upload/download-zip]", err);
    if (!res.headersSent) {
      return res.status(500).json({ error: err.message || "Erro ao gerar ZIP." });
    }
  }
});
router2.get("/historico", async (_req, res) => {
  try {
    const db = await getDb();
    if (!db) return res.json([]);
    const rows = await db.select().from(processamentos).orderBy(processamentos.createdAt).limit(20);
    return res.json(rows.reverse());
  } catch (err) {
    console.error("[upload/historico]", err);
    return res.status(500).json({ error: err.message });
  }
});
router2.get("/consulta/search", async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    const tipoFilter = req.query.tipo || "";
    const disparoFilter = req.query.disparo || "";
    if (!q || q.length < 2) {
      return res.json({ results: [], total: 0, query: q });
    }
    const db = await getDb();
    if (!db) return res.json({ results: [], total: 0, query: q });
    const qDigits = q.replace(/\D/g, "");
    const isNumeric = qDigits.length > 0 && /^\d+$/.test(q.replace(/[.\-\/()\s]/g, ""));
    const conditions = [];
    if (isNumeric && qDigits.length >= 11) {
      conditions.push(like(registrosProcessados.documento, `%${qDigits}%`));
    } else if (isNumeric && qDigits.length >= 8) {
      conditions.push(like(registrosProcessados.telefone, `%${qDigits}%`));
    } else if (isNumeric) {
      conditions.push(like(registrosProcessados.telefone, `%${qDigits}%`));
      conditions.push(like(registrosProcessados.documento, `%${qDigits}%`));
    } else {
      conditions.push(like(registrosProcessados.nome, `%${q}%`));
    }
    let whereClause = conditions.length === 1 ? conditions[0] : or(...conditions);
    if (tipoFilter === "CPF") {
      whereClause = and(whereClause, eq2(registrosProcessados.tipoDoc, "CPF"));
    } else if (tipoFilter === "CNPJ") {
      whereClause = and(whereClause, eq2(registrosProcessados.tipoDoc, "CNPJ"));
    }
    if (disparoFilter === "ligacao") {
      whereClause = and(whereClause, eq2(registrosProcessados.tipoDisparo, "ligacao"));
    } else if (disparoFilter === "sms") {
      whereClause = and(whereClause, eq2(registrosProcessados.tipoDisparo, "sms"));
    }
    const rows = await db.select().from(registrosProcessados).where(whereClause).limit(500);
    return res.json({ results: rows, total: rows.length, query: q });
  } catch (err) {
    console.error("[consulta/search]", err);
    return res.status(500).json({ error: err.message });
  }
});
router2.get("/consulta/pessoa/:documento", async (req, res) => {
  try {
    const doc = req.params.documento.replace(/\D/g, "");
    if (!doc) return res.status(400).json({ error: "Documento inv\xE1lido" });
    const db = await getDb();
    if (!db) return res.json({ records: [], doc });
    const rows = await db.select().from(registrosProcessados).where(eq2(registrosProcessados.documento, doc)).limit(1e3);
    return res.json({ records: rows, doc });
  } catch (err) {
    console.error("[consulta/pessoa]", err);
    return res.status(500).json({ error: err.message });
  }
});
router2.get("/consulta/export-csv", async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    if (!q) return res.status(400).json({ error: "Query obrigat\xF3ria" });
    const db = await getDb();
    if (!db) return res.status(503).json({ error: "Banco indispon\xEDvel" });
    const qDigits = q.replace(/\D/g, "");
    const isNumeric = qDigits.length > 0 && /^\d+$/.test(q.replace(/[.\-\/()\s]/g, ""));
    let whereClause;
    if (isNumeric && qDigits.length >= 11) {
      whereClause = like(registrosProcessados.documento, `%${qDigits}%`);
    } else if (isNumeric && qDigits.length >= 8) {
      whereClause = like(registrosProcessados.telefone, `%${qDigits}%`);
    } else {
      whereClause = like(registrosProcessados.nome, `%${q}%`);
    }
    const rows = await db.select().from(registrosProcessados).where(whereClause).limit(5e3);
    const header = "ID;Processamento;Nome;Documento;Tipo;Telefone;Origem;Disparo;Protocolo;Arquivo;Data\r\n";
    const lines = rows.map(
      (r) => [
        r.id,
        r.processamentoId,
        r.nome ?? "",
        r.documento ?? "",
        r.tipoDoc,
        r.telefone ?? "",
        r.origemTelefone ?? "",
        r.tipoDisparo,
        r.protocolo ?? "",
        r.nomeArquivo ?? "",
        r.createdAt ? new Date(r.createdAt).toLocaleString("pt-BR") : ""
      ].join(";")
    );
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="consulta_${q.slice(0, 20)}.csv"`);
    return res.send(header + lines.join("\r\n"));
  } catch (err) {
    console.error("[consulta/export-csv]", err);
    return res.status(500).json({ error: err.message });
  }
});
var uploadRoutes_default = router2;

// server/contatosRoutes.ts
import { Router as Router2 } from "express";
import multer2 from "multer";
import { eq as eq3, or as or2, like as like2, and as and2, sql as sql2, desc } from "drizzle-orm";
var router3 = Router2();
var upload2 = multer2({
  storage: multer2.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = file.originalname.toLowerCase();
    if (ext.endsWith(".csv") || ext.endsWith(".xlsx") || ext.endsWith(".xls")) {
      cb(null, true);
    } else {
      cb(new Error("Formato n\xE3o suportado. Use CSV ou XLSX."));
    }
  }
});
function cleanDigits(v) {
  return (v ?? "").replace(/\D/g, "");
}
function classifyDoc(digits) {
  if (digits.length === 11) return "CPF";
  if (digits.length === 14) return "CNPJ";
  return "INVALIDO";
}
function tryCorrectDoc(digits) {
  const len = digits.length;
  if (len === 13) {
    const corrected = digits.padStart(14, "0");
    return { corrected, tipo: "CNPJ", method: "zero \xE0 esquerda adicionado (13\u219214 d\xEDgitos)" };
  }
  if (len === 12) {
    const corrected = digits.padStart(14, "0");
    return { corrected, tipo: "CNPJ", method: "zeros \xE0 esquerda adicionados (12\u219214 d\xEDgitos)" };
  }
  if (len === 10) {
    const corrected = digits.padStart(11, "0");
    return { corrected, tipo: "CPF", method: "zero \xE0 esquerda adicionado (10\u219211 d\xEDgitos)" };
  }
  if (len === 9) {
    const corrected = digits.padStart(11, "0");
    return { corrected, tipo: "CPF", method: "zeros \xE0 esquerda adicionados (9\u219211 d\xEDgitos)" };
  }
  return null;
}
var importProgressMap = /* @__PURE__ */ new Map();
var sseClientsMap = /* @__PURE__ */ new Map();
function cleanPhone2(v) {
  const d = cleanDigits(v);
  return d.length >= 8 ? d : null;
}
function cleanEmail(v) {
  const e = (v ?? "").trim().toLowerCase();
  return e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}
function detectContatoColumns(headers) {
  const map = {};
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const patterns = [
    ["documento", /cpf|cnpj|documento|doc/],
    ["nome", /nome|razao|razão|social/],
    ["celular1", /cel.*01|cel.*1|tel.*01|tel.*1|fone.*01|fone.*1|celular01|celular1/],
    ["celular2", /cel.*02|cel.*2|tel.*02|tel.*2|fone.*02|fone.*2|celular02|celular2/],
    ["celular3", /cel.*03|cel.*3|tel.*03|tel.*3|fone.*03|fone.*3|celular03|celular3/],
    ["celular4", /cel.*04|cel.*4|tel.*04|tel.*4|fone.*04|fone.*4|celular04|celular4/],
    ["email1", /e.?mail.*01|e.?mail.*1|email01|email1/],
    ["email2", /e.?mail.*02|e.?mail.*2|email02|email2/],
    ["email3", /e.?mail.*03|e.?mail.*3|email03|email3/]
  ];
  for (const [field, pattern] of patterns) {
    const found = headers.find((h) => pattern.test(norm(h)));
    if (found) map[field] = found;
  }
  return map;
}
router3.post("/parse", upload2.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Nenhum arquivo enviado." });
    const parsed = parseFile(req.file.buffer, req.file.mimetype, req.file.originalname);
    const suggestions = detectContatoColumns(parsed.headers);
    return res.json({
      headers: parsed.headers,
      suggestions,
      totalRows: parsed.rows.length,
      previewRows: parsed.rows.slice(0, 10)
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
router3.get("/import-progress/:jobId", (req, res) => {
  const { jobId } = req.params;
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  const current = importProgressMap.get(jobId);
  if (current) {
    res.write(`data: ${JSON.stringify(current)}

`);
    if (current.status === "done" || current.status === "error") {
      res.end();
      return;
    }
  }
  if (!sseClientsMap.has(jobId)) sseClientsMap.set(jobId, /* @__PURE__ */ new Set());
  sseClientsMap.get(jobId).add(res);
  req.on("close", () => {
    sseClientsMap.get(jobId)?.delete(res);
  });
});
function broadcastProgress(jobId, progress) {
  importProgressMap.set(jobId, progress);
  const clients = sseClientsMap.get(jobId);
  if (clients) {
    const data = `data: ${JSON.stringify(progress)}

`;
    for (const client of Array.from(clients)) {
      try {
        client.write(data);
      } catch {
      }
    }
    if (progress.status === "done" || progress.status === "error") {
      for (const client of Array.from(clients)) {
        try {
          client.end();
        } catch {
        }
      }
      clients.clear();
      setTimeout(() => importProgressMap.delete(jobId), 6e4);
    }
  }
}
router3.post("/import", upload2.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Nenhum arquivo enviado." });
    let mapping;
    try {
      mapping = JSON.parse(req.body.mapping || "{}");
    } catch {
      return res.status(400).json({ error: "Mapeamento inv\xE1lido." });
    }
    const duplicateMode = req.body.duplicateMode || "merge";
    const jobId = req.body.jobId || `job_${Date.now()}`;
    const parsed = parseFile(req.file.buffer, req.file.mimetype, req.file.originalname);
    const fileName = req.file.originalname;
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Banco de dados n\xE3o dispon\xEDvel." });
    let totalLidos = 0;
    let totalImportados = 0;
    let totalAtualizados = 0;
    let totalIgnorados = 0;
    let totalErros = 0;
    let totalCpf = 0;
    let totalCnpj = 0;
    let totalCorrigidos = 0;
    const erros = [];
    const correcoes = [];
    broadcastProgress(jobId, {
      status: "running",
      totalLidos: 0,
      totalProcessados: 0,
      totalImportados: 0,
      totalCorrigidos: 0,
      totalErros: 0,
      message: "Lendo e validando registros..."
    });
    const get = (row, col) => col ? row[col] ?? "" : "";
    const validRecords = [];
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
            metodo: correction.method
          });
          docDigits = correction.corrected;
          tipoDoc = correction.tipo;
          totalCorrigidos++;
        } else {
          totalErros++;
          erros.push({ linha, motivo: `Documento inv\xE1lido: "${docRaw}" (${docDigits.length} d\xEDgitos \u2014 n\xE3o foi poss\xEDvel corrigir)` });
          continue;
        }
      }
      if (tipoDoc === "CPF") totalCpf++;
      else totalCnpj++;
      validRecords.push({
        documento: docDigits,
        tipoDoc,
        nomeRazaoSocial: get(row, mapping.nome).trim() || null,
        celular1: cleanPhone2(get(row, mapping.celular1)),
        celular2: cleanPhone2(get(row, mapping.celular2)),
        celular3: cleanPhone2(get(row, mapping.celular3)),
        celular4: cleanPhone2(get(row, mapping.celular4)),
        email1: cleanEmail(get(row, mapping.email1)),
        email2: cleanEmail(get(row, mapping.email2)),
        email3: cleanEmail(get(row, mapping.email3)),
        origemArquivo: fileName
      });
    }
    broadcastProgress(jobId, {
      status: "running",
      totalLidos,
      totalProcessados: 0,
      totalImportados: 0,
      totalCorrigidos,
      totalErros,
      message: `${validRecords.length} registros v\xE1lidos. Importando...`
    });
    const BATCH_SIZE = 1e3;
    for (let b = 0; b < validRecords.length; b += BATCH_SIZE) {
      const batch = validRecords.slice(b, b + BATCH_SIZE);
      if (duplicateMode === "ignore") {
        await db.insert(contatos).values(batch).onConflictDoNothing();
        totalImportados += batch.length;
      } else if (duplicateMode === "update") {
        await db.insert(contatos).values(batch).onConflictDoUpdate({
          target: contatos.documento,
          set: {
            tipoDoc: sql2`EXCLUDED.tipo_doc`,
            nomeRazaoSocial: sql2`COALESCE(EXCLUDED.nome_razao_social, ${contatos.nomeRazaoSocial})`,
            celular1: sql2`COALESCE(EXCLUDED.celular1, ${contatos.celular1})`,
            celular2: sql2`COALESCE(EXCLUDED.celular2, ${contatos.celular2})`,
            celular3: sql2`COALESCE(EXCLUDED.celular3, ${contatos.celular3})`,
            celular4: sql2`COALESCE(EXCLUDED.celular4, ${contatos.celular4})`,
            email1: sql2`COALESCE(EXCLUDED.email1, ${contatos.email1})`,
            email2: sql2`COALESCE(EXCLUDED.email2, ${contatos.email2})`,
            email3: sql2`COALESCE(EXCLUDED.email3, ${contatos.email3})`,
            origemArquivo: sql2`EXCLUDED.origem_arquivo`
          }
        });
        totalImportados += batch.length;
        totalAtualizados += batch.length;
      } else {
        await db.insert(contatos).values(batch).onConflictDoUpdate({
          target: contatos.documento,
          set: {
            nomeRazaoSocial: sql2`COALESCE(${contatos.nomeRazaoSocial}, EXCLUDED.nome_razao_social)`,
            celular1: sql2`COALESCE(${contatos.celular1}, EXCLUDED.celular1)`,
            celular2: sql2`COALESCE(${contatos.celular2}, EXCLUDED.celular2)`,
            celular3: sql2`COALESCE(${contatos.celular3}, EXCLUDED.celular3)`,
            celular4: sql2`COALESCE(${contatos.celular4}, EXCLUDED.celular4)`,
            email1: sql2`COALESCE(${contatos.email1}, EXCLUDED.email1)`,
            email2: sql2`COALESCE(${contatos.email2}, EXCLUDED.email2)`,
            email3: sql2`COALESCE(${contatos.email3}, EXCLUDED.email3)`
          }
        });
        totalImportados += batch.length;
      }
      broadcastProgress(jobId, {
        status: "running",
        totalLidos,
        totalProcessados: Math.min(b + BATCH_SIZE, validRecords.length),
        totalImportados,
        totalCorrigidos,
        totalErros,
        message: `Importando... ${Math.min(b + BATCH_SIZE, validRecords.length)} de ${validRecords.length}`
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
      correcoes: correcoes.slice(0, 100)
    };
    broadcastProgress(jobId, {
      status: "done",
      totalLidos,
      totalProcessados: validRecords.length,
      totalImportados,
      totalCorrigidos,
      totalErros,
      message: "Importa\xE7\xE3o conclu\xEDda!",
      result
    });
    return res.json({ ...result, jobId });
  } catch (err) {
    console.error("[contatos/import]", err);
    return res.status(500).json({ error: err.message });
  }
});
router3.get("/", async (req, res) => {
  try {
    const db = await getDb();
    if (!db) return res.json({ data: [], total: 0 });
    const q = (req.query.q || "").trim();
    const tipo = req.query.tipo || "";
    const sort = req.query.sort || "recent";
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || "50", 10)));
    const offset = (page - 1) * limit;
    let whereClause = void 0;
    if (q) {
      const qDigits = q.replace(/\D/g, "");
      const conditions = [like2(contatos.nomeRazaoSocial, `%${q}%`)];
      if (qDigits.length >= 8) {
        conditions.push(like2(contatos.documento, `%${qDigits}%`));
        conditions.push(like2(contatos.celular1, `%${qDigits}%`));
        conditions.push(like2(contatos.celular2, `%${qDigits}%`));
        conditions.push(like2(contatos.celular3, `%${qDigits}%`));
        conditions.push(like2(contatos.celular4, `%${qDigits}%`));
      } else if (qDigits.length > 0) {
        conditions.push(like2(contatos.documento, `%${qDigits}%`));
      }
      if (q.includes("@")) {
        conditions.push(like2(contatos.email1, `%${q}%`));
        conditions.push(like2(contatos.email2, `%${q}%`));
        conditions.push(like2(contatos.email3, `%${q}%`));
      }
      whereClause = or2(...conditions);
    }
    if (tipo === "CPF") {
      whereClause = whereClause ? and2(whereClause, eq3(contatos.tipoDoc, "CPF")) : eq3(contatos.tipoDoc, "CPF");
    } else if (tipo === "CNPJ") {
      whereClause = whereClause ? and2(whereClause, eq3(contatos.tipoDoc, "CNPJ")) : eq3(contatos.tipoDoc, "CNPJ");
    }
    const { asc } = await import("drizzle-orm");
    const orderBy = sort === "az" ? asc(contatos.nomeRazaoSocial) : sort === "za" ? desc(contatos.nomeRazaoSocial) : desc(contatos.updatedAt);
    const [rows, countRows] = await Promise.all([
      whereClause ? db.select().from(contatos).where(whereClause).orderBy(orderBy).limit(limit).offset(offset) : db.select().from(contatos).orderBy(orderBy).limit(limit).offset(offset),
      whereClause ? db.select({ count: sql2`count(*)` }).from(contatos).where(whereClause) : db.select({ count: sql2`count(*)` }).from(contatos)
    ]);
    const total = Number(countRows[0]?.count ?? 0);
    return res.json({ data: rows, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error("[contatos/list]", err);
    return res.status(500).json({ error: err.message });
  }
});
router3.get("/:documento", async (req, res) => {
  try {
    const doc = req.params.documento.replace(/\D/g, "");
    if (!doc) return res.status(400).json({ error: "Documento inv\xE1lido" });
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Banco n\xE3o dispon\xEDvel" });
    const rows = await db.select().from(contatos).where(eq3(contatos.documento, doc)).limit(1);
    if (rows.length === 0) return res.status(404).json({ error: "Contato n\xE3o encontrado" });
    return res.json(rows[0]);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
router3.delete("/:documento", async (req, res) => {
  try {
    const doc = req.params.documento.replace(/\D/g, "");
    if (!doc) return res.status(400).json({ error: "Documento inv\xE1lido" });
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Banco n\xE3o dispon\xEDvel" });
    await db.delete(contatos).where(eq3(contatos.documento, doc));
    await db.delete(contatosHistorico).where(eq3(contatosHistorico.documento, doc));
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
router3.post("/", async (req, res) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Banco n\xE3o dispon\xEDvel" });
    const body = req.body;
    const docDigits = cleanDigits(body.documento);
    if (!docDigits) return res.status(400).json({ error: "CPF/CNPJ \xE9 obrigat\xF3rio" });
    let tipoDoc = classifyDoc(docDigits);
    if (tipoDoc === "INVALIDO") {
      const correction = tryCorrectDoc(docDigits);
      if (correction) {
        tipoDoc = correction.tipo;
      } else {
        return res.status(400).json({ error: `Documento inv\xE1lido: ${docDigits.length} d\xEDgitos. CPF deve ter 11 e CNPJ 14.` });
      }
    }
    const nome = (body.nomeRazaoSocial || "").trim();
    if (!nome) return res.status(400).json({ error: "Nome / Raz\xE3o Social \xE9 obrigat\xF3rio" });
    const celular1 = cleanPhone2(body.celular1);
    const celular2 = cleanPhone2(body.celular2);
    const celular3 = cleanPhone2(body.celular3);
    const celular4 = cleanPhone2(body.celular4);
    const email1 = cleanEmail(body.email1);
    const email2 = cleanEmail(body.email2);
    const email3 = cleanEmail(body.email3);
    const telefonePrincipal = parseInt(body.telefonePrincipal || "0", 10);
    const emailPrincipal = parseInt(body.emailPrincipal || "0", 10);
    const existing = await db.select({ id: contatos.id }).from(contatos).where(eq3(contatos.documento, docDigits)).limit(1);
    if (existing.length > 0) {
      return res.status(409).json({ error: "J\xE1 existe um contato com este CPF/CNPJ. Use a fun\xE7\xE3o de edi\xE7\xE3o para atualizar." });
    }
    await db.insert(contatos).values({
      documento: docDigits,
      tipoDoc,
      nomeRazaoSocial: nome,
      celular1,
      celular2,
      celular3,
      celular4,
      email1,
      email2,
      email3,
      origem: "manual",
      telefonePrincipal,
      emailPrincipal,
      ultimaEdicao: /* @__PURE__ */ new Date()
    });
    await db.insert(contatosHistorico).values({
      documento: docDigits,
      acao: "criado",
      descricao: "Contato criado manualmente",
      camposAlterados: null
    });
    const created = await db.select().from(contatos).where(eq3(contatos.documento, docDigits)).limit(1);
    return res.status(201).json(created[0]);
  } catch (err) {
    console.error("[contatos/create]", err);
    return res.status(500).json({ error: err.message });
  }
});
router3.put("/:documento", async (req, res) => {
  try {
    const doc = req.params.documento.replace(/\D/g, "");
    if (!doc) return res.status(400).json({ error: "Documento inv\xE1lido" });
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Banco n\xE3o dispon\xEDvel" });
    const existing = await db.select().from(contatos).where(eq3(contatos.documento, doc)).limit(1);
    if (existing.length === 0) return res.status(404).json({ error: "Contato n\xE3o encontrado" });
    const old = existing[0];
    const body = req.body;
    const nome = (body.nomeRazaoSocial || "").trim() || old.nomeRazaoSocial;
    const celular1 = cleanPhone2(body.celular1) ?? old.celular1;
    const celular2 = cleanPhone2(body.celular2) ?? old.celular2;
    const celular3 = cleanPhone2(body.celular3) ?? old.celular3;
    const celular4 = cleanPhone2(body.celular4) ?? old.celular4;
    const email1 = cleanEmail(body.email1) ?? old.email1;
    const email2 = cleanEmail(body.email2) ?? old.email2;
    const email3 = cleanEmail(body.email3) ?? old.email3;
    const camposAlterados = [];
    const trackChange = (campo, de, para) => {
      const deStr = de ?? null;
      const paraStr = para ?? null;
      if (deStr !== paraStr) camposAlterados.push({ campo, de: deStr, para: paraStr });
    };
    trackChange("Nome / Raz\xE3o Social", old.nomeRazaoSocial, nome);
    trackChange("Celular 01", old.celular1, celular1);
    trackChange("Celular 02", old.celular2, celular2);
    trackChange("Celular 03", old.celular3, celular3);
    trackChange("Celular 04", old.celular4, celular4);
    trackChange("E-mail 01", old.email1, email1);
    trackChange("E-mail 02", old.email2, email2);
    trackChange("E-mail 03", old.email3, email3);
    await db.update(contatos).set({
      nomeRazaoSocial: nome,
      celular1,
      celular2,
      celular3,
      celular4,
      email1,
      email2,
      email3,
      ultimaEdicao: /* @__PURE__ */ new Date()
    }).where(eq3(contatos.documento, doc));
    if (camposAlterados.length > 0) {
      await db.insert(contatosHistorico).values({
        documento: doc,
        acao: "editado",
        descricao: `${camposAlterados.length} campo(s) alterado(s)`,
        camposAlterados
      });
    }
    const updated = await db.select().from(contatos).where(eq3(contatos.documento, doc)).limit(1);
    return res.json(updated[0]);
  } catch (err) {
    console.error("[contatos/edit]", err);
    return res.status(500).json({ error: err.message });
  }
});
router3.post("/:documento/favoritar", async (req, res) => {
  try {
    const doc = req.params.documento.replace(/\D/g, "");
    if (!doc) return res.status(400).json({ error: "Documento inv\xE1lido" });
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Banco n\xE3o dispon\xEDvel" });
    const existing = await db.select().from(contatos).where(eq3(contatos.documento, doc)).limit(1);
    if (existing.length === 0) return res.status(404).json({ error: "Contato n\xE3o encontrado" });
    const old = existing[0];
    const tipo = req.body.tipo;
    const valor = parseInt(req.body.valor || "0", 10);
    const updateData = { ultimaEdicao: /* @__PURE__ */ new Date() };
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
    await db.update(contatos).set(updateData).where(eq3(contatos.documento, doc));
    const oldVal = tipo === "telefone" ? old.telefonePrincipal : old.emailPrincipal;
    if (oldVal !== valor) {
      await db.insert(contatosHistorico).values({
        documento: doc,
        acao: "favorito_alterado",
        descricao,
        camposAlterados: null
      });
    }
    const updated = await db.select().from(contatos).where(eq3(contatos.documento, doc)).limit(1);
    return res.json(updated[0]);
  } catch (err) {
    console.error("[contatos/favoritar]", err);
    return res.status(500).json({ error: err.message });
  }
});
router3.get("/:documento/historico", async (req, res) => {
  try {
    const doc = req.params.documento.replace(/\D/g, "");
    if (!doc) return res.status(400).json({ error: "Documento inv\xE1lido" });
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Banco n\xE3o dispon\xEDvel" });
    const rows = await db.select().from(contatosHistorico).where(eq3(contatosHistorico.documento, doc)).orderBy(desc(contatosHistorico.criadoEm)).limit(100);
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
var contatosRoutes_default = router3;

// server/whatsappRoutes.ts
import { Router as Router3 } from "express";
import { eq as eq4 } from "drizzle-orm";
import fetch3 from "node-fetch";
var router4 = Router3();
var VARIAVEIS_DISPONIVEIS = [
  { variavel: "{{telefone}}", descricao: "N\xFAmero de telefone (somente d\xEDgitos)" },
  { variavel: "{{nome}}", descricao: "Nome completo do devedor" },
  { variavel: "{{documento}}", descricao: "CPF ou CNPJ (somente d\xEDgitos)" },
  { variavel: "{{documento_fmt}}", descricao: "CPF ou CNPJ formatado (XXX.XXX.XXX-XX)" },
  { variavel: "{{tipo_doc}}", descricao: "Tipo do documento: CPF ou CNPJ" },
  { variavel: "{{protocolo}}", descricao: "N\xFAmero do protocolo" }
];
function formatDocument(doc, tipo) {
  const d = doc.replace(/\D/g, "");
  if (tipo === "CPF" && d.length === 11) {
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }
  if (tipo === "CNPJ" && d.length === 14) {
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  }
  return d;
}
function resolveVariavel(variavel, ctx) {
  switch (variavel) {
    case "{{telefone}}":
      return ctx.telefone;
    case "{{nome}}":
      return ctx.nome;
    case "{{documento}}":
      return ctx.documento;
    case "{{documento_fmt}}":
      return formatDocument(ctx.documento, ctx.tipoDoc);
    case "{{tipo_doc}}":
      return ctx.tipoDoc;
    case "{{protocolo}}":
      return ctx.protocolo;
    default:
      return variavel;
  }
}
function serializeCsvRow(cells) {
  return cells.map((c) => {
    const v = String(c ?? "");
    if (v.includes(",") || v.includes('"') || v.includes("\n")) {
      return '"' + v.replace(/"/g, '""') + '"';
    }
    return v;
  }).join(",");
}
router4.get("/variaveis", (_req, res) => {
  return res.json(VARIAVEIS_DISPONIVEIS);
});
router4.get("/templates", async (_req, res) => {
  try {
    const db = await getDb();
    if (!db) return res.status(503).json({ error: "Banco de dados indispon\xEDvel." });
    const rows = await db.select().from(whatsappTemplates).orderBy(whatsappTemplates.id);
    return res.json(rows);
  } catch (err) {
    console.error("[whatsapp/templates GET]", err);
    return res.status(500).json({ error: err.message });
  }
});
router4.post("/templates", async (req, res) => {
  try {
    const { nome, descricao, colunas, padrao } = req.body;
    if (!nome || !Array.isArray(colunas) || colunas.length === 0) {
      return res.status(400).json({ error: "Nome e pelo menos uma coluna s\xE3o obrigat\xF3rios." });
    }
    const db = await getDb();
    if (!db) return res.status(503).json({ error: "Banco de dados indispon\xEDvel." });
    if (padrao) {
      await db.update(whatsappTemplates).set({ padrao: 0 }).where(eq4(whatsappTemplates.padrao, 1));
    }
    const result = await db.insert(whatsappTemplates).values({
      nome,
      descricao: descricao || null,
      colunas,
      padrao: padrao ? 1 : 0
    });
    const id = result.insertId;
    const created = await db.select().from(whatsappTemplates).where(eq4(whatsappTemplates.id, id));
    return res.status(201).json(created[0]);
  } catch (err) {
    console.error("[whatsapp/templates POST]", err);
    return res.status(500).json({ error: err.message });
  }
});
router4.put("/templates/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "ID inv\xE1lido." });
    const { nome, descricao, colunas, padrao } = req.body;
    const db = await getDb();
    if (!db) return res.status(503).json({ error: "Banco de dados indispon\xEDvel." });
    if (padrao) {
      await db.update(whatsappTemplates).set({ padrao: 0 }).where(eq4(whatsappTemplates.padrao, 1));
    }
    const updates = {};
    if (nome !== void 0) updates.nome = nome;
    if (descricao !== void 0) updates.descricao = descricao;
    if (colunas !== void 0) updates.colunas = colunas;
    if (padrao !== void 0) updates.padrao = padrao ? 1 : 0;
    await db.update(whatsappTemplates).set(updates).where(eq4(whatsappTemplates.id, id));
    const updated = await db.select().from(whatsappTemplates).where(eq4(whatsappTemplates.id, id));
    if (!updated.length) return res.status(404).json({ error: "Template n\xE3o encontrado." });
    return res.json(updated[0]);
  } catch (err) {
    console.error("[whatsapp/templates PUT]", err);
    return res.status(500).json({ error: err.message });
  }
});
router4.delete("/templates/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "ID inv\xE1lido." });
    const db = await getDb();
    if (!db) return res.status(503).json({ error: "Banco de dados indispon\xEDvel." });
    await db.delete(whatsappTemplates).where(eq4(whatsappTemplates.id, id));
    return res.json({ ok: true });
  } catch (err) {
    console.error("[whatsapp/templates DELETE]", err);
    return res.status(500).json({ error: err.message });
  }
});
router4.post("/templates/:id/padrao", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "ID inv\xE1lido." });
    const db = await getDb();
    if (!db) return res.status(503).json({ error: "Banco de dados indispon\xEDvel." });
    await db.update(whatsappTemplates).set({ padrao: 0 }).where(eq4(whatsappTemplates.padrao, 1));
    await db.update(whatsappTemplates).set({ padrao: 1 }).where(eq4(whatsappTemplates.id, id));
    return res.json({ ok: true });
  } catch (err) {
    console.error("[whatsapp/templates padrao]", err);
    return res.status(500).json({ error: err.message });
  }
});
router4.post("/exportar", async (req, res) => {
  try {
    const { templateId, fileUrl, tipoDoc = "TODOS" } = req.body;
    if (!templateId || !fileUrl) {
      return res.status(400).json({ error: "templateId e fileUrl s\xE3o obrigat\xF3rios." });
    }
    const db = await getDb();
    if (!db) return res.status(503).json({ error: "Banco de dados indispon\xEDvel." });
    const [template] = await db.select().from(whatsappTemplates).where(eq4(whatsappTemplates.id, templateId));
    if (!template) return res.status(404).json({ error: "Template n\xE3o encontrado." });
    const colunas = template.colunas;
    const fetchResp = await fetch3(fileUrl);
    if (!fetchResp.ok) {
      return res.status(502).json({ error: "N\xE3o foi poss\xEDvel baixar o arquivo de origem." });
    }
    const csvText = await fetchResp.text();
    const lines = csvText.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) {
      return res.status(400).json({ error: "Arquivo de origem vazio ou sem dados." });
    }
    const headers = lines[0].split(";").map((h) => h.replace(/^"|"$/g, "").trim());
    const SMS_PHONE_COL2 = 20;
    const telefoneIdx = (() => {
      const byName = headers.findIndex((h) => /^telefone$/i.test(h.trim()));
      return byName >= 0 ? byName : SMS_PHONE_COL2;
    })();
    const tipoDocIdx = headers.findIndex(
      (h) => /cpf.?ou.?cnpj/i.test(h) || /tipo.?doc/i.test(h) || /tipo_doc/i.test(h)
    );
    const documentoIdx = headers.findIndex(
      (h) => /cpf.?cnpj.?devedor/i.test(h) || /cpf.?cnpj/i.test(h) || /documento/i.test(h)
    );
    const phoneMap = /* @__PURE__ */ new Map();
    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i].split(";").map((c) => c.replace(/^"|"$/g, "").trim());
      const nome = cells[0] ?? "";
      const protocolo = cells[1] ?? "";
      const telefone = (cells[telefoneIdx] ?? "").replace(/\D/g, "");
      const rawDoc = documentoIdx >= 0 ? cells[documentoIdx] ?? "" : "";
      const documento = rawDoc.replace(/\D/g, "");
      let docTipo = "INVALIDO";
      if (tipoDocIdx >= 0) {
        const v = (cells[tipoDocIdx] ?? "").toUpperCase().trim();
        if (v === "CPF") docTipo = "CPF";
        else if (v === "CNPJ") docTipo = "CNPJ";
      } else {
        if (documento.length === 11) docTipo = "CPF";
        else if (documento.length === 14) docTipo = "CNPJ";
      }
      if (tipoDoc !== "TODOS" && docTipo !== tipoDoc) continue;
      if (!telefone) continue;
      if (phoneMap.has(telefone)) {
        const existing = phoneMap.get(telefone);
        if (protocolo && !existing.protocolo.split(" / ").includes(protocolo)) {
          existing.protocolo = existing.protocolo ? `${existing.protocolo} / ${protocolo}` : protocolo;
        }
      } else {
        phoneMap.set(telefone, { nome, documento, docTipo, protocolo });
      }
    }
    const outputLines = [];
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
  } catch (err) {
    console.error("[whatsapp/exportar]", err);
    return res.status(500).json({ error: err.message });
  }
});
var whatsappRoutes_default = router4;

// server/emailRoutes.ts
import { Router as Router4 } from "express";
import multer3 from "multer";
import archiver2 from "archiver";

// server/processadorEmail.ts
import * as XLSX2 from "xlsx";
var DEFAULT_SPAM_THRESHOLD = 5;
var NOME_PATTERNS2 = [
  /^devedor$/i,
  /nome.?devedor/i,
  /^nome$/i,
  /^razao.?social/i,
  /^cliente$/i
];
var DOC_PATTERNS2 = [
  /cpf.?cnpj.?devedor/i,
  /^cpf.?cnpj$/i,
  /^documento$/i,
  /^cpf$/i,
  /^cnpj$/i
];
var PROTOCOLO_PATTERNS2 = [
  /^protocolo$/i,
  /^prot$/i,
  /protocolo.?intimado/i,
  /^numero.?protocolo/i
];
var VALOR_PATTERNS = [
  /^valor.?protesto$/i,
  /^valor$/i,
  /^valor.?total$/i,
  /^vl.?protesto/i
];
var CREDOR_NOME_PATTERNS = [
  /nome.?credor/i,
  /^credor$/i,
  /^nome.?do.?credor$/i
];
var CREDOR_DOC_PATTERNS = [
  /cpf.?cnpj.?credor/i,
  /doc.?credor/i
];
var EMAIL_PATTERNS = [
  /e.?mail/i,
  /email/i,
  /^mail$/i,
  /^e-mail/i
];
function matchesAny(col, patterns) {
  return patterns.some((p) => p.test(col.trim()));
}
function findFirst(headers, patterns) {
  return headers.find((h) => matchesAny(h, patterns)) ?? null;
}
function isValidEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}
function serializeRow2(cells) {
  return cells.map((c) => {
    const v = String(c ?? "");
    if (v.includes(",") || v.includes('"') || v.includes("\n")) {
      return '"' + v.replace(/"/g, '""') + '"';
    }
    return v;
  }).join(",");
}
function detectDocType(doc) {
  const d = doc.replace(/\D/g, "");
  if (d.length === 11) return "CPF";
  if (d.length === 14) return "CNPJ";
  return "INVALIDO";
}
function parseEmailFile(buffer, mimetype, filename) {
  let rows;
  let headers;
  const isXlsx = mimetype.includes("spreadsheetml") || filename.toLowerCase().endsWith(".xlsx") || filename.toLowerCase().endsWith(".xls");
  if (isXlsx) {
    const wb = XLSX2.read(buffer, { type: "buffer" });
    const ws2 = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX2.utils.sheet_to_json(ws2, { header: 1, defval: "" });
    if (!data.length) throw new Error("Planilha vazia.");
    headers = data[0].map((h) => String(h ?? "").trim());
    rows = data.slice(1).map((r) => {
      const obj = {};
      headers.forEach((h, i) => obj[h] = String(r[i] ?? "").trim());
      return obj;
    });
  } else {
    const text2 = buffer.toString("utf-8").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const firstLine = text2.split("\n")[0];
    const sep = firstLine.includes(";") ? ";" : ",";
    const wb = XLSX2.read(buffer, { type: "buffer", FS: sep, codepage: 65001 });
    const ws2 = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX2.utils.sheet_to_json(ws2, { header: 1, defval: "" });
    if (!data.length) throw new Error("Arquivo vazio.");
    headers = data[0].map((h) => String(h ?? "").trim());
    rows = data.slice(1).map((r) => {
      const obj = {};
      headers.forEach((h, i) => obj[h] = String(r[i] ?? "").trim());
      return obj;
    });
  }
  const emailCols = headers.filter((h) => matchesAny(h, EMAIL_PATTERNS)).slice(0, 5);
  const suggestions = {
    nomeCol: findFirst(headers, NOME_PATTERNS2),
    documentoCol: findFirst(headers, DOC_PATTERNS2),
    protocoloCol: findFirst(headers, PROTOCOLO_PATTERNS2),
    valorCol: findFirst(headers, VALOR_PATTERNS),
    nomeCredorCol: findFirst(headers, CREDOR_NOME_PATTERNS),
    docCredorCol: findFirst(headers, CREDOR_DOC_PATTERNS),
    emailCols,
    spamThreshold: DEFAULT_SPAM_THRESHOLD
  };
  return {
    headers,
    suggestions,
    totalRows: rows.length,
    previewRows: rows.slice(0, 10)
  };
}
function processEmailData(buffer, mimetype, filename, mapping) {
  const isXlsx = mimetype.includes("spreadsheetml") || filename.toLowerCase().endsWith(".xlsx") || filename.toLowerCase().endsWith(".xls");
  let rows;
  let headers;
  if (isXlsx) {
    const wb = XLSX2.read(buffer, { type: "buffer" });
    const ws2 = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX2.utils.sheet_to_json(ws2, { header: 1, defval: "" });
    headers = data[0].map((h) => String(h ?? "").trim());
    rows = data.slice(1).map((r) => {
      const obj = {};
      headers.forEach((h, i) => obj[h] = String(r[i] ?? "").trim());
      return obj;
    });
  } else {
    const text2 = buffer.toString("utf-8").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const firstLine = text2.split("\n")[0];
    const sep = firstLine.includes(";") ? ";" : ",";
    const wb = XLSX2.read(buffer, { type: "buffer", FS: sep, codepage: 65001 });
    const ws2 = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX2.utils.sheet_to_json(ws2, { header: 1, defval: "" });
    headers = data[0].map((h) => String(h ?? "").trim());
    rows = data.slice(1).map((r) => {
      const obj = {};
      headers.forEach((h, i) => obj[h] = String(r[i] ?? "").trim());
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
    spamThreshold = DEFAULT_SPAM_THRESHOLD
  } = mapping;
  const emailMap = /* @__PURE__ */ new Map();
  const semEmailRows = [];
  for (const row of rows) {
    const emailsInRow = /* @__PURE__ */ new Set();
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
        const entry = emailMap.get(email);
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
          valores: valor ? [valor] : []
        });
      }
    }
  }
  const normalEntries = [];
  const flaggedEntries = [];
  for (const [email, entry] of Array.from(emailMap.entries())) {
    if (entry.protocolos.length >= spamThreshold) {
      flaggedEntries.push([email, entry]);
    } else {
      normalEntries.push([email, entry]);
    }
  }
  flaggedEntries.sort((a, b) => b[1].protocolos.length - a[1].protocolos.length);
  const OUTPUT_HEADERS = [
    "E-MAIL",
    "QTDE_PROTOCOLOS",
    "PROTOCOLOS",
    "DEVEDOR",
    "CPF_CNPJ",
    "TIPO_DOC",
    "VALOR_TOTAL",
    "NOME_CREDOR",
    "CPF_CNPJ_CREDOR"
  ];
  function buildOutputRow(email, entry) {
    return [
      email,
      String(entry.protocolos.length),
      entry.protocolos.join(" | "),
      entry.devedor,
      entry.cpfCnpj,
      entry.tipoDoc,
      entry.valores.join(" | "),
      entry.nomeCreador,
      entry.docCreador
    ];
  }
  function buildCsv(entries) {
    const lines = [
      serializeRow2(OUTPUT_HEADERS),
      ...entries.map(([email, entry]) => serializeRow2(buildOutputRow(email, entry)))
    ];
    const BOM = "\uFEFF";
    return Buffer.from(BOM + lines.join("\r\n"), "utf-8");
  }
  const normalCsv = buildCsv(normalEntries);
  const alertaCsv = buildCsv(flaggedEntries);
  function buildSemEmailCsv() {
    if (semEmailRows.length === 0) {
      return Buffer.from(serializeRow2(headers) + "\r\n", "utf-8");
    }
    const lines = [
      serializeRow2(headers),
      ...semEmailRows.map((r) => serializeRow2(headers.map((h) => r[h] ?? "")))
    ];
    const BOM = "\uFEFF";
    return Buffer.from(BOM + lines.join("\r\n"), "utf-8");
  }
  const semEmailCsv = buildSemEmailCsv();
  const emailEntries = Array.from(emailMap.entries()).map(([email, entry]) => ({
    email,
    ...entry
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
    emailEntries
  };
}

// server/emailRoutes.ts
import { nanoid as nanoid2 } from "nanoid";
var router5 = Router4();
var upload3 = multer3({
  storage: multer3.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  // 50 MB
  fileFilter: (_req, file, cb) => {
    const ext = file.originalname.toLowerCase();
    const allowed = [
      "text/csv",
      "application/csv",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/plain"
    ];
    if (allowed.includes(file.mimetype) || ext.endsWith(".csv") || ext.endsWith(".xlsx") || ext.endsWith(".xls")) {
      cb(null, true);
    } else {
      cb(new Error("Formato n\xE3o suportado. Use CSV ou XLSX."));
    }
  }
});
router5.post("/parse", upload3.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Nenhum arquivo enviado." });
    const result = parseEmailFile(req.file.buffer, req.file.mimetype, req.file.originalname);
    return res.json(result);
  } catch (err) {
    console.error("[email/parse]", err);
    return res.status(500).json({ error: err.message || "Erro ao ler arquivo." });
  }
});
router5.post("/process", upload3.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Nenhum arquivo enviado." });
    let mapping;
    try {
      mapping = JSON.parse(req.body.mapping || "{}");
    } catch {
      return res.status(400).json({ error: "Mapeamento inv\xE1lido." });
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
    const id = nanoid2(10);
    const [normalUpload, alertaUpload, semEmailUpload] = await Promise.all([
      storagePut(`email-exports/${id}/EMAIL_NORMAL.csv`, result.normalCsv, "text/csv"),
      storagePut(`email-exports/${id}/EMAIL_ALERTA_SPAM.csv`, result.alertaCsv, "text/csv"),
      storagePut(`email-exports/${id}/SEM_EMAIL.csv`, result.semEmailCsv, "text/csv")
    ]);
    let contatosSyncResult = { total: 0, upserted: 0, skipped: 0 };
    try {
      const contactRecords = buildContactsFromEmailRecords(result.emailEntries);
      contatosSyncResult = await syncContatos(contactRecords, req.file.originalname);
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
        spamThreshold: result.spamThreshold
      },
      contatosSynced: contatosSyncResult,
      files: {
        normal: { url: normalUpload.url, name: "EMAIL_NORMAL.csv" },
        alerta: { url: alertaUpload.url, name: "EMAIL_ALERTA_SPAM.csv" },
        semEmail: { url: semEmailUpload.url, name: "SEM_EMAIL.csv" }
      }
    });
  } catch (err) {
    console.error("[email/process]", err);
    return res.status(500).json({ error: err.message || "Erro ao processar arquivo." });
  }
});
router5.post("/download-zip", async (req, res) => {
  try {
    const { files } = req.body;
    if (!files?.normal || !files?.alerta || !files?.semEmail) {
      return res.status(400).json({ error: "URLs dos arquivos ausentes." });
    }
    const [normalBuf, alertaBuf, semEmailBuf] = await Promise.all([
      fetch(files.normal).then((r) => r.arrayBuffer()),
      fetch(files.alerta).then((r) => r.arrayBuffer()),
      fetch(files.semEmail).then((r) => r.arrayBuffer())
    ]);
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="EMAIL_DISPAROS.zip"`);
    const archive = archiver2("zip", { zlib: { level: 6 } });
    archive.pipe(res);
    archive.append(Buffer.from(normalBuf), { name: "EMAIL_NORMAL.csv" });
    archive.append(Buffer.from(alertaBuf), { name: "EMAIL_ALERTA_SPAM.csv" });
    archive.append(Buffer.from(semEmailBuf), { name: "SEM_EMAIL.csv" });
    await archive.finalize();
  } catch (err) {
    console.error("[email/download-zip]", err);
    if (!res.headersSent) {
      return res.status(500).json({ error: err.message });
    }
  }
});
var emailRoutes_default = router5;

// server/protocolosRoutes.ts
import express from "express";
import multer4 from "multer";
import * as XLSX3 from "xlsx";
import { eq as eq5, like as like3, or as or3, and as and3, inArray, sql as sql3 } from "drizzle-orm";
var router6 = express.Router();
var upload4 = multer4({ storage: multer4.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
function cleanDigits2(v) {
  if (!v) return "";
  return String(v).replace(/\D/g, "");
}
function classifyDoc2(digits) {
  if (digits.length === 11) return "CPF";
  if (digits.length === 14) return "CNPJ";
  return "INVALIDO";
}
function formatDoc(digits) {
  if (digits.length === 11) return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (digits.length === 14) return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return digits;
}
function cleanPhone3(v) {
  if (!v) return "";
  const d = String(v).replace(/\D/g, "");
  if (d.toLowerCase() === "sem contato" || d.length < 8) return "";
  return d;
}
function parseDateStr(raw) {
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parts = raw.split(/[\/\-]/);
  if (parts.length === 3) {
    let [a, b, c] = parts.map(Number);
    if (c < 100) c += 2e3;
    if (c > 31) {
      return `${c}-${String(a).padStart(2, "0")}-${String(b).padStart(2, "0")}`;
    }
    return `${c}-${String(b).padStart(2, "0")}-${String(a).padStart(2, "0")}`;
  }
  return null;
}
function detectColumns3(headers) {
  const h = headers.map((x) => x.toLowerCase().trim());
  const norm = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const hn = h.map(norm);
  const find = (...patterns) => {
    for (const p of patterns) {
      const pn = norm(p);
      let idx = hn.findIndex((x) => x === pn);
      if (idx !== -1) return headers[idx];
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
      "n\xFAmero t\xEDtulo",
      "numero titulo",
      "n\xFAmero do t\xEDtulo",
      "numero do titulo",
      "nosso n\xFAmero",
      "nosso numero",
      "t\xEDtulo",
      "titulo"
    ),
    credorCol: find("nome_do_credor", "credor", "cedente"),
    docCredorCol: find("cpf/cnpj_do_credor", "cpf/cnpj credor", "cnpj credor", "doc credor"),
    telefoneCol: find("telefone 01", "telefone devedor", "telefone 1", "telefone1", "celular"),
    valorCol: find("valor_total", "valor protesto", "valor")
  };
}
router6.post("/parse", upload4.single("file"), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Arquivo n\xE3o enviado." });
    const wb = XLSX3.read(req.file.buffer, { type: "buffer", codepage: 65001 });
    const ws2 = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX3.utils.sheet_to_json(ws2, { defval: "" });
    if (rows.length === 0) return res.status(400).json({ error: "Planilha vazia." });
    const headers = Object.keys(rows[0]);
    const suggestions = detectColumns3(headers);
    res.json({
      headers,
      suggestions,
      totalRows: rows.length,
      previewRows: rows.slice(0, 5)
    });
  } catch (err) {
    res.status(500).json({ error: err.message || "Erro ao ler arquivo." });
  }
});
router6.post("/import", upload4.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Arquivo n\xE3o enviado." });
    const mapping = JSON.parse(req.body.mapping || "{}");
    const wb = XLSX3.read(req.file.buffer, { type: "buffer", codepage: 65001 });
    const ws2 = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX3.utils.sheet_to_json(ws2, { defval: "" });
    if (rows.length === 0) return res.status(400).json({ error: "Planilha vazia." });
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Banco de dados n\xE3o dispon\xEDvel." });
    const nomeArquivo = req.file.originalname;
    const toInsert = [];
    const situacaoColAuto = (() => {
      const norm = (s) => s.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const h = Object.keys(rows[0]);
      return h.find(
        (col) => norm(col).includes("situacao atual") || norm(col) === "situacao" || norm(col) === "situacao pesquisada"
      ) || null;
    })();
    const dataProtocoloColAuto = (() => {
      const norm = (s) => s.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const h = Object.keys(rows[0]);
      return h.find((col) => {
        const n = norm(col);
        return n === "data protocolo" || n === "data_protocolo" || n === "dataprotocolo" || n.includes("data prot");
      }) || null;
    })();
    for (const row of rows) {
      const protocoloVal = String(row[mapping.protocoloCol] || "").trim();
      if (!protocoloVal) continue;
      const docRaw = cleanDigits2(row[mapping.documentoCol]);
      const tipoDoc = classifyDoc2(docRaw);
      const telefoneClean = cleanPhone3(row[mapping.telefoneCol]);
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
        docCredor: cleanDigits2(row[mapping.docCredorCol]) || null,
        telefone: telefoneClean || null,
        valorProtesto: String(row[mapping.valorCol] || "").trim() || null,
        nomeArquivo,
        dataProtocolo: dataProtocoloParsed,
        situacaoTitulo: situacaoRaw || null,
        tituloEncerrado: encerrado ? 1 : 0,
        statusIntimacao: isEdital ? "intimado" : "pendente",
        canalIntimacao: isEdital ? "Edital" : null,
        intimadoEm: isEdital ? /* @__PURE__ */ new Date() : null
      });
    }
    let imported = 0;
    const CHUNK = 500;
    for (let i = 0; i < toInsert.length; i += CHUNK) {
      const chunk = toInsert.slice(i, i + CHUNK);
      await db.insert(protocolos).values(chunk).onConflictDoUpdate({
        target: [protocolos.protocolo, protocolos.documento],
        set: {
          nomeDevedor: sql3`CASE WHEN ${protocolos.nomeDevedor} IS NULL OR ${protocolos.nomeDevedor} = '' THEN EXCLUDED.nome_devedor ELSE ${protocolos.nomeDevedor} END`,
          tipoDoc: sql3`CASE WHEN ${protocolos.tipoDoc} = 'INVALIDO' THEN EXCLUDED.tipo_doc ELSE ${protocolos.tipoDoc} END`,
          numeroTitulo: sql3`CASE WHEN ${protocolos.numeroTitulo} IS NULL OR ${protocolos.numeroTitulo} = '' THEN EXCLUDED.numero_titulo ELSE ${protocolos.numeroTitulo} END`,
          credor: sql3`CASE WHEN ${protocolos.credor} IS NULL OR ${protocolos.credor} = '' THEN EXCLUDED.credor ELSE ${protocolos.credor} END`,
          docCredor: sql3`CASE WHEN ${protocolos.docCredor} IS NULL OR ${protocolos.docCredor} = '' THEN EXCLUDED.doc_credor ELSE ${protocolos.docCredor} END`,
          telefone: sql3`CASE WHEN ${protocolos.telefone} IS NULL OR ${protocolos.telefone} = '' THEN EXCLUDED.telefone ELSE ${protocolos.telefone} END`,
          valorProtesto: sql3`CASE WHEN ${protocolos.valorProtesto} IS NULL OR ${protocolos.valorProtesto} = '' THEN EXCLUDED.valor_protesto ELSE ${protocolos.valorProtesto} END`,
          nomeArquivo: sql3`EXCLUDED.nome_arquivo`
        }
      });
      imported += chunk.length;
    }
    const contactsToSync = toInsert.filter((p) => p.documento && p.tipoDoc !== "INVALIDO").map((p) => ({
      documento: p.documento,
      tipoDoc: p.tipoDoc,
      nomeRazaoSocial: p.nomeDevedor || void 0,
      celular1: p.telefone || void 0,
      origemArquivo: nomeArquivo
    }));
    let contatosSynced = { total: 0, upserted: 0, skipped: 0 };
    if (contactsToSync.length > 0) {
      contatosSynced = await syncContatos(contactsToSync, nomeArquivo);
    }
    res.json({
      success: true,
      total: rows.length,
      imported,
      contatosSynced
    });
  } catch (err) {
    console.error("[protocolos/import]", err);
    res.status(500).json({ error: err.message || "Erro ao importar protocolos." });
  }
});
router6.post("/enriquecer", upload4.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Arquivo n\xE3o enviado." });
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Banco de dados n\xE3o dispon\xEDvel." });
    const wb = XLSX3.read(req.file.buffer, { type: "buffer", codepage: 65001 });
    const ws2 = wb.Sheets[wb.SheetNames[0]];
    const rawRows = XLSX3.utils.sheet_to_json(ws2, { defval: "" });
    if (rawRows.length === 0) return res.status(400).json({ error: "Planilha vazia." });
    const headers = Object.keys(rawRows[0]);
    const norm = (s) => s.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const hn = headers.map(norm);
    const findCol = (...patterns) => {
      for (const p of patterns) {
        const pn = norm(p);
        let idx = hn.findIndex((x) => x === pn);
        if (idx !== -1) return headers[idx];
        idx = hn.findIndex((x) => x.includes(pn));
        if (idx !== -1) return headers[idx];
      }
      return null;
    };
    const cols = {
      protocolo: findCol("protocolo"),
      dataProtocolo: findCol("data protocolo", "data_protocolo"),
      numeroTitulo: findCol("numero titulo", "n\xFAmero t\xEDtulo", "numero do titulo", "n\xFAmero do t\xEDtulo", "nosso numero"),
      devedor: findCol("devedor", "nome devedor", "nome"),
      docDevedor: findCol("cpf/cnpj devedor", "cpf/cnpj", "documento devedor", "cpf", "cnpj"),
      telefone: findCol("telefone devedor", "telefone 01", "telefone1", "telefone"),
      credor: findCol("credor", "nome credor", "cedente"),
      docCredor: findCol("cpf/cnpj credor", "cnpj credor", "doc credor"),
      valor: findCol("valor protesto", "valor total", "valor"),
      situacao: findCol("situacao", "situa\xE7\xE3o", "situacao atual")
    };
    if (!cols.protocolo) return res.status(400).json({ error: "Coluna 'Protocolo' n\xE3o encontrada no arquivo." });
    if (!cols.docDevedor) return res.status(400).json({ error: "Coluna de CPF/CNPJ do devedor n\xE3o encontrada." });
    const enrichMap = /* @__PURE__ */ new Map();
    for (const row of rawRows) {
      const protocoloVal = String(row[cols.protocolo] || "").trim();
      if (!protocoloVal) continue;
      const docRaw = cleanDigits2(cols.docDevedor ? row[cols.docDevedor] : "");
      if (!docRaw) continue;
      const key = `${protocoloVal}|${docRaw}`;
      const situacaoRaw = cols.situacao ? String(row[cols.situacao] || "").trim().toUpperCase() : null;
      const encerrado = situacaoRaw ? isSituacaoEncerrada(situacaoRaw) : false;
      const isEdital = situacaoRaw === "EDITAL";
      const dataProtocoloRaw = cols.dataProtocolo ? String(row[cols.dataProtocolo] || "").trim() : "";
      const dataProtocoloParsed = parseDateStr(dataProtocoloRaw);
      const entry = {};
      if (cols.devedor) {
        const v = String(row[cols.devedor] || "").trim();
        if (v) entry.nomeDevedor = v;
      }
      if (cols.numeroTitulo) {
        const v = String(row[cols.numeroTitulo] || "").trim();
        if (v) entry.numeroTitulo = v;
      }
      if (cols.credor) {
        const v = String(row[cols.credor] || "").trim();
        if (v) entry.credor = v;
      }
      if (cols.docCredor) {
        const v = cleanDigits2(row[cols.docCredor]);
        if (v) entry.docCredor = v;
      }
      if (cols.telefone) {
        const v = cleanPhone3(row[cols.telefone]);
        if (v) entry.telefone = v;
      }
      if (cols.valor) {
        const v = String(row[cols.valor] || "").trim();
        if (v) entry.valorProtesto = v;
      }
      if (dataProtocoloParsed) entry.dataProtocolo = dataProtocoloParsed;
      if (situacaoRaw) {
        entry.situacaoTitulo = situacaoRaw;
        entry.tituloEncerrado = encerrado ? 1 : 0;
        if (isEdital) {
          entry.statusIntimacao = "intimado";
          entry.canalIntimacao = "Edital";
          entry.intimadoEm = /* @__PURE__ */ new Date();
        }
      }
      enrichMap.set(key, entry);
    }
    if (enrichMap.size === 0) return res.status(400).json({ error: "Nenhum registro v\xE1lido encontrado no arquivo." });
    const allKeys = Array.from(enrichMap.keys());
    const CHUNK = 500;
    let found = 0;
    let enriched = 0;
    let skipped = 0;
    let notFound = 0;
    for (let i = 0; i < allKeys.length; i += CHUNK) {
      const chunkKeys = allKeys.slice(i, i + CHUNK);
      const chunkProtos = Array.from(new Set(chunkKeys.map((k) => k.split("|")[0])));
      const existing = await db.select({
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
        statusIntimacao: protocolos.statusIntimacao
      }).from(protocolos).where(inArray(protocolos.protocolo, chunkProtos));
      for (const row of existing) {
        const key = `${row.protocolo}|${row.documento}`;
        const enrichData = enrichMap.get(key);
        if (!enrichData) {
          notFound++;
          continue;
        }
        found++;
        const updateSet = {};
        if (enrichData.nomeDevedor && !row.nomeDevedor) updateSet.nomeDevedor = enrichData.nomeDevedor;
        if (enrichData.numeroTitulo && !row.numeroTitulo) updateSet.numeroTitulo = enrichData.numeroTitulo;
        if (enrichData.credor && !row.credor) updateSet.credor = enrichData.credor;
        if (enrichData.docCredor && !row.docCredor) updateSet.docCredor = enrichData.docCredor;
        if (enrichData.telefone && !row.telefone) updateSet.telefone = enrichData.telefone;
        if (enrichData.valorProtesto && !row.valorProtesto) updateSet.valorProtesto = enrichData.valorProtesto;
        if (enrichData.dataProtocolo && !row.dataProtocolo) updateSet.dataProtocolo = enrichData.dataProtocolo;
        if (enrichData.situacaoTitulo) {
          updateSet.situacaoTitulo = enrichData.situacaoTitulo;
          updateSet.tituloEncerrado = enrichData.tituloEncerrado;
          if (enrichData.statusIntimacao === "intimado" && row.statusIntimacao !== "intimado") {
            updateSet.statusIntimacao = enrichData.statusIntimacao;
            updateSet.canalIntimacao = enrichData.canalIntimacao;
            updateSet.intimadoEm = enrichData.intimadoEm;
          }
        }
        if (Object.keys(updateSet).length === 0) {
          skipped++;
          continue;
        }
        await db.update(protocolos).set(updateSet).where(eq5(protocolos.id, row.id));
        enriched++;
      }
    }
    notFound = enrichMap.size - found;
    res.json({
      success: true,
      totalNoArquivo: rawRows.length,
      registrosUnicos: enrichMap.size,
      encontrados: found,
      enriquecidos: enriched,
      semAlteracao: skipped,
      naoEncontrados: notFound,
      colunasDetectadas: cols
    });
  } catch (err) {
    console.error("[protocolos/enriquecer]", err);
    res.status(500).json({ error: err.message || "Erro ao enriquecer protocolos." });
  }
});
router6.get("/", async (req, res) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Banco de dados n\xE3o dispon\xEDvel." });
    const page = Math.max(1, parseInt(String(req.query.page || "1")));
    const limit = Math.min(99999, Math.max(1, parseInt(String(req.query.limit || "50"))));
    const offset = (page - 1) * limit;
    const q = String(req.query.q || "").trim();
    const status = String(req.query.status || "");
    const documento = String(req.query.documento || "").trim();
    const orderByCol = String(req.query.orderBy || "createdAt").trim();
    const orderDir = String(req.query.orderDir || "desc").trim().toLowerCase() === "asc" ? "asc" : "desc";
    const filterCol = String(req.query.filterCol || "").trim();
    const filterVal = String(req.query.filterVal || "").trim();
    const dataInicio = String(req.query.dataInicio || "").trim();
    const dataFim = String(req.query.dataFim || "").trim();
    const competencia = String(req.query.competencia || "").trim();
    const telefone = String(req.query.telefone || "").replace(/\D/g, "").trim();
    const conditions = [];
    if (q) {
      const likeQ = `%${q}%`;
      const qDigits = q.replace(/\D/g, "");
      const likeDigits = qDigits ? `%${qDigits}%` : null;
      let phoneVariants = [];
      if (qDigits && qDigits.length >= 8) {
        phoneVariants.push(`%${qDigits}%`);
        if (qDigits.startsWith("55") && qDigits.length > 10) {
          const withoutCountry = qDigits.slice(2);
          phoneVariants.push(`%${withoutCountry}%`);
          if (withoutCountry.length >= 9) {
            phoneVariants.push(`%${withoutCountry.slice(2)}%`);
          }
        }
        if (qDigits.length >= 10 && !qDigits.startsWith("55")) {
          phoneVariants.push(`%${qDigits.slice(2)}%`);
        }
      }
      phoneVariants = Array.from(new Set(phoneVariants));
      conditions.push(
        or3(
          like3(protocolos.protocolo, likeQ),
          like3(protocolos.nomeDevedor, likeQ),
          like3(protocolos.documento, likeQ),
          ...likeDigits ? [like3(protocolos.documento, likeDigits)] : [],
          like3(protocolos.numeroTitulo, likeQ),
          like3(protocolos.credor, likeQ),
          like3(protocolos.telefone, likeQ),
          ...phoneVariants.map((v) => like3(protocolos.telefone, v))
        )
      );
    }
    if (documento) {
      const docDigits = cleanDigits2(documento);
      conditions.push(eq5(protocolos.documento, docDigits));
    }
    if (status === "pendente" || status === "intimado") {
      conditions.push(eq5(protocolos.statusIntimacao, status));
      conditions.push(eq5(protocolos.tituloEncerrado, 0));
    } else if (status === "encerrado") {
      conditions.push(eq5(protocolos.tituloEncerrado, 1));
    } else if (status === "edital") {
      conditions.push(like3(protocolos.canalIntimacao, "Edital"));
      conditions.push(eq5(protocolos.tituloEncerrado, 0));
    }
    if (filterCol && filterVal) {
      const colMap = {
        protocolo: protocolos.protocolo,
        nomeDevedor: protocolos.nomeDevedor,
        documento: protocolos.documento,
        numeroTitulo: protocolos.numeroTitulo,
        credor: protocolos.credor,
        telefone: protocolos.telefone,
        valorProtesto: protocolos.valorProtesto,
        situacaoTitulo: protocolos.situacaoTitulo,
        nomeArquivo: protocolos.nomeArquivo,
        canalIntimacao: protocolos.canalIntimacao
      };
      if (colMap[filterCol]) {
        conditions.push(like3(colMap[filterCol], `%${filterVal}%`));
      }
    }
    if (dataInicio) {
      conditions.push(sql3`${protocolos.dataProtocolo} >= ${dataInicio}`);
    }
    if (dataFim) {
      conditions.push(sql3`${protocolos.dataProtocolo} <= ${dataFim}`);
    }
    if (competencia && /^\d{4}-\d{2}$/.test(competencia)) {
      conditions.push(sql3`DATE_FORMAT(${protocolos.dataProtocolo}, '%Y-%m') = ${competencia}`);
    }
    if (telefone) {
      conditions.push(like3(protocolos.telefone, `%${telefone}%`));
    }
    const where = conditions.length === 0 ? void 0 : conditions.length === 1 ? conditions[0] : and3(conditions[0], conditions[1], ...conditions.slice(2));
    const colOrderMap = {
      protocolo: protocolos.protocolo,
      nomeDevedor: protocolos.nomeDevedor,
      documento: protocolos.documento,
      numeroTitulo: protocolos.numeroTitulo,
      credor: protocolos.credor,
      dataProtocolo: protocolos.dataProtocolo,
      statusIntimacao: protocolos.statusIntimacao,
      situacaoTitulo: protocolos.situacaoTitulo,
      valorProtesto: protocolos.valorProtesto,
      createdAt: protocolos.createdAt
    };
    const orderCol = colOrderMap[orderByCol] ?? protocolos.createdAt;
    const orderExpr = orderDir === "asc" ? sql3`${orderCol} ASC` : sql3`${orderCol} DESC`;
    const [rows, countResult] = await Promise.all([
      db.select().from(protocolos).where(where).orderBy(orderExpr).limit(limit).offset(offset),
      db.select({ count: sql3`COUNT(*)` }).from(protocolos).where(where)
    ]);
    const total = Number(countResult[0]?.count ?? 0);
    res.json({
      data: rows,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router6.get("/por-documento/:doc", async (req, res) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Banco de dados n\xE3o dispon\xEDvel." });
    const docDigits = cleanDigits2(req.params.doc);
    if (!docDigits) return res.status(400).json({ error: "Documento inv\xE1lido." });
    const rows = await db.select().from(protocolos).where(eq5(protocolos.documento, docDigits)).orderBy(protocolos.createdAt);
    res.json({ data: rows, documento: docDigits, documentoFmt: formatDoc(docDigits) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router6.patch("/marcar-intimado", async (req, res) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Banco de dados n\xE3o dispon\xEDvel." });
    const { ids, status, canal } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: "IDs inv\xE1lidos." });
    if (status !== "pendente" && status !== "intimado") return res.status(400).json({ error: "Status inv\xE1lido." });
    await db.update(protocolos).set({
      statusIntimacao: status,
      intimadoEm: status === "intimado" ? /* @__PURE__ */ new Date() : null,
      canalIntimacao: status === "intimado" ? canal || null : null
    }).where(inArray(protocolos.id, ids));
    res.json({ success: true, updated: ids.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router6.delete("/:id", async (req, res) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Banco de dados n\xE3o dispon\xEDvel." });
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "ID inv\xE1lido." });
    await db.delete(protocolos).where(eq5(protocolos.id, id));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router6.get("/config/mensagem", async (_req, res) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Banco de dados n\xE3o dispon\xEDvel." });
    const rows = await db.select().from(configMensagemWhatsapp).where(eq5(configMensagemWhatsapp.id, 1));
    res.json({ template: rows[0]?.template || "" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router6.put("/config/mensagem", async (req, res) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Banco de dados n\xE3o dispon\xEDvel." });
    const { template } = req.body;
    await db.insert(configMensagemWhatsapp).values({ id: 1, template }).onConflictDoUpdate({ target: configMensagemWhatsapp.id, set: { template } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
var INTIMADORES_IGNORAR = [
  "thaiana vieira",
  "thaiana",
  "s/n",
  "wesley",
  "tadeu"
];
function isIntimadorIgnorado(nome) {
  const lower = nome.toLowerCase().trim();
  return INTIMADORES_IGNORAR.some((ig) => lower.includes(ig));
}
function detectImportFormat(headers) {
  const h = headers.map((x) => x.toLowerCase().trim());
  if (h.some((x) => x.includes("pessoal") || x.includes("eletr\xF4nica"))) return "diligencias";
  if (h.some((x) => x.includes("campanha") || x.includes("status") || x.includes("cliques"))) return "campaign";
  if (h.some((x) => x.includes("notificador") || x.includes("alega\xE7\xE3o") || x.includes("alegacao"))) return "pesquisar";
  return "unknown";
}
async function batchUpdateProtocolos(db, byProtocolo) {
  const allProts = Array.from(byProtocolo.keys());
  if (allProts.length === 0) return { processed: 0, notFound: 0 };
  const CHUNK = 500;
  const existingMap = /* @__PURE__ */ new Map();
  for (let i = 0; i < allProts.length; i += CHUNK) {
    const chunk = allProts.slice(i, i + CHUNK);
    const rows = await db.select({ id: protocolos.id, protocolo: protocolos.protocolo }).from(protocolos).where(inArray(protocolos.protocolo, chunk));
    for (const r of rows) existingMap.set(r.protocolo, r.id);
  }
  const byCanalIds = /* @__PURE__ */ new Map();
  let nf = 0;
  for (const [prot, info] of Array.from(byProtocolo.entries())) {
    const id = existingMap.get(prot);
    if (!id) {
      nf++;
      continue;
    }
    if (!byCanalIds.has(info.canal)) byCanalIds.set(info.canal, []);
    byCanalIds.get(info.canal).push(id);
  }
  let proc = 0;
  const now = /* @__PURE__ */ new Date();
  for (const [canal, ids] of Array.from(byCanalIds.entries())) {
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK);
      await db.update(protocolos).set({
        statusIntimacao: "intimado",
        canalIntimacao: canal,
        intimadoEm: now
      }).where(inArray(protocolos.id, chunk));
      proc += chunk.length;
    }
  }
  return { processed: proc, notFound: nf };
}
router6.post("/import-intimados", upload4.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Arquivo n\xE3o enviado." });
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Banco de dados n\xE3o dispon\xEDvel." });
    const wb = XLSX3.read(req.file.buffer, { type: "buffer", codepage: 65001 });
    const ws2 = wb.Sheets[wb.SheetNames[0]];
    const rawRows = XLSX3.utils.sheet_to_json(ws2, { defval: "", raw: false });
    if (rawRows.length === 0) return res.status(400).json({ error: "Arquivo vazio." });
    const headers = Object.keys(rawRows[0]);
    const format = detectImportFormat(headers);
    let processed = 0;
    let skipped = 0;
    let notFound = 0;
    const dbConn = db;
    if (format === "diligencias") {
      const protocoloKey = headers.find((h) => h.toLowerCase().includes("protocolo")) || "PROTOCOLO";
      const tipoKey = headers.find((h) => h.toLowerCase().includes("eletr\xF4nica") || h.toLowerCase().includes("pessoal")) || "PESSOAL/ELETR\xD4NICA";
      const byProtocolo = /* @__PURE__ */ new Map();
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
      const protocoloKey = headers.find((h) => h.toLowerCase().includes("protocolo")) || "PROTOCOLO";
      const statusKey = headers.find((h) => h.toLowerCase() === "status") || "STATUS";
      const byProtocolo = /* @__PURE__ */ new Map();
      const SUCCESS_STATUSES = ["CONFIRMADO", "ENTREGUE", "LIDO"];
      for (const row of rawRows) {
        const prot = String(row[protocoloKey] || "").trim();
        const status = String(row[statusKey] || "").trim().toUpperCase();
        if (!prot) continue;
        if (!SUCCESS_STATUSES.includes(status)) {
          skipped++;
          continue;
        }
        if (!byProtocolo.has(prot)) byProtocolo.set(prot, { canal: "WhatsApp" });
      }
      const r = await batchUpdateProtocolos(dbConn, byProtocolo);
      processed = r.processed;
      notFound = r.notFound;
    } else if (format === "pesquisar") {
      const protocoloKey = headers.find((h) => h.toLowerCase().includes("protocolo")) || "Protocolo";
      const notificadorKey = headers.find((h) => h.toLowerCase().includes("notificador")) || "Notificador";
      const byProtocolo = /* @__PURE__ */ new Map();
      for (const row of rawRows) {
        const prot = String(row[protocoloKey] || "").replace(/"/g, "").trim();
        if (!prot) continue;
        const notificador = String(row[notificadorKey] || "").replace(/"/g, "").trim();
        if (isIntimadorIgnorado(notificador)) {
          skipped++;
          continue;
        }
        if (!byProtocolo.has(prot)) byProtocolo.set(prot, { canal: "Pessoal" });
      }
      const r = await batchUpdateProtocolos(dbConn, byProtocolo);
      processed = r.processed;
      notFound = r.notFound;
    } else {
      return res.status(400).json({ error: "Formato de arquivo n\xE3o reconhecido. Envie DILIG\xCANCIAS-INTIMADOS, campaign_report ou PesquisarT\xEDtulos." });
    }
    res.json({
      success: true,
      format,
      processed,
      skipped,
      notFound,
      total: rawRows.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
var SITUACOES_ENCERRADAS = /* @__PURE__ */ new Set([
  "PAGO",
  "CANCELADO",
  "CANCELADO SEM ONUS",
  "CANCELADO SEM \xD4NUS",
  "DEVOLVIDO",
  "RETIRADO",
  "PROTESTADO"
]);
function isSituacaoEncerrada(situacao) {
  const s = situacao.trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return SITUACOES_ENCERRADAS.has(situacao.trim().toUpperCase()) || SITUACOES_ENCERRADAS.has(s);
}
router6.post("/importar-situacoes", upload4.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Arquivo n\xE3o enviado." });
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Banco de dados n\xE3o dispon\xEDvel." });
    const wb = XLSX3.read(req.file.buffer, { type: "buffer", codepage: 65001 });
    const ws2 = wb.Sheets[wb.SheetNames[0]];
    const rawRows = XLSX3.utils.sheet_to_json(ws2, { defval: "", raw: false });
    if (rawRows.length === 0) return res.status(400).json({ error: "Arquivo vazio." });
    const headers = Object.keys(rawRows[0]);
    const norm = (s) => s.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const protocoloKey = headers.find((h) => norm(h).includes("protocolo")) || "";
    const situacaoKey = headers.find(
      (h) => norm(h).includes("situacao atual") || norm(h).includes("situa\xE7\xE3o atual") || norm(h) === "situacao" || norm(h) === "situa\xE7\xE3o" || norm(h).includes("status")
    ) || "";
    if (!protocoloKey) return res.status(400).json({ error: "Coluna de protocolo n\xE3o encontrada." });
    if (!situacaoKey) return res.status(400).json({ error: "Coluna de situa\xE7\xE3o n\xE3o encontrada. Esperado: 'Situacao Atual' ou similar." });
    const updates = /* @__PURE__ */ new Map();
    for (const row of rawRows) {
      const prot = String(row[protocoloKey] || "").trim();
      const situacao = String(row[situacaoKey] || "").trim().toUpperCase();
      if (!prot || !situacao) continue;
      if (!updates.has(prot)) {
        updates.set(prot, {
          situacao,
          encerrado: isSituacaoEncerrada(situacao),
          edital: situacao === "EDITAL"
        });
      }
    }
    if (updates.size === 0) return res.status(400).json({ error: "Nenhum protocolo v\xE1lido encontrado no arquivo." });
    const allProts = Array.from(updates.keys());
    const CHUNK = 500;
    const existingMap = /* @__PURE__ */ new Map();
    for (let i = 0; i < allProts.length; i += CHUNK) {
      const chunk = allProts.slice(i, i + CHUNK);
      const rows = await db.select({ id: protocolos.id, protocolo: protocolos.protocolo }).from(protocolos).where(inArray(protocolos.protocolo, chunk));
      for (const r of rows) {
        if (!existingMap.has(r.protocolo)) existingMap.set(r.protocolo, []);
        existingMap.get(r.protocolo).push(r.id);
      }
    }
    let updated = 0;
    let notFound = 0;
    let encerrados = 0;
    let editais = 0;
    const now = /* @__PURE__ */ new Date();
    const groups = [];
    for (const [prot, info] of Array.from(updates.entries())) {
      const ids = existingMap.get(prot);
      if (!ids || ids.length === 0) {
        notFound++;
        continue;
      }
      groups.push({ ids, ...info });
      if (info.encerrado) encerrados += ids.length;
      if (info.edital) editais += ids.length;
      updated += ids.length;
    }
    for (const group of groups) {
      for (let i = 0; i < group.ids.length; i += CHUNK) {
        const chunk = group.ids.slice(i, i + CHUNK);
        const updateSet = {
          situacaoTitulo: group.situacao,
          tituloEncerrado: group.encerrado ? 1 : 0
        };
        if (group.edital) {
          updateSet.statusIntimacao = "intimado";
          updateSet.canalIntimacao = "Edital";
          updateSet.intimadoEm = now;
        }
        await db.update(protocolos).set(updateSet).where(inArray(protocolos.id, chunk));
      }
    }
    res.json({
      success: true,
      total: rawRows.length,
      updated,
      notFound,
      encerrados,
      editais,
      detectedColumns: { protocolo: protocoloKey, situacao: situacaoKey }
    });
  } catch (err) {
    console.error("[protocolos/importar-situacoes]", err);
    res.status(500).json({ error: err.message || "Erro ao importar situa\xE7\xF5es." });
  }
});
router6.patch("/atualizar-situacao", async (req, res) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Banco de dados n\xE3o dispon\xEDvel." });
    const { ids, situacao } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: "IDs inv\xE1lidos." });
    if (!situacao) return res.status(400).json({ error: "Situa\xE7\xE3o inv\xE1lida." });
    const situacaoUp = situacao.trim().toUpperCase();
    const encerrado = isSituacaoEncerrada(situacaoUp);
    const edital = situacaoUp === "EDITAL";
    const now = /* @__PURE__ */ new Date();
    const updateSet = {
      situacaoTitulo: situacaoUp,
      tituloEncerrado: encerrado ? 1 : 0
    };
    if (edital) {
      updateSet.statusIntimacao = "intimado";
      updateSet.canalIntimacao = "Edital";
      updateSet.intimadoEm = now;
    }
    const CHUNK = 500;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK);
      await db.update(protocolos).set(updateSet).where(inArray(protocolos.id, chunk));
    }
    res.json({ success: true, updated: ids.length, encerrado, edital });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
async function computeGaps(db, dataCorte) {
  const baseWhere = dataCorte ? and3(
    eq5(protocolos.tituloEncerrado, 0),
    sql3`dataProtocolo IS NOT NULL AND dataProtocolo >= ${dataCorte}`
  ) : eq5(protocolos.tituloEncerrado, 0);
  const result = await db.select({
    minProto: sql3`MIN(CAST(protocolo AS UNSIGNED))`,
    maxProto: sql3`MAX(CAST(protocolo AS UNSIGNED))`,
    total: sql3`COUNT(DISTINCT protocolo)`
  }).from(protocolos).where(baseWhere);
  const row = result[0];
  if (!row || !row.minProto || !row.maxProto) {
    return { min: null, max: null, total: 0, gapsCount: 0, gaps: [] };
  }
  const minP = Number(row.minProto);
  const maxP = Number(row.maxProto);
  const total = Number(row.total);
  const expected = maxP - minP + 1;
  const gapsCount = expected - total;
  if (gapsCount <= 0) {
    return { min: minP, max: maxP, total, gapsCount: 0, gaps: [] };
  }
  const BATCH = 1e4;
  const existing = /* @__PURE__ */ new Set();
  for (let offset = 0; offset < total + gapsCount + 1; offset += BATCH) {
    const rows = await db.selectDistinct({ p: protocolos.protocolo }).from(protocolos).where(baseWhere).orderBy(sql3`CAST(protocolo AS UNSIGNED)`).limit(BATCH).offset(offset);
    if (rows.length === 0) break;
    for (const r of rows) {
      const n = Number(r.p);
      if (!isNaN(n)) existing.add(n);
    }
    if (rows.length < BATCH) break;
  }
  const gaps = [];
  for (let i = minP; i <= maxP; i++) {
    if (!existing.has(i)) gaps.push(i);
  }
  return { min: minP, max: maxP, total, gapsCount: gaps.length, gaps };
}
router6.get("/stats", async (req, res) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Banco de dados n\xE3o dispon\xEDvel." });
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
    const conditions = [];
    if (q) {
      const likeQ = `%${q}%`;
      const qDigits = q.replace(/\D/g, "");
      const likeDigits = qDigits ? `%${qDigits}%` : null;
      let phoneVariants = [];
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
      conditions.push(or3(
        like3(protocolos.protocolo, likeQ),
        like3(protocolos.nomeDevedor, likeQ),
        like3(protocolos.documento, likeQ),
        ...likeDigits ? [like3(protocolos.documento, likeDigits)] : [],
        like3(protocolos.numeroTitulo, likeQ),
        like3(protocolos.credor, likeQ),
        like3(protocolos.telefone, likeQ),
        ...phoneVariants.map((v) => like3(protocolos.telefone, v))
      ));
    }
    if (status === "pendente" || status === "intimado") {
      conditions.push(eq5(protocolos.statusIntimacao, status));
      conditions.push(eq5(protocolos.tituloEncerrado, 0));
    } else if (status === "encerrado") {
      conditions.push(eq5(protocolos.tituloEncerrado, 1));
    } else if (status === "edital") {
      conditions.push(like3(protocolos.canalIntimacao, "Edital"));
      conditions.push(eq5(protocolos.tituloEncerrado, 0));
    }
    if (filterCol && filterVal) {
      const colMap = {
        protocolo: protocolos.protocolo,
        nomeDevedor: protocolos.nomeDevedor,
        documento: protocolos.documento,
        numeroTitulo: protocolos.numeroTitulo,
        credor: protocolos.credor,
        telefone: protocolos.telefone,
        valorProtesto: protocolos.valorProtesto,
        situacaoTitulo: protocolos.situacaoTitulo,
        nomeArquivo: protocolos.nomeArquivo,
        canalIntimacao: protocolos.canalIntimacao
      };
      if (colMap[filterCol]) conditions.push(like3(colMap[filterCol], `%${filterVal}%`));
    }
    const hasDateFilter = !!(dataInicio || dataFim || competencia);
    if (hasDateFilter) conditions.push(sql3`${protocolos.dataProtocolo} IS NOT NULL`);
    if (dataInicio) conditions.push(sql3`${protocolos.dataProtocolo} >= ${dataInicio}`);
    if (dataFim) conditions.push(sql3`${protocolos.dataProtocolo} <= ${dataFim}`);
    if (competencia && /^\d{4}-\d{2}$/.test(competencia)) {
      conditions.push(sql3`DATE_FORMAT(${protocolos.dataProtocolo}, '%Y-%m') = ${competencia}`);
    }
    if (telefone) conditions.push(like3(protocolos.telefone, `%${telefone}%`));
    const whereClause = conditions.length === 0 ? void 0 : conditions.length === 1 ? conditions[0] : and3(conditions[0], conditions[1], ...conditions.slice(2));
    const aggQuery = db.select({
      totalFiltrado: sql3`COUNT(*)`,
      totalPendentes: sql3`SUM(CASE WHEN ${protocolos.statusIntimacao} = 'pendente' AND ${protocolos.tituloEncerrado} = 0 THEN 1 ELSE 0 END)`,
      totalIntimados: sql3`SUM(CASE WHEN ${protocolos.statusIntimacao} = 'intimado' THEN 1 ELSE 0 END)`,
      totalEncerrados: sql3`SUM(CASE WHEN ${protocolos.tituloEncerrado} = 1 THEN 1 ELSE 0 END)`
    }).from(protocolos);
    const aggResult = whereClause ? await aggQuery.where(whereClause) : await aggQuery;
    const agg = aggResult[0] || { totalFiltrado: 0, totalPendentes: 0, totalIntimados: 0, totalEncerrados: 0 };
    const hasFilter = !!(q || status || filterCol || dataInicio || dataFim || competencia || telefone);
    res.json({ min, max, total, gapsCount, totalPendentes: Number(agg.totalPendentes), totalIntimados: Number(agg.totalIntimados), totalEncerrados: Number(agg.totalEncerrados), totalFiltrado: Number(agg.totalFiltrado), hasFilter });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router6.get("/gaps", async (req, res) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Banco de dados n\xE3o dispon\xEDvel." });
    const page = Math.max(1, parseInt(String(req.query.page || "1")));
    const limit = Math.min(5e3, Math.max(1, parseInt(String(req.query.limit || "500"))));
    const dataCorte = String(req.query.dataCorte || "").trim() || null;
    const { min, max, total, gapsCount, gaps } = await computeGaps(db, dataCorte);
    const start = (page - 1) * limit;
    const pageGaps = gaps.slice(start, start + limit);
    res.json({
      min,
      max,
      total,
      gapsCount,
      gaps: pageGaps,
      dataCorte,
      pagination: { page, limit, total: gapsCount, pages: Math.ceil(gapsCount / limit) }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router6.get("/gaps/export", async (req, res) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Banco de dados n\xE3o dispon\xEDvel." });
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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
var protocolosRoutes_default = router6;

// api/index.ts
var app = express2();
app.use(express2.json({ limit: "50mb" }));
app.use(express2.urlencoded({ limit: "50mb", extended: true }));
app.use("/api/upload", uploadRoutes_default);
app.use("/api/contatos", contatosRoutes_default);
app.use("/api/whatsapp", whatsappRoutes_default);
app.use("/api/email", emailRoutes_default);
app.use("/api/protocolos", protocolosRoutes_default);
app.use(
  "/api/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext
  })
);
var index_default = app;
export {
  index_default as default
};
