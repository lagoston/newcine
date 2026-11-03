-- 03/11/2026 — O Grande Blefe (pôquer), pacote C: correções achadas nos testes.
--
--   - poker_award_marks: "text[] || 'literal'" tentava ler o literal como
--     array; agora usa array_append.

create or replace function public.poker_award_marks(p_uid uuid, p_match_id uuid, p_summary jsonb)
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  m poker_bounty_matches;
  s jsonb := coalesce(p_summary, '{}'::jsonb);
  v_elims jsonb := case when jsonb_typeof(p_summary -> 'eliminations') = 'array' then p_summary -> 'eliminations' else '[]'::jsonb end;
  v_tags text[] := '{}';
  v_new text[];
begin
  select * into m from poker_bounty_matches where id = p_match_id and user_id = p_uid;
  if not found then
    return '{}';
  end if;

  -- Primeira Vitória: 1º lugar numa partida com prêmio.
  if m.status = 'won' and m.place = 1 then
    v_tags := array_append(v_tags, 'poker-first-win');
  end if;
  -- Derrubou o Raposo: eliminatorOf(fincher) = human.
  if (s -> 'marks' -> 'foxHunter') = 'true'::jsonb
     or exists (select 1 from jsonb_array_elements(v_elims) e where e ->> 'victimId' = 'fincher' and e ->> 'byId' = 'human') then
    v_tags := array_append(v_tags, 'poker-fox-hunter');
  end if;
  -- Limpa-Mesa: a pessoa eliminou os três oráculos na mesma partida.
  if (s -> 'marks' -> 'cleanSweep') = 'true'::jsonb
     or (select count(distinct e ->> 'victimId') from jsonb_array_elements(v_elims) e
          where e ->> 'byId' = 'human' and e ->> 'victimId' in ('bogart', 'cypher', 'fincher')) = 3 then
    v_tags := array_append(v_tags, 'poker-clean-sweep');
  end if;
  -- Blefe de Oscar: apurado pelo motor no servidor (informação privada).
  if (s -> 'marks' -> 'oscarBluff') = 'true'::jsonb then
    v_tags := array_append(v_tags, 'poker-oscar-bluff');
  end if;
  -- Uma Semana na Mesa: 7 dias seguidos de Brasília com partida com prêmio terminada.
  if (select count(distinct x.day) from poker_bounty_matches x
       where x.user_id = p_uid and x.status in ('won', 'lost', 'forfeit', 'abandoned')
         and x.day between m.day - 6 and m.day) = 7 then
    v_tags := array_append(v_tags, 'poker-seven-nights');
  end if;

  with ins as (
    insert into user_special_tags (user_id, tag_id, is_permanent)
    select p_uid, t, true from unnest(v_tags) t
     where exists (select 1 from special_tags st where st.id = t)
    on conflict do nothing
    returning tag_id
  )
  select coalesce(array_agg(tag_id), '{}') into v_new from ins;
  return v_new;
end;
$$;
