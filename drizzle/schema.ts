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
  serial,
} from "drizzle-orm/pg-core";

// ─── Enums ────────────────────────────────────────────────────────────────────
export const roleEnum = pgEnum("role", ["user", "admin"]);
export const tipoDocEnum = pgEnum("tipo_doc", ["CPF", "CNPJ", "INVALIDO"]);
export const tipoDisparoEnum = pgEnum("tipo_disparo", ["ligacao", "sms"]);
export const origemEnum = pgEnum("origem", ["importacao", "manual"]);
export const acaoEnum = pgEnum("acao", [
  "criado",
  "importado",
  "editado",
  "atualizado_importacao",
  "favorito_alterado",
]);
export const statusProcessamentoEnum = pgEnum("status_processamento", [
  "processando",
  "concluido",
  "erro",
]);
export const statusIntimacaoEnum = pgEnum("status_intimacao", [
  "pendente",
  "intimado",
]);

// ─── Users ────────────────────────────────────────────────────────────────────
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("open_id", { length: 64 }).unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("login_method", { length: 64 }),
  passwordHash: text("password_hash"),
  role: roleEnum("role").default("user").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  lastSignedIn: timestamp("last_signed_in").defaultNow().notNull(),
});
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Processamentos ───────────────────────────────────────────────────────────
export const processamentos = pgTable("processamentos", {
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
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type Processamento = typeof processamentos.$inferSelect;
export type InsertProcessamento = typeof processamentos.$inferInsert;

// ─── Registros Processados ────────────────────────────────────────────────────
export const registrosProcessados = pgTable("registros_processados", {
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
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type RegistroProcessado = typeof registrosProcessados.$inferSelect;
export type InsertRegistroProcessado = typeof registrosProcessados.$inferInsert;

// ─── Contatos ─────────────────────────────────────────────────────────────────
export const contatos = pgTable("contatos", {
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
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export type Contato = typeof contatos.$inferSelect;
export type InsertContato = typeof contatos.$inferInsert;

// ─── Contatos Histórico ───────────────────────────────────────────────────────
export const contatosHistorico = pgTable("contatos_historico", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  documento: varchar("documento", { length: 20 }).notNull(),
  acao: acaoEnum("acao").notNull(),
  camposAlterados: json("campos_alterados"),
  descricao: text("descricao"),
  criadoEm: timestamp("criado_em").defaultNow().notNull(),
});
export type ContatoHistorico = typeof contatosHistorico.$inferSelect;
export type InsertContatoHistorico = typeof contatosHistorico.$inferInsert;

// ─── WhatsApp Templates ───────────────────────────────────────────────────────
export const whatsappTemplates = pgTable("whatsapp_templates", {
  id: serial("id").primaryKey(),
  nome: varchar("nome", { length: 255 }).notNull(),
  descricao: text("descricao"),
  colunas: json("colunas").notNull(),
  padrao: boolean("padrao").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export type WhatsappTemplate = typeof whatsappTemplates.$inferSelect;
export type InsertWhatsappTemplate = typeof whatsappTemplates.$inferInsert;

// ─── Protocolos ───────────────────────────────────────────────────────────────
export const protocolos = pgTable(
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
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    protocoloDocumentoIdx: uniqueIndex("protocolos_protocolo_documento_unique").on(
      table.protocolo,
      table.documento
    ),
  })
);
export type Protocolo = typeof protocolos.$inferSelect;
export type InsertProtocolo = typeof protocolos.$inferInsert;

// ─── Config Mensagem WhatsApp ─────────────────────────────────────────────────
export const configMensagemWhatsapp = pgTable("config_mensagem_whatsapp", {
  id: serial("id").primaryKey(),
  template: text("template"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export type ConfigMensagemWhatsapp = typeof configMensagemWhatsapp.$inferSelect;
export type InsertConfigMensagemWhatsapp = typeof configMensagemWhatsapp.$inferInsert;
