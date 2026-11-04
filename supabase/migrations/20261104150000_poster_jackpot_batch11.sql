-- 04/11/2026 (14h31) — Pedido do Bruno: trocas de raridade e de posição, duas artes
-- novas, o lote 11 e as pools dos oráculos. Arquivos conferidos no TMDB (/images)
-- antes; o do 12 Macacos não aparece mais na lista de pôsteres do filme no TMDB, mas a
-- imagem abre normalmente (conferido pela CDN), então entrou como o Bruno mandou.
-- Fecha o catálogo em 205 pôsteres na roleta: 80 comuns, 60 raros, 40 épicos e 25
-- lendários (mais os 9 exclusivos do Pôster Poker).

-- 1. Seis pares trocam de raridade e de número ("inverter de raridade e posição"):
--    Laranja Mecânica ↔ Up, Blade Runner 2049 ↔ Invencível, A Viagem de Chihiro ↔
--    Jurassic Park, Matrix ↔ Stranger Things, A Hora do Mal ↔ Homem de Ferro,
--    Psicose ↔ Meninas Malvadas. O gatilho dá um número provisório quando a raridade
--    muda; logo depois cada um fica com o número do outro. Quem tem um desses pôsteres
--    continua tendo, agora na raridade nova (em 04/11, só a Viagem de Chihiro tinha
--    dono). A trava confere o estado de antes, para a troca nunca rodar duas vezes.
do $$
declare
  pairs int[] := array[60, 38,  108, 191,  63, 216,  59, 65,  176, 99,  48, 194];
  expect text[] := array['epic:12', 'common:15',  'epic:18', 'legendary:24',  'legendary:14', 'rare:49',
                         'legendary:12', 'epic:13',  'rare:37', 'common:40',  'epic:8', 'common:69'];
  a int; b int; ra text; sa int; rb text; sb int; i int;
begin
  for i in 0..5 loop
    a := pairs[i * 2 + 1]; b := pairs[i * 2 + 2];
    select rarity, serial into ra, sa from poster_items where id = a;
    select rarity, serial into rb, sb from poster_items where id = b;
    if ra || ':' || sa <> expect[i * 2 + 1] or rb || ':' || sb <> expect[i * 2 + 2] then
      raise exception 'troca % ↔ %: estado inesperado (%:% / %:%)', a, b, ra, sa, rb, sb;
    end if;
    update poster_items set rarity = rb where id = a;
    update poster_items set rarity = ra where id = b;
    update poster_items set serial = sb where id = a;
    update poster_items set serial = sa where id = b;
  end loop;
end $$;

-- 2. Artes novas no próprio pôster (o número e quem tem continuam):
update poster_items set file_path = '/7ASlGCxAAaN1HzquQw00KXS5tIr.jpg'
 where id = 202 and tmdb_id = 598 and file_path = '/yY8Fp644mPNX8HP8O7cu2ksMq3y.jpg';   -- Cidade de Deus (Lendário)
update poster_items set file_path = '/kpm1q8vC6D9QAGLyucCTMH5gi6y.jpg'
 where id = 10 and tmdb_id = 106646 and file_path = '/9o9E3Szf7VkNFKU4wbqWnyxzaV3.jpg'; -- O Lobo de Wall Street (Comum 003)

-- 3. Lote 11, na ordem do Bruno (é ela que define os números).
insert into poster_items (media_type, tmdb_id, rarity, file_path) values ('tv', 1416, 'rare', '/mrgk0yPmSblKw9T0yAMtcKIY9Sv.jpg') on conflict (file_path) do nothing; -- Grey's Anatomy (série)
insert into poster_items (media_type, tmdb_id, rarity, file_path) values ('tv', 2316, 'rare', '/gfgbx5qSRqKiIk0TwWeVIlFp1vV.jpg') on conflict (file_path) do nothing; -- The Office (série)
insert into poster_items (media_type, tmdb_id, rarity, file_path) values ('tv', 87108, 'rare', '/w9PyruPBfPC9SMi2VFSrx4veggE.jpg') on conflict (file_path) do nothing; -- Chernobyl (série)
insert into poster_items (media_type, tmdb_id, rarity, file_path) values ('movie', 496243, 'rare', '/rSk3usNUWriGlbJfHrZCtJ0Sk6s.jpg') on conflict (file_path) do nothing; -- Parasita
insert into poster_items (media_type, tmdb_id, rarity, file_path) values ('movie', 78, 'epic', '/4EwTF31tnul7XNgwFCLcmQwGPti.jpg') on conflict (file_path) do nothing; -- Blade Runner (1982)
insert into poster_items (media_type, tmdb_id, rarity, file_path) values ('movie', 24, 'legendary', '/swkDZBD4Rf685fYwsQwqochkLkX.jpg') on conflict (file_path) do nothing; -- Kill Bill: Volume 1
insert into poster_items (media_type, tmdb_id, rarity, file_path) values ('tv', 95396, 'rare', '/yMEJr7LBZcwOSR0S3VHa23cmEJ8.jpg') on conflict (file_path) do nothing; -- Ruptura (série)
insert into poster_items (media_type, tmdb_id, rarity, file_path) values ('movie', 312221, 'rare', '/lLhUGVu4IFvOmvPxG1sNyCIgOdN.jpg') on conflict (file_path) do nothing; -- Creed: Nascido para Lutar
insert into poster_items (media_type, tmdb_id, rarity, file_path) values ('movie', 339403, 'epic', '/pqtMmpclUka4CfwuDRKi1mOCcKD.jpg') on conflict (file_path) do nothing; -- Em Ritmo de Fuga
insert into poster_items (media_type, tmdb_id, rarity, file_path) values ('movie', 39254, 'rare', '/29elLgSWqcNeev5xhoBsNya8i9E.jpg') on conflict (file_path) do nothing; -- Gigantes de Aço
insert into poster_items (media_type, tmdb_id, rarity, file_path) values ('movie', 27205, 'rare', '/4i1I0cvwYhUTVbU5Qe6HbD1audF.jpg') on conflict (file_path) do nothing; -- A Origem
insert into poster_items (media_type, tmdb_id, rarity, file_path) values ('movie', 12, 'rare', '/9S5aRtfExWuQEf1jTAoY6k2piyI.jpg') on conflict (file_path) do nothing; -- Procurando Nemo

-- No Limite do Amanhã no lugar do Star Wars comum ("substitua"): o próprio pôster
-- (Comum 004) vira o novo filme. Em 04/11 só o Tonico (conta de teste do Bruno) tinha o
-- Star Wars comum, sem equipar; ele passa a ter o No Limite do Amanhã.
update poster_items set tmdb_id = 137113, file_path = '/vfpKz4rJK8KnoOCrkwlBtpQfKdu.jpg'
 where id = 13 and media_type = 'movie' and tmdb_id = 11 and rarity = 'common' and file_path = '/n0fP2rSekfbhVhxtnoQD00cdkEh.jpg';
update user_poster_equips set active = false where item_id = 13 and active;

insert into poster_items (media_type, tmdb_id, rarity, file_path) values ('movie', 63, 'rare', '/l4NSVm3tlJ4nYaLkJJAaJPhx6XH.jpg') on conflict (file_path) do nothing; -- Os 12 Macacos
insert into poster_items (media_type, tmdb_id, rarity, file_path) values ('movie', 545611, 'rare', '/c7D9Pl2Ci1AcMPkL4Jgsf8cXgpw.jpg') on conflict (file_path) do nothing; -- Tudo em Todo o Lugar ao Mesmo Tempo
insert into poster_items (media_type, tmdb_id, rarity, file_path) values ('movie', 1422, 'rare', '/8AO7k8iPWnbzeXAKZ2qY94DkwQO.jpg') on conflict (file_path) do nothing; -- Os Infiltrados

-- La La Land vira o último raro (o gatilho dá o próximo número da raridade) e Dexter
-- entra como comum no lugar dele (o número que o La La Land deixou, 023).
update poster_items set rarity = 'rare' where id = 66 and tmdb_id = 313369 and rarity = 'common' and serial = 23;
insert into poster_items (media_type, tmdb_id, rarity, file_path, serial)
values ('tv', 1405, 'common', '/danlrb3gHGIz35jW39rfRxtQoxQ.jpg', 23)
on conflict (file_path) do nothing; -- Dexter (série)

-- 4. Pools dos oráculos: todo título com pôster colecionável precisa estar numa
--    prateleira. Em 04/11 só faltavam dois, ambos exclusivos do Pôster Poker, filmes
--    dos EUA antes de 2000 com mais de 200 votos: Fincher, pela regra de sempre. Humor
--    pelos vizinhos do pôquer (Rain Man e Cassino moram na Catarse do Fincher).
update recommendation_pools set movie_ids = coalesce(movie_ids, '[]'::jsonb) || to_jsonb(11873)
 where card_type = 'fincher' and mood_key = 'catharsis' and not coalesce(movie_ids, '[]'::jsonb) @> to_jsonb(11873);   -- A Cor do Dinheiro (1986)
update recommendation_pools set movie_ids = coalesce(movie_ids, '[]'::jsonb) || to_jsonb(10220)
 where card_type = 'fincher' and mood_key = 'adrenaline' and not coalesce(movie_ids, '[]'::jsonb) @> to_jsonb(10220);  -- Cartas na Mesa (Rounders, 1998)
