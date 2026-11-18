-- 18/11/2026 (pedido do Bruno, 08h51): "Faça com que o giro especial do
-- jackpot seja como um bônus de um giro com ficha, não de um giro grátis além
-- do bônus estatístico, o usuário precisa inserir a ficha básica ou especial."
--
-- O Giro da Sorte deixa de ser um giro grátis. A barra da sorte continua
-- enchendo a cada 10 giros com ficha e guardando um Giro da Sorte
-- (jackpot_wallets.lucky_spins), mas agora ele é um BÔNUS: o próximo giro com
-- ficha (comum ou especial) sai com as chances do Giro da Sorte (raro 20%,
-- épico 50%, lendário 30%) e gasta a ficha como qualquer giro. O efeito segue
-- a ficha inserida (comum: 5% de chance; especial: sempre). Como gastou ficha,
-- esse giro também anda a barra.
--   • jackpot_pulls.lucky: o giro saiu com o bônus. `kind` continua sendo a
--     ficha (normal/special), então a ficha semanal do Premium e os kits da
--     Cobra continuam contando certo. As linhas antigas com kind = 'lucky' (os
--     Giros da Sorte grátis de antes) ganham lucky = true.
--   • jackpot_pull aplica o bônus sozinho quando há Giro da Sorte guardado. A
--     resposta ganha `chip` (a ficha) e `lucky` (veio com o bônus); `kind` diz
--     'lucky' quando veio com o bônus, para o app antigo mostrar a faixa
--     dourada na revelação. jackpot_pull('lucky') (o "Girar grátis" do app
--     antigo) é recusado com no_lucky, sem gastar nada: o app antigo esconde o
--     botão e o bônus sai no próximo giro com ficha dele.
--   • game_tag_metric (Lucky Charm e a fila de lendários no Giro da Sorte) e o
--     story do lendário passam a olhar jackpot_pulls.lucky.
-- As definições são as do banco (lidas aqui), com trechos conferidos: cada um
-- precisa aparecer o número de vezes esperado.

alter table public.jackpot_pulls add column if not exists lucky boolean not null default false;
update public.jackpot_pulls set lucky = true where kind = 'lucky' and not lucky;

create function pg_temp.swap_once(p_def text, p_old text, p_new text, p_label text)
returns text
language plpgsql
as $f$
begin
  if (length(p_def) - length(replace(p_def, p_old, ''))) / length(p_old) <> 1 then
    raise exception '%: o trecho não aparece uma vez só', p_label;
  end if;
  return replace(p_def, p_old, p_new);
end;
$f$;

-- jackpot_pull
do $do$
declare
  v_def text := pg_get_functiondef('public.jackpot_pull(text)'::regprocedure);
begin
  if position('v_lucky boolean' in v_def) > 0 then
    raise exception 'jackpot_pull: o bônus já existe';
  end if;

  v_def := pg_temp.swap_once(v_def,
$s$  v_lucky_earned boolean := false;
$s$,
$s$  v_lucky_earned boolean := false;
  -- 18/11/2026: este giro com ficha vem com o bônus do Giro da Sorte
  v_lucky boolean := false;
$s$, 'declare');

  -- a ficha é sempre comum ou especial; o Giro da Sorte não é mais um giro à parte
  v_def := pg_temp.swap_once(v_def,
$s$  elsif p_kind = 'lucky' then
    if w.lucky_spins < 1 then
      raise exception 'no_lucky';
    end if;
  else
    if w.tickets < 1 then
$s$,
$s$  else
    if w.tickets < 1 then
$s$, 'ficha');

  v_def := pg_temp.swap_once(v_def,
$s$  if p_kind = 'normal' then
    update jackpot_wallets set tickets = tickets - 1, updated_at = now() where user_id = v_uid;
  elsif p_kind = 'lucky' then
    update jackpot_wallets set lucky_spins = lucky_spins - 1, updated_at = now() where user_id = v_uid;
  elsif not v_weekly then
    update jackpot_wallets set special_tickets = special_tickets - 1, updated_at = now() where user_id = v_uid;
  end if;

  if p_kind <> 'lucky' then
    update jackpot_wallets
       set lucky_progress = case when lucky_progress + 1 >= 10 then 0 else lucky_progress + 1 end,
           lucky_spins = lucky_spins + case when lucky_progress + 1 >= 10 then 1 else 0 end
     where user_id = v_uid
    returning lucky_progress = 0 into v_lucky_earned;
  end if;
$s$,
$s$  if p_kind = 'normal' then
    update jackpot_wallets set tickets = tickets - 1, updated_at = now() where user_id = v_uid;
  elsif not v_weekly then
    update jackpot_wallets set special_tickets = special_tickets - 1, updated_at = now() where user_id = v_uid;
  end if;
  -- 18/11/2026: o bônus do Giro da Sorte foi usado neste giro com ficha
  if v_lucky then
    update jackpot_wallets set lucky_spins = lucky_spins - 1, updated_at = now() where user_id = v_uid;
  end if;

  -- todo giro gasta ficha, então todo giro anda a barra (inclusive o que usou o bônus)
  update jackpot_wallets
     set lucky_progress = case when lucky_progress + 1 >= 10 then 0 else lucky_progress + 1 end,
         lucky_spins = lucky_spins + case when lucky_progress + 1 >= 10 then 1 else 0 end
   where user_id = v_uid
  returning lucky_progress = 0 into v_lucky_earned;
$s$, 'carteira');

  -- o resto do que valia para o "giro lucky" passa a valer para o giro com o bônus
  v_def := replace(v_def, $s$p_kind = 'lucky'$s$, 'v_lucky');
  if position($s$p_kind = 'lucky'$s$ in v_def) > 0 or position($s$p_kind <> 'lucky'$s$ in v_def) > 0 then
    raise exception 'jackpot_pull: sobrou giro lucky à parte';
  end if;

  v_def := pg_temp.swap_once(v_def,
$s$  if p_kind not in ('normal', 'special', 'lucky') then
    raise exception 'invalid_kind';
  end if;
$s$,
$s$  if p_kind not in ('normal', 'special', 'lucky') then
    raise exception 'invalid_kind';
  end if;
  -- 18/11/2026: o Giro da Sorte é o bônus do próximo giro com ficha. O
  -- "Girar grátis" do app antigo é recusado sem gastar nada.
  if p_kind = 'lucky' then
    raise exception 'no_lucky' using hint = 'update_app';
  end if;
$s$, 'app antigo');

  v_def := pg_temp.swap_once(v_def,
$s$  r := random();
  if v_lucky then
$s$,
$s$  -- 18/11/2026: com um Giro da Sorte guardado, este giro com ficha sai com as chances dele
  v_lucky := w.lucky_spins >= 1;

  r := random();
  if v_lucky then
$s$, 'bônus');

  v_def := pg_temp.swap_once(v_def,
$s$  insert into jackpot_pulls (user_id, kind, item_id, rarity, effect, duplicate, fragments_gained, from_bonus)
  values (v_uid, p_kind, v_item.id, v_item.rarity, v_effect, false, 0, p_kind = 'special' and not v_weekly)
$s$,
$s$  insert into jackpot_pulls (user_id, kind, item_id, rarity, effect, duplicate, fragments_gained, from_bonus, lucky)
  values (v_uid, p_kind, v_item.id, v_item.rarity, v_effect, false, 0, p_kind = 'special' and not v_weekly, v_lucky)
$s$, 'registro');

  v_def := pg_temp.swap_once(v_def,
$s$    'kind', p_kind,
$s$,
$s$    -- 18/11/2026: 'kind' diz 'lucky' quando veio com o bônus (o app antigo
    -- mostra a faixa dourada); 'chip' é a ficha que entrou.
    'kind', case when v_lucky then 'lucky' else p_kind end,
    'chip', p_kind,
    'lucky', v_lucky,
$s$, 'resposta');

  execute v_def;
end;
$do$;

-- O story do lendário: a faixa do Giro da Sorte vem do bônus.
do $do$
declare
  v_def text := pg_get_functiondef('public.feed_story_json(uuid,uuid,integer,text)'::regprocedure);
begin
  v_def := pg_temp.swap_once(v_def,
    $s$'pull_kind', jp.kind))$s$,
    $s$'pull_kind', case when jp.lucky then 'lucky' else jp.kind end))$s$,
    'feed_story_json');
  execute v_def;
end;
$do$;

-- As tags do Giro da Sorte (Lucky Charm e a fila de lendários).
do $do$
declare
  v_def text := pg_get_functiondef('public.game_tag_metric(uuid,text)'::regprocedure);
begin
  if (length(v_def) - length(replace(v_def, $s$p.kind = 'lucky'$s$, ''))) / length($s$p.kind = 'lucky'$s$) <> 2 then
    raise exception 'game_tag_metric: esperava dois trechos do Giro da Sorte';
  end if;
  execute replace(v_def, $s$p.kind = 'lucky'$s$, 'p.lucky');
end;
$do$;
