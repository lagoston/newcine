-- Halloween: além dos 30 filmes da lista, valem os filmes da prateleira
-- Sombrio e Assustador dos três oráculos (11/10/2026, pedido do Bruno).
--
-- 1. seasonal_events.bonus_moods: humores cujas prateleiras também contam
--    para o evento. Halloween = {dark-and-scary}; Natal continua só a lista.
-- 2. seasonal_event_counts_movie(): "este filme conta para o evento?" —
--    está na lista da edição OU numa prateleira de um bonus_mood.
--    record_seasonal_action e revalidate_seasonal_tags_for_movie passam a
--    usar essa regra (o compromisso com os filmes vale igual: tirar a nota
--    de um filme de Sombrio e Assustador que contou desfaz a missão).
-- 3. get_seasonal_event_state devolve bonus_moods (o painel mostra o atalho).
-- 4. As missões de presente continuam olhando só a lista (seasonal_pre_rated).
-- 5. Ajuste retroativo: quem deu a 1ª nota a um filme de Sombrio e
--    Assustador fora da lista entre 01/10 e agora ganha a ação 'rate' com a
--    data dessa nota (vinda de prediction_accuracy_log, que registra
--    exatamente a 1ª nota de cada filme), e as tags são concedidas na hora.

alter table public.seasonal_events
  add column if not exists bonus_moods text[] not null default '{}';

comment on column public.seasonal_events.bonus_moods is
  'Humores (recommendation_pools.mood_key) cujos filmes também contam para o evento, além da lista da edição.';

update public.seasonal_events set bonus_moods = array['dark-and-scary'] where id = 'halloween';

create or replace function public.seasonal_event_counts_movie(p_event_id text, p_edition integer, p_movie_id integer)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select coalesce(public.seasonal_event_list(p_event_id, p_edition) @> to_jsonb(p_movie_id), false)
      or exists (
        select 1
        from public.seasonal_events se
        join public.recommendation_pools rp on rp.mood_key = any (se.bonus_moods)
        where se.id = p_event_id
          and rp.movie_ids @> to_jsonb(p_movie_id));
$function$;

create or replace function public.record_seasonal_action(p_user_id uuid, p_kind text, p_movie_id integer)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  ev record;
  w record;
begin
  for ev in select se.id from public.seasonal_events se where se.enabled loop
    select * into w from public.seasonal_event_window(ev.id);
    if w.is_active and public.seasonal_event_counts_movie(ev.id, w.edition, p_movie_id) then
      insert into public.seasonal_event_actions (user_id, event_id, edition, kind, movie_id)
      values (p_user_id, ev.id, w.edition, p_kind, p_movie_id)
      on conflict do nothing;
      perform public.grant_seasonal_tags(p_user_id, ev.id, w.edition);
    end if;
  end loop;
end;
$function$;

create or replace function public.revalidate_seasonal_tags_for_movie(p_user_id uuid, p_movie_id integer)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  ev record;
  w record;
begin
  for ev in select se.id from public.seasonal_events se where se.enabled loop
    select * into w from public.seasonal_event_window(ev.id);
    if w.is_active and public.seasonal_event_counts_movie(ev.id, w.edition, p_movie_id) then
      perform public.revalidate_seasonal_tags(p_user_id, ev.id);
    end if;
  end loop;
end;
$function$;

-- get_seasonal_event_state: acrescenta bonus_moods ao que vai para o site.
do $$
declare
  d text;
begin
  d := pg_get_functiondef('public.get_seasonal_event_state(text)'::regprocedure);
  if position('''bonus_moods''' in d) = 0 then
    if position('''decoration_tag'', deco,' in d) = 0 then
      raise exception 'trecho decoration_tag não encontrado em get_seasonal_event_state';
    end if;
    d := replace(d, '''decoration_tag'', deco,', '''bonus_moods'', to_jsonb(coalesce(e.bonus_moods, ''{}''::text[])),' || chr(10) || '    ''decoration_tag'', deco,');
    execute d;
  end if;
end $$;

-- Textos das tags (modal de Tags).
update public.special_tags set
  description = 'Rated the 1st film of the Halloween ritual (from the selection or Dark & Scary)',
  description_pt = 'Avaliou o 1º filme do ritual de Halloween (da seleção ou de Sombrio e Assustador)'
where id = 'scary-clown';

update public.special_tags set
  description = 'Rated 2 films of the Halloween ritual (from the selection or Dark & Scary)',
  description_pt = 'Avaliou 2 filmes do ritual de Halloween (da seleção ou de Sombrio e Assustador)'
where id = 'deadly-sleeping';

-- Ajuste retroativo da edição no ar.
do $$
declare
  w record;
  r record;
begin
  select * into w from public.seasonal_event_window('halloween');
  if not w.is_active then
    return;
  end if;

  insert into public.seasonal_event_actions (user_id, event_id, edition, kind, movie_id, created_at)
  select um.user_id, 'halloween', w.edition, 'rate', um.movie_id, l.first_at
  from public.user_movies um
  cross join lateral (
    select min(pal.created_at) first_at
    from public.prediction_accuracy_log pal
    where pal.user_id = um.user_id
      and pal.movie_id = um.movie_id
      and coalesce(pal.media_type, 'movie') = 'movie'
      and pal.created_at >= w.starts_at
      and pal.created_at < least(w.ends_at, now())
  ) l
  where l.first_at is not null
    and coalesce(um.media_type, 'movie') = 'movie'
    and um.rating is not null
    and not exists (select 1 from public.bot_accounts b where b.user_id = um.user_id)
    and not (public.seasonal_event_list('halloween', w.edition) @> to_jsonb(um.movie_id))
    and public.seasonal_event_counts_movie('halloween', w.edition, um.movie_id)
  on conflict do nothing;

  for r in
    select distinct a.user_id
    from public.seasonal_event_actions a
    where a.event_id = 'halloween' and a.edition = w.edition
  loop
    perform public.grant_seasonal_tags(r.user_id, 'halloween', w.edition);
  end loop;
end $$;
