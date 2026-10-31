-- Poster Jackpot: número de colecionador em cada pôster (31/10/2026).
--
-- Pedido do Bruno: os pôsteres ganham um número pequeno no canto, com a
-- marca de colecionável (o cristal da raridade) ao lado. A forma de numerar
-- ficou por nossa conta. A escolha:
--
--   • numeração por raridade, na ordem em que o pôster entrou no catálogo:
--     Lendário nº 1, 2, 3…; Épico nº 1, 2, 3…; e assim por diante. O cristal
--     diz a raridade e o número diz "qual deles" — como nos álbuns e cartas
--     colecionáveis;
--   • o número nunca muda: pôsteres novos ganham o próximo da raridade
--     dele; um pôster tirado do sorteio (is_active = false) guarda o número
--     (fica "aposentado", sem reaproveitar);
--   • se a raridade de um pôster for trocada, ele ganha o próximo número da
--     raridade nova (o antigo fica vago).
-- Os atuais foram numerados pela ordem de entrada (o id), lote a lote, na
-- ordem em que o Bruno mandou.

alter table public.poster_items add column if not exists serial integer;

update public.poster_items p
   set serial = s.n
  from (select id, row_number() over (partition by rarity order by id) as n from public.poster_items) s
 where s.id = p.id and p.serial is null;

create unique index if not exists poster_items_rarity_serial on public.poster_items (rarity, serial);

create or replace function public.poster_items_assign_serial()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' and new.serial is not null then
    return new;
  end if;
  if tg_op = 'INSERT' or new.rarity is distinct from old.rarity then
    perform pg_advisory_xact_lock(hashtext('poster_serial:' || new.rarity));
    select coalesce(max(serial), 0) + 1 into new.serial from poster_items where rarity = new.rarity;
  end if;
  return new;
end;
$$;

create or replace trigger poster_items_serial
  before insert or update of rarity on public.poster_items
  for each row execute function public.poster_items_assign_serial();

-- O número vai junto em todo lugar que mostra um pôster.
create or replace function public.poster_item_json(p_item poster_items)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', p_item.id, 'media_type', p_item.media_type, 'tmdb_id', p_item.tmdb_id,
    'rarity', p_item.rarity, 'serial', p_item.serial, 'file_path', p_item.file_path,
    'title_pt', coalesce(mc.title_pt, mc.title_en), 'title_en', coalesce(mc.title_en, mc.title_pt),
    'year', extract(year from mc.release_date)::int)
  from (select 1) one
  left join movie_cache mc on mc.tmdb_id = p_item.tmdb_id and mc.media_type = p_item.media_type;
$$;

create or replace function public.get_jackpot_catalog()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when not jackpot_enabled(auth.uid()) then '[]'::jsonb else
    coalesce((select jsonb_agg(jsonb_build_object('id', pi.id, 'rarity', pi.rarity, 'serial', pi.serial, 'file_path', pi.file_path,
                                                  'media_type', pi.media_type, 'tmdb_id', pi.tmdb_id))
                from poster_items pi where pi.is_active), '[]'::jsonb)
  end;
$$;

create or replace function public.get_equipped_posters(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when not can_view_user_content(p_user_id) then '[]'::jsonb else
    coalesce((select jsonb_agg(jsonb_build_object('media_type', e.media_type, 'tmdb_id', e.tmdb_id, 'item_id', e.item_id,
                                                  'effect', e.effect, 'rarity', pi.rarity, 'serial', pi.serial, 'file_path', pi.file_path))
                from user_poster_equips e
                join poster_items pi on pi.id = e.item_id
                join user_posters up on up.user_id = e.user_id and up.item_id = e.item_id and up.effect = e.effect and up.reset_at is null
               where e.user_id = p_user_id and e.active), '[]'::jsonb)
  end;
$$;
