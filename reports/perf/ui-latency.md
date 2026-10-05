# Latência percebida entre dois navegadores

Gerado por `npm run test:e2e:perf` em 2026-10-03T20:33:31.934Z. 40 renomeações de entidade.

| Média (ms) | p50 (ms) | p95 (ms) | Máximo (ms) |
|---|---|---|---|
| 54.41 | 55 | 90 | 117.7 |

Inclui: evento no navegador A, aplicação no store, envio pelo socket, repasse no gateway,
aplicação no store do navegador B, nova renderização do React e o próximo quadro desenhado.
