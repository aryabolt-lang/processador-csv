CREATE TABLE `registros_processados` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`processamentoId` int NOT NULL,
	`nome` varchar(512),
	`documento` varchar(20),
	`tipoDoc` enum('CPF','CNPJ','INVALIDO') NOT NULL DEFAULT 'INVALIDO',
	`telefone` varchar(20),
	`origemTelefone` varchar(64),
	`tipoDisparo` enum('ligacao','sms') NOT NULL,
	`protocolo` varchar(255),
	`nomeArquivo` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `registros_processados_id` PRIMARY KEY(`id`)
);
