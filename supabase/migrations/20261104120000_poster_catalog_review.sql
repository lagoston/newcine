-- 04/11/2026 — Pedido do Bruno: "ver todos os pôsteres que adicionamos até agora lado a
-- lado em suas respectivas categorias, para ver como eles estão funcionando como um
-- conjunto". A página /curadoria/posteres do site (só para os testadores do Poster
-- Jackpot) lê o catálogo inteiro por esta função: os pôsteres da roleta e os
-- exclusivos do Pôster Poker, ativos ou não, com título, ano, número de colecionador,
-- o lote em que entraram e quantas pessoas têm cada um (qualquer versão).
--
-- O lote sai da data de cadastro: cada migração de lote insere tudo na mesma
-- transação, com o mesmo created_at. Os exclusivos do pôquer ficam fora da contagem
-- de lotes (lote null).
create or replace function public.get_poster_catalog_review()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not exists (select 1 from poster_jackpot_settings s where s.id and v_uid = any (coalesce(s.testers, '{}'))) then
    raise exception 'forbidden';
  end if;
  return jsonb_build_object(
    'goal', jsonb_build_object('common', 80, 'rare', 60, 'epic', 40, 'legendary', 20),
    'posters', (
      select coalesce(jsonb_agg(poster_item_json(pi) || jsonb_build_object(
               'is_active', pi.is_active,
               'exclusive', pi.exclusive,
               'batch', b.batch,
               'added_at', pi.created_at,
               'owners', (select count(distinct up.user_id) from user_posters up
                           where up.item_id = pi.id and up.reset_at is null))
             order by array_position(array['legendary', 'epic', 'rare', 'common'], pi.rarity), pi.serial), '[]'::jsonb)
        from poster_items pi
        left join (select x.created_at, dense_rank() over (order by x.created_at)::int as batch
                     from (select distinct created_at from poster_items where exclusive is null) x) b
          on b.created_at = pi.created_at and pi.exclusive is null));
end;
$$;
revoke all on function public.get_poster_catalog_review() from public, anon;
grant execute on function public.get_poster_catalog_review() to authenticated;
