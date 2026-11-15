-- Tags de Jogos mais difíceis (15/11/2026, tarde).
--
-- Pedido do Bruno: "As tags vermelhas, elas estão muito fáceis de ganhar. Eu
-- praticamente já ganhei todas só testando os jogos, no começo. […] elas têm
-- que ser no nível de dificuldade de ganhar igual todas as outras categorias
-- […] manter os emojis, porém os nomes mudar ou aumentar a dificuldade".
--
-- Os nomes e os emojis ficam; sobem as metas. A régua são as outras
-- categorias (50 títulos numa prateleira, 50/100/200 da curadoria de um
-- oráculo, 200/500/1000 títulos avaliados) e o ritmo de cada jogo:
--   • Poster Jackpot: umas 13 fichas por semana (1 por dia, 3 missões e a
--     ficha voadora). 50 giros são um mês; 200, uns quatro meses.
--   • Pôster Poker: no máximo uma vitória por semana (quem venceu não entra de
--     novo). 5 vitórias são pelo menos cinco semanas; 20, cinco meses.
--
-- Meta de antes → meta de agora:
--   🎰 Gambler        10 giros                → 50 giros
--   💸 High Roller    100 giros               → 200 giros
--   🍀 Lucky Charm    1 Giro da Sorte         → 10 Giros da Sorte
--   💰 Jackpot        1 lendário              → 10 lendários tirados na roleta
--   🌈 Shiny Hunter   10 pôsteres com efeito  → 20
--   🤝 Croupier       10 trocas               → 25 trocas
--   🗃️ Curator        50 pôsteres             → 100 pôsteres
--   🕶️ Black Market   1 contrato              → 5 contratos
--   ⚗️ Alchemist      1 lendário em contrato  → 3
--   ♠️ All-in         1 vitória em torneio    → 5 vitórias
--   🎯 Outfoxed       eliminar o Raposo 1 vez → em 5 torneios
--   🧹 Clean Sweep    os três oráculos 1 vez  → em 3 torneios
--   💎 High Stakes    1 vitória com pôster    → 5 vitórias apostando um pôster
--   🦈 Card Shark     10 vitórias             → 20 vitórias
-- Não mudam: 😐 Poker Face, 🌙 Seven Nights, ⚜️ Royal Flush e 🖼️ Full House
-- (ninguém as tinha, nem testando).
--
-- Esta migração só muda a regra daqui para a frente. Quem ganhou uma tag com a
-- regra antiga continua com ela até o Bruno decidir (a conferência que devolve
-- ao cadeado quem não cumpre a regra nova está em
-- supabase/pending/20261115193000_game_tags_recheck.sql, sem aplicar: ela
-- apaga conquistas).
--
-- Os mesmos números e textos estão em src/lib/tags.ts (GAME_TAGS).

-- ---------------------------------------------------------------------------
-- As metas e os textos
-- ---------------------------------------------------------------------------
update public.special_tags set
  requirement_data = requirement_data || '{"goal": 50}'::jsonb,
  requirement_description = 'Spin the Poster Jackpot wheel 50 times (with a regular or special chip)',
  requirement_description_pt = 'Dê 50 giros na roleta do Poster Jackpot (com ficha comum ou especial)',
  description = 'Fifty spins on the wheel. The machine knows your name now.',
  description_pt = 'Cinquenta giros na roleta. A máquina já sabe o seu nome.'
 where id = 'jackpot-gambler';

update public.special_tags set
  requirement_data = requirement_data || '{"goal": 200}'::jsonb,
  requirement_description = 'Spin the wheel 200 times (with a regular or special chip)',
  requirement_description_pt = 'Dê 200 giros na roleta (com ficha comum ou especial)',
  description = 'Two hundred spins. At this table, the chips never cool down.',
  description_pt = 'Duzentos giros. Nesta mesa, a ficha nunca esfria.'
 where id = 'jackpot-high-roller';

update public.special_tags set
  requirement_data = requirement_data || '{"goal": 10}'::jsonb,
  requirement_description = 'Use 10 Lucky Spins',
  requirement_description_pt = 'Use 10 Giros da Sorte',
  description = 'Filled the bar ten times and spun for free. Luck likes the stubborn.',
  description_pt = 'Encheu a barra dez vezes e girou de graça. A sorte gosta de quem insiste.'
 where id = 'jackpot-lucky-charm';

update public.special_tags set
  requirement_data = requirement_data || '{"goal": 10}'::jsonb,
  requirement_description = 'Pull 10 legendary posters on the wheel',
  requirement_description_pt = 'Tire 10 pôsteres lendários na roleta',
  description = 'The wheel stopped on gold ten times. That is no longer luck.',
  description_pt = 'A roleta parou no dourado dez vezes. Isso já não é sorte.'
 where id = 'jackpot-jackpot';

update public.special_tags set
  requirement_data = requirement_data || '{"goal": 20}'::jsonb,
  requirement_description = 'Have 20 posters with an effect',
  requirement_description_pt = 'Tenha 20 pôsteres com efeito',
  description = 'Twenty posters with an effect. The collection glows in the dark.',
  description_pt = 'Vinte pôsteres com efeito. A coleção brilha no escuro.'
 where id = 'jackpot-shiny-hunter';

update public.special_tags set
  requirement_data = requirement_data || '{"goal": 25}'::jsonb,
  requirement_description = 'Make 25 poster trades with friends',
  requirement_description_pt = 'Faça 25 trocas de pôster com amigos',
  description = 'Twenty-five trades with friends. Now you''re the one dealing.',
  description_pt = 'Vinte e cinco trocas com amigos. Agora quem distribui é você.'
 where id = 'jackpot-croupier';

update public.special_tags set
  requirement_data = requirement_data || '{"goal": 100}'::jsonb,
  requirement_description = 'Have 100 posters in your collection',
  requirement_description_pt = 'Tenha 100 pôsteres na coleção',
  description = 'A hundred posters in the collection. Time to open a museum.',
  description_pt = 'Cem pôsteres na coleção. Já dá para abrir um museu.'
 where id = 'jackpot-curator';

update public.special_tags set
  requirement_data = requirement_data || '{"goal": 5}'::jsonb,
  requirement_description = 'Close 5 contracts at the Cobra''s Black Market (in the Poster Jackpot)',
  requirement_description_pt = 'Feche 5 contratos no Mercado Negro da Cobra (no Poster Jackpot)',
  description = 'Five contracts signed with the Cobra. No questions, no receipts.',
  description_pt = 'Cinco contratos assinados com a Cobra. Sem perguntas, sem recibo.'
 where id = 'jackpot-black-market';

update public.special_tags set
  requirement_data = requirement_data || '{"goal": 3}'::jsonb,
  requirement_description = 'Forge 3 legendary posters in Black Market contracts',
  requirement_description_pt = 'Consiga 3 pôsteres lendários em contratos do Mercado Negro',
  description = 'Three times, six epics in and one legend out. The Cobra almost smiled.',
  description_pt = 'Três vezes entraram seis épicos e saiu um lendário. A Cobra quase sorriu.'
 where id = 'jackpot-alchemist';

update public.special_tags set
  requirement_data = requirement_data || '{"metric": "poker_wins", "goal": 5}'::jsonb,
  requirement_description = 'Win 5 Poster Poker tournaments',
  requirement_description_pt = 'Vença 5 torneios do Pôster Poker',
  description = 'Five tournaments won. I gave it a 10. Don''t tell anyone.',
  description_pt = 'Cinco torneios vencidos. Dei nota 10. Não conta pra ninguém.'
 where id = 'poker-first-win';

update public.special_tags set
  requirement_data = requirement_data || '{"metric": "poker_fox", "goal": 5}'::jsonb,
  requirement_description = 'Knock out the Fox in 5 tournaments',
  requirement_description_pt = 'Elimine o Raposo em 5 torneios',
  description = 'Took me off the table in five tournaments. Few can say that. Say it.',
  description_pt = 'Me tirou da mesa em cinco torneios. Poucos podem dizer isso. Diga.'
 where id = 'poker-fox-hunter';

update public.special_tags set
  requirement_data = requirement_data || '{"metric": "poker_sweeps", "goal": 3}'::jsonb,
  requirement_description = 'Knock out all three oracles in the same tournament, 3 times',
  requirement_description_pt = 'Elimine os três oráculos no mesmo torneio, 3 vezes',
  description = 'Knocked out all three in one tournament, three times over. A gorgeous massacre. I''m jealous.',
  description_pt = 'Eliminou os três no mesmo torneio, três vezes. Que massacre lindo. Fiquei com inveja.'
 where id = 'poker-clean-sweep';

update public.special_tags set
  requirement_data = requirement_data || '{"metric": "poker_stake_wins", "goal": 5}'::jsonb,
  requirement_description = 'Win 5 tournaments with a poster from your collection as the stake',
  requirement_description_pt = 'Vença 5 torneios apostando um pôster da sua coleção',
  description = 'Five times you put a poster on the table and walked out with two. Nerve pays.',
  description_pt = 'Cinco vezes apostou um pôster da coleção e saiu da mesa com dois. Coragem paga.'
 where id = 'poker-high-stakes';

update public.special_tags set
  requirement_data = requirement_data || '{"goal": 20}'::jsonb,
  requirement_description = 'Win 20 tournaments',
  requirement_description_pt = 'Vença 20 torneios',
  description = 'Twenty tournaments won. The table smells you coming.',
  description_pt = 'Vinte torneios vencidos. A mesa já sente o cheiro de longe.'
 where id = 'poker-card-shark';

-- ---------------------------------------------------------------------------
-- O que o resumo de um torneio diz (o mesmo teste que poker_award_marks fazia
-- só no torneio que acabou de terminar; agora ele conta os torneios guardados)
-- ---------------------------------------------------------------------------
-- a pessoa eliminou o Raposo
create or replace function public.poker_summary_fox(s jsonb)
returns boolean
language sql
immutable
set search_path to 'public'
as $function$
  select coalesce((s -> 'marks' -> 'foxHunter') = 'true'::jsonb, false)
      or exists (
        select 1
          from jsonb_array_elements(case when jsonb_typeof(s -> 'eliminations') = 'array' then s -> 'eliminations' else '[]'::jsonb end) e
         where e ->> 'victimId' = 'fincher' and e ->> 'byId' = 'human');
$function$;

-- a pessoa eliminou os três oráculos
create or replace function public.poker_summary_sweep(s jsonb)
returns boolean
language sql
immutable
set search_path to 'public'
as $function$
  select coalesce((s -> 'marks' -> 'cleanSweep') = 'true'::jsonb, false)
      or (select count(distinct e ->> 'victimId')
            from jsonb_array_elements(case when jsonb_typeof(s -> 'eliminations') = 'array' then s -> 'eliminations' else '[]'::jsonb end) e
           where e ->> 'byId' = 'human' and e ->> 'victimId' in ('bogart', 'cypher', 'fincher')) = 3;
$function$;

revoke all on function public.poker_summary_fox(jsonb) from public, anon, authenticated;
revoke all on function public.poker_summary_sweep(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- O progresso de cada métrica (a de antes, mais as três do pôquer que ganharam
-- contagem: Raposo eliminado, os três eliminados e vitórias apostando pôster)
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
    when 'legendary_pulls' then
      return (select count(*) from jackpot_pulls p
               where p.user_id = p_uid and not p.voided and p.rarity = 'legendary');
    when 'effect_posters' then
      return (select count(*) from user_posters up join poster_items pi on pi.id = up.item_id
               where up.user_id = p_uid and up.reset_at is null and pi.exclusive is null and up.effect <> 'none');
    when 'posters' then
      return (select count(*) from user_posters up join poster_items pi on pi.id = up.item_id
               where up.user_id = p_uid and up.reset_at is null and pi.exclusive is null);
    when 'trades' then
      return coalesce((select c.value from game_tag_counters c where c.user_id = p_uid and c.metric = 'trades'), 0);
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
    else
      return null;
  end case;
end;
$function$;

-- ---------------------------------------------------------------------------
-- As tags do pôquer, no fim do torneio (a de antes, com as metas novas)
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
  v_wins int;
  v_need int;
begin
  select * into m from poker_bounty_matches where id = p_match_id and user_id = p_uid;
  if not found or m.week is null then
    return '{}';
  end if;
  v_won := m.status = 'won' and m.place = 1;
  -- as vitórias em torneio, com a deste (a linha já está como vencida)
  select count(*) into v_wins from poker_bounty_matches x where x.user_id = p_uid and x.week is not null and x.status = 'won';

  -- All-in: 5 vitórias em torneio (até 15/11/2026, a 1ª).
  if v_won and v_wins >= 5 then
    v_tags := array_append(v_tags, 'poker-first-win');
  end if;
  -- Outfoxed: eliminou o Raposo em 5 torneios (até 15/11/2026, em 1). Este torneio
  -- vale pelo resumo que chegou; os outros, pelo resumo guardado.
  if poker_summary_fox(s)
     and (select count(*) from poker_bounty_matches x
           where x.user_id = p_uid and x.week is not null and x.id <> p_match_id and poker_summary_fox(x.summary)) + 1 >= 5 then
    v_tags := array_append(v_tags, 'poker-fox-hunter');
  end if;
  -- Clean Sweep: eliminou os três oráculos no mesmo torneio, em 3 torneios (até 15/11/2026, em 1).
  if poker_summary_sweep(s)
     and (select count(*) from poker_bounty_matches x
           where x.user_id = p_uid and x.week is not null and x.id <> p_match_id and poker_summary_sweep(x.summary)) + 1 >= 3 then
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
    -- High Stakes: 5 vitórias apostando um pôster da coleção (até 15/11/2026, 1).
    if m.stake_kind = 'poster'
       and (select count(*) from poker_bounty_matches x
             where x.user_id = p_uid and x.week is not null and x.status = 'won' and x.stake_kind = 'poster') >= 5 then
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
    -- Card Shark: 20 vitórias em torneio (até 15/11/2026, 10).
    if v_wins >= 20 then
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
