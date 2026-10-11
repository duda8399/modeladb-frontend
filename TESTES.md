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
| `npm run test:e2e:perf` | Latência percebida de uma edição entre dois navegadores | ~20 s |
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
| `src/utils/sqlImport.test.ts` | Importação de SQL: MySQL, PostgreSQL, dumps do pg_dump e phpMyAdmin, 1:1/1:N/N:N, layout, entradas inválidas e ida e volta exportar → importar → exportar |
| `src/utils/viewSql.test.ts` | Análise da consulta de views: tabelas de FROM/JOIN, CTEs, subconsultas e colunas de saída |
| `src/utils/sqlExport.engines.test.ts` | Os 32 tipos da interface em bancos reais e a matriz de compatibilidade (`reports/sql-compatibility.md`) |
| `src/services/realtimeService.test.ts` | Contrato do cliente Socket.IO com o gateway, com socket simulado |
| `src/utils/*.test.ts` | Leitura do token e cores/iniciais de presença |
| `e2e/auth.spec.ts` | Cadastro, login e redirecionamento pela interface |
| `e2e/collaboration.spec.ts` | Dois usuários reais: presença, cursores, entidades, atributos, desfazer, concorrência, salvar |
| `e2e/permissions.spec.ts` | Convite pelo modal, leitor sem edição, usuário sem acesso |
| `e2e/sql-import.spec.ts` | Importa um `.sql` pelo botão "Importar", confere entidades/arestas no canvas e o salvamento |
| `e2e/views-indexes.spec.ts` | Índices e views: importação, modal de índices, nova view com consulta, linhas até as tabelas, exportação e persistência |
| `e2e/perf.spec.ts` | Gera `reports/perf/ui-latency.{md,json}` |

## Falhas conhecidas documentadas

Testes marcados com `it.fails` descrevem o comportamento **correto** e hoje
falham. Quando o problema for corrigido, o Vitest acusa e o `.fails` deve sair.

| Teste | Problema |
|---|---|
| MySQL: ENUM / SET / VARBINARY | Exportados sem a lista de valores ou o tamanho obrigatórios |
| MySQL: UNIQUE numa coluna TEXT | TEXT, BLOB, JSON e tipos espaciais não podem ser chave sem ajustes |
| PostgreSQL: UNIQUE numa coluna POINT | `point` não tem índice B-tree |
| MySQL: AUTO_INCREMENT fora de chave ou em VARCHAR | A interface permite, o MySQL recusa |
| duas entidades com o mesmo nome | Gera dois `CREATE TABLE` iguais |
| renomear a coluna FK depois de criar o relacionamento | A aresta guarda o nome antigo e o `ALTER TABLE` aponta para uma coluna inexistente |
