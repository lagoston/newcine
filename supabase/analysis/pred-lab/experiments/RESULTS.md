# Resultados — laboratório da nota prevista

Alvo principal: `shelf` (964 notas de filmes em prateleira). Fora da amostra = cada lado (u % 2) previsto com parâmetros ajustados no outro.
IC 95% = bootstrap pareado de usuários da diferença para a referência.

## Referência (v4, sem nenhum ajuste — nada a cross-fitar)

| versão | shelf exata | MAE | ±1 | lado 0 / lado 1 (exata) | movies exata / MAE | series exata / MAE | 9+ precisão / cobertura (shelf) |
|---|---|---|---|---|---|---|---|
| v4 como está no site (com promoção a 9/10) | 31,1% | 1,072 | 75,4% | 31,7% / 30,5% | 31,7% / 1,091 | 29,4% / 1,119 | 53,7% / 59,5% |
| v4 só arredondando μ (sem promoção) | 33,2% | 1,048 | 75,3% | 31,5% / 34,8% | 33,5% / 1,068 | 30,3% / 1,083 | 60,5% / 40,5% |

RMSE de μ (shelf) = 1,450. Chutar sempre 8 acerta 27,7% de todas as notas.
A promoção a 9/10 custa ~2 pontos de acerto exato (troca acerto por cobertura de 9+).

## Experimentos

### Só pessoas reais (24 pessoas, 1.425 notas) — 09/10/2026
Nenhuma variante ganhou da v4 de forma robusta. A regra de decisão com histograma pessoal (A2) deu +1,0pp [−1,6; +4,6],
com lados inconsistentes e parâmetros instáveis.

### Com 22 bots (`data_bots22`: 24 reais + 22 bots, 8.706 notas) — 09/10/2026
Scripts: `experiments/run_bots.py`, `run_v5.py`, `run_bots_g.py`, `run_commsim.py`, `run_polar.py` (logs `log_*_bots22.txt`).
Tudo arredondando μ (sem a promoção a 9/10). Ajustes feitos num lado (u % 2) com todos os alvos daquele lado, medidos no outro.

| | reais prateleira (964) | reais filmes (1.316) | bots filmes (6.718) | bots séries (563) |
|---|---|---|---|---|
| v4 sem bots na base | 33,7% | 34,0% | — | — |
| v4 (com bots na base) | 32,4% | 32,6% | 32,3% | 27,7% |
| V4 lab (+ gênero, elenco, década, inclinação, oráculo, origem) | 33,2% (+0,8 [−1,8; +2,9]) | 33,0% | **34,5% (+2,2 [+0,9; +3,8])** | 27,5% |
| v4 + regra de decisão (histograma) | 34,3% (+2,0 [−1,6; +6,0]) | 34,1% | 32,7% | 31,1% |

- Bots na base: real prateleira −1,3pp [−3,0; +0,3]. Vem do termo da comunidade: com g só das pessoas reais continua −1,2pp.
  Comunidade ponderada por afinidade (corr. dos desvios, encolhida n/(n+10)) não recupera (−0,1 a +0,2pp vs v4 com bots).
- Bots: v4 31,9% exata vs TMDB+viés 31,4% (as pistas da v4 quase não somam); reais: 32,4% vs 27,9%.
- Polarizados (≥50% das notas em 1–2 ou 9–10): v4 18,8% → histograma 25,4%; "moda" acerta 30–40% em Faradey, Lidia, Nemesis.
- Pesos da V4 lab instáveis entre lados (ex.: diretor w=1,10 k=16 vs w=0,25 k=0,5) → regularizar antes de levar ao banco.
