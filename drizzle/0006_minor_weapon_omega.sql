CREATE TABLE `config_mensagem_whatsapp` (
	`id` int AUTO_INCREMENT NOT NULL,
	`template` text,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `config_mensagem_whatsapp_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `protocolos` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`protocolo` varchar(255) NOT NULL,
	`nomeDevedor` varchar(512),
	`documento` varchar(20),
	`tipoDoc` enum('CPF','CNPJ','INVALIDO') NOT NULL DEFAULT 'INVALIDO',
	`numeroTitulo` varchar(255),
	`credor` varchar(512),
	`docCredor` varchar(20),
	`telefone` varchar(20),
	`valorProtesto` varchar(50),
	`statusIntimacao` enum('pendente','intimado') NOT NULL DEFAULT 'pendente',
	`intimadoEm` timestamp,
	`nomeArquivo` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `protocolos_id` PRIMARY KEY(`id`),
	CONSTRAINT `protocolos_protocolo_unique` UNIQUE(`protocolo`)
);
