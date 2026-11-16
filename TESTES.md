# Testes do frontend

## Pré-requisitos

- Node 20.19 ou superior (`nvm use` lê o `.nvmrc`).
- Para os testes ponta a ponta: Google Chrome instalado e o repositório
  `modeladb-backend` ao lado deste, com `npm install` feito. O Playwright sobe
  sozinho um backend isolado (MongoDB em memória, porta 3101) e um Vite na
  porta 5174. Os servidores de desenvolvimento (3001/5173) não são usados.
- Para `test:sql-engines`: Docker (usa as imagens `mysql:8.4` e `postgres:16-alpine`).

## Comandos

| Comando | O que roda | Tempo |
|---|---|---|
| `npm test` | Testes unitários e de propriedades (Vitest) | ~5 s |
| `npm run test:cov` | O mesmo, com cobertura em `coverage/` | ~6 s |
| `npm run test:sql-engines` | SQL exportado executado em MySQL 8.4 e PostgreSQL 16 reais | ~4 min |
| `npm run test:e2e` | Ponta a ponta com Playwright em dois navegadores | ~1 min |
| `npm run test:e2e:perf` | Latência percebida entre dois navegadores: 4 tipos de operação, 3 execuções × 125 ciclos (1500 amostras), ajustável por `UI_LATENCY_SAMPLES`, `UI_LATENCY_RUNS` e `UI_LATENCY_WARMUP` | ~10 min |
| `npm run experiment:reconnection` | Desconexão do cliente (1, 5, 15 e 30 s), intensidade de edições concorrentes (1, 5 e 20 op/s) e reinício do servidor, com e sem o mecanismo de reconexão, 10 repetições; resultados em `reports/perf/reconnection.*`. Ajustável por `RECONN_REPEATS`, `RECONN_SCENARIOS`, `RECONN_DURATIONS_MS`, `RECONN_RATES`, `RECONN_RESTART_EXTRA_MS` | ~1 h |
| `npm run bench` | Operações por segundo do store e custo da exportação SQL | ~15 s |
| `npm run typecheck:test` | Checagem de tipos dos arquivos de teste | ~5 s |

Para aumentar o número de sessões aleatórias dos testes de convergência:

```
FC_NUM_RUNS=20000 npx vitest run src/stores/diagramCollabStore.convergence.test.ts
```

## O que cada suíte cobre

| Arquivo | Conteúdo |
|---|---|
| `src/stores/diagramCollabStore.test.ts` | Relógio de Lamport, LWW e desempate, idempotência, fila de pendentes, exclusão lógica, desfazer/refazer |
| `src/stores/diagramCollabStore.convergence.test.ts` | Propriedades do CRDT com sessões aleatórias de 3 usuários: convergência, independência de ordem, reenvio e causalidade |
| `src/utils/sqlExport.test.ts` | DDL de MySQL e PostgreSQL, tipos, saneamento, FKs 1:N e N:N, execução no pg-mem e gramática do MySQL |
| `src/utils/sqlImport.test.ts` | Importação de SQL: MySQL, PostgreSQL, dumps do pg_dump e phpMyAdmin, 1:1/1:N/N:N, tamanhos, DEFAULT, CHECK, ações de FK, índices, views, layout, entradas inválidas e ida e volta exportar → importar → exportar |
| `src/utils/viewSql.test.ts` | Análise da consulta de views: tabelas de FROM/JOIN, CTEs, subconsultas e colunas de saída |
| `src/utils/diagramDiff.test.ts` e `versionLabels.test.ts` | Comparação entre versões (tabelas, colunas, índices, CHECK, views, relacionamentos) e títulos das versões |
| `src/utils/aiSuggestions.test.ts` | Ações sugeridas pela IA convertidas em operações colaborativas e aplicadas no store (inclusive desfazer e recusas) |
| `src/utils/sqlExport.engines.test.ts` | Os 32 tipos da interface em bancos reais e a matriz de compatibilidade (`reports/sql-compatibility.md`) |
| `src/services/realtimeService.test.ts` | Contrato do cliente Socket.IO com o gateway, com socket simulado: fila de edições offline, sincronização ao reconectar, recarga quando o log não cobre o intervalo e estados da conexão |
| `src/services/api.test.ts` | Renovação da sessão com refresh token, repetição após 401, refresh único entre requisições e abas, saída para o login |
| `src/utils/fieldOps.test.ts` | Diferença entre campos antes e depois do modal de atributos, sem reenviar remoções de campos já apagados |
| `src/utils/relationshipOps.test.ts` | Operações geradas ao criar relacionamentos 1:1, 1:N e N:N |
| `src/components/ErrorBoundary.test.ts` | Captura de erros de renderização e fallback |
| `src/utils/*.test.ts` | Leitura do token e cores/iniciais de presença |
| `e2e/auth.spec.ts` | Cadastro, login, redirecionamento, renovação de sessão expirada e esqueci a senha |
| `e2e/collaboration.spec.ts` | Dois usuários reais: presença, cursores, entidades, atributos, desfazer, concorrência, salvar |
| `e2e/permissions.spec.ts` | Convite pelo modal, leitor sem edição, usuário sem acesso, rebaixamento e remoção com o diagrama aberto |
| `e2e/reconnection.spec.ts` | Conexão derrubada no meio da edição: indicador de status, fila de alterações e convergência dos dois lados ao reconectar |
| `e2e/sql-import.spec.ts` | Importa um `.sql` pelo botão "Importar", confere entidades/arestas no canvas e o salvamento |
| `e2e/views-indexes.spec.ts` | Índices e views: importação, modal de índices, nova view com consulta, linhas até as tabelas, exportação e persistência |
| `e2e/logical-model.spec.ts` | Tamanho/precisão, DEFAULT, CHECK, ON DELETE/ON UPDATE e participação: importação, edição, sincronização com um segundo usuário e exportação |
| `e2e/version-history.spec.ts` | Histórico: versão automática e manual, pré-visualização com mudanças, restauração avisando outro colaborador, persistência e leitor sem ações |
| `e2e/ai-analysis.spec.ts` | Análise da IA (resposta simulada): painel, aplicar sugestões sincronizando com outro usuário, ignorar, desfazer, pedido de chave |
| `e2e/perf.spec.ts` | Gera `reports/perf/ui-latency.{md,json}` e `ui-latency-amostras.csv` |

## Falhas conhecidas documentadas

Testes marcados com `it.fails` descrevem o comportamento **correto** e hoje
falham. Quando o problema for corrigido, o Vitest acusa e o `.fails` deve sair.

| Teste | Problema |
|---|---|
| MySQL: UNIQUE numa coluna TEXT | TEXT, BLOB, JSON e tipos espaciais não podem ser chave sem ajustes |
| PostgreSQL: UNIQUE numa coluna POINT | `point` não tem índice B-tree |
| MySQL: AUTO_INCREMENT fora de chave ou em VARCHAR | A interface permite, o MySQL recusa |

Corrigidas em 2026-10-12 e hoje cobertas por testes normais: ENUM/SET exportados
sem a lista de valores, VARBINARY sem tamanho, duas entidades com o mesmo nome
(a cópia recebe sufixo `_2`) e coluna FK renomeada depois do relacionamento (a
aresta guarda o id da coluna).
