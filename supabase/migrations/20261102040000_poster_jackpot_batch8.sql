-- Poster Jackpot: oitavo lote (02/11/2026), mandado pelo Bruno.
-- O file_path foi conferido na lista de pôsteres do título no TMDB
-- (tmdb-proxy via pg_net). O número de colecionador sai do gatilho
-- poster_items_serial (próximo épico).

insert into public.poster_items (media_type, tmdb_id, rarity, file_path) values
  ('movie', 10009, 'epic', '/sUMxWH5KWUlP7WEAV5aHtI2eNIb.jpg')    -- Irmão Urso (Brother Bear, 2003)
on conflict (file_path) do nothing;
