-- 19/11/2026 — Protocolo Reborn, onda 3 do banco (rede.md, A6): as tags
-- calculadas no servidor, parte 2 de 2 (gravar o que desbloqueou).
--
-- Hoje o aparelho calcula quais tags a pessoa desbloqueou e manda a lista ao
-- banco (sync_unlocked_tags_from_home na Home, sync_unlocked_tags_and_notify
-- no modal de Tags). O banco confia na lista: só as tags de Jogos são
-- conferidas (normalize_synced_tags). Qualquer conta logada pode se dar uma
-- tag básica, temática, de comunidade ou de oráculo — e o sussurro e o story
-- de conquista que vêm junto — mandando o nome certo. É um achado de
-- segurança da auditoria; esta migração NÃO fecha o furo (as funções antigas
-- continuam iguais para o APK antigo), só cria o caminho sem ele.
--
-- sync_my_tags() não recebe lista: o banco calcula o progresso
-- (get_tag_progress), tira dele as tags desbloqueadas com a mesma regra do
-- unlockedPinsFrom do site (tag_pins_from_progress) e entrega essa lista à
-- função antiga. Por isso os efeitos são os mesmos por construção: registro
-- em user_unlocked_tags, um sussurro 'tag_unlocked' por tag nova, o story de
-- conquista (básicas, temáticas, comunidade, oráculo e jogos) e, na primeira
-- vez da pessoa, só o registro, sem aviso. Devolve o mesmo número (quantas
-- tags novas viraram aviso).
--   sync_my_tags()      = sync_unlocked_tags_from_home (a Home)
--   sync_my_tags(true)  = sync_unlocked_tags_and_notify (o modal de Tags)
--
-- RPCs NOVAS (só acréscimo). SECURITY DEFINER com auth.uid() fixo.

create or replace function public.tag_pins_from_progress(p_progress jsonb)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(x.pin order by x.grp, x.ord), '[]'::jsonb)
    from (
      -- básicas: as sem condição contam títulos avaliados
      select 1 as grp, r.sort::bigint as ord,
             jsonb_build_object('category', 'basic', 'name', coalesce(r.name, r.tag_key), 'emoji', r.emoji) as pin
        from tag_rules r
       where r.category = 'basic'
         and case when r.kind = 'rated' then coalesce((p_progress ->> 'ratedCount')::numeric, 0)
                  else coalesce((p_progress -> 'basic' ->> r.tag_key)::numeric, 0) end >= r.goal
      union all
      select 2, r.sort, jsonb_build_object('category', 'theme', 'name', coalesce(r.name, r.tag_key), 'emoji', r.emoji)
        from tag_rules r
       where r.category = 'theme' and coalesce((p_progress -> 'theme' ->> r.tag_key)::numeric, 0) >= r.goal
      union all
      select 3, r.sort, jsonb_build_object('category', 'community', 'name', coalesce(r.name, r.tag_key), 'emoji', r.emoji)
        from tag_rules r
       where r.category = 'community' and coalesce((p_progress ->> 'followers')::numeric, 0) >= r.goal
      union all
      select 4, r.sort, jsonb_build_object('category', 'oracle', 'name', coalesce(r.name, r.tag_key), 'emoji', r.emoji)
        from tag_rules r
       where r.category = 'oracle' and coalesce((p_progress -> 'oracle' ->> r.tag_key)::numeric, 0) >= r.goal
      union all
      select 5, g.ord, jsonb_build_object('category', 'games', 'name', g.tag ->> 'name', 'emoji', g.tag ->> 'emoji')
        from jsonb_array_elements(coalesce(p_progress -> 'gameTags', '[]'::jsonb)) with ordinality g(tag, ord)
       where (g.tag ->> 'is_unlocked')::boolean
      union all
      select 6, s.ord, jsonb_build_object('category', 'special', 'name', s.tag ->> 'name', 'emoji', s.tag ->> 'emoji')
        from jsonb_array_elements(coalesce(p_progress -> 'specialTags', '[]'::jsonb)) with ordinality s(tag, ord)
       where (s.tag ->> 'is_unlocked')::boolean
    ) x;
$function$;

revoke all on function public.tag_pins_from_progress(jsonb) from public, anon, authenticated;

comment on function public.tag_pins_from_progress(jsonb) is
  '19/11/2026 (Reborn): as tags desbloqueadas de um TagProgress — a regra de unlockedPinsFrom (src/lib/tagProgress.ts). Uso interno de sync_my_tags.';

create or replace function public.sync_my_tags(p_notify_first boolean default false)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_pins jsonb;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  v_pins := tag_pins_from_progress(get_tag_progress());
  if jsonb_array_length(v_pins) = 0 then
    return 0;  -- como no site: sem tag nenhuma, nada a registrar
  end if;

  if coalesce(p_notify_first, false) then
    return sync_unlocked_tags_and_notify(v_uid, v_pins);
  end if;
  return sync_unlocked_tags_from_home(v_uid, v_pins);
end;
$function$;

revoke all on function public.sync_my_tags(boolean) from public, anon;
grant execute on function public.sync_my_tags(boolean) to authenticated, service_role;

comment on function public.sync_my_tags(boolean) is
  '19/11/2026 (Reborn): registra e avisa as tags que a pessoa logada desbloqueou, calculadas no banco (sem lista do aparelho). Mesmos efeitos e mesmo retorno de sync_unlocked_tags_from_home; com true, os de sync_unlocked_tags_and_notify.';
