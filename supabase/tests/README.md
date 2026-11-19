# Fumaça do banco

`fumaca.sql` é o teste rápido das funções que a tela mais usa. Ele roda **dentro
de uma transação que é desfeita no fim** (`begin … rollback`): nada fica gravado,
nem o sussurro de ensaio, nem a previsão guardada.

## Como rodar

O arquivo inteiro vai numa chamada só (painel SQL do Supabase ou o conector que o
Claude usa). A resposta é uma tabela com uma linha por conferência:

| coluna | o que é |
|---|---|
| `conferencia` | o que foi conferido |
| `ok` | `true` passou, `false` falhou |
| `detalhe` | o número ou o trecho que explica |

Qualquer linha com `ok = false` é um problema para olhar antes de publicar.

## Quando rodar

- depois de aplicar uma migração que mexe em função usada pela tela;
- antes de trocar a tela para uma função nova (a função tem de estar aqui);
- quando algo "sumiu" no site e a dúvida é se foi o banco.

## O que ele confere

- a previsão de notas (`predict_ratings`) devolve notas de 0 a 10 para a conta de teste;
- a ida única da casca (`get_app_bootstrap`) devolve as partes pedidas;
- as funções de resumo do título e do perfil (`get_title_social`, `get_title_me`,
  `get_profile_stats_v2`) devolvem o formato combinado e não mostram nada a
  visitante;
- as tags calculadas no servidor (`get_tag_progress`, `sync_my_tags`) devolvem o
  formato da tela e são fechadas a visitante;
- privacidade de `user_movies`: visitante e conta sem amizade não enxergam contas
  escondidas nem perfis fechados;
- o convite (`get_my_invite`) informa o limite de 3;
- o aviso ao vivo dos sussurros: um sussurro de ensaio gera o `ping` no tópico da
  pessoa, e só ela entra nesse tópico.

A conta de teste é escolhida na hora (a de biblioteca maior entre as visíveis);
nenhum id de conta fica escrito no repositório.

## Regras ao acrescentar uma conferência

- só leitura ou escrita que o `rollback` desfaz; nunca chamar função que fala com
  fora do banco (HTTP) ou que gasta algo do jogador de verdade;
- nunca chamar `jackpot_pull` daqui;
- uma linha em `_r` por conferência, com `ok` calculado, sem `raise exception`
  (uma falha não esconde as outras).
