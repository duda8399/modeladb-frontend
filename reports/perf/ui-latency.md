# Latência percebida entre dois navegadores

Gerado por `npm run test:e2e:perf` em 2026-11-15T22:56:29.517Z.

3 execuções independentes (usuários, diagrama e navegadores novos em cada uma). Em cada execução, 125 ciclos de quatro operações intercaladas (renomear, mover, criar, remover), após 5 ciclos de aquecimento descartados. Total: 1500 amostras (375 por operação).

## Todas as amostras agrupadas

| Operação | Amostras | Média ± dp (ms) | p50 (ms) | p95 (ms) | IC 95% do p95 (ms) | p99 (ms) | Máximo (ms) |
|---|---|---|---|---|---|---|---|
| Renomear entidade (SET_NODE_PROP) | 375 | 43.61 ± 22.71 | 38.8 | 95 | [80.1; 112.6] | 128 | 157.6 |
| Mover entidade (MOVE_NODE) | 375 | 54.94 ± 18.12 | 57.8 | 84.4 | [77.1; 95.6] | 105 | 117.7 |
| Criar entidade (ADD_NODE) | 375 | 73.54 ± 19.52 | 73.6 | 108 | [97.8; 113.1] | 123.3 | 142.5 |
| Remover entidade com desfazer (DELETE_NODE) | 375 | 63.29 ± 15.6 | 61.6 | 90.8 | [87.4; 92.7] | 100.6 | 109.3 |
| **Todas as operações** | 1500 | 58.85 ± 22.08 | 59.5 | 94.3 | [91.6; 98.2] | 117.7 | 157.6 |

O IC 95% do p95 é não paramétrico (estatísticas de ordem, aproximação normal da binomial). \* indica que o limite superior coincide com o máximo da amostra.

## Variação entre execuções

Cada execução contribui com um p50 e um p95; a tabela mostra média ± desvio padrão, coeficiente de variação e faixa desses valores.

| Operação | p50 entre execuções (ms) | p95 entre execuções (ms) | CV do p95 | p95 mín–máx (ms) |
|---|---|---|---|---|
| Renomear entidade (SET_NODE_PROP) | 38.5 ± 9.11 | 83.13 ± 32.12 | 38.63% | 56.5–118.8 |
| Mover entidade (MOVE_NODE) | 51.13 ± 13.63 | 84 ± 6.64 | 7.9% | 77.8–91 |
| Criar entidade (ADD_NODE) | 73.17 ± 2.9 | 102.87 ± 9.48 | 9.22% | 92.5–111.1 |
| Remover entidade com desfazer (DELETE_NODE) | 61.83 ± 3.59 | 88.5 ± 6.29 | 7.1% | 82.9–95.3 |
| **Todas as operações** | 59.47 ± 0.32 | 93.8 ± 9.4 | 10.02% | 85.9–104.2 |

Medido com o servidor de desenvolvimento do Vite (React em modo de desenvolvimento); em produção tende a ser menor.

Inclui: evento no navegador A, aplicação no store, envio pelo socket, repasse no gateway,
aplicação no store do navegador B, nova renderização do React e o próximo quadro desenhado.
O instante inicial é o Enter (renomear), o fim do arraste (mover) ou o clique no botão (criar e desfazer).
As amostras individuais estão em `ui-latency-amostras.csv`.
