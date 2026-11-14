# ModelaDB – Frontend

Interface web do **ModelaDB**, plataforma para a modelagem colaborativa de bancos
de dados relacionais com apoio de IA generativa.

Desenvolvido como Trabalho de Conclusão de Curso de Maria Eduarda Leal Silva
(IFMG – Campus Formiga, 2026).

- Backend: https://github.com/duda8399/modeladb-backend
- Aplicação publicada: https://modeladb-frontend.onrender.com
- **Versão avaliada no TCC: tag [`v1.0.0`](https://github.com/duda8399/modeladb-frontend/releases/tag/v1.0.0)**

## Tecnologias

React 19, TypeScript, Vite, ReactFlow, Zustand (estado replicado com CRDT
orientado a operações, LWW por propriedade e relógios de Lamport), Ant Design e
Socket.IO Client. Node.js 20.19.6 (ver `.nvmrc`).

## Executar a aplicação

Os dois repositórios devem ficar **lado a lado** na mesma pasta, porque os testes
ponta a ponta sobem o backend a partir de `../modeladb-backend`:

```bash
mkdir modeladb && cd modeladb
git clone https://github.com/duda8399/modeladb-backend.git
git clone https://github.com/duda8399/modeladb-frontend.git
git -C modeladb-backend checkout v1.0.0
git -C modeladb-frontend checkout v1.0.0
```

Configure e inicie o backend conforme o README dele. Depois:

```bash
cd modeladb-frontend
nvm use
npm install
cp .env.example .env   # VITE_BACKEND_URL=http://localhost:3001
npm run dev            # http://localhost:5173
```

## Reproduzir os testes e medições do TCC (Capítulo 5)

Pré-requisitos: `npm install` feito nos **dois** repositórios, Google Chrome
(testes ponta a ponta) e Docker (testes de compatibilidade do SQL). Nenhum
serviço externo é usado: o Playwright sobe um backend isolado na porta 3101 com
MongoDB em memória, e as respostas da OpenAI são simuladas.

| Item do TCC | Comando | Saída |
|---|---|---|
| Testes unitários e de propriedades (convergência em 300 sessões aleatórias) | `npm test` | terminal |
| Testes ponta a ponta com dois navegadores | `npm run test:e2e` | terminal / relatório do Playwright |
| Compatibilidade do SQL exportado em MySQL 8.4 e PostgreSQL 16 | `npm run test:sql-engines` | `reports/sql-compatibility.md` |
| Latência percebida de uma edição entre dois navegadores | `npm run test:e2e:perf` | `reports/perf/ui-latency.{md,json}` |
| Desempenho do store e da exportação SQL | `npm run bench` | `reports/perf/store-bench.json` |

O teste de compatibilidade cria e remove sozinho os contêineres `mysql:8.4` e
`postgres:16-alpine` (ver `src/test/dockerEngines.ts`); não é preciso subir nenhum
banco manualmente. Ele leva cerca de 4 minutos.

Para ampliar o número de sessões aleatórias dos testes de convergência:

```bash
FC_NUM_RUNS=20000 npx vitest run src/stores/diagramCollabStore.convergence.test.ts
```

A latência e a vazão do gateway com 2 a 100 clientes são medidas no backend
(`npm run perf:realtime`). A descrição de cada suíte está em [`TESTES.md`](TESTES.md).

As medições do TCC foram feitas em um Intel Core i5-1345U (12 núcleos lógicos),
31 GB de RAM e Node.js 20.19.6, com servidor e clientes na mesma máquina.
Valores absolutos variam conforme o hardware.

## Licença

MIT – ver [`LICENSE`](LICENSE).
