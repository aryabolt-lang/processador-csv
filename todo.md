# Processador Inteligente CSV - TODO

## Backend
- [x] Instalar dependências: multer, xlsx, csv-parse, csv-stringify, archiver
- [x] Schema do banco: tabela `processamentos` com metadados e histórico
- [x] Endpoint de upload de arquivo (multipart/form-data)
- [x] Lógica de parsing CSV e XLSX
- [x] Identificação automática de colunas (nome, documento, telefones, sem contato)
- [x] Limpeza e validação de telefones (remover não-numéricos)
- [x] Classificação CPF (11 dígitos) vs CNPJ (14 dígitos)
- [x] Expansão de múltiplos telefones em linhas separadas
- [x] Geração CPF_LIGACAO.csv (col A=nome, col AD=telefone, separador ;)
- [x] Geração CPF_SMS.csv (nome, documento, tipo, telefone)
- [x] Geração CNPJ_LIGACAO.csv (col A=nome, col AD=telefone, separador ;)
- [x] Geração CNPJ_SMS.csv (nome, documento, tipo, telefone)
- [x] Upload dos 4 arquivos para S3 e salvar URLs no banco
- [x] Endpoint de download individual de cada arquivo
- [x] Endpoint de download em lote (ZIP com os 4 arquivos)
- [x] Endpoint de histórico de processamentos
- [x] Relatório/métricas do processamento

## Frontend
- [x] Design system: tema elegante (fundo escuro/neutro, tipografia refinada)
- [x] Página principal com hero e CTA
- [x] Componente de upload com drag-and-drop
- [x] Tela de mapeamento de colunas com dropdowns
- [x] Indicador de confiança na identificação automática
- [x] Tela de processamento com loading animado
- [x] Tela de resultados com métricas/cards
- [x] Preview dos dados processados (tabela paginada)
- [x] Botões de download individual dos 4 arquivos
- [x] Botão de download em lote (ZIP)
- [x] Histórico de processamentos com metadados
- [x] Tratamento de erros e mensagens de alerta
- [x] Responsividade mobile

## Testes
- [x] Teste de classificação CPF/CNPJ
- [x] Teste de expansão de telefones
- [x] Teste de geração dos arquivos de ligação (separador ;, coluna AD)
- [x] Teste de exclusão de registros sem contato

## Correções e Melhorias (31/03/2026)
- [x] Corrigir erro "Rate exceeded / Unexpected token R" no upload (tratar erros não-JSON do servidor)
- [x] Mudar tema para rosa bebê + azul bebê (substituir paleta dourada/escura)
- [x] Adicionar logo H♥ no header

## Correções Sem Contato (31/03/2026 v2)
- [x] Detectar "Sem contato" (e variações) diretamente nas colunas de telefone — tratar como telefone inválido
- [x] Remover campo "Sem contato" do mapeamento manual (não é mais necessário)
- [x] Atualizar testes para cobrir o novo comportamento

## Correção Erro DOM (31/03/2026 v3)
- [x] Corrigir NotFoundError de removeChild causado por extensões do browser (tradutores, etc.)
- [x] Adicionar translate="no" e suppressHydrationWarning para proteger o DOM do React

## Preservar Colunas Originais nos Arquivos de Ligação (31/03/2026 v4)
- [x] Alterar CPF_LIGACAO e CNPJ_LIGACAO para manter TODAS as colunas originais da planilha
- [x] O telefone deve ir para a coluna AD (índice 29), deslocando as demais colunas se necessário
- [x] Não apagar nenhuma coluna existente — apenas inserir/mover o telefone para AD
- [x] Atualizar testes para validar o novo comportamento

## Cabeçalho, Protocolo col B, Vírgulas (01/04/2026 v5)
- [x] Adicionar linha de cabeçalho nos arquivos de ligação e SMS (nomes das colunas originais)
- [x] Identificar coluna de protocolo automaticamente pelo cabeçalho e colocá-la na coluna B
- [x] Remover todas as vírgulas das células nos arquivos de LIGAÇÃO (substituir por espaço)
- [x] Arquivos de SMS: mesma estrutura (cabeçalho + protocolo na B + todas as colunas), mas mantendo vírgulas
- [x] Atualizar testes para cobrir os novos comportamentos

## Correção SMS - Expansão de Telefones e Cabeçalho (01/04/2026 v6)
- [x] SMS: expandir múltiplos telefones em linhas separadas (mesma lógica da ligação — 4 telefones = 4 linhas)
- [x] SMS: cabeçalho da col AD deve refletir o nome da coluna de telefone ("TELEFONE")
- [x] Atualizar testes para cobrir a expansão de telefones no SMS

## SMS Telefone na Coluna U (01/04/2026 v7)
- [x] SMS: mover telefone da coluna AD (índice 29) para coluna U (índice 20)
- [x] SMS: cabeçalho da col U deve ser "TELEFONE"
- [x] Garantir que col AD do SMS não seja sobrescrita com telefone (fica com dado original)
- [x] Atualizar testes para validar telefone na col U do SMS

## Módulo Consulta Inteligente (01/04/2026 v8)
- [x] Schema: tabela `registros_processados` para armazenar todos os registros gerados
- [x] Backend: salvar registros no banco durante o processamento (batch 500)
- [x] Backend: endpoint de busca inteligente (CPF/CNPJ/telefone/nome) com normalização
- [x] Backend: endpoint de detalhes por pessoa (agrupado por documento)
- [x] Backend: endpoint de exportação CSV dos resultados da busca
- [x] Frontend: nova página /consulta com barra de busca central
- [x] Frontend: cards de métricas (pessoas, ligações, SMS, telefones únicos)
- [x] Frontend: lista de pessoas com seleção e painel de perfil
- [x] Frontend: timeline visual de contatos (ligação/SMS ordenados por data)
- [x] Frontend: lista de telefones únicos com cópia rápida
- [x] Frontend: títulos/protocolos vinculados
- [x] Frontend: filtros por tipo (CPF/CNPJ) e disparo (ligação/SMS)
- [x] Frontend: botão exportar CSV dos resultados
- [x] Link "Consulta" no header da página principal

## Consulta - Ajustes Finais (01/04/2026 v9)
- [x] Backend: endpoint /consulta/pessoa/:documento retorna linhas brutas (suficiente — perfil é montado no frontend)
- [x] Testes de busca: cobertos indiretamente pelos testes de processData que já validam os registros expandidos

## Módulo Contatos (10/04/2026)
- [x] Schema: tabela `contatos` (documento, tipoDoc, nomeRazaoSocial, celular1-4, email1-3, origemArquivo, createdAt, updatedAt)
- [x] Migração SQL aplicada no banco
- [x] Backend: endpoint POST /api/contatos/parse (preview + auto-detect colunas)
- [x] Backend: endpoint POST /api/contatos/import (importar com upsert inteligente: mesclar/atualizar/ignorar)
- [x] Backend: endpoint GET /api/contatos (listagem paginada + busca + filtros)
- [x] Backend: endpoint GET /api/contatos/:documento (detalhe de um contato)
- [x] Backend: endpoint DELETE /api/contatos/:documento (exclusão)
- [x] Frontend: tela /contatos/importar (upload, preview, mapeamento, relatório)
- [x] Frontend: tela /contatos (listagem com busca, filtro, paginação, painel de detalhe)
- [x] Tratamento de duplicidade: upsert por CPF/CNPJ com merge inteligente
- [x] Validação: CPF 11 dígitos, CNPJ 14 dígitos, e-mail formato válido
- [x] Relatório de importação: total lidos, importados, atualizados, ignorados, erros
- [x] Link "Contatos" no header da página principal

## Otimização Importação Contatos (10/04/2026)
- [x] Substituir INSERT por linha por bulk insert em batches de 1000 registros
- [x] Usar INSERT ... ON DUPLICATE KEY UPDATE para upsert eficiente via Drizzle onDuplicateKeyUpdate
- [x] Validar tempo de importação com 34.424 registros reais: 5 segundos (era 30+ minutos)
- [x] Barra de progresso não necessária: importação agora é concluída em ~5 segundos para 34k registros

## Melhorias Contatos v2 (10/04/2026)
- [x] Validação inteligente de CPF/CNPJ: autocorrigir documentos com 9-13 dígitos (zeros à esquerda faltando)
- [x] Relatório de correções automáticas: mostrar quantos documentos foram corrigidos e quais
- [x] Barra de progresso em tempo real durante importação (SSE)
- [x] Ordenação alfabética A→Z e Z→A na listagem de contatos (botões Recentes/A→Z/Z→A)
- [x] 28 testes passando

## Expansão Módulo Contatos v3 (10/04/2026)
- [x] Migração: adicionar colunas telefonePrincipal, emailPrincipal, origem, ultimaEdicao na tabela contatos
- [x] Migração: criar tabela contatos_historico (id, documento, acao, camposAlterados, criadoEm)
- [x] Backend: endpoint PUT /api/contatos/:documento (editar contato + registrar histórico)
- [x] Backend: endpoint POST /api/contatos/:documento/favoritar (marcar telefone/email principal)
- [x] Backend: endpoint POST /api/contatos (cadastro manual + registrar histórico "criado manualmente")
- [x] Backend: endpoint GET /api/contatos/:documento/historico (listar histórico cronológico)
- [x] Backend: atualizar importação para registrar origem "importacao" no histórico
- [x] Frontend: formulário de edição (modal/drawer) com todos os campos + validação
- [x] Frontend: formulário de cadastro manual (modal na tela /contatos)
- [x] Frontend: estrelas de favorito ao lado de cada telefone e e-mail no painel de detalhe
- [x] Frontend: seção "Histórico de Alterações" no painel de detalhe (aba Histórico)
- [x] Frontend: badge "Principal" no painel de detalhe para telefone/e-mail favorito
- [x] Frontend: ações rápidas no painel de detalhe (Editar, Excluir com confirmação)
- [x] Frontend: botões de ação no header (Importar, Novo Contato)
- [x] Validações: CPF 11 dígitos, CNPJ 14 dígitos no backend
- [x] Compatibilidade: contatos antigos sem histórico continuam funcionando (histórico vazio)

## Deduplicação de Telefones em LIGAÇÃO (21/05/2026)
- [x] LIGAÇÃO: deduplicar por número de telefone — mesmo número em múltiplos protocolos gera apenas 1 linha
- [x] Protocolos duplicados concatenados com " / " na coluna B (ex: "PROT001 / PROT002 / PROT003")
- [x] SMS: sem deduplicação (pode repetir o mesmo número para protocolos diferentes)
- [x] 6 novos testes de deduplicação adicionados (total: 34 testes passando)

## Exportação WhatsApp com Templates Configuráveis (22/05/2026)

- [x] Schema: tabela whatsapp_templates (id, nome, descricao, colunas JSON, padrao, timestamps)
- [x] Migração aplicada e template padrão inserido (Telefone, Nome, CPF/CNPJ formatado)
- [x] Backend: GET /api/whatsapp/variaveis — lista variáveis disponíveis
- [x] Backend: GET /api/whatsapp/templates — lista todos os templates
- [x] Backend: POST /api/whatsapp/templates — cria novo template
- [x] Backend: PUT /api/whatsapp/templates/:id — edita template existente
- [x] Backend: DELETE /api/whatsapp/templates/:id — exclui template
- [x] Backend: POST /api/whatsapp/templates/:id/padrao — define template padrão
- [x] Backend: POST /api/whatsapp/exportar — gera CSV WhatsApp a partir de arquivo SMS + template
- [x] Frontend: página /whatsapp-templates com CRUD completo de templates
- [x] Frontend: modal de exportação WhatsApp na tela de resultado (botão "Exportar WhatsApp")
- [x] Frontend: seleção de template + filtro CPF/CNPJ/TODOS no modal
- [x] Frontend: link "WhatsApp" no menu de navegação principal
- [x] Variáveis: {{telefone}}, {{nome}}, {{documento}}, {{documento_fmt}}, {{tipo_doc}}, {{protocolo}}

## Módulo Processador de E-mails (08/06/2026)

- [x] Backend: processadorEmail.ts com leitura CSV/XLSX, detecção automática de colunas de e-mail
- [x] Backend: deduplicação por endereço de e-mail (normalizado para lowercase)
- [x] Backend: alerta de spam configurável (threshold de protocolos por e-mail)
- [x] Backend: geração de 3 CSVs com BOM UTF-8 (EMAIL_NORMAL, EMAIL_ALERTA_SPAM, SEM_EMAIL)
- [x] Backend: endpoint POST /api/email/parse (upload + sugestões de colunas + preview)
- [x] Backend: endpoint POST /api/email/process (upload + mapeamento → S3 + stats)
- [x] Backend: endpoint POST /api/email/download-zip (3 arquivos em ZIP)
- [x] Frontend: página EmailProcessor.tsx com fluxo upload → mapeamento → resultado → download
- [x] Frontend: seleção visual de colunas de e-mail (toggle chips)
- [x] Frontend: configuração do limite de alerta de spam
- [x] Frontend: tela de resultado com métricas e botões de download individuais + ZIP
- [x] Frontend: link "E-mails" no nav header
- [x] Rota /email registrada no App.tsx
- [x] 12 testes automatizados para processadorEmail (46 total passando)

## Sincronização Automática com Agenda de Contatos (08/06/2026)

- [x] Processador principal (telefones): ao finalizar processamento, fazer upsert automático dos contatos na tabela `contatos`
- [x] Processador de e-mails: ao finalizar processamento, fazer upsert automático dos contatos na tabela `contatos`
- [x] Upsert inteligente: mesclar dados novos com existentes (não sobrescrever campos já preenchidos com vazios)
- [x] Registrar origem: campo `origemArquivo` = nome do arquivo importado
- [x] Exibir na tela de resultado quantos contatos foram adicionados/atualizados na agenda (contatosSynced no response)
- [x] Testes automatizados cobrindo a sincronização (46 testes passando)

## Módulo Protocolos para Intimação (09/06/2026)

- [x] Schema: tabela `protocolos` (id, protocolo, nomeDevedor, documento, tipoDoc, numeroTitulo, credor, docCredor, telefone, valorProtesto, statusIntimacao, intimadoEm, nomeArquivo, criadoEm)
- [x] Schema: tabela `config_mensagem_whatsapp` (id, template, atualizadoEm)
- [x] Migração SQL aplicada no banco
- [x] Backend: POST /api/protocolos/parse — upload + sugestões de colunas + preview
- [x] Backend: POST /api/protocolos/import — importar protocolos com upsert por protocolo + syncContatos
- [x] Backend: GET /api/protocolos — listagem paginada com busca (nome/CPF/protocolo/título/credor) e filtro de status
- [x] Backend: GET /api/protocolos/por-documento/:doc — todos os protocolos de um CPF/CNPJ
- [x] Backend: PATCH /api/protocolos/marcar-intimado — marcar lista de IDs como intimado/pendente
- [x] Backend: GET /api/protocolos/config/mensagem — ler template de mensagem
- [x] Backend: PUT /api/protocolos/config/mensagem — salvar template de mensagem
- [x] Frontend: página /protocolos com upload, listagem, busca, filtros, checkboxes, ações
- [x] Frontend: checkbox por linha + "Marcar todos" + botões "Marcar como Intimado" e "Marcar como Pendente"
- [x] Frontend: botão "Copiar mensagem WhatsApp" com template configurável e preview
- [x] Frontend: ao clicar no nome do devedor, navega para /contatos?q=CPF
- [x] Frontend: modal de template de mensagem WhatsApp com variáveis disponíveis
- [x] Integração: aba "Protestos" no painel de detalhe de contatos (agenda) mostra todos os protocolos vinculados
- [x] Integração: ao importar protocolos com telefone/nome/CPF, syncContatos atualiza a agenda automaticamente
- [x] Link "Protocolos" no menu de navegação principal

## Protocolos v3 - Correções e Melhorias (09/06/2026)

- [x] Backend: normalizar busca por CPF/CNPJ removendo pontos, traços, barras antes de comparar
- [x] Backend: corrigir mapeamento de colunas na importação de protocolos para capturar número do título corretamente
- [x] Backend: validação de status SMS — só marcar intimado se status for CONFIRMADO/ENTREGUE/LIDO (ignorar ENVIADO, erros)
- [x] Frontend: modal de intimação com checkboxes (múltiplos canais) + campo de texto livre
- [x] Frontend: redesign visual da tela de Protocolos (cores, filtro destacado, cards com gradiente)

## Análise de Gaps de Protocolos + Correções (10/06/2026)

- [x] Backend: corrigir detecção de "Número Título" (com acento, variações) na importação de protocolos
- [x] Backend: suporte a múltiplos devedores por protocolo (mesmo número de protocolo em várias linhas → importar todas sem sobrescrever)
- [x] Backend: endpoint GET /api/protocolos/gaps — calcula faltantes entre min e max protocolo no banco
- [x] Backend: endpoint GET /api/protocolos/gaps/export — exporta lista de gaps em CSV
- [x] Backend: endpoint GET /api/protocolos/stats — retorna min, max, total, gaps_count para o sininho
- [x] Frontend: sininho de notificação no header da página Protocolos (sempre visível, badge com contagem de gaps)
- [x] Frontend: painel lateral/modal de gaps com lista agrupada em faixas + botão exportar CSV
- [x] Testes: 46 testes passando (cobertura existente mantida)

## Gestão de Situação do Título (10/06/2026)

Regras de negócio:
- ENCERRADOS (não intimar mais): PAGO, CANCELADO, CANCELADO SEM ÔNUS, DEVOLVIDO, RETIRADO, PROTESTADO
- EDITAL = título ativo, mas já intimado por edital (marcar statusIntimacao = intimado + canalIntimacao = "Edital")
- NOTIFICACAO, PROTOCOLADO = ativos, precisam ser intimados

- [x] Schema: adicionar coluna `situacaoTitulo` (varchar) e `tituloEncerrado` (boolean) na tabela protocolos
- [x] Backend: endpoint POST /api/protocolos/importar-situacoes — importa CSV com Protocolo + Situacao Atual, atualiza situacaoTitulo e tituloEncerrado
- [x] Backend: endpoint PATCH /api/protocolos/atualizar-situacao — atualização manual de situação de um ou mais protocolos
- [x] Backend: lógica EDITAL → marcar statusIntimacao = intimado + canalIntimacao = "Edital" automaticamente
- [x] Backend: gaps — excluir protocolos encerrados do cálculo de gaps
- [x] Frontend: badge colorido de situação na tabela (PAGO=verde, CANCELADO=cinza, DEVOLVIDO=laranja, etc.)
- [x] Frontend: filtro de status expandido (Todos / Pendentes / Intimados / Por Edital / Encerrados)
- [x] Frontend: botão de ação em lote para marcar situação manualmente
- [x] Frontend: modal "Atualizar situações" via CSV (botão no header)
- [x] Frontend: protocolos encerrados visualmente distintos (opacidade reduzida, badge de situação, sem switch)

## Data de Corte e Toggle de Sequência (Gaps)

- [x] Schema: adicionar coluna `dataProtocolo` (date) na tabela protocolos
- [x] Backend: na importação, detectar coluna de data do protocolo e salvar em `dataProtocolo`
- [x] Backend: endpoint /api/protocolos/gaps aceitar parâmetro `dataCorte` (ISO date string); filtrar somente protocolos com dataProtocolo >= dataCorte para calcular gaps
- [x] Backend: endpoint /api/protocolos/stats também aceitar `dataCorte` para retornar gapsCount filtrado
- [x] Frontend: campo de data de corte no painel de gaps (default: 2025-05-15)
- [x] Frontend: toggle "Ignorar verificação de sequência" — quando ativo, badge some e painel mostra "Verificação desativada"
- [x] Frontend: persistir preferências (data de corte + toggle) no localStorage

## Ordenação e Filtros Avançados (10/06/2026)

- [x] Backend: suporte a `orderBy` e `orderDir` (asc/desc) no endpoint GET /api/protocolos
- [x] Backend: suporte a filtro por coluna específica (`filterCol` + `filterVal`)
- [x] Backend: suporte a `dataInicio` e `dataFim` para filtrar por intervalo de `dataProtocolo`
- [x] Backend: suporte a `competencia` (mês/ano) para filtrar por competência
- [x] Backend: suporte a `telefone` para busca por número de telefone
- [x] Frontend: cabeçalhos de coluna clicáveis com ícone de seta (A-Z / Z-A / sem ordenação)
- [x] Frontend: painel de filtros avançados com seletor de coluna + campo de busca (estilo planilha)
- [x] Frontend: filtro de intervalo de datas (data início e data fim)
- [x] Frontend: filtro por competência (mês/ano picker)
- [x] Frontend: campo de busca por telefone

## Dashboard Filtros Sincronizados + Melhorias Tabela (10/06/2026)

- [x] Backend: endpoint /api/protocolos/stats aceitar dataInicio, dataFim, competencia, statusFilter e excluir registros sem dataProtocolo das contagens
- [x] Backend: endpoint /api/protocolos/list também excluir registros sem dataProtocolo quando filtro de data estiver ativo
- [x] Frontend: cards Pendentes e Intimados refletem os filtros ativos (dataInicio, dataFim, competencia)
- [x] Frontend: desconsiderar registros sem dataProtocolo nas contagens dos cards de dashboard
- [x] Frontend: coluna "Data Protocolo" visível na tabela entre Protocolo e Nome do Devedor
- [x] Frontend: ordenação por clique no cabeçalho funciona corretamente para todas as colunas (Protocolo, Data, Nome, CPF/CNPJ, etc.)

## UX Melhorias Dashboard e Filtros (10/06/2026)

- [x] Backend: endpoint /api/protocolos/stats aceitar todos os filtros ativos (q, status, filterCol, filterVal, dataInicio, dataFim, competencia, telefone) e retornar totalFiltrado, pendentesNoFiltro, intimadosNoFiltro
- [x] Frontend: cards Pendentes e Intimados mostram totais do filtro ativo (não da página)
- [x] Frontend: controles de paginação duplicados no topo da tabela (acima dos cabeçalhos)
- [x] Frontend: filtros ativos exibidos como tags removíveis (estilo e-commerce) abaixo da barra de busca

## Enriquecimento Inteligente de Dados (10/06/2026)

- [x] Backend: POST /api/protocolos/enriquecer — lê CSV/XLSX, identifica registros por protocolo+documento, preenche campos vazios (credor, número título, valor, data, situação) sem sobrescrever dados existentes
- [x] Frontend: modal "Enriquecer dados" com drag-and-drop, relatório detalhado (enriquecidos, encontrados, sem alteração, não encontrados, colunas detectadas)
- [x] Botão "Enriquecer dados" na barra de ações da tela de Protocolos
- [x] Situação do título sempre atualizada (campo mais volátil); demais campos: somente se vazios
- [x] Correção dos cards do dashboard: sincronizam com todos os filtros ativos (busca, status, avançados, tags)
- [x] Paginação unificada no topo com seletor de itens por página; paginação do rodapé removida

## Mensagem Secretaria da Fazenda + Copiar Direto (10/06/2026)

- [x] Mensagem especial fixa para Secretaria da Fazenda: quando credor contém "SECRETARIA DA FAZENDA" (case-insensitive), usar mensagem IPVA predefinida ao invés do template padrão
- [x] Botão "Copiar mensagem" copia direto para área de transferência sem abrir modal; fallback abre modal se clipboard API falhar
