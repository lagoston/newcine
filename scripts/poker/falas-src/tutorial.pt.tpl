# O Grande Blefe · Tutorial ("Treino")

*Roteiro das 3 mãos (roteirista, 03/11/2026). Segue o veredito, Q8: o Raposo explica, o Sapo erra e a Cobra corrige. A partida aparece marcada "Treino", fica fora do placar, o botão "Pular" está sempre visível e nenhuma mão passa de 6 toques. As cartas entram por `startHand(..., { preset })` e os bots seguem o script. As falas vêm do banco (`banco-v1.md`, seção 14), com o id ao lado.*

## Regras do roteiro

- **Mesa:** 4 lugares, todos com **2.000** de cacife. Blinds **25/50**, sem ante (nível 1). O cacife se mantém de uma mão para a outra, mas não importa: é treino.
- **Assentos, no sentido horário:** Você (embaixo) → Sapo (esquerda) → Raposo (centro) → Cobra (direita). O botão anda uma cadeira por mão, como numa partida de verdade.
- **Botão esperado:** brilha com o aro de ouro. Os outros continuam tocáveis.
- **Se a pessoa tocar outro botão:** a ação **não acontece**. A fala `TUx-Cn` correspondente aparece e a decisão se repete; isso não conta como toque novo. É a "tomada dois" do Raposo. Nunca punimos uma jogada boa: quando a alternativa também é boa ("Aumentar" com trinca), a fala reconhece e pede a ação da aula.
- **Valores:** o slider já vem posicionado no valor do roteiro. Se a pessoa mexer, o "Aumentar" volta ao valor do roteiro com a fala `TU3-C2` ou a `TU3-09` repetida.
- **Ritmo:** os bots agem em 0,9 s. As falas seguem o tempo do 05, e na vez da pessoa só aparecem falas curtas (`vez`).
- **No fim do treino:** todas as cartas viram (inclusive as de quem desistiu), para a aula ficar clara. Isso só acontece no Treino.

---

## Mão 1 · Pagar e passar · ganhar com uma combinação

**Objetivo:** pagar e passar, e ganhar o primeiro pote com uma trinca. **Toques da pessoa:** 4.

| Posição | Quem | Cartas |
|---|---|---|
| Botão | Você | 9♠ 9♦ (`9s 9d`) |
| Small blind (25) | Sapo | 7♥ 6♥ (`7h 6h`) |
| Big blind (50) | Raposo | K♠ J♣ (`Ks Jc`) |
| Primeiro a falar | Cobra | 8♦ 3♣ (`8d 3c`) |

**Mesa:** flop 9♣ K♦ 4♥ (`9c Kd 4h`) · turn 2♣ (`2c`) · river 7♠ (`7s`).

**Resultado:** você vence com **trinca de noves** (9-9-9-K-7). O Raposo tem par de reis (K-K-J-9-7) e o Sapo, par de setes (7-7-K-9-6). Não há sequência possível (9, K, 4, 2, 7) nem flush (só dois paus na mesa). **Pote final: 750.**

| # | Rua | Ação | Pote | Falas |
|---|---|---|---|---|
| 0 | — | Abertura | 75 | {{TU1-01}} · {{TU1-02}} |
| 1 | Pré-flop | Cobra desiste | 75 | {{TU1-03}} |
| 2 | Pré-flop | **Você paga 50** (toque 1) | 125 | {{TU1-04}} |
| 3 | Pré-flop | Sapo completa (+25) | 150 | {{TU1-05}} |
| 4 | Pré-flop | Raposo passa | 150 | {{TU1-06}} |
| 5 | Flop | Mesa: 9♣ K♦ 4♥ | 150 | {{TU1-07}} |
| 6 | Flop | Sapo passa · Raposo aposta 75 | 225 | {{TU1-08}} |
| 7 | Flop | **Você paga 75** (toque 2) | 300 | {{TU1-09}} |
| 8 | Flop | Sapo paga 75 (o erro dele) | 375 | {{TU1-10}} · {{TU1-11}} |
| 9 | Turn | Mesa: 2♣ · Sapo passa · Raposo passa | 375 | {{TU1-12}} |
| 10 | Turn | **Você passa** (toque 3) | 375 | {{TU1-13}} |
| 11 | River | Mesa: 7♠ · Sapo aposta 125 | 500 | {{TU1-14}} |
| 12 | River | Raposo paga 125 | 625 | {{TU1-15}} |
| 13 | River | **Você paga 125** (toque 4) | 750 | {{TU1-16}} |
| 14 | Showdown | O Sapo mostra primeiro (último a apostar), depois o Raposo e você | 750 | {{TU1-17}} · {{TU1-18}} · {{TU1-19}} |

**Se a pessoa fizer outra coisa:**
- Passo 2: Desistir → {{TU1-C1}} · Aumentar → {{TU1-C2}}
- Passo 7: Desistir → {{TU1-C3}} · Aumentar → {{TU1-C4}}
- Passo 10: Apostar → {{TU1-C5}} · Desistir → {{TU1-C6}}
- Passo 13: Aumentar → {{TU1-C7}} · Desistir → {{TU1-C8}}

*Por que o poker fecha:* o Raposo passa no big blind com K-J porque ninguém aumentou. Ele aposta meio pote no flop com par de reis e controla o pote no turn. O Sapo "paga com flush" achando que duas copas bastam: é o erro dele, e a Cobra corrige. No river, o par de setes o faz apostar pequeno (⅓ do pote), como o perfil dele pede (02), e o Raposo paga com o par mais alto.

---

## Mão 2 · Desistir · ver um blefe funcionar

**Objetivo:** desistir de uma mão fraca e ver, de fora, um blefe da Cobra derrubar uma mão melhor. **Toques da pessoa:** 1.

| Posição | Quem | Cartas |
|---|---|---|
| Primeiro a falar | Você | 8♣ 3♦ (`8c 3d`) |
| Botão | Sapo | A♣ J♣ (`Ac Jc`) |
| Small blind (25) | Raposo | T♥ 4♠ (`Th 4s`) |
| Big blind (50) | Cobra | 7♠ 2♦ (`7s 2d`) |

**Mesa:** não sai. A mão acaba antes do flop.

**Resultado:** a Cobra leva **325** sem mostrar a mão. Como é Treino, ela mostra mesmo assim: sete e dois, a pior mão do baralho. O Sapo largou A-J de paus.

| # | Rua | Ação | Pote | Falas |
|---|---|---|---|---|
| 0 | — | Abertura | 75 | {{TU2-01}} |
| 1 | Pré-flop | **Você desiste** (toque 1) | 75 | {{TU2-02}} |
| 2 | Pré-flop | Sapo paga 50 | 125 | {{TU2-03}} |
| 3 | Pré-flop | Raposo desiste (perde o small blind) | 125 | {{TU2-04}} |
| 4 | Pré-flop | Cobra aumenta para 250 (no big blind) | 325 | {{TU2-05}} |
| 5 | Pré-flop | Sapo desiste (o erro dele) | 325 | {{TU2-06}} |
| 6 | Fim | A Cobra leva 325 e mostra 7♠ 2♦ | — | {{TU2-07}} · {{TU2-08}} · {{TU2-09}} |

**Se a pessoa fizer outra coisa:**
- Passo 1: Pagar → {{TU2-C1}} · Aumentar → {{TU2-C2}}

*Por que o poker fecha:* 8-3 diferente, primeiro a falar numa mesa de 4, está fora de qualquer faixa razoável, então desistir é a única jogada boa. O Sapo entra só pagando com A-J de paus (ele faz *limp* em 70% das entradas, 02). A Cobra, solta e agressiva, ataca o *limp* com qualquer coisa. Pagar 200 num pote de 525 pede ~38% de chance, e A-J tem ~67% contra 7-2: largar é um erro claro do Sapo.

---

## Mão 3 · Aumentar · o seu blefe funciona

**Objetivo:** pagar no big blind e depois **aumentar** como blefe com saída, fazendo a Cobra largar uma mão melhor. **Toques da pessoa:** 2.

| Posição | Quem | Cartas |
|---|---|---|
| Big blind (50) | Você | 6♦ 5♦ (`6d 5d`) |
| Primeiro a falar | Sapo | J♠ 3♥ (`Js 3h`) |
| Botão | Raposo | 9♣ 2♥ (`9c 2h`) |
| Small blind (25) | Cobra | Q♥ J♣ (`Qh Jc`) |

**Mesa:** flop K♠ 4♣ 3♦ (`Ks 4c 3d`). Turn e river não saem.

**Resultado:** a Cobra desiste e você leva **500** (os 300 do pré-flop, os 100 da aposta dela e os seus 100 que a igualaram; os 250 restantes do seu aumento voltam para você). No momento do blefe, a dama alta dela vencia o seu seis alto, mas você tinha **saída**: com 3-4-5-6 na mão e na mesa, um 2 ou um 7 faz sequência (8 cartas no baralho).

| # | Rua | Ação | Pote | Falas |
|---|---|---|---|---|
| 1 | Pré-flop | Sapo desiste | 75 | {{TU3-01}} |
| 2 | Pré-flop | Raposo desiste | 75 | {{TU3-02}} |
| 3 | Pré-flop | Cobra aumenta para 150 | 200 | {{TU3-03}} |
| 4 | Pré-flop | **Você paga 100** (toque 1) | 300 | {{TU3-04}} |
| 5 | Flop | Mesa: K♠ 4♣ 3♦ | 300 | {{TU3-05}} |
| 6 | Flop | Cobra aposta 100 (⅓ do pote) | 400 | {{TU3-06}} · {{TU3-07}} · {{TU3-08}} |
| 7 | Flop | **Você aumenta para 350** (toque 2) | 750 | {{TU3-09}} |
| 8 | Flop | Cobra desiste | 500 | {{TU3-10}} |
| 9 | Fim | Treino: todas as cartas viram | — | {{TU3-11}} · {{TU3-12}} · {{TU3-13}} |
| 10 | Fim | Fim do treino; a ficha do tutorial sai da RPC idempotente | — | {{TU3-14}} · {{TU3-15}} |

**Se a pessoa fizer outra coisa:**
- Passo 4: Desistir → {{TU3-C1}} · Aumentar → {{TU3-C2}}
- Passo 7: Pagar → {{TU3-C3}} · Desistir → {{TU3-C4}}

*Por que o poker fecha:* no small blind contra o big blind, a Cobra aumenta para 3 BB (é o tamanho dela fora de posição, 02). Defender o big blind com 6-5 do mesmo naipe é correto: pagar 100 para um pote final de 300 pede ~33% de chance, 6-5 tem ~37% contra Q-J, e você fala por último depois do flop. No flop K-4-3, ela aposta ⅓ do pote com quase todo o range (c-bet de 80%) e larga para aumento com frequência (02 recomenda o *check-raise*; aqui ela fala primeiro, então é um aumento comum). O aumento mínimo seria para 200; 350 é um tamanho padrão (3,5× a aposta). Ela desiste com dama alta, e o blefe tem saída: um "semi-blefe".

---

## Checklist da equipe

- [ ] O `preset` de cada mão fica no código do tutorial e nunca vem do cliente na partida valendo (veredito, divergência 5).
- [ ] As falas `TU*` furam o orçamento de falas (é o Treino), mas respeitam a regra de só falas curtas na vez da pessoa.
- [ ] "Pular" encerra o treino sem dar a ficha; a ficha só sai ao concluir as 3 mãos (RPC idempotente por pessoa).
- [ ] O Treino nunca dispara `HUMAN_SLOW`, `TIP` nem réplicas.
