# Processador Inteligente de CSV - Versão 2.0

Aplicação web para processamento, validação e importação de arquivos CSV/XLSX com suporte a CPF/CNPJ, contatos e geração de arquivos de disparo (ligação/SMS).

**100% independente - sem dependências externas!**

## Stack Tecnológico

- **Frontend:** React 19 + Vite + TailwindCSS + Radix UI
- **Backend:** Express.js + Drizzle ORM
- **Banco de Dados:** PostgreSQL (Neon)
- **Autenticação:** JWT com email/senha
- **Deploy:** Vercel
- **Versionamento:** GitHub

## Pré-requisitos

- Node.js 22+
- pnpm 10+
- Conta no Neon (PostgreSQL)
- Conta no Vercel
- Conta no GitHub

## Setup Local

### 1. Clonar o repositório

```bash
git clone https://github.com/aryabolt-lang/processador-csv.git
cd processador-csv
```

### 2. Instalar dependências

```bash
pnpm install
```

### 3. Configurar variáveis de ambiente

Copie `.env.example` para `.env.local`:

```bash
cp .env.example .env.local
```

Preencha as variáveis:
- `DATABASE_URL`: String de conexão PostgreSQL do Neon
- `JWT_SECRET`: Segredo para assinar JWTs (mude em produção!)

### 4. Preparar o banco de dados

```bash
# Gerar migrations
pnpm db:push

# Ou manualmente
pnpm exec drizzle-kit generate
pnpm exec drizzle-kit migrate
```

Isso vai criar:
- Tabelas do banco
- Usuário admin padrão: `admin@example.com` / `admin123`

### 5. Executar em desenvolvimento

```bash
pnpm dev
```

Acesse: `http://localhost:3000`

## Build e Deploy

### Build local

```bash
pnpm build
```

### Deploy na Vercel

1. **Conectar repositório GitHub à Vercel**
   - Acesse https://vercel.com
   - Clique em "New Project"
   - Selecione seu repositório GitHub
   - Configure as variáveis de ambiente

2. **Variáveis de Ambiente na Vercel**
   - `DATABASE_URL`: String de conexão Neon
   - `JWT_SECRET`: Segredo JWT (use um valor forte!)

3. **Deploy automático**
   - Cada push para `main` dispara um deploy automático
   - Visualize o progresso no dashboard da Vercel

## Estrutura do Projeto

```
.
├── client/                 # Frontend React
│   ├── src/
│   │   ├── pages/         # Páginas principais
│   │   ├── components/    # Componentes React
│   │   └── App.tsx        # App principal
│   └── index.html
├── server/                # Backend Express
│   ├── _core/
│   │   ├── index.ts       # Entrada do servidor
│   │   ├── auth.ts        # Autenticação JWT
│   │   ├── init.ts        # Inicialização (admin user)
│   │   └── ...
│   ├── db.ts              # Camada de banco de dados
│   ├── uploadRoutes.ts    # Rotas de upload/processamento
│   ├── contatosRoutes.ts  # Rotas de contatos
│   └── processador.ts     # Lógica de processamento
├── drizzle/
│   ├── schema.ts          # Schema PostgreSQL
│   └── migrations/        # Migrations SQL
├── shared/                # Código compartilhado
├── .env.example           # Variáveis de exemplo
├── drizzle.config.ts      # Configuração Drizzle
├── vite.config.ts         # Configuração Vite
├── package.json           # Dependências
└── README.md              # Este arquivo
```

## Rotas da API

### Autenticação

- `POST /api/auth/register` - Registrar novo usuário
- `POST /api/auth/login` - Fazer login
- `GET /api/auth/me` - Obter dados do usuário (requer JWT)

### Upload e Processamento

- `POST /api/upload/parse` - Analisar arquivo CSV/XLSX
- `POST /api/upload/process` - Processar arquivo completo
- `POST /api/upload/download-csv` - Baixar CSV processado
- `GET /api/upload/historico` - Histórico de processamentos

### Consultas

- `GET /api/upload/consulta/search?q=...` - Buscar registros
- `GET /api/upload/consulta/pessoa/:documento` - Buscar por documento
- `GET /api/upload/consulta/export-csv?q=...` - Exportar como CSV

### Contatos

- `POST /api/contatos/parse` - Analisar arquivo de contatos
- `POST /api/contatos/import` - Importar contatos
- `GET /api/contatos/import-progress/:jobId` - Progresso (SSE)
- `GET /api/contatos` - Listar contatos
- `GET /api/contatos/search?q=...` - Buscar contatos

## Autenticação

A aplicação usa JWT com email/senha. Todos os endpoints (exceto `/api/auth/register` e `/api/auth/login`) requerem autenticação.

### Fazer login

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "admin123"
  }'
```

Resposta:
```json
{
  "id": 1,
  "email": "admin@example.com",
  "name": "Administrador",
  "role": "admin",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Usar o token

Adicione o token no header `Authorization`:

```bash
curl http://localhost:3000/api/upload/historico \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

## Dados Armazenados

Todos os dados são armazenados no PostgreSQL (Neon):

- **users**: Usuários da aplicação
- **processamentos**: Histórico de processamentos de arquivos
- **registros_processados**: Registros individuais processados
- **contatos**: Base de contatos importados
- **contatos_historico**: Auditoria de mudanças em contatos

## Troubleshooting

### Erro: "DATABASE_URL is not set"

- Verifique se a variável está configurada em `.env.local`
- Teste localmente: `echo $DATABASE_URL`

### Erro: "Connection refused"

- Verifique se o banco Neon está ativo
- Confirme que a string de conexão está correta
- Teste a conexão: `psql $DATABASE_URL`

### Erro: "Admin user already exists"

- Isso é normal na primeira execução
- O usuário admin é criado automaticamente

### Aplicação lenta

- Verifique a performance do Neon
- Monitore as queries no console do Neon
- Considere adicionar índices se necessário

## Desenvolvimento

### Adicionar nova rota

1. Crie um novo arquivo em `server/`
2. Importe em `server/_core/index.ts`
3. Registre a rota: `app.use("/api/nova-rota", novaRota)`
4. Adicione autenticação se necessário: `authMiddleware`

### Adicionar nova tabela

1. Atualize `drizzle/schema.ts`
2. Execute: `pnpm db:push`
3. Use em `server/db.ts`

### Build e testes

```bash
# Type checking
pnpm check

# Format code
pnpm format

# Run tests
pnpm test
```

## Deploy

### Vercel

1. Push para GitHub
2. Vercel detecta automaticamente
3. Configura variáveis de ambiente
4. Deploy automático

### Variáveis de Ambiente em Produção

⚠️ **IMPORTANTE**: Mude o `JWT_SECRET` em produção!

```bash
# Gere um novo secret seguro:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Segurança

- ✅ Senhas com hash bcrypt
- ✅ JWT com expiração
- ✅ Validação de entrada
- ✅ CORS configurado
- ✅ Rate limiting via Vercel

### Recomendações

- 🔒 Ative 2FA no GitHub e Vercel
- 🔒 Revise permissões regularmente
- 🔒 Monitore logs de acesso
- 🔒 Faça backups do Neon
- 🔒 Mude senhas padrão em produção

## Monitoramento

### Neon Dashboard
- https://console.neon.tech
- Monitore conexões, queries e performance

### Vercel Dashboard
- https://vercel.com/dashboard
- Monitore builds e deployments

## Próximos Passos

1. Configure Neon e Vercel
2. Teste a aplicação em produção
3. Configure domínio customizado (opcional)
4. Implemente monitoramento e alertas

## Suporte

Para problemas:
- Documentação Neon: https://neon.tech/docs
- Documentação Vercel: https://vercel.com/docs
- Documentação Express: https://expressjs.com
- Documentação Drizzle: https://orm.drizzle.team

## Licença

MIT

## Autor

Desenvolvido com ❤️ usando Manus AI
