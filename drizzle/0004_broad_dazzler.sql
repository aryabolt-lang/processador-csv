CREATE TABLE `contatos_historico` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`documento` varchar(20) NOT NULL,
	`acao` enum('criado','importado','editado','atualizado_importacao','favorito_alterado') NOT NULL,
	`camposAlterados` json,
	`descricao` text,
	`criadoEm` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `contatos_historico_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `contatos` ADD `origem` enum('importacao','manual') DEFAULT 'importacao' NOT NULL;--> statement-breakpoint
ALTER TABLE `contatos` ADD `telefonePrincipal` tinyint DEFAULT 0;--> statement-breakpoint
ALTER TABLE `contatos` ADD `emailPrincipal` tinyint DEFAULT 0;--> statement-breakpoint
ALTER TABLE `contatos` ADD `ultimaEdicao` timestamp;