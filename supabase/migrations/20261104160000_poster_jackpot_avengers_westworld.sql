-- 04/11/2026 (15h20) — Pedido do Bruno: arte nova para Os Vingadores e para Westworld
-- (arquivos conferidos no TMDB /images) e Westworld troca número e raridade com
-- Três Homens em Conflito: Westworld (Comum 038) vira Raro 013, Três Homens em
-- Conflito (Raro 013) vira Comum 038. Quem tem continua tendo (em 04/11, 1 pessoa
-- tinha o Três Homens em Conflito e 1 tinha Os Vingadores; ninguém tinha Westworld).

update poster_items set file_path = '/ogU1VYnsWs6ZM2rDUfi5D82kTdI.jpg'
 where id = 71 and tmdb_id = 24428 and file_path = '/q4xuhyjfMqbkm6o6Rx548EREJw0.jpg';   -- Os Vingadores (Raro 017)
update poster_items set file_path = '/rBWoQYULA3dQWehmZbqeuE6v41S.jpg'
 where id = 94 and tmdb_id = 63247 and file_path = '/kYacwb1n1fJ9q6WuPHHfxO3RCEL.jpg';    -- Westworld (série)

-- A troca: o gatilho dá um número provisório quando a raridade muda; logo depois cada
-- um fica com o número do outro. A trava confere o estado de antes.
do $$
begin
  if (select rarity || ':' || serial from poster_items where id = 94) <> 'common:38'
     or (select rarity || ':' || serial from poster_items where id = 52) <> 'rare:13' then
    raise exception 'Westworld ↔ Três Homens em Conflito: estado inesperado';
  end if;
  update poster_items set rarity = 'rare' where id = 94;
  update poster_items set rarity = 'common' where id = 52;
  update poster_items set serial = 13 where id = 94;
  update poster_items set serial = 38 where id = 52;
end $$;
