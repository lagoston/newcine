# CineOracle — laboratório da nota prevista

Objetivo: melhorar a fórmula que prevê a nota (0 a 10, inteira) que um usuário daria a um filme/série.
**Critério principal: acerto exato da nota exibida** (a nota inteira que o site mostra = a nota que a pessoa deu).
Critérios secundários: erro médio absoluto (MAE) da nota exibida, acerto com ±1, e "previu 9+ e virou 9+".

A fórmula atual é a **v4** (`v4_reference.sql`, função `predict_ratings`). Ela mora no banco (Postgres/Supabase)
e precisa continuar podendo morar lá: qualquer proposta final tem de ser implementável em SQL, rápida
(~0,5 s para prever ~700 títulos de um usuário) e explicável. Nada de modelo caixa-preta que não dê para
escrever em SQL (redes neurais, boosting com centenas de árvores). Modelos lineares/logísticos com poucos
coeficientes, vizinhos mais próximos, tabelas de consulta, encolhimento bayesiano, regras de decisão — ok.

## Dados (pasta `data/`, exportados do banco em 09/10/2026 — já carregados por `lab.load()`)

São 24 usuários (u = 0..23) e 1.428 notas; 1.425 têm âncora do TMDB (vote_average > 0) e são as que a v4 usa
(1.316 de filmes, 109 de séries), em 921 títulos. Pouco dado: cuidado com sobreajuste. Notas são inteiras 0..10.

- `users.tsv` — `u, subcategoria, pontos_e, pontos_i, pontos_c, pontos_s, pontos_r`
  (subcategoria = letra do questionário; pontos = balanças da "Arquitetura da Alma")
- `ratings.tsv` — `u, tmdb_id, mt, rating, created_day, updated_day` (mt = m filme | t série; dia = dias desde 2024-01-01;
  vários usuários importaram a biblioteca de uma vez, então a data nem sempre é a data em que viram)
- `watchlist.tsv` — `u, tmdb_id, mt, created_day` (títulos guardados para ver, sem nota)
- `titles.tsv` (com cabeçalho) — `tmdb_id, mt, vote_average, vote_count, year, runtime, episode_run_time, number_of_seasons, dir, mood, oracle, genres, kw, cast, origin`
  - `dir` = índice do diretor (filmes) ou criador (séries); `mood` = prateleira em letra: A adrenaline, V adventures, C catharsis,
    D dark-and-scary, P drug-trip, F family-time, L laugh-out-loud, M mind-blowing, R romantic (vazio = fora das prateleiras);
    `oracle` = b bogart / f fincher / c cypher
  - `genres` = ids de gênero do TMDB (`/`); `kw` = índices de palavra-chave; `cast` = índices dos 5 primeiros do elenco
  - `kw` e `cast` só trazem quem aparece em **2 ou mais** títulos com nota (um que aparece num título só nunca vira evidência)
    e `kw` já vem **sem** as 4 genéricas que a v4 ignora. Índice 0 = a mais frequente.
  - ATENÇÃO: (mt, tmdb_id) é a chave — o mesmo número pode ser um filme e uma série diferentes.
- `keywords.tsv` — 1ª linha `#ndocs<TAB>2925`, depois `ki, df, nt`: `df` = em quantos filmes do catálogo inteiro do site
  a palavra aparece (é o que a v4 usa no idf: `ln(ndocs / max(df, 1))`); `nt` = em quantos títulos com nota ela aparece.

### Dados novos (com bots) — função de borda `lab-export`

O pacote atualizado sai em um arquivo só pela função de borda `lab-export` (`?key=` = uma chave válida de `bot_seed_keys`),
que chama `public.lab_export_text()` (~1,5 s). Para usar:

    python3 -c "from lab import split_export; split_export('cineoracle_lab_AAAAMMDD.tsv', 'data_bots')"
    python3 experiments/run_bots.py data_bots && python3 experiments/run_v5.py data_bots

`users.tsv` ganha a 8ª coluna `bot` (0/1): pessoas reais vêm primeiro (u = 0..), depois os bots.
Os dados NÃO vão para o repositório (são notas de usuários, mesmo anônimas).

A réplica Python da v4 (`lab.v4_features` + `lab.v4_predict`) bate com o banco: 62 pares conferidos, |Δ| < 1e-9 (relatório gerado por `parity.py`, fora do repositório).

## A v4 em uma frase

nota esperada `mu` = TMDB + viés pessoal (encolhido) + 0,70·diretor + 0,60·humor + 0,75·palavras-chave(idf) + 0,80·desvio da comunidade,
cada evidência = soma dos resíduos da pessoa (nota − TMDB − viés) nos títulos que compartilham a pista / (quantidade + k).
Chance de 9+ = logística com o "ruído pessoal" (sigma, medido deixando cada filme de fora). Nota exibida = arredondar `mu`,
promovida a 9 se chance de 9+ ≥ 40% e a 10 se ≥ 70%. Detalhes exatos: `v4_reference.sql`; implementação Python fiel: `lab.py` (`v4_features`, `v4_mu`, `v4_sigma`, `v4_predict`) e `baseline_v4.py`.

## Protocolo de avaliação (OBRIGATÓRIO — use `evaluate.py`)

- **Deixa um de fora (LOO):** cada nota-alvo é prevista com aquela nota removida de TUDO (viés, evidências, comunidade, médias globais).
- **Alvos:**
  - `shelf` (principal): notas de FILMES em títulos que moram numa prateleira (mood não vazio) e têm vote_average > 0 — é o que o site mostra.
  - `movies`: todas as notas de filmes com vote_average > 0.
  - `series`: notas de séries com vote_average > 0 (secundário; a v4 usa o histórico de filmes para prever séries).
- **Folds por usuário:** os 24 usuários estão divididos em 2 grupos fixos (`fold = u % 2`). Todo hiperparâmetro ou
  escolha tem de ser **ajustado num grupo e medido no outro** (e vice-versa); o número que vale é o **fora da amostra**
  (média dos dois lados, ponderada pelo número de notas). Reporte também o resultado de cada lado.
  O histórico usado para prever um usuário pode incluir os outros usuários (é assim no site) — o que não pode é escolher
  parâmetros olhando as notas-alvo do grupo em que você está medindo.
- **Incerteza:** reporte o intervalo de 95% por bootstrap de usuários (`evaluate.bootstrap_ci`) da DIFERENÇA para a v4
  (pareado). Uma melhora só conta se for consistente nos dois grupos e o intervalo não for todo negativo.
- Compare sempre com a v4 (`baseline_v4.py`) no mesmo protocolo.

## Como reportar

Cada experimento num arquivo `experiments/<nome>.py`, autocontido (importa `lab.py`/`evaluate.py`), e uma linha em
`experiments/RESULTS.md`: nome, ideia em uma frase, exata/MAE/±1 fora da amostra (shelf e movies), diferença para a v4 com IC 95%,
lados A/B, se é implementável em SQL e como.
