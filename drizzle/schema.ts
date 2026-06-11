import { date, int, mysqlEnum, mysqlTable, text, timestamp, varchar, json, bigint, tinyint, uniqueIndex } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  passwordHash: text("passwordHash"),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const processamentos = mysqlTable("processamentos", {
  id: int("id").autoincrement().primaryKey(),
  nomeArquivo: varchar("nomeArquivo", { length: 255 }).notNull(),
  totalRegistros: int("totalRegistros").notNull().default(0),
  totalComContato: int("totalComContato").notNull().default(0),
  totalSemContato: int("totalSemContato").notNull().default(0),
  totalCpf: int("totalCpf").notNull().default(0),
  totalCnpj: int("totalCnpj").notNull().default(0),
  totalInvalidos: int("totalInvalidos").notNull().default(0),
  totalLinhasGeradas: int("totalLinhasGeradas").notNull().default(0),
  cpfLigacaoUrl: text("cpfLigacaoUrl"),
  cpfSmsUrl: text("cpfSmsUrl"),
  cnpjLigacaoUrl: text("cnpjLigacaoUrl"),
  cnpjSmsUrl: text("cnpjSmsUrl"),
  zipUrl: text("zipUrl"),
  mapeamento: json("mapeamento"),
  status: mysqlEnum("status", ["processando", "concluido", "erro"]).default("processando").notNull(),
  erroMsg: text("erroMsg"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Processamento = typeof processamentos.$inferSelect;
export type InsertProcessamento = typeof processamentos.$inferInsert;

/**
 * Stores every expanded row generated during processing.
 * Powers the intelligent search module without touching the main flow.
 */
export const registrosProcessados = mysqlTable("registros_processados", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  processamentoId: int("processamentoId").notNull(),
  /** Nome do devedor (col A) */
  nome: varchar("nome", { length: 512 }),
  /** Documento limpo (somente dígitos) */
  documento: varchar("documento", { length: 20 }),
  /** CPF ou CNPJ */
  tipoDoc: mysqlEnum("tipoDoc", ["CPF", "CNPJ", "INVALIDO"]).notNull().default("INVALIDO"),
  /** Telefone limpo (somente dígitos) */
  telefone: varchar("telefone", { length: 20 }),
  /** Qual coluna de telefone originou este registro (telefone1..4) */
  origemTelefone: varchar("origemTelefone", { length: 64 }),
  /** ligacao ou sms */
  tipoDisparo: mysqlEnum("tipoDisparo", ["ligacao", "sms"]).notNull(),
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
export const contatos = mysqlTable("contatos", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  /** CPF or CNPJ digits only — unique key for upsert */
  documento: varchar("documento", { length: 20 }).notNull().unique(),
  /** CPF or CNPJ */
  tipoDoc: mysqlEnum("tipoDoc", ["CPF", "CNPJ", "INVALIDO"]).notNull().default("INVALIDO"),
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
  origem: mysqlEnum("origem", ["importacao", "manual"]).default("importacao").notNull(),
  /** Which celular field is the primary contact (1-4) */
  telefonePrincipal: tinyint("telefonePrincipal").default(0),
  /** Which email field is the primary contact (1-3) */
  emailPrincipal: tinyint("emailPrincipal").default(0),
  /** Last manual edit timestamp */
  ultimaEdicao: timestamp("ultimaEdicao"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Contato = typeof contatos.$inferSelect;
export type InsertContato = typeof contatos.$inferInsert;

/**
 * Audit log for every change made to a contato.
 */
export const contatosHistorico = mysqlTable("contatos_historico", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  /** CPF/CNPJ of the contato this entry belongs to */
  documento: varchar("documento", { length: 20 }).notNull(),
  /** Action type */
  acao: mysqlEnum("acao", ["criado", "importado", "editado", "atualizado_importacao", "favorito_alterado"]).notNull(),
  /** JSON array of changed fields: [{campo, de, para}] */
  camposAlterados: json("camposAlterados"),
  /** Free-text description */
  descricao: text("descricao"),
  criadoEm: timestamp("criadoEm").defaultNow().notNull(),
});

export type ContatoHistorico = typeof contatosHistorico.$inferSelect;
export type InsertContatoHistorico = typeof contatosHistorico.$inferInsert;

/**
 * WhatsApp export templates.
 * Each template defines an ordered list of columns (variables) to include
 * in the exported CSV. Shared across all users.
 *
 * Built-in variables available:
 *   {{telefone}}         - cleaned phone number (digits only)
 *   {{nome}}             - debtor full name
 *   {{documento}}        - CPF or CNPJ digits only
 *   {{documento_fmt}}    - CPF or CNPJ formatted (XXX.XXX.XXX-XX / XX.XXX.XXX/XXXX-XX)
 *   {{tipo_doc}}         - "CPF" or "CNPJ"
 *   {{protocolo}}        - protocol number (col B)
 *
 * `colunas` is a JSON array of column definitions:
 *   [{ variavel: "{{telefone}}", cabecalho: "Telefone" }, ...]
 */
export const whatsappTemplates = mysqlTable("whatsapp_templates", {
  id: int("id").autoincrement().primaryKey(),
  /** Template display name */
  nome: varchar("nome", { length: 255 }).notNull(),
  /** Optional description */
  descricao: text("descricao"),
  /** JSON array of { variavel: string, cabecalho: string }[] */
  colunas: json("colunas").notNull(),
  /** Whether this is the default template selected on export */
  padrao: tinyint("padrao").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type WhatsappTemplate = typeof whatsappTemplates.$inferSelect;
export type InsertWhatsappTemplate = typeof whatsappTemplates.$inferInsert;

/**
 * Stores protocols imported for electronic intimation.
 * One protocol can have multiple debtors (one row per debtor).
 * Unique key is (protocolo, documento) — same protocol+debtor is upserted.
 */
export const protocolos = mysqlTable("protocolos", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  /** Protocol number */
  protocolo: varchar("protocolo", { length: 255 }).notNull(),
  /** Debtor full name */
  nomeDevedor: varchar("nomeDevedor", { length: 512 }),
  /** CPF or CNPJ digits only */
  documento: varchar("documento", { length: 20 }),
  /** CPF or CNPJ */
  tipoDoc: mysqlEnum("tipoDoc", ["CPF", "CNPJ", "INVALIDO"]).notNull().default("INVALIDO"),
  /** Title/plate number (e.g., IPVA, SEFA) */
  numeroTitulo: varchar("numeroTitulo", { length: 255 }),
  /** Creditor name */
  credor: varchar("credor", { length: 512 }),
  /** Creditor CPF/CNPJ */
  docCredor: varchar("docCredor", { length: 20 }),
  /** Phone number (digits only) */
  telefone: varchar("telefone", { length: 20 }),
  /** Protest value in cents */
  valorProtesto: varchar("valorProtesto", { length: 50 }),
  /** Intimation status */
  statusIntimacao: mysqlEnum("statusIntimacao", ["pendente", "intimado"]).notNull().default("pendente"),
  /** When marked as intimated */
  intimadoEm: timestamp("intimadoEm"),
  /** Channel used for intimation: WhatsApp, email, pessoal, sms, etc. */
  canalIntimacao: varchar("canalIntimacao", { length: 100 }),
  /** Source file name */
  nomeArquivo: varchar("nomeArquivo", { length: 255 }),
  /**
   * Date the protocol was registered at the cartório (from CSV 'Data Protocolo' column).
   * Used to filter gaps by date cutoff.
   */
  dataProtocolo: date("dataProtocolo"),
  /**
   * Current situation of the title as reported by the cartório system.
   * Examples: PAGO, CANCELADO, DEVOLVIDO, RETIRADO, PROTESTADO, NOTIFICACAO, EDITAL, PROTOCOLADO
   */
  situacaoTitulo: varchar("situacaoTitulo", { length: 100 }),
  /**
   * True when the title is definitively closed and no longer needs intimation.
   * Encerrado = PAGO | CANCELADO | CANCELADO SEM ÔNUS | DEVOLVIDO | RETIRADO | PROTESTADO
   */
  tituloEncerrado: tinyint("tituloEncerrado").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  // Composite unique: one row per (protocolo, documento) pair
  // This allows one protocol to have multiple debtors
  protocoloDocumentoIdx: uniqueIndex("protocolos_protocolo_documento_unique").on(table.protocolo, table.documento),
}));

export type Protocolo = typeof protocolos.$inferSelect;
export type InsertProtocolo = typeof protocolos.$inferInsert;

/**
 * Global configuration for WhatsApp intimation message template.
 * Single-row table (id=1 always).
 */
export const configMensagemWhatsapp = mysqlTable("config_mensagem_whatsapp", {
  id: int("id").autoincrement().primaryKey(),
  /** WhatsApp message template with {{nome}}, {{protocolo}}, {{titulo}}, {{credor}}, {{cpf}} variables */
  template: text("template"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ConfigMensagemWhatsapp = typeof configMensagemWhatsapp.$inferSelect;
export type InsertConfigMensagemWhatsapp = typeof configMensagemWhatsapp.$inferInsert;
