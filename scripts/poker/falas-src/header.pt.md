# O Grande Blefe · Banco de falas v1 (pt-BR)

*Roteirista · 03/11/2026. Fechado conforme o `VEREDITO.md` da Central do Poker. Gerado a partir das fontes; a contagem de caracteres de cada fala já considera o tamanho das variáveis.*

## Contagem

{{COUNTS}}

## Como ler cada fala

| Campo | O que é |
|---|---|
| **id** | Estável: B = Sapo, C = Cobra, F = Raposo, T/TR/D = trocas, P* = prêmio por tipo, L = empréstimo, R/Q* = réplicas, I* = intervalo, AN = "Anteriormente", DT = dicas, M = marcos, TU = tutorial. |
| **evento** | O sinal que o Diretor recebe (lista abaixo). |
| **contexto** | A condição dentro do evento: quem é o alvo, o tipo de prêmio, a leitura, a hora… |
| **cue** | Para fala de bot **sobre a própria mão**, o `cue` público que a permite: `confiante`, `nervoso`, `calado` ou `neutro`. `fora` = o falante não está na mão. `*` = qualquer cue (a Cobra é teatro). `-` = não depende de cue (fora de mão ou depois do showdown). |
| **P** | Prioridade: P1 sempre, P2 forte, P3 médio (chances e orçamento do veredito, Q11). |
| **marcas** | `curta` (≤44 caracteres) é calculada; `vez` = pode cair na vez da pessoa e por isso é curta; `once=match/session/life` = toca no máximo uma vez nesse escopo; `story=` = capítulo de arco; `requires=` = pré-condição. |
| **car.** | Caracteres com as variáveis no tamanho máximo. Teto: 88. |

**Variáveis** (nunca o nome da pessoa): `{premio}` (nome do prêmio com artigo, até 30), `{mao}` (nome da mão, até 16: "um par de damas"), `{estreante}` ("estreante" até Protagonista, depois "colega"), `{lider}` e `{portador}` (nome do oráculo), `{cacife}` (número), `{mao_n}` (número da mão). Para a pessoa: o título (Figurante, Dublê, Coadjuvante, Protagonista, Estrela, Lenda da Sessão) ou os apelidos invariáveis: "girino" (Sapo), "criatura" (Cobra), "estreante"/"colega" (Raposo), "a visita" (terceira pessoa). Nenhuma fala flexiona gênero para a pessoa; `{o|a}` só se usa quando o alvo é outro oráculo.

## O `cue` e o tell, por oráculo

| `cue` | Sapo (honesto, ~90%) | Cobra (teatro, ~70%) | Raposo (vitrine) |
|---|---|---|---|
| `confiante` | Papo inflado, coaxar rápido: par ou melhor | Cauda batendo: força ou projeto | **Anel de fumaça perfeito**: o único tell verdadeiro. **Não fala.** |
| `nervoso` | Olha a pilha, hesita: mão média ou fraca | Língua piscando: blefe | Suspira, ajeita o chapéu: falso (50/50) |
| `calado` | Silêncio e aposta: monstro. **Não fala até o fim da mão**, nem réplica (só o selo "…"). | — | — |
| `neutro` | Nada | Nada | Nada |

**Regras de tell que o Diretor nunca quebra** (veredito, divergência 1):
1. Sapo com `calado` não fala até a mão acabar, em nenhum evento.
2. `B26` (aposta grande do Sapo) só com `nervoso`, que o motor só emite numa aposta grande do Sapo **sem** monstro. Com monstro, o `cue` é `calado` (ou `confiante` no ruído previsto pelo 02), nunca `nervoso`.
3. As falas de all-in do Sapo existem só no `ALL_IN·curto` (≤10 BB). O all-in fundo dele é sempre monstro, portanto silêncio.
4. No meio da mão, o Sapo só reage à sua aposta com medo (`nervoso`) ou depois de largar (`fora`). Fala de flop do Sapo, só com ele fora da mão (`B86`).
5. O Raposo nunca fala enquanto mostra o anel, e nenhuma fala dele sobre a própria mão menciona fumaça.
6. As palavras da Cobra nunca afirmam a força da mão dela.
7. Nenhum evento público carrega força, faixa ou equidade: o `cue` é a própria atuação.

## Eventos que o Diretor recebe

| Grupo | Eventos |
|---|---|
| Partida | `FIRST_VISIT`, `MATCH_START` (contextos: volta = 3+ dias sem jogar, madrugada = 00h–05h local, série = 3ª seguida, nêmesis, freguês, memória do Raposo, mesa livre ou valendo), `RECAP`, `DEAL`, `FLOP`, `BLINDS_UP` (e primeiro ante), `HEADS_UP`, `HAND_END`, `MATCH_END`, `CREDITS`, `RANK_UP`, `REMATCH`, `HUMAN_LEAVES`, `INTERVAL_INVITE`, `INTERVAL_RETURN` |
| Ação do bot (com `cue`) | `LIMP`, `CALL` (com `comprometido` depois de pagar uma vez com par), `BET`, `BIG_BET` (≥75% do pote ou ≥30% da pilha), `RAISE_3BET`, `CHECK_RAISE`, `OVERBET`, `ISOLATE`, `ALL_IN` (`curto` = ≤10 BB), `FOLD`, `FOLD_TO_HUMAN` |
| Ação da pessoa | `HUMAN_BIG_BET`, `HUMAN_ALL_IN`, `HUMAN_FOLD`, `HUMAN_SLOW` (25 s e 60 s; nunca no tutorial, com gaveta aberta ou nas 3 primeiras partidas), `QUIP` → `QUIP_REPLY` |
| Desfecho da mão | `POT_WON`, `POT_LOST`, `SHOWDOWN`, `BLUFF_SHOWN`, `HUMAN_BLUFF_SHOWN`, `BLUFF_CAUGHT` (seu blefe pago e perdido), `CATCH_BLUFF` (o bot pagou um blefe), `VALUE_SHOWN`, `HERO_FOLD_SHOWN`, `BAD_BEAT` (vítima, vencedor, você), `WIN_STREAK`, `RATE_MOVE`, `BEAUTIFUL_ERROR` |
| Estados | `TILT_START`/`TILT_END` (Sapo emburrado, Cobra Veneno), `PRIDE` (Orgulho do Raposo), `STYLE_READ`, `ELIMINATION`, `ORACLE_OUT`, `HUMAN_OUT` (despedida), `LESSON`, `TIP`, `SECRET_TELL` |
| Prêmio e empréstimo | `PRIZE_INTRO`, `PRIZE_TAUNT`, `PRIZE_AT_RISK`, `PRIZE_MOVED`, `PRIZE_CAPTURED`, `PRIZE_KEPT`, `LOAN`, `MILESTONE` (texto de tag) |

## Ritmo (veredito, Q11)

- **18 a 22 balões** numa partida de ~35 mãos; **no máximo 1 momento por mão** (uma fala, ou uma troca atômica de até 3 balões); **40% ou mais das mãos em silêncio**.
- **Na vez da pessoa:** só falas `curta` e de um oráculo só.
- **Trocas:** só entre mãos, na abertura, nos créditos ou depois que a pessoa desistiu.
- **Orçamento pela metade** a partir da 3ª partida seguida; só P1 e trocas inéditas furam. **Turbo:** só P1.
- **A abertura** (a cartela "Estrelando…") vale um momento com até 2 balões: o `MATCH_START` mais específico e, na partida valendo, o `PRIZE_INTRO` do portador. Com empréstimo, `LOAN` substitui o `MATCH_START`.
- **O mesmo id não se repete na sessão.** Entre sessões, a LRU de 300 ids (03).
