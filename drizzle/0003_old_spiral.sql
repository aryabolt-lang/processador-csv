CREATE TABLE `contatos` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`documento` varchar(20) NOT NULL,
	`tipoDoc` enum('CPF','CNPJ','INVALIDO') NOT NULL DEFAULT 'INVALIDO',
	`nomeRazaoSocial` varchar(512),
	`celular1` varchar(20),
	`celular2` varchar(20),
	`celular3` varchar(20),
	`celular4` varchar(20),
	`email1` varchar(320),
	`email2` varchar(320),
	`email3` varchar(320),
	`origemArquivo` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `contatos_id` PRIMARY KEY(`id`),
	CONSTRAINT `contatos_documento_unique` UNIQUE(`documento`)
);
