# Guia de Importação de Dados

Este documento explica como importar dados do banco antigo para o novo banco PostgreSQL no Neon.

## 📋 Preparação

Você vai precisar de:
- Dump SQL do banco MySQL antigo
- Acesso ao console Neon
- String de conexão PostgreSQL

## 🔄 Opção 1: Importação via Dump SQL (Recomendado)

### Passo 1: Exportar dados do MySQL

```bash
# Exportar apenas dados (sem estrutura)
mysqldump -u usuario -p banco_antigo \
  --no-create-info \
  --insert-ignore \
  > dados_mysql.sql
```

### Passo 2: Converter SQL de MySQL para PostgreSQL

Se o dump tiver sintaxe específica do MySQL, você pode:

**Opção A: Usar ferramenta online**
- Acesse: https://www.sqlines.com/online
- Cole o SQL MySQL
- Clique em "Convert"
- Copie o resultado PostgreSQL

**Opção B: Converter manualmente**
Mudanças comuns:
- `\N` → `NULL`
- `` ` `` (backticks) → `"` (aspas duplas)
- `VALUES()` → Use `EXCLUDED` no `ON CONFLICT`

### Passo 3: Importar no Neon

**Via psql (local):**
```bash
psql $DATABASE_URL < dados_postgresql.sql
```

**Via Neon Console:**
1. Acesse https://console.neon.tech
2. Vá para "SQL Editor"
3. Cole o SQL convertido
4. Clique em "Execute"

## 📊 Opção 2: Importação Programática (Python)

Se o dump SQL for complexo, use Python:

```python
import mysql.connector
import psycopg2
from datetime import datetime

# Conectar ao MySQL antigo
mysql_conn = mysql.connector.connect(
    host="host_mysql",
    user="user_mysql",
    password="pass_mysql",
    database="banco_antigo"
)

# Conectar ao PostgreSQL novo
pg_conn = psycopg2.connect(
    "postgresql://user:pass@host/database"
)

mysql_cursor = mysql_conn.cursor(dictionary=True)
pg_cursor = pg_conn.cursor()

# Importar tabela 'users'
mysql_cursor.execute("SELECT * FROM users")
users = mysql_cursor.fetchall()

for user in users:
    pg_cursor.execute("""
        INSERT INTO users (openId, name, email, loginMethod, role, createdAt, updatedAt, lastSignedIn)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (openId) DO UPDATE SET
            name = EXCLUDED.name,
            email = EXCLUDED.email,
            updatedAt = EXCLUDED.updatedAt
    """, (
        user['openId'],
        user['name'],
        user['email'],
        user['loginMethod'],
        user['role'],
        user['createdAt'],
        user['updatedAt'],
        user['lastSignedIn']
    ))

pg_conn.commit()
print(f"Importados {len(users)} usuários")

# Repetir para outras tabelas...
mysql_cursor.close()
pg_cursor.close()
mysql_conn.close()
pg_conn.close()
```

## 🔍 Validação Pós-Importação

Após importar, verifique:

```sql
-- Contar registros em cada tabela
SELECT 'users' as table_name, COUNT(*) as count FROM users
UNION ALL
SELECT 'processamentos', COUNT(*) FROM processamentos
UNION ALL
SELECT 'registros_processados', COUNT(*) FROM registros_processados
UNION ALL
SELECT 'contatos', COUNT(*) FROM contatos
UNION ALL
SELECT 'contatos_historico', COUNT(*) FROM contatos_historico;
```

## ⚠️ Problemas Comuns

### Erro: "Duplicate key value violates unique constraint"

Significa que há duplicatas. Soluções:
- Use `ON CONFLICT DO UPDATE` nas queries
- Ou limpe os dados antes de importar

### Erro: "Invalid input syntax for type uuid"

Se você tiver UUIDs, certifique-se de:
- O tipo de dado está correto no schema
- Os valores são UUIDs válidos

### Erro: "Permission denied"

- Verifique se o usuário PostgreSQL tem permissões
- No Neon, use o usuário padrão (geralmente `postgres`)

### Dados incompletos

- Verifique se todas as colunas foram mapeadas
- Confirme que os tipos de dados são compatíveis
- Valide os dados antes de importar

## 📝 Checklist de Importação

- [ ] Dump SQL do MySQL exportado
- [ ] SQL convertido para PostgreSQL
- [ ] Tabelas criadas no Neon (via migrations)
- [ ] Dados importados
- [ ] Contagem de registros validada
- [ ] Integridade referencial verificada
- [ ] Índices criados (se necessário)
- [ ] Aplicação testada com novos dados

## 🔐 Backup Antes de Importar

**Sempre faça backup:**

```bash
# Backup do Neon
pg_dump $DATABASE_URL > backup_neon.sql

# Backup do MySQL
mysqldump -u user -p database > backup_mysql.sql
```

## 📞 Próximos Passos

1. Importe os dados usando um dos métodos acima
2. Valide os dados no Neon
3. Teste a aplicação com os dados reais
4. Monitore performance e conexões
5. Se tudo OK, remova o banco antigo

## 🆘 Suporte

Se encontrar problemas:
- Verifique os logs do Neon
- Teste as queries no SQL Editor do Neon
- Consulte a documentação: https://neon.tech/docs
