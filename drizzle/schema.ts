import { integer, pgEnum, pgTable, text, timestamp, varchar, json, bigint, smallint } from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["user", "admin"]);
export const statusEnum = pgEnum("status", ["processando", "concluido", "erro"]);
export const tipoDocEnum = pgEnum("tipoDoc", ["CPF", "CNPJ", "INVALIDO"]);
export const tipoDisparoEnum = pgEnum("tipoDisparo", ["ligacao", "sms"]);
export const acaoEnum = pgEnum("acao", ["criado", "importado", "editado", "atualizado_importacao", "favorito_alterado"]);
export const origemEnum = pgEnum("origem", ["importacao", "manual"]);

export const users = pgTable("users", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  name: text("name"),
  passwordHash: text("passwordHash").notNull(),
  role: roleEnum("role").default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type CreateUser = {
  email: string;
  name: string;
  passwordHash: string;
  role?: "user" | "admin";
};

export const processamentos = pgTable("processamentos", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  nomeArquivo: varchar("nomeArquivo", { length: 255 }).notNull(),
  totalRegistros: integer("totalRegistros").notNull().default(0),
  totalComContato: integer("totalComContato").notNull().default(0),
  totalSemContato: integer("totalSemContato").notNull().default(0),
  totalCpf: integer("totalCpf").notNull().default(0),
  totalCnpj: integer("totalCnpj").notNull().default(0),
  totalInvalidos: integer("totalInvalidos").notNull().default(0),
  totalLinhasGeradas: integer("totalLinhasGeradas").notNull().default(0),
  cpfLigacaoUrl: text("cpfLigacaoUrl"),
  cpfSmsUrl: text("cpfSmsUrl"),
  cnpjLigacaoUrl: text("cnpjLigacaoUrl"),
  cnpjSmsUrl: text("cnpjSmsUrl"),
  zipUrl: text("zipUrl"),
  mapeamento: json("mapeamento"),
  status: statusEnum("status").default("processando").notNull(),
  erroMsg: text("erroMsg"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Processamento = typeof processamentos.$inferSelect;
export type InsertProcessamento = typeof processamentos.$inferInsert;

/**
 * Stores every expanded row generated during processing.
 * Powers the intelligent search module without touching the main flow.
 */
export const registrosProcessados = pgTable("registros_processados", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  processamentoId: integer("processamentoId").notNull(),
  /** Nome do devedor (col A) */
  nome: varchar("nome", { length: 512 }),
  /** Documento limpo (somente dígitos) */
  documento: varchar("documento", { length: 20 }),
  /** CPF ou CNPJ */
  tipoDoc: tipoDocEnum("tipoDoc").notNull().default("INVALIDO"),
  /** Telefone limpo (somente dígitos) */
  telefone: varchar("telefone", { length: 20 }),
  /** Qual coluna de telefone originou este registro (telefone1..4) */
  origemTelefone: varchar("origemTelefone", { length: 64 }),
  /** ligacao ou sms */
  tipoDisparo: tipoDisparoEnum("tipoDisparo").notNull(),
  /** Número do protocolo (col B) */
  protocolo: varchar("protocolo", { length: 255 }),
  /** Nome do arquivo original */
  nomeArquivo: varchar("nomeArquivo", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type RegistroProcessado = typeof registrosProcessados.$inferSelect;
export type InsertRegistroProcessado = typeof registrosProcessados.$inferInsert;

/**
 * Stores imported contacts (CPF/CNPJ base).
 * Upserted by documento (CPF or CNPJ digits only) — no duplicates.
 */
export const contatosBase = pgTable("contatos", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  /** CPF or CNPJ digits only — unique key for upsert */
  documento: varchar("documento", { length: 20 }).notNull().unique(),
  /** CPF or CNPJ */
  tipoDoc: tipoDocEnum("tipoDoc").notNull().default("INVALIDO"),
  nomeRazaoSocial: varchar("nomeRazaoSocial", { length: 512 }),
  celular1: varchar("celular1", { length: 20 }),
  celular2: varchar("celular2", { length: 20 }),
  celular3: varchar("celular3", { length: 20 }),
  celular4: varchar("celular4", { length: 20 }),
  email1: varchar("email1", { length: 320 }),
  email2: varchar("email2", { length: 320 }),
  email3: varchar("email3", { length: 320 }),
  /** Original file name that created/last updated this record */
  origemArquivo: varchar("origemArquivo", { length: 255 }),
  /** How this record was created: importacao or manual */
  origem: origemEnum("origem").default("importacao").notNull(),
  /** Which celular field is the primary contact (1-4) */
  telefonePrincipal: smallint("telefonePrincipal").default(0),
  /** Which email field is the primary contact (1-3) */
  emailPrincipal: smallint("emailPrincipal").default(0),
  /** Last manual edit timestamp */
  ultimaEdicao: timestamp("ultimaEdicao"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Contato = typeof contatosBase.$inferSelect;
export type InsertContato = typeof contatosBase.$inferInsert;

/**
 * Audit log for every change made to a contato.
 */
export const contatosHistorico = pgTable("contatos_historico", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  /** CPF/CNPJ of the contato this entry belongs to */
  documento: varchar("documento", { length: 20 }).notNull(),
  /** Action type */
  acao: acaoEnum("acao").notNull(),
  /** JSON array of changed fields: [{campo, de, para}] */
  camposAlterados: json("camposAlterados"),
  /** Free-text description */
  descricao: text("descricao"),
  criadoEm: timestamp("criadoEm").defaultNow().notNull(),
});

export type ContatoHistorico = typeof contatosHistorico.$inferSelect;
export type InsertContatoHistorico = typeof contatosHistorico.$inferInsert;
