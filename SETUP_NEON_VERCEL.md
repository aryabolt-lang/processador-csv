# Guia de Setup: Neon + Vercel

Este guia passo a passo vai ajudá-lo a configurar o banco de dados PostgreSQL no Neon e fazer o deploy automático na Vercel.

## 📋 Pré-requisitos

- Repositório GitHub criado: https://github.com/aryabolt-lang/processador-csv
- Conta no Neon (https://console.neon.tech)
- Conta no Vercel (https://vercel.com)
- Credenciais OAuth configuradas
- Credenciais da API Manus Forge

## 🗄️ Passo 1: Configurar Banco de Dados no Neon

### 1.1 Criar Projeto no Neon

1. Acesse https://console.neon.tech
2. Clique em "New Project"
3. Preencha os dados:
   - **Project Name**: `processador-csv`
   - **Database Name**: `processador_csv` (padrão)
   - **Region**: Selecione a mais próxima de você
4. Clique em "Create Project"

### 1.2 Obter String de Conexão

1. No dashboard do Neon, vá para "Connection string"
2. Selecione "Pooling" (recomendado para Vercel)
3. Copie a string no formato:
   ```
   postgresql://user:password@host/database?sslmode=require
   ```
4. **Guarde esta string** - você vai precisar na Vercel

### 1.3 Criar Tabelas (Migrations)

Você tem duas opções:

**Opção A: Via Drizzle Kit (recomendado)**
```bash
# Localmente, com a DATABASE_URL configurada
export DATABASE_URL="postgresql://..."
pnpm db:push
```

**Opção B: Via SQL direto no Neon**
1. No console do Neon, abra o SQL Editor
2. Execute os scripts em `drizzle/` na ordem:
   - `0000_sudden_phantom_reporter.sql`
   - `0001_outgoing_dragon_man.sql`
   - `0002_gigantic_stellaris.sql`
   - `0003_old_spiral.sql`
   - `0004_broad_dazzler.sql`

## 🚀 Passo 2: Deploy na Vercel

### 2.1 Conectar Repositório

1. Acesse https://vercel.com/dashboard
2. Clique em "Add New..." → "Project"
3. Selecione "Import Git Repository"
4. Procure por `processador-csv` e clique em "Import"

### 2.2 Configurar Variáveis de Ambiente

Na tela de configuração do projeto, vá para "Environment Variables" e adicione:

| Variável | Valor | Exemplo |
|----------|-------|---------|
| `DATABASE_URL` | String de conexão do Neon | `postgresql://user:pass@host/db?sslmode=require` |
| `VITE_OAUTH_PROVIDER_ID` | ID do seu provedor OAuth | `seu-provider-id` |
| `VITE_OAUTH_CLIENT_ID` | Client ID OAuth | `seu-client-id` |
| `VITE_OAUTH_REDIRECT_URI` | URL de redirecionamento | `https://seu-dominio.vercel.app/api/oauth/callback` |
| `BUILT_IN_FORGE_API_URL` | URL da API Manus | `https://api.manus.im/v1/storage` |
| `BUILT_IN_FORGE_API_KEY` | Chave da API Manus | `sua-chave-api` |
| `NODE_ENV` | Ambiente | `production` |

### 2.3 Deploy

1. Clique em "Deploy"
2. Aguarde o build completar (pode levar 2-5 minutos)
3. Você receberá uma URL como: `https://processador-csv-xxxxx.vercel.app`

## ✅ Verificação Pós-Deploy

### Verificar se o banco está conectado

```bash
curl https://seu-dominio.vercel.app/api/upload/historico
```

Você deve receber um JSON vazio `[]` (sem erro).

### Verificar logs

1. No dashboard da Vercel, clique em "Deployments"
2. Selecione o deployment mais recente
3. Clique em "View Function Logs" para ver os logs

## 🔄 Fluxo de Deploy Automático

Agora que tudo está configurado, o fluxo é:

1. **Você faz mudanças no código** localmente
2. **Faz commit e push** para `main`:
   ```bash
   git add .
   git commit -m "Sua mensagem"
   git push origin main
   ```
3. **Vercel detecta automaticamente** a mudança
4. **Inicia o build** (você pode acompanhar no dashboard)
5. **Deploy automático** para produção

## 🐛 Troubleshooting

### Erro: "DATABASE_URL is not set"

- Verifique se a variável está configurada na Vercel
- Certifique-se de que a string está correta
- Teste localmente: `echo $DATABASE_URL`

### Erro: "Connection refused"

- Verifique se o IP da Vercel está na whitelist do Neon
- No Neon, vá para "Security" e adicione o IP da Vercel
- Ou use "Allow all IPs" (menos seguro)

### Erro: "ENOENT: no such file or directory"

- Pode ser um problema de build
- Verifique os logs no dashboard da Vercel
- Tente fazer rebuild: clique em "Redeploy" no dashboard

### Aplicação lenta

- Verifique a conexão com o banco (pooling ativado?)
- Monitore as queries no Neon
- Considere aumentar os recursos do Neon

## 📊 Monitoramento

### Neon Dashboard
- Acesse https://console.neon.tech
- Monitore conexões, queries e performance
- Veja o uso de CPU e memória

### Vercel Dashboard
- Acesse https://vercel.com/dashboard
- Monitore builds e deployments
- Veja logs de erro e performance

## 🔐 Segurança

- **Nunca** compartilhe sua `DATABASE_URL`
- Use variáveis de ambiente para dados sensíveis
- Ative 2FA no GitHub e Vercel
- Revise regularmente os acessos

## 📝 Próximos Passos

1. Teste a aplicação em produção
2. Configure um domínio customizado (opcional)
3. Configure CI/CD adicional se necessário
4. Implemente monitoramento e alertas

## 📞 Suporte

Para problemas:
- Documentação Neon: https://neon.tech/docs
- Documentação Vercel: https://vercel.com/docs
- Comunidade Vercel: https://vercel.com/support
