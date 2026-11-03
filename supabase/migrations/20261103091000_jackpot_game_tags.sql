-- 03/11/2026 (tarde) — pacote T: as 7 tags do Poster Jackpot (categoria Jogos),
-- concedidas só pelo banco.
--
-- Cada tag tem em special_tags.requirement_data a métrica e a meta
-- (20261103090000_game_tags_category.sql). Contagem:
--   spins            giros com ficha (normal + especial), sem os anulados  → Gambler 10, High Roller 100
--   lucky_spins      Giros da Sorte, sem os anulados                       → Lucky Charm 1
--   legendary_pulls  giros (qualquer ficha) que tiraram lendário           → Jackpot 1
--   effect_posters   pôsteres com efeito que a pessoa TEM agora            → Shiny Hunter 10
--   posters          pôsteres que a pessoa TEM agora                       → Curator 50
--   trades           trocas aceitas, dos dois lados (contador próprio)     → Croupier 10
-- "Tem agora" = linha de user_posters sem reset_at (cada versão — item +
-- efeito — é um pôster, como no contador da coleção do Jackpot). Os pôsteres
-- exclusivos do Pôster Poker (poster_items.exclusive, com o brilho dourado)
-- NÃO contam para Curator nem Shiny Hunter: são de outro jogo, têm a tag
-- própria (Full House) e já ficam fora da coleção do Jackpot
-- (get_jackpot_state.owned).
--
-- Trocas: poster_trades é apagada 30 dias depois do último movimento, então
-- contar a tabela faria o progresso andar para trás. Cada troca aceita soma 1
-- num contador durável (game_tag_counters, métrica 'trades') para as duas
-- pessoas, no gatilho da própria troca.
--
-- Quando: gatilhos AFTER em jackpot_pulls (insert), user_posters (insert ou
-- update de linha presente) e poster_trades (troca que vira 'accepted').
-- Idempotentes (on conflict do nothing em user_special_tags), sem bots, e um
-- erro aqui nunca derruba o giro nem a troca (bloco de exceção próprio).
-- A tag é para sempre: giro anulado, reset ou pôster trocado não a tiram
-- (nada aqui apaga de user_special_tags).
--
-- Para quem já merece hoje: concedidas de uma vez no fim desta migração,
-- registradas como já avisadas (sem sussurro nem story em massa).

-- ---------------------------------------------------------------------------
-- Contador durável
-- ---------------------------------------------------------------------------

create table if not exists public.game_tag_counters (
  user_id uuid not null references public.profiles(id) on delete cascade,
  metric text not null,
  value integer not null default 0 check (value >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, metric)
);
alter table public.game_tag_counters enable row level security;
revoke all on public.game_tag_counters from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Métricas
-- ---------------------------------------------------------------------------

create or replace function public.game_tag_metric(p_uid uuid, p_metric text)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
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
    -- Do Pôster Poker (só para o progresso no modal; quem concede é o fim do
    -- torneio, poker_award_marks — as mesmas contas de lá).
    when 'poker_wins' then
      return (select count(*) from poker_bounty_matches x
               where x.user_id = p_uid and x.week is not null and x.status = 'won');
    when 'poker_posters' then
      return (select count(distinct up.item_id) from user_posters up join poster_items pi on pi.id = up.item_id
               where up.user_id = p_uid and up.reset_at is null and up.effect = 'gold' and pi.exclusive = 'poker');
    else
      return null;
  end case;
end;
$$;
revoke all on function public.game_tag_metric(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Concessão (só as do Jackpot; as do pôquer são do fim do torneio)
-- ---------------------------------------------------------------------------

create or replace function public.award_jackpot_game_tags(p_uid uuid, p_metrics text[])
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_values jsonb := '{}'::jsonb;
  v_new text[] := '{}';
  n int;
begin
  if p_uid is null or exists (select 1 from bot_accounts b where b.user_id = p_uid) then
    return v_new;
  end if;
  for r in
    select st.id, st.requirement_data ->> 'metric' as metric, (st.requirement_data ->> 'goal')::int as goal
      from special_tags st
     where st.category = 'games'
       and st.requirement_data ->> 'source' = 'jackpot'
       and st.requirement_data ->> 'metric' = any (p_metrics)
       and st.starts_at <= now()
       and (st.ends_at is null or st.ends_at > now())
       and not exists (select 1 from user_special_tags u where u.user_id = p_uid and u.tag_id = st.id)
     order by st.id
  loop
    if not v_values ? r.metric then
      v_values := v_values || jsonb_build_object(r.metric, game_tag_metric(p_uid, r.metric));
    end if;
    if coalesce((v_values ->> r.metric)::int, 0) >= r.goal then
      insert into user_special_tags (user_id, tag_id, is_permanent)
      values (p_uid, r.id, true)
      on conflict (user_id, tag_id) do nothing;
      get diagnostics n = row_count;
      if n > 0 then
        v_new := v_new || r.id;
      end if;
    end if;
  end loop;
  return v_new;
end;
$$;
revoke all on function public.award_jackpot_game_tags(uuid, text[]) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Gatilhos
-- ---------------------------------------------------------------------------

create or replace function public.trigger_game_tags_on_pull()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce(new.voided, false) then
    begin
      perform award_jackpot_game_tags(new.user_id, array['spins', 'lucky_spins', 'legendary_pulls']);
    exception when others then
      raise warning 'game tags (jackpot_pulls): %', sqlerrm;
    end;
  end if;
  return null;
end;
$$;
revoke all on function public.trigger_game_tags_on_pull() from public, anon, authenticated;

create or replace trigger game_tags_on_pull
  after insert on public.jackpot_pulls
  for each row execute function public.trigger_game_tags_on_pull();

create or replace function public.trigger_game_tags_on_poster()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform award_jackpot_game_tags(new.user_id, array['effect_posters', 'posters']);
  exception when others then
    raise warning 'game tags (user_posters): %', sqlerrm;
  end;
  return null;
end;
$$;
revoke all on function public.trigger_game_tags_on_poster() from public, anon, authenticated;

-- Só linhas presentes (reset_at null): um pôster que saiu não muda nada.
create or replace trigger game_tags_on_poster
  after insert or update on public.user_posters
  for each row when (new.reset_at is null)
  execute function public.trigger_game_tags_on_poster();

create or replace function public.trigger_game_tags_on_trade()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status <> 'accepted' or (tg_op = 'UPDATE' and old.status = 'accepted') then
    return null;
  end if;
  begin
    insert into game_tag_counters (user_id, metric, value)
    values (new.from_user, 'trades', 1), (new.to_user, 'trades', 1)
    on conflict (user_id, metric) do update set value = game_tag_counters.value + 1, updated_at = now();
    perform award_jackpot_game_tags(new.from_user, array['trades']);
    perform award_jackpot_game_tags(new.to_user, array['trades']);
  exception when others then
    raise warning 'game tags (poster_trades): %', sqlerrm;
  end;
  return null;
end;
$$;
revoke all on function public.trigger_game_tags_on_trade() from public, anon, authenticated;

create or replace trigger game_tags_on_trade
  after insert or update of status on public.poster_trades
  for each row when (new.status = 'accepted')
  execute function public.trigger_game_tags_on_trade();

-- ---------------------------------------------------------------------------
-- Progresso para o modal de Tags (só da própria pessoa)
-- ---------------------------------------------------------------------------
-- { "<métrica>": n, … } com todas as métricas que alguma tag de Jogos usa.
-- Uma métrica que falhar (ex.: tabela do pôquer mudando) só fica de fora.
create or replace function public.get_my_game_tag_progress()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_out jsonb := '{}'::jsonb;
  m text;
begin
  if v_uid is null then
    return v_out;
  end if;
  for m in
    select distinct st.requirement_data ->> 'metric'
      from special_tags st
     where st.category = 'games' and st.requirement_data ? 'metric'
  loop
    begin
      v_out := v_out || jsonb_build_object(m, game_tag_metric(v_uid, m));
    exception when others then
      null;
    end;
  end loop;
  return v_out;
end;
$$;
revoke all on function public.get_my_game_tag_progress() from public, anon;
grant execute on function public.get_my_game_tag_progress() to authenticated;

-- ---------------------------------------------------------------------------
-- Largada: quem já merece hoje
-- ---------------------------------------------------------------------------

do $$
declare
  r record;
begin
  -- Registra como já avisada (trigger_game_tag_unlocked): sem sussurro nem story.
  perform set_config('cineoracle.game_tags_silent', 'on', true);

  -- As trocas aceitas que ainda estão na tabela (a troca mais antiga é de 31/10:
  -- nenhuma passou dos 30 dias, então esta é a conta completa).
  insert into game_tag_counters (user_id, metric, value)
  select x.uid, 'trades', count(*)
    from (select t.from_user as uid from poster_trades t where t.status = 'accepted'
          union all
          select t.to_user from poster_trades t where t.status = 'accepted') x
   group by x.uid
  on conflict (user_id, metric) do update set value = greatest(game_tag_counters.value, excluded.value), updated_at = now();

  for r in
    select distinct x.uid
      from (select p.user_id as uid from jackpot_pulls p
            union select up.user_id from user_posters up
            union select c.user_id from game_tag_counters c) x
  loop
    perform award_jackpot_game_tags(r.uid, array['spins', 'lucky_spins', 'legendary_pulls', 'effect_posters', 'posters', 'trades']);
  end loop;

  perform set_config('cineoracle.game_tags_silent', 'off', true);
end;
$$;
