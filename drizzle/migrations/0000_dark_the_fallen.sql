CREATE TYPE "public"."acao" AS ENUM('criado', 'importado', 'editado', 'atualizado_importacao', 'favorito_alterado');--> statement-breakpoint
CREATE TYPE "public"."origem" AS ENUM('importacao', 'manual');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TYPE "public"."status_intimacao" AS ENUM('pendente', 'intimado');--> statement-breakpoint
CREATE TYPE "public"."status_processamento" AS ENUM('processando', 'concluido', 'erro');--> statement-breakpoint
CREATE TYPE "public"."tipo_disparo" AS ENUM('ligacao', 'sms');--> statement-breakpoint
CREATE TYPE "public"."tipo_doc" AS ENUM('CPF', 'CNPJ', 'INVALIDO');--> statement-breakpoint
CREATE TABLE "config_mensagem_whatsapp" (
	"id" serial PRIMARY KEY NOT NULL,
	"template" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contatos" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "contatos_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"documento" varchar(20) NOT NULL,
	"tipo_doc" "tipo_doc" DEFAULT 'INVALIDO' NOT NULL,
	"nome_razao_social" varchar(512),
	"celular1" varchar(20),
	"celular2" varchar(20),
	"celular3" varchar(20),
	"celular4" varchar(20),
	"email1" varchar(320),
	"email2" varchar(320),
	"email3" varchar(320),
	"origem_arquivo" varchar(255),
	"origem" "origem" DEFAULT 'importacao' NOT NULL,
	"telefone_principal" integer DEFAULT 0,
	"email_principal" integer DEFAULT 0,
	"ultima_edicao" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "contatos_documento_unique" UNIQUE("documento")
);
--> statement-breakpoint
CREATE TABLE "contatos_historico" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "contatos_historico_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"documento" varchar(20) NOT NULL,
	"acao" "acao" NOT NULL,
	"campos_alterados" json,
	"descricao" text,
	"criado_em" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "processamentos" (
	"id" serial PRIMARY KEY NOT NULL,
	"nome_arquivo" varchar(255) NOT NULL,
	"total_registros" integer DEFAULT 0 NOT NULL,
	"total_com_contato" integer DEFAULT 0 NOT NULL,
	"total_sem_contato" integer DEFAULT 0 NOT NULL,
	"total_cpf" integer DEFAULT 0 NOT NULL,
	"total_cnpj" integer DEFAULT 0 NOT NULL,
	"total_invalidos" integer DEFAULT 0 NOT NULL,
	"total_linhas_geradas" integer DEFAULT 0 NOT NULL,
	"cpf_ligacao_url" text,
	"cpf_sms_url" text,
	"cnpj_ligacao_url" text,
	"cnpj_sms_url" text,
	"zip_url" text,
	"mapeamento" json,
	"status" "status_processamento" DEFAULT 'processando' NOT NULL,
	"erro_msg" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "protocolos" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "protocolos_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"protocolo" varchar(255) NOT NULL,
	"nome_devedor" varchar(512),
	"documento" varchar(20),
	"tipo_doc" "tipo_doc" DEFAULT 'INVALIDO' NOT NULL,
	"numero_titulo" varchar(255),
	"credor" varchar(512),
	"doc_credor" varchar(20),
	"telefone" varchar(20),
	"valor_protesto" varchar(50),
	"status_intimacao" "status_intimacao" DEFAULT 'pendente' NOT NULL,
	"intimado_em" timestamp,
	"canal_intimacao" varchar(100),
	"nome_arquivo" varchar(255),
	"data_protocolo" date,
	"situacao_titulo" varchar(100),
	"titulo_encerrado" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "registros_processados" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "registros_processados_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"processamento_id" integer NOT NULL,
	"nome" varchar(512),
	"documento" varchar(20),
	"tipo_doc" "tipo_doc" DEFAULT 'INVALIDO' NOT NULL,
	"telefone" varchar(20),
	"origem_telefone" varchar(64),
	"tipo_disparo" "tipo_disparo" NOT NULL,
	"protocolo" varchar(255),
	"nome_arquivo" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"open_id" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"login_method" varchar(64),
	"password_hash" text,
	"role" "role" DEFAULT 'user' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"last_signed_in" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_open_id_unique" UNIQUE("open_id")
);
--> statement-breakpoint
CREATE TABLE "whatsapp_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"nome" varchar(255) NOT NULL,
	"descricao" text,
	"colunas" json NOT NULL,
	"padrao" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "protocolos_protocolo_documento_unique" ON "protocolos" USING btree ("protocolo","documento");