-- Tags de Jogos raras (15/11/2026, noite).
--
-- Pedido do Bruno, depois de ver as metas da tarde (50 giros, 5 vitórias…):
-- "Aumente mais ou até mude as tags de jogo, estão muito banais, tem que ser
-- algo bem mais raro."
--
-- A régua agora: cada tag pede meses de jogo de quem joga todo dia, ou um
-- feito que a maioria nunca vai ter. Os nomes e os emojis ficam; mudam as
-- metas e, em sete tags, a própria regra.
--
-- O ritmo que serviu de medida:
--   • Poster Jackpot: no máximo umas 13 fichas por semana (1 por dia, 3
--     missões, a ficha voadora). Giro com ficha: 55% comum, 28% raro, 13%
--     épico, 4% lendário; efeito em 5% dos giros. A cada 10 giros, um Giro da
--     Sorte (50% épico, 50% lendário). Trocas: 3 por dia.
--   • Pôster Poker: no máximo uma vitória por semana, e quem já tem o pôster
--     da semana não entra. Com 9 pôsteres no ciclo, ninguém passa de 9
--     vitórias: por isso as tags do pôquer viraram feitos, não contagens
--     altas (a Card Shark pedia 20 vitórias, o que não existia).
--
-- Poster Jackpot (meta da tarde → meta de agora):
--   🎰 Gambler        50 giros                → 250 giros (uns 4 meses e meio, no mínimo)
--   💸 High Roller    200 giros               → 1.000 giros (um ano e meio, no mínimo)
--   🍀 Lucky Charm    10 Giros da Sorte       → lendário em 5 Giros da Sorte seguidos (1 chance em 32 a cada cinco)
--   💰 Jackpot        10 lendários            → 25 lendários
--   🌈 Shiny Hunter   20 pôsteres com efeito  → 50
--   🤝 Croupier       25 trocas               → trocar com 10 amigos diferentes (troca repetida com o mesmo amigo não conta)
--   🗃️ Curator        100 pôsteres            → 200 pôsteres diferentes (a roleta tem 205; versões com efeito não contam duas vezes)
--   🕶️ Black Market   5 contratos             → 25 contratos (150 pôsteres entregues)
--   ⚗️ Alchemist      3 lendários em contrato → 10 (60 épicos entregues)
-- Pôster Poker:
--   ♠️ All-in         5 vitórias              → vencer um torneio sem perder nenhum all-in, com 5 ou mais
--   🎯 Outfoxed       eliminar o Raposo em 5  → vencer 5 torneios com o Raposo como último adversário
--   🧹 Clean Sweep    os três, em 3 torneios  → em 5 torneios
--   💎 High Stakes    5 vitórias com pôster   → vencer o torneio lendário apostando um pôster lendário
--   🦈 Card Shark     20 vitórias             → vencer 5 torneios na primeira entrada da semana
-- Não mudam: 😐 Poker Face, 🌙 Seven Nights, ⚜️ Royal Flush e 🖼️ Full House.
--
-- Como a migração da tarde, esta só muda a regra daqui para a frente. Quem
-- ganhou uma tag com a regra antiga continua com ela até o Bruno decidir (a
-- conferência está em supabase/pending/20261115220000_game_tags_recheck.sql,
-- sem aplicar: ela apaga conquistas).
--
-- Os mesmos números e textos estão em src/lib/tags.ts (GAME_TAGS).

-- ---------------------------------------------------------------------------
-- Croupier: com quem cada pessoa já trocou
-- ---------------------------------------------------------------------------
-- As trocas somem do banco depois de 30 dias, então a lista de parceiros
-- precisa de lugar próprio (como o contador de trocas). O Jackpot abriu em
-- 31/10/2026: todas as trocas aceitas ainda estão em poster_trades e entram
-- aqui.
create table if not exists public.game_tag_trade_partners (
  user_id uuid not null references public.profiles(id) on delete cascade,
  partner_id uuid not null references public.profiles(id) on delete cascade,
  first_at timestamptz not null default now(),
  primary key (user_id, partner_id),
  check (user_id <> partner_id)
);
alter table public.game_tag_trade_partners enable row level security;
revoke all on table public.game_tag_trade_partners from anon, authenticated;

insert into public.game_tag_trade_partners (user_id, partner_id, first_at)
select t.u, t.o, min(t.at)
  from (
    select from_user as u, to_user as o, coalesce(responded_at, created_at) as at
      from public.poster_trades where status = 'accepted'
    union all
    select to_user, from_user, coalesce(responded_at, created_at)
      from public.poster_trades where status = 'accepted'
  ) t
 where t.u <> t.o
 group by t.u, t.o
on conflict (user_id, partner_id) do nothing;

-- ---------------------------------------------------------------------------
-- Pôquer: o que o resumo de um torneio diz
-- ---------------------------------------------------------------------------
-- All-in: a pessoa entrou em 5 all-ins ou mais e levou todos (allinCount e
-- allinWon, que o motor conta mão a mão; empate no pote principal não vale
-- como all-in ganho).
create or replace function public.poker_summary_perfect_allin(s jsonb)
 returns boolean
 language sql
 immutable
 set search_path to 'public'
as $function$
  select case
           when jsonb_typeof(s -> 'human' -> 'allinCount') = 'number'
            and jsonb_typeof(s -> 'human' -> 'allinWon') = 'number'
           then (s -> 'human' ->> 'allinCount')::numeric >= 5
            and (s -> 'human' ->> 'allinWon')::numeric = (s -> 'human' ->> 'allinCount')::numeric
           else false
         end;
$function$;

-- Outfoxed: a última eliminação do torneio foi a do Raposo, pela pessoa (o
-- mano a mano final foi contra ele).
create or replace function public.poker_summary_fox_final(s jsonb)
 returns boolean
 language sql
 immutable
 set search_path to 'public'
as $function$
  select coalesce((
    select e ->> 'victimId' = 'fincher' and e ->> 'byId' = 'human'
      from jsonb_array_elements(case when jsonb_typeof(s -> 'eliminations') = 'array' then s -> 'eliminations' else '[]'::jsonb end)
           with ordinality as t(e, ord)
     order by case when jsonb_typeof(e -> 'hand') = 'number' then (e ->> 'hand')::numeric else 0 end desc, ord desc
     limit 1), false);
$function$;

revoke all on function public.poker_summary_perfect_allin(jsonb) from public, anon, authenticated;
revoke all on function public.poker_summary_fox_final(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- As contagens
-- ---------------------------------------------------------------------------
create or replace function public.game_tag_metric(p_uid uuid, p_metric text)
 returns integer
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
begin
  case p_metric
    when 'spins' then
      return (select count(*) from jackpot_pulls p
               where p.user_id = p_uid and not p.voided and p.kind in ('normal', 'special'));
    when 'lucky_spins' then
      return (select count(*) from jackpot_pulls p
               where p.user_id = p_uid and not p.voided and p.kind = 'lucky');
    -- 15/11/2026 (noite): a maior fila de Giros da Sorte seguidos que deram
    -- lendário (os giros com ficha no meio não quebram a fila).
    when 'lucky_legendary_streak' then
      return coalesce((
        select max(r.n) from (
          select count(*) as n from (
            select p.rarity,
                   row_number() over (order by p.id)
                   - row_number() over (partition by (p.rarity = 'legendary') order by p.id) as grp
              from jackpot_pulls p
             where p.user_id = p_uid and not p.voided and p.kind = 'lucky') q
           where q.rarity = 'legendary'
           group by q.grp) r), 0);
    when 'legendary_pulls' then
      return (select count(*) from jackpot_pulls p
               where p.user_id = p_uid and not p.voided and p.rarity = 'legendary');
    when 'effect_posters' then
      return (select count(*) from user_posters up join poster_items pi on pi.id = up.item_id
               where up.user_id = p_uid and up.reset_at is null and pi.exclusive is null and up.effect <> 'none');
    when 'posters' then
      return (select count(*) from user_posters up join poster_items pi on pi.id = up.item_id
               where up.user_id = p_uid and up.reset_at is null and pi.exclusive is null);
    -- 15/11/2026 (noite): pôsteres diferentes (o mesmo pôster com e sem efeito conta uma vez).
    when 'poster_items' then
      return (select count(distinct up.item_id) from user_posters up join poster_items pi on pi.id = up.item_id
               where up.user_id = p_uid and up.reset_at is null and pi.exclusive is null);
    when 'trades' then
      return coalesce((select c.value from game_tag_counters c where c.user_id = p_uid and c.metric = 'trades'), 0);
    -- 15/11/2026 (noite): com quantas pessoas diferentes já trocou.
    when 'trade_partners' then
      return (select count(*) from game_tag_trade_partners g where g.user_id = p_uid);
    -- 04/11/2026: contratos da Cobra (o histórico não some; um reset não tira a tag).
    when 'contracts' then
      return (select count(*) from jackpot_contracts c where c.user_id = p_uid);
    when 'contract_legendaries' then
      return (select count(*) from jackpot_contracts c where c.user_id = p_uid and c.rarity_out = 'legendary');
    -- Do Pôster Poker (só para o progresso no modal; quem concede é o fim do
    -- torneio, poker_award_marks — as mesmas contas de lá).
    when 'poker_wins' then
      return (select count(*) from poker_bounty_matches x
               where x.user_id = p_uid and x.week is not null and x.status = 'won');
    when 'poker_posters' then
      return (select count(distinct up.item_id) from user_posters up join poster_items pi on pi.id = up.item_id
               where up.user_id = p_uid and up.reset_at is null and up.effect = 'gold' and pi.exclusive = 'poker');
    -- 15/11/2026: as três que passaram a pedir mais de uma vez.
    when 'poker_fox' then
      return (select count(*) from poker_bounty_matches x
               where x.user_id = p_uid and x.week is not null and poker_summary_fox(x.summary));
    when 'poker_sweeps' then
      return (select count(*) from poker_bounty_matches x
               where x.user_id = p_uid and x.week is not null and poker_summary_sweep(x.summary));
    when 'poker_stake_wins' then
      return (select count(*) from poker_bounty_matches x
               where x.user_id = p_uid and x.week is not null and x.status = 'won' and x.stake_kind = 'poster');
    -- 15/11/2026 (noite): os feitos.
    when 'poker_perfect_allins' then
      return (select count(*) from poker_bounty_matches x
               where x.user_id = p_uid and x.week is not null and x.status = 'won' and poker_summary_perfect_allin(x.summary));
    when 'poker_fox_finals' then
      return (select count(*) from poker_bounty_matches x
               where x.user_id = p_uid and x.week is not null and x.status = 'won' and poker_summary_fox_final(x.summary));
    when 'poker_first_try_wins' then
      return (select count(*) from poker_bounty_matches x
               where x.user_id = p_uid and x.week is not null and x.status = 'won'
                 and not exists (select 1 from poker_bounty_matches y
                                  where y.user_id = x.user_id and y.week = x.week and y.id <> x.id and y.created_at < x.created_at));
    when 'poker_legendary_stake_wins' then
      return (select count(*) from poker_bounty_matches x
               where x.user_id = p_uid and x.week is not null and x.status = 'won'
                 and x.rarity = 'legendary' and x.stake_kind = 'poster');
    else
      return null;
  end case;
end;
$function$;

-- ---------------------------------------------------------------------------
-- Os gatilhos do Jackpot: as contagens novas entram na conferência
-- ---------------------------------------------------------------------------
create or replace function public.trigger_game_tags_on_pull()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not coalesce(new.voided, false) then
    begin
      perform award_jackpot_game_tags(new.user_id, array['spins', 'lucky_spins', 'lucky_legendary_streak', 'legendary_pulls']);
    exception when others then
      raise warning 'game tags (jackpot_pulls): %', sqlerrm;
    end;
  end if;
  return null;
end;
$function$;

create or replace function public.trigger_game_tags_on_poster()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  begin
    perform award_jackpot_game_tags(new.user_id, array['effect_posters', 'posters', 'poster_items']);
  exception when others then
    raise warning 'game tags (user_posters): %', sqlerrm;
  end;
  return null;
end;
$function$;

create or replace function public.trigger_game_tags_on_trade()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if new.status <> 'accepted' or (tg_op = 'UPDATE' and old.status = 'accepted') then
    return null;
  end if;
  begin
    insert into game_tag_counters (user_id, metric, value)
    values (new.from_user, 'trades', 1), (new.to_user, 'trades', 1)
    on conflict (user_id, metric) do update set value = game_tag_counters.value + 1, updated_at = now();
    -- 15/11/2026 (noite): o parceiro de troca, uma vez só por par, nos dois sentidos.
    insert into game_tag_trade_partners (user_id, partner_id)
    select v.u, v.o
      from (values (new.from_user, new.to_user), (new.to_user, new.from_user)) as v(u, o)
     where v.u is not null and v.o is not null and v.u <> v.o
    on conflict (user_id, partner_id) do nothing;
    perform award_jackpot_game_tags(new.from_user, array['trades', 'trade_partners']);
    perform award_jackpot_game_tags(new.to_user, array['trades', 'trade_partners']);
  exception when others then
    raise warning 'game tags (poster_trades): %', sqlerrm;
  end;
  return null;
end;
$function$;

-- ---------------------------------------------------------------------------
-- As metas e os textos
-- ---------------------------------------------------------------------------
update public.special_tags set
  requirement_data = requirement_data || '{"metric": "spins", "goal": 250}'::jsonb,
  requirement_description = 'Spin the Poster Jackpot wheel 250 times (with a regular or special chip)',
  requirement_description_pt = 'Dê 250 giros na roleta do Poster Jackpot (com ficha comum ou especial)',
  description = 'Two hundred and fifty spins on the wheel. The machine saves your seat now.',
  description_pt = 'Duzentos e cinquenta giros na roleta. A máquina já guarda o seu lugar.'
 where id = 'jackpot-gambler';

update public.special_tags set
  requirement_data = requirement_data || '{"metric": "spins", "goal": 1000}'::jsonb,
  requirement_description = 'Spin the wheel 1,000 times (with a regular or special chip)',
  requirement_description_pt = 'Dê 1.000 giros na roleta (com ficha comum ou especial)',
  description = 'A thousand spins. At this table, the chips never cool down.',
  description_pt = 'Mil giros. Nesta mesa, a ficha nunca esfria.'
 where id = 'jackpot-high-roller';

update public.special_tags set
  requirement_data = requirement_data || '{"metric": "lucky_legendary_streak", "goal": 5}'::jsonb,
  requirement_description = 'Pull a legendary on 5 Lucky Spins in a row',
  requirement_description_pt = 'Tire um lendário em 5 Giros da Sorte seguidos',
  description = 'Five Lucky Spins in a row, five legendaries. The wheel has picked a side.',
  description_pt = 'Cinco Giros da Sorte seguidos, cinco lendários. A roleta escolheu um lado.'
 where id = 'jackpot-lucky-charm';

update public.special_tags set
  requirement_data = requirement_data || '{"metric": "legendary_pulls", "goal": 25}'::jsonb,
  requirement_description = 'Pull 25 legendary posters',
  requirement_description_pt = 'Tire 25 pôsteres lendários',
  description = 'The wheel stopped on gold twenty-five times. That is no longer luck.',
  description_pt = 'A roleta parou no dourado vinte e cinco vezes. Isso já não é sorte.'
 where id = 'jackpot-jackpot';

update public.special_tags set
  requirement_data = requirement_data || '{"metric": "effect_posters", "goal": 50}'::jsonb,
  requirement_description = 'Have 50 posters with an effect',
  requirement_description_pt = 'Tenha 50 pôsteres com efeito',
  description = 'Fifty posters with an effect. The collection glows in the dark.',
  description_pt = 'Cinquenta pôsteres com efeito. A coleção brilha no escuro.'
 where id = 'jackpot-shiny-hunter';

update public.special_tags set
  requirement_data = requirement_data || '{"metric": "trade_partners", "goal": 10}'::jsonb,
  requirement_description = 'Trade posters with 10 different friends',
  requirement_description_pt = 'Troque pôsteres com 10 amigos diferentes',
  description = 'Ten friends, ten handshakes. You run the table now.',
  description_pt = 'Dez amigos, dez apertos de mão. Agora quem distribui é você.'
 where id = 'jackpot-croupier';

update public.special_tags set
  requirement_data = requirement_data || '{"metric": "poster_items", "goal": 200}'::jsonb,
  requirement_description = 'Have 200 different posters in your collection',
  requirement_description_pt = 'Tenha 200 pôsteres diferentes na coleção',
  description = 'Two hundred different posters. That is a museum.',
  description_pt = 'Duzentos pôsteres diferentes. Isso já é um museu.'
 where id = 'jackpot-curator';

update public.special_tags set
  requirement_data = requirement_data || '{"metric": "contracts", "goal": 25}'::jsonb,
  requirement_description = 'Close 25 contracts at the Cobra''s Black Market (in the Poster Jackpot)',
  requirement_description_pt = 'Feche 25 contratos no Mercado Negro da Cobra (no Poster Jackpot)',
  description = 'Twenty-five contracts signed with the Cobra. No questions, no receipt.',
  description_pt = 'Vinte e cinco contratos assinados com a Cobra. Sem perguntas, sem recibo.'
 where id = 'jackpot-black-market';

update public.special_tags set
  requirement_data = requirement_data || '{"metric": "contract_legendaries", "goal": 10}'::jsonb,
  requirement_description = 'Forge 10 legendary posters in Black Market contracts',
  requirement_description_pt = 'Consiga 10 pôsteres lendários em contratos do Mercado Negro',
  description = 'Ten times, six epics went in and a legendary came out. The Cobra almost smiled.',
  description_pt = 'Dez vezes entraram seis épicos e saiu um lendário. A Cobra quase sorriu.'
 where id = 'jackpot-alchemist';

update public.special_tags set
  requirement_data = requirement_data || '{"metric": "poker_perfect_allins", "goal": 1}'::jsonb,
  requirement_description = 'Win a tournament without losing a single all-in, with 5 or more all-ins',
  requirement_description_pt = 'Vença um torneio sem perder nenhum all-in, com 5 all-ins ou mais',
  description = 'Five all-ins or more, none lost, and the table was yours. I gave it a 10. Tell no one.',
  description_pt = 'Cinco all-ins ou mais, nenhum perdido, e a mesa ficou sua. Dei nota 10. Não conta pra ninguém.'
 where id = 'poker-first-win';

update public.special_tags set
  requirement_data = requirement_data || '{"metric": "poker_fox_finals", "goal": 5}'::jsonb,
  requirement_description = 'Win 5 tournaments with the Fox as your last opponent',
  requirement_description_pt = 'Vença 5 torneios com o Raposo como último adversário',
  description = 'Five times it came down to the two of us. Five times I was the one who left. Few can say that. Say it.',
  description_pt = 'Cinco vezes sobramos só nós dois. Nas cinco, quem levantou da mesa fui eu. Poucos podem dizer isso. Diga.'
 where id = 'poker-fox-hunter';

update public.special_tags set
  requirement_data = requirement_data || '{"metric": "poker_sweeps", "goal": 5}'::jsonb,
  requirement_description = 'Knock out all three oracles in the same tournament, 5 times',
  requirement_description_pt = 'Elimine os três oráculos no mesmo torneio, 5 vezes',
  description = 'Knocked out all three in the same tournament, five times. What a lovely massacre. I am jealous.',
  description_pt = 'Eliminou os três no mesmo torneio, cinco vezes. Que massacre lindo. Fiquei com inveja.'
 where id = 'poker-clean-sweep';

update public.special_tags set
  requirement_data = requirement_data || '{"metric": "poker_legendary_stake_wins", "goal": 1}'::jsonb,
  requirement_description = 'Win a legendary tournament with a legendary poster from your collection as the stake',
  requirement_description_pt = 'Vença um torneio lendário apostando um pôster lendário da sua coleção',
  description = 'Put a legendary on the table in the hardest week and walked away with two. Courage pays.',
  description_pt = 'Pôs um lendário na mesa, na semana mais difícil, e saiu com dois. Coragem paga.'
 where id = 'poker-high-stakes';

update public.special_tags set
  requirement_data = requirement_data || '{"metric": "poker_first_try_wins", "goal": 5}'::jsonb,
  requirement_description = 'Win 5 tournaments on your first entry of the week',
  requirement_description_pt = 'Vença 5 torneios na primeira entrada da semana',
  description = 'Five weeks, five tournaments won on the first entry. The table smells you coming.',
  description_pt = 'Cinco semanas, cinco torneios vencidos na primeira entrada. A mesa já sente o cheiro de longe.'
 where id = 'poker-card-shark';

-- ---------------------------------------------------------------------------
-- Pôquer: a concessão no fim do torneio
-- ---------------------------------------------------------------------------
create or replace function public.poker_award_marks(p_uid uuid, p_match_id uuid, p_summary jsonb)
 returns text[]
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  m poker_bounty_matches;
  s jsonb := coalesce(p_summary, '{}'::jsonb);
  v_tags text[] := '{}';
  v_new text[];
  v_won boolean;
  v_need int;
begin
  select * into m from poker_bounty_matches where id = p_match_id and user_id = p_uid;
  if not found or m.week is null then
    return '{}';
  end if;
  v_won := m.status = 'won' and m.place = 1;

  -- Este torneio vale pelo resumo que chegou; os outros, pelo resumo guardado.

  -- All-in: venceu sem perder nenhum all-in, com 5 ou mais (até 15/11/2026 à
  -- noite, 5 vitórias; antes, a 1ª).
  if v_won and poker_summary_perfect_allin(s) then
    v_tags := array_append(v_tags, 'poker-first-win');
  end if;
  -- Outfoxed: 5 torneios vencidos com o Raposo como último adversário (até
  -- 15/11/2026 à noite, eliminar o Raposo em 5 torneios).
  if v_won and poker_summary_fox_final(s)
     and (select count(*) from poker_bounty_matches x
           where x.user_id = p_uid and x.week is not null and x.id <> p_match_id
             and x.status = 'won' and poker_summary_fox_final(x.summary)) + 1 >= 5 then
    v_tags := array_append(v_tags, 'poker-fox-hunter');
  end if;
  -- Clean Sweep: eliminou os três oráculos no mesmo torneio, em 5 torneios (até 15/11/2026 à noite, em 3).
  if poker_summary_sweep(s)
     and (select count(*) from poker_bounty_matches x
           where x.user_id = p_uid and x.week is not null and x.id <> p_match_id and poker_summary_sweep(x.summary)) + 1 >= 5 then
    v_tags := array_append(v_tags, 'poker-clean-sweep');
  end if;
  -- Poker Face: apurado pelo motor no servidor (informação privada).
  if (s -> 'marks' -> 'oscarBluff') = 'true'::jsonb then
    v_tags := array_append(v_tags, 'poker-oscar-bluff');
  end if;
  -- Seven Nights: torneio terminado em 7 dias seguidos de Brasília.
  if (select count(distinct x.day) from poker_bounty_matches x
       where x.user_id = p_uid and x.week is not null and x.status in ('won', 'lost', 'forfeit', 'abandoned')
         and x.day between m.day - 6 and m.day) = 7 then
    v_tags := array_append(v_tags, 'poker-seven-nights');
  end if;
  if v_won then
    -- High Stakes: venceu o torneio lendário apostando um pôster (que, pela
    -- regra da entrada, é lendário também). Até 15/11/2026 à noite, 5 vitórias
    -- apostando um pôster.
    if m.rarity = 'legendary' and m.stake_kind = 'poster' then
      v_tags := array_append(v_tags, 'poker-high-stakes');
    end if;
    -- Royal Flush: venceu um torneio de pôster lendário.
    if m.rarity = 'legendary' then
      v_tags := array_append(v_tags, 'poker-royal-flush');
    end if;
    -- Full House: tem os 9 pôsteres do Pôster Poker (o desta vitória já foi concedido).
    select count(*) into v_need from poster_items where exclusive = 'poker';
    if v_need > 0 and (select count(distinct up.item_id) from user_posters up join poster_items pi on pi.id = up.item_id
                        where up.user_id = p_uid and up.reset_at is null and up.effect = 'gold' and pi.exclusive = 'poker') >= v_need then
      v_tags := array_append(v_tags, 'poker-full-house');
    end if;
    -- Card Shark: 5 torneios vencidos na primeira entrada da semana, este
    -- entre eles (até 15/11/2026 à noite, 20 vitórias, que o ciclo de 9
    -- pôsteres não deixava alcançar).
    if not exists (select 1 from poker_bounty_matches y
                    where y.user_id = p_uid and y.week = m.week and y.id <> m.id and y.created_at < m.created_at)
       and (select count(*) from poker_bounty_matches x
             where x.user_id = p_uid and x.week is not null and x.status = 'won'
               and not exists (select 1 from poker_bounty_matches y
                                where y.user_id = x.user_id and y.week = x.week and y.id <> x.id and y.created_at < x.created_at)) >= 5 then
      v_tags := array_append(v_tags, 'poker-card-shark');
    end if;
  end if;

  -- Só tags que existem e estão na janela (lançadas) — ou, antes do lançamento, para os
  -- testadores do Pôster Poker (pedido do Bruno, 03/11: "hoje só você vê e pode ganhar");
  -- o gatilho de aviso continua calado até o lançamento. Quem já tem não ganha de novo.
  with ins as (
    insert into user_special_tags (user_id, tag_id, is_permanent)
    select p_uid, t, true from unnest(v_tags) t
     where exists (select 1 from special_tags st
                    where st.id = t
                      and (st.starts_at is null or st.starts_at <= now()
                           or p_uid = any (coalesce((select testers from poker_settings limit 1), '{}')))
                      and (st.ends_at is null or st.ends_at > now()))
    on conflict do nothing
    returning tag_id
  )
  select coalesce(array_agg(tag_id), '{}') into v_new from ins;
  return v_new;
end;
$function$;
