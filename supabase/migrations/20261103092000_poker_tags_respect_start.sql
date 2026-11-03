-- 03/11/2026 — Revisão de segurança da fase 2 (achado 4): as tags do Pôster Poker estão
-- escondidas até o lançamento (special_tags.starts_at em 2100), mas poker_award_marks as
-- concedia mesmo assim, e o gatilho trigger_game_tag_unlocked anunciava (sussurro + story
-- no feed dos amigos) uma tag de um jogo que ainda não foi lançado. Agora:
--   1. poker_award_marks só concede tag que já começou e não terminou;
--   2. o gatilho nunca anuncia tag fora da janela (defesa em profundidade).
-- Consequência: o que um testador vence antes do lançamento não vira tag (ela apareceria
-- no perfil dele para todo mundo); depois do lançamento, conta normalmente.

create or replace function public.poker_award_marks(p_uid uuid, p_match_id uuid, p_summary jsonb)
 returns text[]
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  m poker_bounty_matches;
  s jsonb := coalesce(p_summary, '{}'::jsonb);
  v_elims jsonb := case when jsonb_typeof(p_summary -> 'eliminations') = 'array' then p_summary -> 'eliminations' else '[]'::jsonb end;
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

  -- All-in: 1º lugar num torneio.
  if v_won then
    v_tags := array_append(v_tags, 'poker-first-win');
  end if;
  -- Outfoxed: eliminatorOf(fincher) = human.
  if (s -> 'marks' -> 'foxHunter') = 'true'::jsonb
     or exists (select 1 from jsonb_array_elements(v_elims) e where e ->> 'victimId' = 'fincher' and e ->> 'byId' = 'human') then
    v_tags := array_append(v_tags, 'poker-fox-hunter');
  end if;
  -- Clean Sweep: a pessoa eliminou os três oráculos no mesmo torneio.
  if (s -> 'marks' -> 'cleanSweep') = 'true'::jsonb
     or (select count(distinct e ->> 'victimId') from jsonb_array_elements(v_elims) e
          where e ->> 'byId' = 'human' and e ->> 'victimId' in ('bogart', 'cypher', 'fincher')) = 3 then
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
    -- High Stakes: venceu apostando um pôster da coleção.
    if m.stake_kind = 'poster' then
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
    -- Card Shark: 10 vitórias em torneio.
    if (select count(*) from poker_bounty_matches x where x.user_id = p_uid and x.week is not null and x.status = 'won') >= 10 then
      v_tags := array_append(v_tags, 'poker-card-shark');
    end if;
  end if;

  -- Só tags que existem e estão na janela (lançadas); quem já tem não ganha de novo.
  with ins as (
    insert into user_special_tags (user_id, tag_id, is_permanent)
    select p_uid, t, true from unnest(v_tags) t
     where exists (select 1 from special_tags st
                    where st.id = t
                      and (st.starts_at is null or st.starts_at <= now())
                      and (st.ends_at is null or st.ends_at > now()))
    on conflict do nothing
    returning tag_id
  )
  select coalesce(array_agg(tag_id), '{}') into v_new from ins;
  return v_new;
end;
$function$;

create or replace function public.trigger_game_tag_unlocked()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  st record;
  n int;
begin
  select s.name, s.emoji, s.category, s.starts_at, s.ends_at into st from special_tags s where s.id = new.tag_id;
  if not found or st.category is distinct from 'games' then
    return null;
  end if;
  -- Tag fora da janela (ex.: as do Pôster Poker antes do lançamento): nunca anuncia.
  if (st.starts_at is not null and st.starts_at > now()) or (st.ends_at is not null and st.ends_at <= now()) then
    return null;
  end if;
  if exists (select 1 from bot_accounts b where b.user_id = new.user_id) then
    return null;
  end if;
  -- Quem nunca sincronizou as tags: a primeira sincronização da home registra
  -- tudo calada (sync_unlocked_tags_from_home), inclusive esta.
  if not exists (select 1 from user_unlocked_tags u where u.user_id = new.user_id) then
    return null;
  end if;

  insert into user_unlocked_tags (user_id, category, tag_name)
  values (new.user_id, 'games', st.name)
  on conflict (user_id, category, tag_name) do nothing;
  get diagnostics n = row_count;
  if n = 0 or coalesce(current_setting('cineoracle.game_tags_silent', true), '') = 'on' then
    return null;
  end if;

  insert into friend_indications (from_user_id, to_user_id, type, tag_name, tag_emoji, tag_category, message, read)
  values (null, new.user_id, 'tag_unlocked', st.name, st.emoji, 'games', null, false);

  insert into feed_achievement_stories (owner_id, kind, tag_category, tag_name, tag_emoji, created_at)
  values (new.user_id, 'tag', 'games', left(st.name, 60), left(coalesce(st.emoji, ''), 16), coalesce(new.unlocked_at, now()))
  on conflict (owner_id, tag_category, tag_name) where kind = 'tag' do nothing;
  return null;
exception when others then
  -- O aviso é enfeite: um erro aqui nunca desfaz a concessão da tag.
  raise warning 'game tag notice (user_special_tags): %', sqlerrm;
  return null;
end;
$function$;
