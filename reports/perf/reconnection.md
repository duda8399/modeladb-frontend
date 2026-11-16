# Experimento de desconexão e reconexão

Gerado por `npm run experiment:reconnection` em 2026-11-16T18:01:23.905Z.

Ambiente: 13th Gen Intel(R) Core(TM) i5-1345U (12 núcleos), 31.04 GB de RAM, Node v20.19.6. Backend real (NestJS + Socket.IO) com MongoDB em memória num processo separado que sobrevive ao reinício do servidor. Clientes: o `realtimeService` e o store CRDT reais do frontend, com a mesma lógica de autosave (2 s) e de ressincronização do `Constructor`, rodando em Node.

## Desenho

- Três editores (ana, bruno, carla) no mesmo diagrama, que começa com 3 entidades compartilhadas.
- Cada editor gera operações na taxa indicada: 40% criam uma entidade nova, 40% adicionam um atributo a uma entidade compartilhada (edição concorrente no mesmo elemento) e 20% movem uma entidade compartilhada (conflito LWW).
- A edição começa 1 s antes da falha e para no instante em que a conexão (ou o servidor) volta.
- **Desconexão do cliente**: um proxy TCP entre a ana e o servidor derruba as conexões e recusa novas durante o intervalo (WebSocket e HTTP, como um navegador offline). Os outros dois seguem conectados e editando.
- **Reinício do servidor**: o processo do backend recebe SIGKILL e é iniciado de novo sobre o mesmo banco; todos os clientes perdem a conexão e continuam editando até o servidor voltar. O log de operações em memória se perde.
- **Sem mecanismo**: o `realtimeService` da versão anterior à reconexão sem perda (commit `8c2e547`), que descarta operações enviadas sem conexão e reentra na sala sem pedir o que perdeu.
- **Mecanismo original**: a reconexão sem perda como foi implementada (fila no cliente, `join_diagram` com `since`, reenvio e recarga do servidor quando o log não cobre o intervalo).
- **Mecanismo corrigido**: o original com as duas correções motivadas por este experimento: o autosave fica pausado enquanto o cliente está reconectando e as operações próprias reaplicadas contam como alteração pendente; e, quando a época do log mudou (reinício do servidor), o `sync` traz as operações da época nova, aplicadas depois da recarga.

## Métricas

- **Estado esperado (oráculo)**: uma réplica do store que aplica todas as operações geradas por todos; como o store é um CRDT, esse é o estado ao qual todos deveriam convergir.
- **Perda nos clientes**: fração das operações verificáveis (criação de entidade ou de atributo) cujo efeito não está no estado final de cada cliente, média dos 3 clientes. **Ops ausentes em algum cliente**: quantas faltam em pelo menos um. **Próprias ops sumidas do autor**: operações que desapareceram até da tela de quem as fez.
- **Perda no banco**: fração das operações verificáveis ausentes no documento salvo no MongoDB após o autosave.
- **Réplicas convergiram**: execuções em que os 3 clientes terminaram idênticos ao oráculo (inclui posições).
- **Reconexão**: da volta da rede/servidor até o cliente voltar a estar na sala (todos, no reinício).
- **Recuperação**: da volta da rede/servidor até todos os clientes ficarem idênticos ao oráculo; entre parênteses, a mediana e quantas execuções recuperaram dentro de 5 s após a reconexão.

Cada célula é média ± desvio padrão de 10 repetições.

## 1. Duração da desconexão do cliente

Taxa de edição: 2 op/s por editor.

| Desconexão | Versão | Ops durante a falha | Perda nos clientes | Ops ausentes em algum cliente | Próprias ops sumidas do autor | Perda no banco | Réplicas convergiram | Banco = estado esperado | Reconexão (ms) | Recuperação (ms) |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 s | Sem mecanismo | 6 ± 0 | 21.0% ± 4.5 | 4.5 ± 1.4 | 0.0 ± 0.0 | 23.0% ± 14.0 | 0/10 | 0/10 | 1323 ± 974 | não recuperou (0/10) |
| 1 s | Mecanismo original | 6 ± 0 | 0.0% ± 0.0 | 0.0 ± 0.0 | 0.0 ± 0.0 | 0.0% ± 0.0 | 10/10 | 10/10 | 1073 ± 950 | 1076 ± 953 (p50 379; 10/10) |
| 1 s | Mecanismo corrigido | 6 ± 0 | 0.0% ± 0.0 | 0.0 ± 0.0 | 0.0 ± 0.0 | 0.0% ± 0.0 | 10/10 | 10/10 | 1404 ± 786 | 1406 ± 785 (p50 1532; 10/10) |
| 5 s | Sem mecanismo | 30 ± 0 | 37.3% ± 1.8 | 23.9 ± 1.4 | 0.0 ± 0.0 | 33.3% ± 11.2 | 0/10 | 0/10 | 2697 ± 1102 | não recuperou (0/10) |
| 5 s | Mecanismo original | 30 ± 0 | 0.0% ± 0.0 | 0.0 ± 0.0 | 0.0 ± 0.0 | 0.0% ± 0.0 | 10/10 | 10/10 | 2433 ± 1158 | 2444 ± 1159 (p50 2149; 10/10) |
| 5 s | Mecanismo corrigido | 30 ± 0 | 0.0% ± 0.0 | 0.0 ± 0.0 | 0.0 ± 0.0 | 0.0% ± 0.0 | 10/10 | 10/10 | 2519 ± 1593 | 2527 ± 1594 (p50 2723; 10/10) |
| 15 s | Sem mecanismo | 90 ± 0 | 41.7% ± 1.1 | 72.0 ± 4.2 | 0.0 ± 0.0 | 37.8% ± 12.9 | 0/10 | 0/10 | 2101 ± 1180 | não recuperou (0/10) |
| 15 s | Mecanismo original | 90 ± 0 | 0.0% ± 0.0 | 0.0 ± 0.0 | 0.0 ± 0.0 | 0.0% ± 0.0 | 10/10 | 10/10 | 1996 ± 1459 | 2011 ± 1459 (p50 1440; 10/10) |
| 15 s | Mecanismo corrigido | 90 ± 0 | 0.0% ± 0.0 | 0.0 ± 0.0 | 0.0 ± 0.0 | 0.0% ± 0.0 | 10/10 | 10/10 | 1897 ± 1158 | 1913 ± 1152 (p50 1850; 10/10) |
| 30 s | Sem mecanismo | 180 ± 0 | 42.6% ± 0.4 | 142.1 ± 3.5 | 0.0 ± 0.0 | 34.8% ± 11.2 | 0/10 | 0/10 | 2712 ± 1271 | não recuperou (0/10) |
| 30 s | Mecanismo original | 180 ± 0 | 0.0% ± 0.0 | 0.0 ± 0.0 | 0.0 ± 0.0 | 0.0% ± 0.0 | 10/10 | 10/10 | 2319 ± 966 | 2348 ± 968 (p50 2420; 10/10) |
| 30 s | Mecanismo corrigido | 180 ± 0 | 0.0% ± 0.0 | 0.0 ± 0.0 | 0.0 ± 0.0 | 0.0% ± 0.0 | 10/10 | 10/10 | 2611 ± 1244 | 2632 ± 1245 (p50 2310; 10/10) |

## 2. Intensidade das edições concorrentes durante a desconexão

Desconexão de 5 s.

| Taxa por editor | Versão | Ops durante a falha | Perda nos clientes | Ops ausentes em algum cliente | Próprias ops sumidas do autor | Perda no banco | Réplicas convergiram | Banco = estado esperado | Reconexão (ms) | Recuperação (ms) |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 op/s | Sem mecanismo | 15 ± 0 | 36.5% ± 3.5 | 11.8 ± 1.3 | 0.0 ± 0.0 | 40.1% ± 14.3 | 0/10 | 0/10 | 1781 ± 1059 | não recuperou (0/10) |
| 1 op/s | Mecanismo original | 15 ± 0 | 0.0% ± 0.0 | 0.0 ± 0.0 | 0.0 ± 0.0 | 0.0% ± 0.0 | 10/10 | 10/10 | 2681 ± 1150 | 2682 ± 1150 (p50 2806; 10/10) |
| 1 op/s | Mecanismo corrigido | 15 ± 0 | 0.0% ± 0.0 | 0.0 ± 0.0 | 0.0 ± 0.0 | 0.0% ± 0.0 | 10/10 | 10/10 | 2241 ± 1159 | 2246 ± 1160 (p50 2088; 10/10) |
| 5 op/s | Sem mecanismo | 75 ± 0 | 37.0% ± 1.2 | 57.7 ± 6.3 | 0.0 ± 0.0 | 30.8% ± 8.4 | 0/10 | 0/10 | 2864 ± 1236 | não recuperou (0/10) |
| 5 op/s | Mecanismo original | 75 ± 0 | 0.0% ± 0.0 | 0.0 ± 0.0 | 0.0 ± 0.0 | 0.0% ± 0.0 | 10/10 | 10/10 | 2271 ± 1353 | 2283 ± 1352 (p50 2175; 10/10) |
| 5 op/s | Mecanismo corrigido | 75 ± 0 | 0.0% ± 0.0 | 0.0 ± 0.0 | 0.0 ± 0.0 | 0.0% ± 0.0 | 10/10 | 10/10 | 2058 ± 1054 | 2070 ± 1051 (p50 2030; 10/10) |
| 20 op/s | Sem mecanismo | 298 ± 1 | 36.9% ± 0.6 | 238.8 ± 6.0 | 0.0 ± 0.0 | 29.8% ± 8.4 | 0/10 | 0/10 | 2180 ± 1140 | não recuperou (0/10) |
| 20 op/s | Mecanismo original | 299 ± 1 | 0.0% ± 0.1 | 0.1 ± 0.3 | 0.0 ± 0.0 | 0.0% ± 0.1 | 9/10 | 9/10 | 2371 ± 1423 | 2229 ± 1376 (p50 2271; 9/10) |
| 20 op/s | Mecanismo corrigido | 299 ± 1 | 0.0% ± 0.0 | 0.0 ± 0.0 | 0.0 ± 0.0 | 0.0% ± 0.0 | 10/10 | 10/10 | 2419 ± 1350 | 2460 ± 1354 (p50 2935; 10/10) |

## 3. Reinício do servidor

Taxa de edição: 2 op/s por editor. "boot" = o servidor é reiniciado imediatamente; "boot + N s" = fica fora do ar N s antes de reiniciar. Tempo de boot do servidor reiniciado: 989 ± 363 ms.

| Indisponibilidade | Versão | Ops durante a falha | Perda nos clientes | Ops ausentes em algum cliente | Próprias ops sumidas do autor | Perda no banco | Réplicas convergiram | Banco = estado esperado | Reconexão (ms) | Recuperação (ms) |
|---|---|---|---|---|---|---|---|---|---|---|
| boot | Sem mecanismo | 6 ± 2 | 32.9% ± 5.6 | 4.9 ± 2.0 | 0.0 ± 0.0 | 29.4% ± 9.4 | 0/10 | 0/10 | 1967 ± 826 | não recuperou (0/10) |
| boot | Mecanismo original | 6 ± 1 | 31.4% ± 7.9 | 6.0 ± 1.8 | 0.4 ± 1.3 | 22.7% ± 19.5 | 0/10 | 2/10 | 1846 ± 667 | não recuperou (0/10) |
| boot | Mecanismo corrigido | 5 ± 1 | 0.0% ± 0.0 | 0.0 ± 0.0 | 0.0 ± 0.0 | 0.0% ± 0.0 | 10/10 | 10/10 | 1378 ± 947 | 1384 ± 947 (p50 661; 10/10) |
| boot + 10 s | Sem mecanismo | 66 ± 1 | 60.8% ± 1.0 | 53.6 ± 4.3 | 0.0 ± 0.0 | 61.2% ± 4.0 | 0/10 | 0/10 | 2696 ± 1263 | não recuperou (0/10) |
| boot + 10 s | Mecanismo original | 67 ± 2 | 30.3% ± 8.0 | 37.2 ± 8.8 | 14.5 ± 14.7 | 5.3% ± 8.1 | 0/10 | 3/10 | 3221 ± 1110 | não recuperou (0/10) |
| boot + 10 s | Mecanismo corrigido | 67 ± 4 | 0.0% ± 0.0 | 0.0 ± 0.0 | 0.0 ± 0.0 | 0.0% ± 0.0 | 10/10 | 10/10 | 2965 ± 1364 | 2978 ± 1366 (p50 2572; 10/10) |

Os dados por execução estão em `reconnection-execucoes.csv`, o resumo estatístico (IC 95% pela t de Student) em `reconnection-resumo.csv` e tudo em `reconnection.json`.
