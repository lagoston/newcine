-- Fotos dos personagens das 84 personalidades (21/10/2026).
--
-- Em vez da capa do filme, cada personalidade passa a mostrar o próprio
-- personagem: uma imagem do TMDB (backdrop ou pôster, escolhida a olho entre
-- as candidatas de cada filme) e o ponto de enquadramento para o recorte 4:5
-- dos cartões (object-position CSS). Junto vêm as obras das prateleiras em que
-- o personagem aparece (o filme dele primeiro), o ator e o id do ator no TMDB.
--
-- Já aplicada no banco como persona_character_photos_columns; este arquivo é o
-- registro no repositório, com os dados finais das 84.

alter table public.cine_personas add column if not exists character_image_path text;
alter table public.cine_personas add column if not exists character_image_focus text;
alter table public.cine_personas add column if not exists actor_name text;
alter table public.cine_personas add column if not exists actor_tmdb_id integer;
alter table public.cine_personas add column if not exists works jsonb not null default '[]'::jsonb;

-- A personalidade de alguém, agora com as obras do personagem que quem está olhando já avaliou.
create or replace function public.get_user_persona(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_viewer uuid := auth.uid();
  v_prof record;
  v_persona jsonb;
  v_seen jsonb := '{}'::jsonb;
begin
  select p.id, p.personalidade_completa, p.persona_scores, p.persona_counted, p.profile_visibility
    into v_prof
    from profiles p
   where p.id = p_user_id;
  if not found then
    return null;
  end if;

  if v_viewer is distinct from p_user_id
     and coalesce(v_prof.profile_visibility, 'public') <> 'public'
     and not (v_prof.profile_visibility = 'friends_only' and v_viewer is not null and are_friends(v_viewer, p_user_id)) then
    return null;
  end if;

  select to_jsonb(cp) into v_persona from cine_personas cp where cp.code = v_prof.personalidade_completa;

  if v_persona is not null and v_viewer is not null then
    select coalesce(jsonb_object_agg(um.media_type || ':' || um.movie_id, um.rating), '{}'::jsonb)
      into v_seen
      from jsonb_array_elements(coalesce(v_persona -> 'works', '[]'::jsonb)) w
      join user_movies um on um.user_id = v_viewer and um.movie_id = (w ->> 'id')::int and um.media_type = (w ->> 'type');
  end if;

  return jsonb_build_object(
    'code', case when v_persona is not null then v_prof.personalidade_completa end,
    'counted', coalesce(v_prof.persona_counted, 0),
    'threshold', 10,
    'scores', coalesce(v_prof.persona_scores, '[]'::jsonb),
    'persona', v_persona,
    'works_seen', v_seen
  );
end;
$$;

-- O catálogo das 84 com tudo (foto do personagem e obras). A get_personas_global_stats antiga
-- fica igual, para os apps instalados.
create or replace function public.get_personas_catalog()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(to_jsonb(cp) || jsonb_build_object('user_count', coalesce(c.n, 0)) order by cp.sort_order), '[]'::jsonb)
    from cine_personas cp
    left join (
      select p.personalidade_completa, count(*) as n
        from profiles p
       where p.personalidade_completa is not null
       group by p.personalidade_completa
    ) c on c.personalidade_completa = cp.code;
$$;

grant execute on function public.get_personas_catalog() to anon, authenticated;

-- Os dados das 84.
update public.cine_personas set actor_name = 'Jake Gyllenhaal', actor_tmdb_id = 131, character_image_path = '/3qau6s5IDXqHPjT7X63hDIgqK3c.jpg', character_image_focus = '17% 50%', works = '[{"id": 141, "type": "movie"}]'::jsonb where code = 'MXP';
update public.cine_personas set actor_name = 'Keir Dullea', actor_tmdb_id = 245, character_image_path = '/6gyZF4SeifiUUYDELkCS8nOqsu2.jpg', character_image_focus = '50% 50%', works = '[{"id": 62, "type": "movie"}, {"id": 4437, "type": "movie"}]'::jsonb where code = 'MXA';
update public.cine_personas set actor_name = 'Bruce Willis', actor_tmdb_id = 62, character_image_path = '/grG6sAPaJXcm2bHOzzKAFt0xhUn.jpg', character_image_focus = '75% 50%', works = '[{"id": 745, "type": "movie"}]'::jsonb where code = 'MXC';
update public.cine_personas set actor_name = 'Guy Pearce', actor_tmdb_id = 529, character_image_path = '/v4u9FnSOpLEjPIAhbKClM45LJoJ.jpg', character_image_focus = '65% 50%', works = '[{"id": 77, "type": "movie"}]'::jsonb where code = 'MXZ';
update public.cine_personas set actor_name = 'James Stewart', actor_tmdb_id = 854, character_image_path = '/xHi7g5ZbEJJaABeeVAdfZYVKV0v.jpg', character_image_focus = '50% 0%', works = '[{"id": 426, "type": "movie"}]'::jsonb where code = 'MXR';
update public.cine_personas set actor_name = 'Dakota Fanning', actor_tmdb_id = 501, character_image_path = '/hofnlIyF6bePkgQOpcuRWLvzf15.jpg', character_image_focus = '48% 50%', works = '[{"id": 14836, "type": "movie"}]'::jsonb where code = 'MXF';
update public.cine_personas set actor_name = 'Fran Kranz', actor_tmdb_id = 51533, character_image_path = '/5NvddmcPzVtbC5Cry7PjeLVX5RM.jpg', character_image_focus = '55% 50%', works = '[{"id": 22970, "type": "movie"}]'::jsonb where code = 'MXL';
update public.cine_personas set actor_name = 'Benedict Cumberbatch', actor_tmdb_id = 71580, character_image_path = '/3TNsOfumoXZCTgJb0MrfNv6n0r2.jpg', character_image_focus = '50% 0%', works = '[{"id": 284052, "type": "movie"}, {"id": 284053, "type": "movie"}, {"id": 299536, "type": "movie"}, {"id": 299534, "type": "movie"}, {"id": 91363, "type": "tv"}, {"id": 634649, "type": "movie"}, {"id": 453395, "type": "movie"}]'::jsonb where code = 'MPA';
update public.cine_personas set actor_name = 'Nathaniel Brown', actor_tmdb_id = 112741, character_image_path = '/dgQHZXPqyS8eQI6vuud8WOGkZIs.jpg', character_image_focus = '50% 20%', works = '[{"id": 34647, "type": "movie"}]'::jsonb where code = 'MPC';
update public.cine_personas set actor_name = 'Scarlett Johansson', actor_tmdb_id = 1245, character_image_path = '/4QHsKdTeN4APmHwXnhF5RErCwhP.jpg', character_image_focus = '94% 50%', works = '[{"id": 240832, "type": "movie"}]'::jsonb where code = 'MPZ';
update public.cine_personas set actor_name = 'Gael García Bernal', actor_tmdb_id = 258, character_image_path = '/grVoyB0mVN5a5sdKvVIJsNyeG3Z.jpg', character_image_focus = '19% 50%', works = '[{"id": 300, "type": "movie"}]'::jsonb where code = 'MPR';
update public.cine_personas set actor_name = 'Gene Wilder', actor_tmdb_id = 3460, character_image_path = '/8olKZYJEbDw4WVNoyIm8dZEr9o.jpg', character_image_focus = '50% 0%', works = '[{"id": 252, "type": "movie"}, {"id": 118, "type": "movie"}, {"id": 787699, "type": "movie"}]'::jsonb where code = 'MPF';
update public.cine_personas set actor_name = 'Michelle Yeoh', actor_tmdb_id = 1620, character_image_path = '/fIwiFha3WPu5nHkBeMQ4GzEk0Hv.jpg', character_image_focus = '65% 50%', works = '[{"id": 545611, "type": "movie"}]'::jsonb where code = 'MPL';
update public.cine_personas set actor_name = 'Jodie Foster', actor_tmdb_id = 1038, character_image_path = '/aOzTr5FxlS06ppd5a5KaqKwOPgx.jpg', character_image_focus = '6% 50%', works = '[{"id": 686, "type": "movie"}]'::jsonb where code = 'MAC';
update public.cine_personas set actor_name = 'Keanu Reeves', actor_tmdb_id = 6384, character_image_path = '/fNG7i7RqMErkcqhohV2a6cV1Ehy.jpg', character_image_focus = '50% 50%', works = '[{"id": 603, "type": "movie"}, {"id": 604, "type": "movie"}, {"id": 605, "type": "movie"}, {"id": 55931, "type": "movie"}, {"id": 624860, "type": "movie"}]'::jsonb where code = 'MAZ';
update public.cine_personas set actor_name = 'Ryunosuke Kamiki', actor_tmdb_id = 225730, character_image_path = '/kacVpZhp9KoRJUGfIdo1c1fk1tC.jpg', character_image_focus = '50% 0%', works = '[{"id": 372058, "type": "movie"}, {"id": 568160, "type": "movie"}]'::jsonb where code = 'MAR';
update public.cine_personas set actor_name = 'Michael J. Fox', actor_tmdb_id = 521, character_image_path = '/QCqjm2JMaN6qptzMjmPuWXsMFA.jpg', character_image_focus = '63% 50%', works = '[{"id": 105, "type": "movie"}, {"id": 165, "type": "movie"}, {"id": 196, "type": "movie"}]'::jsonb where code = 'MAF';
update public.cine_personas set actor_name = 'Martin Freeman', actor_tmdb_id = 7060, character_image_path = '/tvI85xGm6KezHuHzfHEGNv5pzFc.jpg', character_image_focus = '68% 50%', works = '[{"id": 7453, "type": "movie"}, {"id": 2048, "type": "tv"}]'::jsonb where code = 'MAL';
update public.cine_personas set actor_name = 'Joseph Gordon-Levitt', actor_tmdb_id = 24045, character_image_path = '/gXuGhveKaPVIZCg9qCqwQdfLtTT.jpg', character_image_focus = '50% 50%', works = '[{"id": 59967, "type": "movie"}]'::jsonb where code = 'MCZ';
update public.cine_personas set actor_name = 'Jim Carrey', actor_tmdb_id = 206, character_image_path = '/744ybMaYRry1IQKoDakMc4GEU4L.jpg', character_image_focus = '14% 50%', works = '[{"id": 38, "type": "movie"}]'::jsonb where code = 'MCR';
update public.cine_personas set actor_name = 'Kaitlyn Dias', actor_tmdb_id = 1371894, character_image_path = '/38XXVy0ERYTlAZ4OHMSa3kyR2J2.jpg', character_image_focus = '50% 50%', works = '[{"id": 150540, "type": "movie"}, {"id": 1022789, "type": "movie"}]'::jsonb where code = 'MCF';
update public.cine_personas set actor_name = 'Will Ferrell', actor_tmdb_id = 23659, character_image_path = '/d9eONXYtCmQnPWw61w9pNMGlSzK.jpg', character_image_focus = '50% 50%', works = '[{"id": 1262, "type": "movie"}]'::jsonb where code = 'MCL';
update public.cine_personas set actor_name = 'Matt Damon', actor_tmdb_id = 1892, character_image_path = '/yPAYpLofITQ9pST80ZNBGIE2pfN.jpg', character_image_focus = '0% 50%', works = '[{"id": 38050, "type": "movie"}]'::jsonb where code = 'MZR';
update public.cine_personas set actor_name = 'Shameik Moore', actor_tmdb_id = 587506, character_image_path = '/d7MZ3D85bzgNbwbKdq7ks74Smah.jpg', character_image_focus = '50% 0%', works = '[{"id": 324857, "type": "movie"}, {"id": 569094, "type": "movie"}]'::jsonb where code = 'MZF';
update public.cine_personas set actor_name = 'Will Smith', actor_tmdb_id = 2888, character_image_path = '/8r1Wglhe8RCp7VxaTyXSpmB1AzX.jpg', character_image_focus = '50% 0%', works = '[{"id": 607, "type": "movie"}, {"id": 41154, "type": "movie"}]'::jsonb where code = 'MZL';
update public.cine_personas set actor_name = 'Domhnall Gleeson', actor_tmdb_id = 93210, character_image_path = '/einbto9qLXFx9QXxEHylaxDbKPx.jpg', character_image_focus = '30% 50%', works = '[{"id": 122906, "type": "movie"}]'::jsonb where code = 'MRF';
update public.cine_personas set actor_name = 'Bill Murray', actor_tmdb_id = 1532, character_image_path = '/ttBydD0SynC0TMkW3AcnmsySkLp.jpg', character_image_focus = '25% 50%', works = '[{"id": 137, "type": "movie"}]'::jsonb where code = 'MRL';
update public.cine_personas set actor_name = 'Chris Pratt', actor_tmdb_id = 73457, character_image_path = '/zHOLA5OzTvNnaVvg5MZ30HvivXJ.jpg', character_image_focus = '50% 50%', works = '[{"id": 137106, "type": "movie"}, {"id": 280217, "type": "movie"}]'::jsonb where code = 'MFL';
update public.cine_personas set actor_name = 'Martin Sheen', actor_tmdb_id = 8349, character_image_path = '/49fzLedFVKgGgFChLMuulDJBY1c.jpg', character_image_focus = '46% 50%', works = '[{"id": 28, "type": "movie"}]'::jsonb where code = 'XPA';
update public.cine_personas set actor_name = 'Natalie Portman', actor_tmdb_id = 524, character_image_path = '/5yGEXoH9Wcq5TO4kacrRUsqWB2F.jpg', character_image_focus = '50% 0%', works = '[{"id": 44214, "type": "movie"}]'::jsonb where code = 'XPC';
update public.cine_personas set actor_name = 'Nicolas Cage', actor_tmdb_id = 2963, character_image_path = '/1XA9KiP7NDWb6Dre3RGXBGc5e9o.jpg', character_image_focus = '46% 50%', works = '[{"id": 460885, "type": "movie"}]'::jsonb where code = 'XPZ';
update public.cine_personas set actor_name = 'Gary Oldman', actor_tmdb_id = 64, character_image_path = '/1ZVsHrPyogvUMJEuuB9eCkHSwaR.jpg', character_image_focus = '17% 50%', works = '[{"id": 6114, "type": "movie"}, {"id": 138, "type": "movie"}, {"id": 3073, "type": "movie"}, {"id": 11868, "type": "movie"}, {"id": 17102, "type": "movie"}, {"id": 29778, "type": "movie"}, {"id": 29748, "type": "movie"}, {"id": 33020, "type": "movie"}, {"id": 6404, "type": "movie"}, {"id": 13509, "type": "movie"}, {"id": 7131, "type": "movie"}, {"id": 76492, "type": "movie"}, {"id": 159824, "type": "movie"}, {"id": 400155, "type": "movie"}, {"id": 585083, "type": "movie"}, {"id": 635910, "type": "movie"}, {"id": 1246049, "type": "movie"}]'::jsonb where code = 'XPR';
update public.cine_personas set actor_name = 'Mia Wasikowska', actor_tmdb_id = 76070, character_image_path = '/1WHfwCcPMZqDtUhQO3VgNh1tryd.jpg', character_image_focus = '50% 50%', works = '[{"id": 12155, "type": "movie"}, {"id": 12092, "type": "movie"}]'::jsonb where code = 'XPF';
update public.cine_personas set actor_name = 'Michael Keaton', actor_tmdb_id = 2232, character_image_path = '/9Sgr19oWCPh9m3LRWScNqWrqGDF.jpg', character_image_focus = '50% 50%', works = '[{"id": 4011, "type": "movie"}, {"id": 917496, "type": "movie"}]'::jsonb where code = 'XPL';
update public.cine_personas set actor_name = 'Ivana Baquero', actor_tmdb_id = 16970, character_image_path = '/blrRsZ1CcyURhB8zYsoS7EQWoMM.jpg', character_image_focus = '41% 50%', works = '[{"id": 1417, "type": "movie"}]'::jsonb where code = 'XAC';
update public.cine_personas set actor_name = 'Sigourney Weaver', actor_tmdb_id = 10205, character_image_path = '/Ad19RSlBqRw4tQLJmYfQN6a8vEe.jpg', character_image_focus = '50% 0%', works = '[{"id": 348, "type": "movie"}, {"id": 679, "type": "movie"}, {"id": 8077, "type": "movie"}, {"id": 8078, "type": "movie"}]'::jsonb where code = 'XAZ';
update public.cine_personas set actor_name = 'Brendan Fraser', actor_tmdb_id = 18269, character_image_path = '/pwOVw2PEHwqypHbhBJFQe158Ljb.jpg', character_image_focus = '10% 50%', works = '[{"id": 564, "type": "movie"}, {"id": 1734, "type": "movie"}]'::jsonb where code = 'XAR';
update public.cine_personas set actor_name = 'Daniel Radcliffe', actor_tmdb_id = 10980, character_image_path = '/mnGdB7sDfxq55BpMDSvhIbsGnlp.jpg', character_image_focus = '50% 20%', works = '[{"id": 671, "type": "movie"}, {"id": 672, "type": "movie"}, {"id": 673, "type": "movie"}, {"id": 674, "type": "movie"}, {"id": 675, "type": "movie"}, {"id": 767, "type": "movie"}, {"id": 12444, "type": "movie"}, {"id": 12445, "type": "movie"}]'::jsonb where code = 'XAF';
update public.cine_personas set actor_name = 'Bruce Campbell', actor_tmdb_id = 11357, character_image_path = '/j1CqN4ypo3lFJJA5C7mYJzBaXoL.jpg', character_image_focus = '54% 50%', works = '[{"id": 765, "type": "movie"}, {"id": 764, "type": "movie"}, {"id": 766, "type": "movie"}, {"id": 713704, "type": "movie"}]'::jsonb where code = 'XAL';
update public.cine_personas set actor_name = 'Christian Bale', actor_tmdb_id = 3894, character_image_path = '/9FE5eD92WfVCiivM9Pq9GVSrlWk.jpg', character_image_focus = '14% 50%', works = '[{"id": 155, "type": "movie"}, {"id": 268, "type": "movie"}, {"id": 364, "type": "movie"}, {"id": 2098, "type": "tv"}, {"id": 14919, "type": "movie"}, {"id": 4625, "type": "tv"}, {"id": 513, "type": "tv"}, {"id": 84200, "type": "tv"}, {"id": 272, "type": "movie"}, {"id": 40662, "type": "movie"}, {"id": 49026, "type": "movie"}, {"id": 123025, "type": "movie"}, {"id": 142061, "type": "movie"}, {"id": 60708, "type": "tv"}, {"id": 137106, "type": "movie"}, {"id": 251519, "type": "movie"}, {"id": 324849, "type": "movie"}, {"id": 408220, "type": "movie"}, {"id": 474395, "type": "movie"}, {"id": 280217, "type": "movie"}, {"id": 791373, "type": "movie"}, {"id": 414906, "type": "movie"}, {"id": 298618, "type": "movie"}, {"id": 125909, "type": "tv"}]'::jsonb where code = 'XCZ';
update public.cine_personas set actor_name = 'Sally Hawkins', actor_tmdb_id = 39658, character_image_path = '/tzUP1wNKYLLyHjUMScFJjrSjGfO.jpg', character_image_focus = '17% 50%', works = '[{"id": 399055, "type": "movie"}]'::jsonb where code = 'XCR';
update public.cine_personas set actor_name = 'Lewis MacDougall', actor_tmdb_id = 1523921, character_image_path = '/sBtLpesSh0pniKHGWZjgyxmtIks.jpg', character_image_focus = '79% 50%', works = '[{"id": 258230, "type": "movie"}]'::jsonb where code = 'XCF';
update public.cine_personas set actor_name = 'Roman Griffin Davis', actor_tmdb_id = 2054851, character_image_path = '/lTyikzfGgRX5ZqIfVeT26APYfRL.jpg', character_image_focus = '41% 50%', works = '[{"id": 515001, "type": "movie"}]'::jsonb where code = 'XCL';
update public.cine_personas set actor_name = 'Uma Thurman', actor_tmdb_id = 139, character_image_path = '/lVy5Zqcty2NfemqKYbVJfdg44rK.jpg', character_image_focus = '68% 50%', works = '[{"id": 24, "type": "movie"}, {"id": 393, "type": "movie"}]'::jsonb where code = 'XZR';
update public.cine_personas set actor_name = 'Sam Neill', actor_tmdb_id = 4783, character_image_path = '/wDdnGC8ZkoriorlNOh0wDcIKSv4.jpg', character_image_focus = '94% 50%', works = '[{"id": 329, "type": "movie"}, {"id": 331, "type": "movie"}, {"id": 507086, "type": "movie"}]'::jsonb where code = 'XZF';
update public.cine_personas set actor_name = 'Ryan Reynolds', actor_tmdb_id = 10859, character_image_path = '/gBYgQQe5mmh8fIQTWRht8gzJV8G.jpg', character_image_focus = '50% 0%', works = '[{"id": 293660, "type": "movie"}, {"id": 2080, "type": "movie"}, {"id": 383498, "type": "movie"}, {"id": 533535, "type": "movie"}]'::jsonb where code = 'XZL';
update public.cine_personas set actor_name = 'Danny Elfman', actor_tmdb_id = 531, character_image_path = '/ohoQw1TRUZlUCOwOiqJ2x1YeqGH.jpg', character_image_focus = '50% 0%', works = '[{"id": 9479, "type": "movie"}]'::jsonb where code = 'XRF';
update public.cine_personas set actor_name = 'Simon Pegg', actor_tmdb_id = 11108, character_image_path = '/5GUuHcOoaqFyo1cfa3seMMGXgPL.jpg', character_image_focus = '68% 50%', works = '[{"id": 747, "type": "movie"}]'::jsonb where code = 'XRL';
update public.cine_personas set actor_name = 'Raúl Juliá', actor_tmdb_id = 27888, character_image_path = '/zY8r3K8ViKRSSNYQQKySuJz6ERX.jpg', character_image_focus = '61% 50%', works = '[{"id": 2907, "type": "movie"}, {"id": 14009, "type": "tv"}, {"id": 12925, "type": "tv"}, {"id": 2758, "type": "movie"}]'::jsonb where code = 'XFL';
update public.cine_personas set actor_name = 'Suraj Sharma', actor_tmdb_id = 933160, character_image_path = '/vMqo5g4dbgqcbuAGXb5A8yb85jO.jpg', character_image_focus = '50% 50%', works = '[{"id": 87827, "type": "movie"}]'::jsonb where code = 'PAC';
update public.cine_personas set actor_name = 'Charlize Theron', actor_tmdb_id = 6885, character_image_path = '/n6vWE0bXq4ImAM00iM5gWyORNSM.jpg', character_image_focus = '35% 50%', works = '[{"id": 76341, "type": "movie"}, {"id": 786892, "type": "movie"}]'::jsonb where code = 'PAZ';
update public.cine_personas set actor_name = 'Jim Sturgess', actor_tmdb_id = 38941, character_image_path = '/2qmaSEN3FfeGzJMb7kWq5uJxOai.jpg', character_image_focus = '0% 50%', works = '[{"id": 4688, "type": "movie"}]'::jsonb where code = 'PAR';
update public.cine_personas set actor_name = 'Judy Garland', actor_tmdb_id = 9066, character_image_path = '/rWyAhbAS07ZoJ7PEzbywuzGwdVc.jpg', character_image_focus = '32% 50%', works = '[{"id": 630, "type": "movie"}, {"id": 13155, "type": "movie"}]'::jsonb where code = 'PAF';
update public.cine_personas set actor_name = 'Johnny Depp', actor_tmdb_id = 85, character_image_path = '/xQkk0i3FrNSq7DTBlxRf9XJhH7l.jpg', character_image_focus = '57% 50%', works = '[{"id": 285, "type": "movie"}, {"id": 22, "type": "movie"}, {"id": 58, "type": "movie"}, {"id": 1865, "type": "movie"}, {"id": 166426, "type": "movie"}]'::jsonb where code = 'PAL';
update public.cine_personas set actor_name = 'Franka Potente', actor_tmdb_id = 679, character_image_path = '/zjXYVebVsLQAMJ5bymvzvRclivl.jpg', character_image_focus = '59% 50%', works = '[{"id": 104, "type": "movie"}]'::jsonb where code = 'PCZ';
update public.cine_personas set actor_name = 'Hugh Jackman', actor_tmdb_id = 6968, character_image_path = '/zGN3oWZ9toIFjgAwAc2Xswt8t0g.jpg', character_image_focus = '50% 50%', works = '[{"id": 1381, "type": "movie"}]'::jsonb where code = 'PCR';
update public.cine_personas set actor_name = null, actor_tmdb_id = null, character_image_path = '/aRVQ1EgTx3vbhK6qls2O834bPQc.jpg', character_image_focus = '50% 50%', works = '[{"id": 11360, "type": "movie"}]'::jsonb where code = 'PCF';
update public.cine_personas set actor_name = 'Ewan McGregor', actor_tmdb_id = 3061, character_image_path = '/fxX9oME14wJReH2lU0ncfFQ51Cz.jpg', character_image_focus = '50% 0%', works = '[{"id": 627, "type": "movie"}, {"id": 180863, "type": "movie"}]'::jsonb where code = 'PCL';
update public.cine_personas set actor_name = 'Christian Slater', actor_tmdb_id = 2224, character_image_path = '/1Uh8yuXlFcMDpVHWZJidjanT06e.jpg', character_image_focus = '68% 50%', works = '[{"id": 319, "type": "movie"}]'::jsonb where code = 'PZR';
update public.cine_personas set actor_name = 'Emile Hirsch', actor_tmdb_id = 46593, character_image_path = '/kH14XvCHKfMRz1sNsAMY0KpAKb0.jpg', character_image_focus = '83% 50%', works = '[{"id": 7459, "type": "movie"}]'::jsonb where code = 'PZF';
update public.cine_personas set actor_name = 'Seth Rogen', actor_tmdb_id = 19274, character_image_path = '/gnWhqrGlDUXBv7L5kXN6o7iMoYs.jpg', character_image_focus = '17% 50%', works = '[{"id": 10189, "type": "movie"}]'::jsonb where code = 'PZL';
update public.cine_personas set actor_name = 'Amy Adams', actor_tmdb_id = 9273, character_image_path = '/dOeaWGpouIaONuhRKOj2SrTEWe7.jpg', character_image_focus = '37% 50%', works = '[{"id": 4523, "type": "movie"}, {"id": 338958, "type": "movie"}]'::jsonb where code = 'PRF';
update public.cine_personas set actor_name = 'Michael Cera', actor_tmdb_id = 39995, character_image_path = '/mSdICzciNGlaQwSzqBjGSJmzOuU.jpg', character_image_focus = '59% 50%', works = '[{"id": 22538, "type": "movie"}]'::jsonb where code = 'PRL';
update public.cine_personas set actor_name = 'Bill Hader', actor_tmdb_id = 19278, character_image_path = '/i8OEDu2sI3dx29rNa80p0MAVZB.jpg', character_image_focus = '50% 0%', works = '[{"id": 22794, "type": "movie"}, {"id": 109451, "type": "movie"}]'::jsonb where code = 'PFL';
update public.cine_personas set actor_name = 'Russell Crowe', actor_tmdb_id = 934, character_image_path = '/swpjSgGmBCx6QgfO4rgv5vBzqHL.jpg', character_image_focus = '41% 50%', works = '[{"id": 98, "type": "movie"}]'::jsonb where code = 'ACZ';
update public.cine_personas set actor_name = 'Leonardo DiCaprio', actor_tmdb_id = 6193, character_image_path = '/4MS3PY7syZUULFGlujYeqQqnIoG.jpg', character_image_focus = '19% 50%', works = '[{"id": 597, "type": "movie"}]'::jsonb where code = 'ACR';
update public.cine_personas set actor_name = 'Anthony Gonzalez', actor_tmdb_id = 1193391, character_image_path = '/gqk6fLXiJnuHRF3IC2sNAfnRJo6.jpg', character_image_focus = '28% 50%', works = '[{"id": 354912, "type": "movie"}]'::jsonb where code = 'ACF';
update public.cine_personas set actor_name = 'Ben Stiller', actor_tmdb_id = 7399, character_image_path = '/yzouMVR7udoScaPDIERkYW5a3vI.jpg', character_image_focus = '35% 50%', works = '[{"id": 116745, "type": "movie"}]'::jsonb where code = 'ACL';
update public.cine_personas set actor_name = 'Kathleen Turner', actor_tmdb_id = 3391, character_image_path = '/woqohUNAAtVaa2YANPL30DQjjNR.jpg', character_image_focus = '72% 50%', works = '[{"id": 9326, "type": "movie"}, {"id": 10303, "type": "movie"}]'::jsonb where code = 'AZR';
update public.cine_personas set actor_name = 'Jay Baruchel', actor_tmdb_id = 449, character_image_path = '/zYltonEJitG5EYciuJEgbMTKjSB.jpg', character_image_focus = '83% 50%', works = '[{"id": 10191, "type": "movie"}, {"id": 82702, "type": "movie"}, {"id": 166428, "type": "movie"}, {"id": 1087192, "type": "movie"}]'::jsonb where code = 'AZF';
update public.cine_personas set actor_name = 'Harrison Ford', actor_tmdb_id = 3, character_image_path = '/yrdAamkeqXHm0UYukk8xgoCvc7G.jpg', character_image_focus = '100% 50%', works = '[{"id": 11, "type": "movie"}, {"id": 1891, "type": "movie"}, {"id": 1892, "type": "movie"}, {"id": 140607, "type": "movie"}, {"id": 181812, "type": "movie"}]'::jsonb where code = 'AZL';
update public.cine_personas set actor_name = 'Scott Weinger', actor_tmdb_id = 15827, character_image_path = '/ogmeAedmBJjP9hcd14LPZFb592t.jpg', character_image_focus = '21% 50%', works = '[{"id": 812, "type": "movie"}, {"id": 15969, "type": "movie"}, {"id": 11238, "type": "movie"}, {"id": 420817, "type": "movie"}]'::jsonb where code = 'ARF';
update public.cine_personas set actor_name = 'Cary Elwes', actor_tmdb_id = 2130, character_image_path = '/onACwa3TjpeaY7EVHSZZbeNkd2q.jpg', character_image_focus = '72% 50%', works = '[{"id": 2493, "type": "movie"}]'::jsonb where code = 'ARL';
update public.cine_personas set actor_name = 'Mike Myers', actor_tmdb_id = 12073, character_image_path = '/40Wtp7kMG6mZ4d5T1jfrd8qrvD4.jpg', character_image_focus = '65% 50%', works = '[{"id": 808, "type": "movie"}, {"id": 809, "type": "movie"}, {"id": 810, "type": "movie"}, {"id": 10192, "type": "movie"}]'::jsonb where code = 'AFL';
update public.cine_personas set actor_name = 'Tom Cruise', actor_tmdb_id = 500, character_image_path = '/4OyBTDZE2FPoS6en475q5wJT6hG.jpg', character_image_focus = '90% 50%', works = '[{"id": 744, "type": "movie"}, {"id": 361743, "type": "movie"}]'::jsonb where code = 'CZR';
update public.cine_personas set actor_name = 'Ralph Macchio', actor_tmdb_id = 2877, character_image_path = '/g8Q4QfwO3curRpMqE4JUxPXfL3H.jpg', character_image_focus = '23% 50%', works = '[{"id": 1885, "type": "movie"}, {"id": 8856, "type": "movie"}, {"id": 77169, "type": "tv"}, {"id": 1011477, "type": "movie"}]'::jsonb where code = 'CZF';
update public.cine_personas set actor_name = 'Jack Black', actor_tmdb_id = 70851, character_image_path = '/hiWzAdjePK0MOBo2l6OJxD4m950.jpg', character_image_focus = '28% 50%', works = '[{"id": 1584, "type": "movie"}]'::jsonb where code = 'CZL';
update public.cine_personas set actor_name = 'Saoirse Ronan', actor_tmdb_id = 36592, character_image_path = '/cQmjq1m7Uk0moBNiLkWbWHSG8E6.jpg', character_image_focus = '92% 50%', works = '[{"id": 331482, "type": "movie"}, {"id": 9587, "type": "movie"}]'::jsonb where code = 'CRF';
update public.cine_personas set actor_name = 'Tom Hanks', actor_tmdb_id = 31, character_image_path = '/8uWbSjUky6NiJnD3Typz6ZN0f9w.jpg', character_image_focus = '50% 50%', works = '[{"id": 13, "type": "movie"}]'::jsonb where code = 'CRL';
update public.cine_personas set actor_name = 'Ed Asner', actor_tmdb_id = 68812, character_image_path = '/hGGC9gKo7CFE3fW07RA587e5kol.jpg', character_image_focus = '100% 50%', works = '[{"id": 14160, "type": "movie"}]'::jsonb where code = 'CFL';
update public.cine_personas set actor_name = 'Ming-Na Wen', actor_tmdb_id = 21702, character_image_path = '/cTQiSrWhTDJPW8p56CUCoVNJZYl.jpg', character_image_focus = '35% 50%', works = '[{"id": 10674, "type": "movie"}, {"id": 12242, "type": "movie"}, {"id": 404368, "type": "movie"}, {"id": 337401, "type": "movie"}]'::jsonb where code = 'ZRF';
update public.cine_personas set actor_name = 'Brad Pitt', actor_tmdb_id = 287, character_image_path = '/zxYMe9GoJ67LP9xpPP3cgqCUuIU.jpg', character_image_focus = '77% 50%', works = '[{"id": 787, "type": "movie"}]'::jsonb where code = 'ZRL';
update public.cine_personas set actor_name = 'Macaulay Culkin', actor_tmdb_id = 11510, character_image_path = '/tG2OCLvl9n0TJwBiEm0LwvmkPGf.jpg', character_image_focus = '50% 50%', works = '[{"id": 771, "type": "movie"}, {"id": 772, "type": "movie"}]'::jsonb where code = 'ZFL';
update public.cine_personas set actor_name = 'Anne Hathaway', actor_tmdb_id = 1813, character_image_path = '/2paMtRFE1l9Gayo3vl9gQV0hmHX.jpg', character_image_focus = '77% 50%', works = '[{"id": 9880, "type": "movie"}, {"id": 11130, "type": "movie"}]'::jsonb where code = 'RFL';
