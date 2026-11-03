-- 03/11/2026 (15h45) — Pedido do Bruno: as tags do Pôster Poker aparecem no modal de Tags
-- para quem já joga (hoje, os testadores) e podem ser ganhas por eles antes do lançamento.
-- poker_award_marks passa a conceder também para testadores (poker_settings.testers); o
-- aviso (sussurro + story) continua calado até a tag começar (trigger_game_tag_unlocked).

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
