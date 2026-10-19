-- Salas secretas (19/10/2026). A primeira: o Clube do Terror.
--
-- Pedido do Bruno: uma página que só abre durante um evento para quem
-- conquistou uma tag, e que, depois do evento, só quem está USANDO a tag no
-- perfil acessa — e leva outras pessoas para dentro por um portal no perfil
-- dele. No Halloween a sala é o Clube do Terror, dentro do Oráculo, liberado
-- pela 2ª tag do ritual (Deadly Sleeping). Ela "disseca" Sombrio e
-- Assustador (X) dos três oráculos em prateleiras temáticas.
--
-- Regras de entrada (get_secret_room_access):
--   • membro: está usando a tag no perfil (qualquer edição: Deadly Sleeping,
--     Deadly Sleeping II…), a qualquer hora; ou, com o evento da sala no ar,
--     conquistou a tag (mesmo sem usar);
--   • convidado: entrou pelo portal de alguém que está usando a tag
--     (?via=<username>), a qualquer hora;
--   • o resto fica do lado de fora (o motivo vem em `reason`).
-- Durante o evento a tag ainda é provisória (compromisso com os filmes): se
-- ela cair, o portal fecha junto (o active_tag é limpo pelo ritual).
--
-- Conteúdo: secret_room_shelves guarda as prateleiras curadas (com notas:
-- posição no estudo de batimentos, país que proibiu, a pessoa real, a
-- virada). As prateleiras pessoais (para você, membros, o ritual do ano)
-- são montadas na hora. Tudo fechado para o site: só as funções leem.

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------

create table if not exists public.secret_rooms (
  key text primary key,
  event_id text not null,
  unlock_base_tag text not null,
  unlock_tag_name text not null,
  unlock_tag_emoji text,
  mood_key text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.secret_room_shelves (
  room_key text not null references public.secret_rooms(key) on update cascade,
  shelf_key text not null,
  sort_order integer not null default 100,
  kind text not null default 'curated' check (kind in ('curated', 'science', 'banned', 'real', 'twist')),
  title_pt text not null,
  title_en text not null,
  hint_pt text,
  hint_en text,
  items jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (room_key, shelf_key)
);

alter table public.secret_rooms enable row level security;
alter table public.secret_room_shelves enable row level security;
revoke all on public.secret_rooms from anon, authenticated;
revoke all on public.secret_room_shelves from anon, authenticated;

insert into public.secret_rooms (key, event_id, unlock_base_tag, unlock_tag_name, unlock_tag_emoji, mood_key)
values ('clube-do-terror', 'halloween', 'deadly-sleeping', 'Deadly Sleeping', '⚰️', 'dark-and-scary')
on conflict (key) do update set event_id = excluded.event_id, unlock_base_tag = excluded.unlock_base_tag,
  unlock_tag_name = excluded.unlock_tag_name, unlock_tag_emoji = excluded.unlock_tag_emoji, mood_key = excluded.mood_key;

-- ---------------------------------------------------------------------------
-- Prateleiras curadas do Clube do Terror
-- ---------------------------------------------------------------------------

insert into public.secret_room_shelves (room_key, shelf_key, sort_order, kind, title_pt, title_en, hint_pt, hint_en, items) values

('clube-do-terror', 'science', 10, 'science',
 'Medidos no coração', 'Measured by the heart',
 'O ranking de 2026 do Science of Scare Project: voluntários assistiram aos filmes com monitor cardíaco.',
 'The 2026 Science of Scare Project ranking: volunteers watched with heart-rate monitors on.',
 '[{"id":82507,"type":"movie","rank":1,"bpm":{"from":64,"to":86,"peak":131,"score":96}},
   {"id":723072,"type":"movie","rank":2},{"id":994143,"type":"movie","rank":3},{"id":49018,"type":"movie","rank":4},
   {"id":138843,"type":"movie","rank":5},{"id":493922,"type":"movie","rank":6},{"id":1100782,"type":"movie","rank":7},
   {"id":882598,"type":"movie","rank":8},{"id":8643,"type":"movie","rank":9},{"id":1008042,"type":"movie","rank":10},
   {"id":359246,"type":"movie","rank":11},{"id":259693,"type":"movie","rank":12},{"id":270303,"type":"movie","rank":13},
   {"id":680593,"type":"movie","rank":14},{"id":9392,"type":"movie","rank":15},{"id":23827,"type":"movie","rank":16},
   {"id":242224,"type":"movie","rank":17},{"id":520763,"type":"movie","rank":18},{"id":397243,"type":"movie","rank":19},
   {"id":91586,"type":"movie","rank":20}]'::jsonb),

('clube-do-terror', 'banned', 20, 'banned',
 'Proibidos', 'Banned',
 'Filmes que a censura ou a Justiça tiraram de circulação em algum país.',
 'Films that censors or courts pulled from circulation somewhere.',
 '[{"id":653,"type":"movie","where_pt":"Alemanha, 1925","where_en":"Germany, 1925","note_pt":"A Justiça mandou destruir todas as cópias, a pedido da viúva de Bram Stoker.","note_en":"A court ordered every copy destroyed, at the request of Bram Stoker''s widow."},
   {"id":136,"type":"movie","where_pt":"Reino Unido, 1932–1963","where_en":"UK, 1932–1963","note_pt":"Ficou proibido por mais de 30 anos.","note_en":"Banned for more than 30 years."},
   {"id":15516,"type":"movie","where_pt":"Reino Unido","where_en":"UK","note_pt":"Um dos ''video nasties''; só foi liberado sem cortes em 2008.","note_en":"One of the ''video nasties''; passed uncut only in 2008."},
   {"id":9552,"type":"movie","where_pt":"Reino Unido, 1988–1999","where_en":"UK, 1988–1999","note_pt":"Ficou 11 anos fora das locadoras.","note_en":"Kept off video shelves for 11 years."},
   {"id":30497,"type":"movie","where_pt":"Reino Unido, 1975–1999","where_en":"UK, 1975–1999","note_pt":"A censura recusou o filme em 1975 e só o liberou em 1999.","note_en":"Refused by the censors in 1975, passed only in 1999."},
   {"id":5336,"type":"movie","where_pt":"Austrália","where_en":"Australia","note_pt":"Proibido por décadas; liberado de vez em 2010.","note_en":"Banned for decades; finally cleared in 2010."},
   {"id":7219,"type":"movie","where_pt":"Reino Unido","where_en":"UK","note_pt":"Um dos ''video nasties'' dos anos 80.","note_en":"One of the 1980s ''video nasties''."},
   {"id":8689,"type":"movie","where_pt":"Itália, 1980","where_en":"Italy, 1980","note_pt":"Saiu de cartaz dez dias após a estreia; o diretor foi acusado de matar os atores. Censurado em mais de 50 países.","note_en":"Pulled ten days after release; the director was accused of killing his actors. Censored in over 50 countries."},
   {"id":764,"type":"movie","where_pt":"Reino Unido","where_en":"UK","note_pt":"Um dos ''video nasties'' dos anos 80.","note_en":"One of the 1980s ''video nasties''."},
   {"id":73861,"type":"movie","where_pt":"Brasil, 2011","where_en":"Brazil, 2011","note_pt":"A Justiça barrou a estreia no Rio e depois a exibição no país.","note_en":"A court blocked its Rio premiere, then its release nationwide."}]'::jsonb),

('clube-do-terror', 'real', 30, 'real',
 'Monstros reais', 'Real monsters',
 'Histórias reais por trás dos filmes. As vítimas também foram reais.',
 'The true stories behind the films. The victims were real too.',
 '[{"person":{"name":"Peter Kürten","photo":null,"years":"1883–1931","place_pt":"Düsseldorf, Alemanha","place_en":"Düsseldorf, Germany","line_pt":"O \"Vampiro de Düsseldorf\" foi condenado por nove assassinatos e executado em 1931.","line_en":"The \"Vampire of Düsseldorf\" was convicted of nine murders and executed in 1931."},"titles":[{"id":832,"type":"movie","rel":"inspired"}]},
   {"person":{"name":"John Christie","photo":null,"years":"1899–1953","place_pt":"Londres, Inglaterra","place_en":"London, England","line_pt":"Matou ao menos oito mulheres no número 10 da Rillington Place; foi enforcado em 1953.","line_en":"Killed at least eight women at 10 Rillington Place; hanged in 1953."},"titles":[{"id":68800,"type":"tv","rel":"portrayed"}]},
   {"person":{"name":"Ed Gein","photo":"/fObdZCSn2tir1CM7akF1ceATLIC.jpg","years":"1906–1984","place_pt":"Plainfield, EUA","place_en":"Plainfield, USA","line_pt":"Em 1957 a polícia achou na casa dele objetos feitos com restos humanos. Considerado insano, morreu num hospital psiquiátrico.","line_en":"In 1957 police found objects made from human remains in his house. Found insane, he died in a psychiatric hospital."},"titles":[{"id":539,"type":"movie","rel":"inspired"},{"id":30497,"type":"movie","rel":"inspired"},{"id":274,"type":"movie","rel":"inspired"}]},
   {"person":{"name":"Zodíaco","name_en":"Zodiac","photo":null,"unknown":true,"years":"1968–1969","place_pt":"Califórnia, EUA","place_en":"California, USA","line_pt":"Assumiu os crimes em cartas cifradas aos jornais. Nunca foi identificado.","line_en":"Claimed the killings in coded letters to newspapers. Never identified."},"titles":[{"id":1949,"type":"movie","rel":"portrayed"}]},
   {"person":{"name":"Ted Bundy","photo":"/kQOquIyvps9wlg4COqeAfVtrb4N.jpg","years":"1946–1989","place_pt":"EUA","place_en":"USA","line_pt":"Confessou 30 assassinatos de mulheres nos anos 1970; foi executado em 1989.","line_en":"Confessed to 30 murders of women in the 1970s; executed in 1989."},"titles":[{"id":457799,"type":"movie","rel":"portrayed"}]},
   {"person":{"name":"Henry Lee Lucas","photo":"/dAvnO4IYeyC9E2zi29gRXiUZQdA.jpg","years":"1936–2001","place_pt":"Texas, EUA","place_en":"Texas, USA","line_pt":"Confessou centenas de mortes, a maioria inventada; foi condenado por 11 e morreu na prisão.","line_en":"Confessed to hundreds of killings, most invented; convicted of 11, he died in prison."},"titles":[{"id":10692,"type":"movie","rel":"inspired"}]},
   {"person":{"name":"Jeffrey Dahmer","photo":"/rPdYUPuoMCcoky3hU8tnMJqlXLn.jpg","years":"1960–1994","place_pt":"Milwaukee, EUA","place_en":"Milwaukee, USA","line_pt":"Matou 17 jovens entre 1978 e 1991; foi morto na prisão em 1994.","line_en":"Killed 17 young men between 1978 and 1991; killed in prison in 1994."},"titles":[{"id":113988,"type":"tv","rel":"portrayed"},{"id":445040,"type":"movie","rel":"portrayed"}]},
   {"person":{"name":"Aileen Wuornos","photo":"/wndkcgrXERfDIx3zFqSDGMN6gZa.jpg","years":"1956–2002","place_pt":"Flórida, EUA","place_en":"Florida, USA","line_pt":"Matou sete homens entre 1989 e 1990; foi executada em 2002.","line_en":"Killed seven men between 1989 and 1990; executed in 2002."},"titles":[{"id":504,"type":"movie","rel":"portrayed"}]}]'::jsonb),

('clube-do-terror', 'twists', 40, 'twist',
 'Viradas', 'Twists',
 'Começam como um filme e terminam como outro. A virada fica escondida até você tocar.',
 'They start as one film and end as another. The twist stays hidden until you tap.',
 '[{"id":539,"type":"movie","twist":"genre","from_pt":"filme de roubo","from_en":"heist film","to_pt":"slasher","to_en":"slasher"},
   {"id":755,"type":"movie","twist":"genre","from_pt":"filme de fuga","from_en":"crime road movie","to_pt":"vampiros","to_en":"vampires"},
   {"id":745,"type":"movie","twist":"ending","from_pt":"drama sobrenatural","from_en":"supernatural drama"},
   {"id":1933,"type":"movie","twist":"ending","from_pt":"casa assombrada","from_en":"haunted house"},
   {"id":21208,"type":"movie","twist":"ending","from_pt":"drama de adoção","from_en":"adoption drama"},
   {"id":46838,"type":"movie","twist":"genre","from_pt":"slasher na floresta","from_en":"backwoods slasher","to_pt":"comédia de erros","to_en":"comedy of errors"},
   {"id":22970,"type":"movie","twist":"genre","from_pt":"slasher de cabana","from_en":"cabin slasher","to_pt":"terror cósmico","to_en":"cosmic horror"},
   {"id":294963,"type":"movie","twist":"genre","from_pt":"faroeste","from_en":"western","to_pt":"canibais","to_en":"cannibals"},
   {"id":321258,"type":"movie","twist":"genre","from_pt":"boneco assombrado","from_en":"haunted doll","to_pt":"slasher","to_en":"slasher"},
   {"id":419430,"type":"movie","twist":"genre","from_pt":"visita aos sogros","from_en":"meet the parents","to_pt":"ficção científica de horror","to_en":"sci-fi horror"},
   {"id":567609,"type":"movie","twist":"genre","from_pt":"comédia de casamento","from_en":"wedding comedy","to_pt":"caçada mortal","to_en":"deadly hunt"},
   {"id":619778,"type":"movie","twist":"genre","from_pt":"terror sobrenatural","from_en":"supernatural horror","to_pt":"slasher","to_en":"slasher"},
   {"id":787752,"type":"movie","twist":"genre","from_pt":"comédia romântica","from_en":"rom-com","to_pt":"canibalismo","to_en":"cannibalism"},
   {"id":913290,"type":"movie","twist":"genre","from_pt":"suspense de aluguel","from_en":"rental thriller","to_pt":"criatura no porão","to_en":"creature in the basement"},
   {"id":933260,"type":"movie","twist":"genre","from_pt":"ficção científica","from_en":"sci-fi drama","to_pt":"gore","to_en":"gore"},
   {"id":1111873,"type":"movie","twist":"genre","from_pt":"filme de sequestro","from_en":"kidnapping thriller","to_pt":"vampiros","to_en":"vampires"}]'::jsonb),

('clube-do-terror', 'undead', 50, 'curated',
 'Mortos-vivos', 'The undead',
 'De Romero a Extermínio: os mortos não param de voltar.',
 'From Romero to 28 Days Later: the dead keep coming back.',
 '[{"id":21159,"type":"movie"},{"id":10331,"type":"movie"},{"id":923,"type":"movie"},{"id":7219,"type":"movie"},{"id":8408,"type":"movie"},{"id":10925,"type":"movie"},{"id":1694,"type":"movie"},{"id":763,"type":"movie"},{"id":170,"type":"movie"},{"id":1576,"type":"movie"},{"id":924,"type":"movie"},{"id":747,"type":"movie"},{"id":11683,"type":"movie"},{"id":1562,"type":"movie"},{"id":23963,"type":"movie"},{"id":19908,"type":"movie"},{"id":1402,"type":"tv"},{"id":375366,"type":"movie"},{"id":396535,"type":"movie"},{"id":1100988,"type":"movie"}]'::jsonb),

('clube-do-terror', 'vampires', 60, 'curated',
 'Vampiros', 'Vampires',
 'Convide um para entrar e ele nunca mais vai embora.',
 'Invite one in and it never leaves.',
 '[{"id":653,"type":"movie"},{"id":138,"type":"movie"},{"id":779,"type":"movie"},{"id":11868,"type":"movie"},{"id":26517,"type":"movie"},{"id":6404,"type":"movie"},{"id":16118,"type":"tv"},{"id":11797,"type":"movie"},{"id":1547,"type":"movie"},{"id":11879,"type":"movie"},{"id":6114,"type":"movie"},{"id":628,"type":"movie"},{"id":10873,"type":"movie"},{"id":4513,"type":"movie"},{"id":13310,"type":"movie"},{"id":246741,"type":"movie"},{"id":97400,"type":"tv"},{"id":635910,"type":"movie"},{"id":426063,"type":"movie"},{"id":1233413,"type":"movie"}]'::jsonb),

('clube-do-terror', 'possessions', 70, 'curated',
 'Possessões', 'Possessions',
 'Demônios, exorcistas e o que não devia ter sido invocado.',
 'Demons, exorcists and things that should not have been summoned.',
 '[{"id":805,"type":"movie"},{"id":9552,"type":"movie"},{"id":794,"type":"movie"},{"id":11449,"type":"movie"},{"id":635,"type":"movie"},{"id":9003,"type":"movie"},{"id":8852,"type":"movie"},{"id":11587,"type":"movie"},{"id":10307,"type":"movie"},{"id":8643,"type":"movie"},{"id":49018,"type":"movie"},{"id":138843,"type":"movie"},{"id":493922,"type":"movie"},{"id":680593,"type":"movie"},{"id":758323,"type":"movie"},{"id":713704,"type":"movie"},{"id":1008042,"type":"movie"},{"id":437342,"type":"movie"},{"id":1226578,"type":"movie"}]'::jsonb),

('clube-do-terror', 'houses', 80, 'curated',
 'Casas que respiram', 'Houses that breathe',
 'O mal mora aqui, e chegou antes de você.',
 'Evil lives here, and it moved in first.',
 '[{"id":15856,"type":"movie"},{"id":16372,"type":"movie"},{"id":11772,"type":"movie"},{"id":16180,"type":"movie"},{"id":13549,"type":"movie"},{"id":13550,"type":"movie"},{"id":694,"type":"movie"},{"id":609,"type":"movie"},{"id":3021,"type":"movie"},{"id":6537,"type":"movie"},{"id":65086,"type":"movie"},{"id":201085,"type":"movie"},{"id":72844,"type":"tv"},{"id":109958,"type":"tv"}]'::jsonb),

('clube-do-terror', 'found-footage', 90, 'curated',
 'Achado em fita', 'Found footage',
 'Ninguém sobreviveu para contar, mas a câmera ficou ligada.',
 'Nobody lived to tell it, but the camera kept rolling.',
 '[{"id":10086,"type":"movie"},{"id":2667,"type":"movie"},{"id":8329,"type":"movie"},{"id":23827,"type":"movie"},{"id":27374,"type":"movie"},{"id":22824,"type":"movie"},{"id":256274,"type":"movie"},{"id":297608,"type":"movie"},{"id":298312,"type":"movie"},{"id":359246,"type":"movie"},{"id":723072,"type":"movie"},{"id":994143,"type":"movie"},{"id":938614,"type":"movie"},{"id":112314,"type":"tv"}]'::jsonb),

('clube-do-terror', 'folk', 100, 'curated',
 'Folk e seitas', 'Folk horror and cults',
 'Rituais antigos, bruxas e vilas que sorriem demais.',
 'Old rituals, witches and villages that smile too much.',
 '[{"id":57283,"type":"movie"},{"id":16307,"type":"movie"},{"id":11906,"type":"movie"},{"id":74725,"type":"movie"},{"id":310131,"type":"movie"},{"id":378018,"type":"movie"},{"id":433808,"type":"movie"},{"id":361292,"type":"movie"},{"id":530385,"type":"movie"},{"id":788929,"type":"movie"},{"id":1151031,"type":"movie"},{"id":1078605,"type":"movie"}]'::jsonb),

('clube-do-terror', 'a24', 110, 'curated',
 'A24', 'A24',
 'A distribuidora que tornou o terror de autor um fenômeno.',
 'The distributor that made arthouse horror a phenomenon.',
 '[{"id":97370,"type":"movie"},{"id":310131,"type":"movie"},{"id":313922,"type":"movie"},{"id":334536,"type":"movie"},{"id":418078,"type":"movie"},{"id":399057,"type":"movie"},{"id":493922,"type":"movie"},{"id":507076,"type":"movie"},{"id":530385,"type":"movie"},{"id":503919,"type":"movie"},{"id":575776,"type":"movie"},{"id":788929,"type":"movie"},{"id":760104,"type":"movie"},{"id":949423,"type":"movie"},{"id":780609,"type":"movie"},{"id":520023,"type":"movie"},{"id":1008042,"type":"movie"},{"id":1023922,"type":"movie"},{"id":1138194,"type":"movie"},{"id":858017,"type":"movie"},{"id":1151031,"type":"movie"},{"id":1153714,"type":"movie"},{"id":1083381,"type":"movie"}]'::jsonb)

on conflict (room_key, shelf_key) do update set sort_order = excluded.sort_order, kind = excluded.kind,
  title_pt = excluded.title_pt, title_en = excluded.title_en, hint_pt = excluded.hint_pt, hint_en = excluded.hint_en,
  items = excluded.items, updated_at = now();

-- ---------------------------------------------------------------------------
-- Tags e acesso
-- ---------------------------------------------------------------------------

-- Tem a tag em alguma edição (deadly-sleeping, deadly-sleeping-2…).
create or replace function public.secret_room_has_tag(p_user_id uuid, p_base text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_special_tags t
    where t.user_id = p_user_id
      and (t.tag_id = p_base or t.tag_id ~ ('^' || p_base || '-[0-9]+$'))
  );
$$;

-- Está usando a tag no perfil agora ("Deadly Sleeping", "Deadly Sleeping II"…)
-- e ela é mesmo dele.
create or replace function public.secret_room_tag_in_use(p_user_id uuid, p_base text, p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_user_id
      and coalesce(p.active_tag ->> 'name', '') ~ ('^' || p_name || '( [IVXLCDM]+)?$')
  ) and public.secret_room_has_tag(p_user_id, p_base);
$$;

create or replace function public.secret_room_event_live(p_event text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select w.is_active from public.seasonal_event_window(p_event, now()) w limit 1), false);
$$;

-- O veredito da porta, para quem está olhando.
create or replace function public.secret_room_access(p_viewer uuid, p_room text, p_via text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r public.secret_rooms;
  v_live boolean;
  v_has boolean := false;
  v_in_use boolean := false;
  v_bearer public.profiles;
  v_bearer_open boolean := false;
  v_mode text := null;
  v_reason text := null;
begin
  select * into r from public.secret_rooms where key = p_room and is_active;
  if not found then
    return jsonb_build_object('granted', false, 'reason', 'not_found');
  end if;
  v_live := public.secret_room_event_live(r.event_id);
  if p_viewer is not null then
    v_has := public.secret_room_has_tag(p_viewer, r.unlock_base_tag);
    v_in_use := v_has and public.secret_room_tag_in_use(p_viewer, r.unlock_base_tag, r.unlock_tag_name);
  end if;
  if nullif(trim(coalesce(p_via, '')), '') is not null then
    select * into v_bearer from public.profiles where lower(username) = lower(trim(p_via)) limit 1;
    if found then
      v_bearer_open := public.secret_room_tag_in_use(v_bearer.id, r.unlock_base_tag, r.unlock_tag_name);
    end if;
  end if;

  if p_viewer is null then
    v_reason := 'login';
  elsif v_in_use or (v_live and v_has) then
    v_mode := 'member';
  elsif v_bearer_open and v_bearer.id <> p_viewer then
    v_mode := 'portal';
  elsif p_via is not null and v_bearer.id is not null and not v_bearer_open then
    v_reason := 'portal_closed';
  elsif v_live then
    v_reason := 'need_tag';
  elsif v_has then
    v_reason := 'need_tag_in_use';
  else
    v_reason := 'closed';
  end if;

  return jsonb_build_object(
    'room', r.key,
    'granted', v_mode is not null,
    'mode', v_mode,
    'reason', v_reason,
    'event', r.event_id,
    'event_live', v_live,
    'has_tag', v_has,
    'tag_in_use', v_in_use,
    -- A sala aparece no Oráculo durante o evento (aberta ou trancada) e, fora
    -- dele, só para quem está usando a tag.
    'visible_in_oracle', v_live or v_in_use,
    'tag', jsonb_build_object('base', r.unlock_base_tag, 'name', r.unlock_tag_name, 'emoji', r.unlock_tag_emoji),
    'via', case when v_bearer.id is not null and v_bearer_open
                then jsonb_build_object('id', v_bearer.id, 'username', v_bearer.username, 'avatar_url', v_bearer.avatar_url, 'avatar_frame', v_bearer.avatar_frame)
                else null end
  );
end;
$$;

create or replace function public.get_secret_room_access(p_room text, p_via text default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.secret_room_access(auth.uid(), p_room, p_via);
$$;

-- O portal no perfil de alguém: aberto quando a pessoa está usando a tag de
-- alguma sala.
create or replace function public.get_secret_room_portal(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when auth.uid() is null then null else (
    select jsonb_build_object('room', r.key, 'open', true,
             'tag', jsonb_build_object('base', r.unlock_base_tag, 'name', r.unlock_tag_name, 'emoji', r.unlock_tag_emoji),
             'event_live', public.secret_room_event_live(r.event_id))
    from public.secret_rooms r
    where r.is_active and public.secret_room_tag_in_use(p_user_id, r.unlock_base_tag, r.unlock_tag_name)
    order by r.created_at
    limit 1
  ) end;
$$;

-- ---------------------------------------------------------------------------
-- Conteúdo
-- ---------------------------------------------------------------------------

-- Um título para a tela: títulos, pôsteres, ano, fundo e o oráculo (quando
-- está numa prateleira).
create or replace function public.secret_room_card(p_id integer, p_type text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', p_id,
    'type', p_type,
    't_pt', mc.title_pt,
    't_en', mc.title_en,
    'p_pt', mc.poster_path_pt,
    'p_en', mc.poster_path,
    'b', mc.backdrop_path,
    'y', extract(year from mc.release_date)::int,
    'oracle', (select rp.card_type from public.recommendation_pools rp
               where rp.mood_key <> 'random-surprise'
                 and (case when p_type = 'tv' then coalesce(rp.tv_ids, '[]'::jsonb) else rp.movie_ids end) @> to_jsonb(p_id)
               order by (rp.mood_key = 'dark-and-scary') desc, rp.card_type limit 1)
  )
  from public.movie_cache mc
  where mc.tmdb_id = p_id and mc.media_type = p_type;
$$;

-- Os títulos de Sombrio e Assustador (os três oráculos).
create or replace function public.secret_room_mood_titles(p_mood text)
returns table (id integer, media_type text, oracle text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct on (t.mt, t.id) t.id, t.mt, rp.card_type
  from public.recommendation_pools rp
  cross join lateral (
    select 'movie' mt, (e)::int id from jsonb_array_elements_text(rp.movie_ids) e
    union all
    select 'tv', (e)::int from jsonb_array_elements_text(coalesce(rp.tv_ids, '[]'::jsonb)) e
  ) t
  where rp.mood_key = p_mood
  order by t.mt, t.id, rp.card_type;
$$;

create or replace function public.get_secret_room(p_room text, p_via text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_access jsonb;
  r public.secret_rooms;
  v_shelves jsonb;
  v_ritual jsonb := null;
  v_edition integer;
  w record;
  v_members jsonb;
  v_member_shelves jsonb;
  v_me jsonb;
  v_via_id uuid;
begin
  v_access := public.secret_room_access(v_uid, p_room, p_via);
  if not coalesce((v_access ->> 'granted')::boolean, false) then
    return jsonb_build_object('access', v_access);
  end if;
  select * into r from public.secret_rooms where key = p_room;
  v_via_id := nullif(v_access #>> '{via,id}', '')::uuid;

  -- Prateleiras curadas, com os dados de tela de cada título.
  select coalesce(jsonb_agg(jsonb_build_object(
           'key', s.shelf_key, 'kind', s.kind,
           'title_pt', s.title_pt, 'title_en', s.title_en, 'hint_pt', s.hint_pt, 'hint_en', s.hint_en,
           'items', case when s.kind = 'real' then (
               select coalesce(jsonb_agg(jsonb_build_object(
                        'person', it -> 'person',
                        'titles', (select coalesce(jsonb_agg(c.card || jsonb_build_object('rel', tt ->> 'rel') order by tord), '[]'::jsonb)
                                   from jsonb_array_elements(it -> 'titles') with ordinality x(tt, tord)
                                   cross join lateral (select public.secret_room_card((tt ->> 'id')::int, tt ->> 'type') card) c
                                   where c.card is not null)) order by ord), '[]'::jsonb)
               from jsonb_array_elements(s.items) with ordinality y(it, ord))
             else (
               select coalesce(jsonb_agg(c.card || (it - 'id' - 'type') order by ord), '[]'::jsonb)
               from jsonb_array_elements(s.items) with ordinality y(it, ord)
               cross join lateral (select public.secret_room_card((it ->> 'id')::int, coalesce(it ->> 'type', 'movie')) card) c
               where c.card is not null)
             end) order by s.sort_order), '[]'::jsonb)
    into v_shelves
  from public.secret_room_shelves s
  where s.room_key = p_room and s.is_active;

  -- A seleção do evento (a edição no ar ou a última que passou).
  select * into w from public.seasonal_event_window(r.event_id, now()) limit 1;
  if found then
    v_edition := w.edition - case when not w.is_active and w.starts_at > now() then 1 else 0 end;
    select jsonb_build_object('edition', v_edition, 'live', w.is_active and v_edition = w.edition,
             'items', coalesce(jsonb_agg(c.card order by ord), '[]'::jsonb))
      into v_ritual
    from jsonb_array_elements_text(coalesce(public.seasonal_event_list(r.event_id, v_edition), '[]'::jsonb)) with ordinality l(mid, ord)
    cross join lateral (select public.secret_room_card(l.mid::int, 'movie') card) c
    where c.card is not null;
  end if;

  -- Quem tem a chave (sem bots). Fotos só de quem você pode ver: amigos ou
  -- perfis públicos (a mesma regra do "Assistam juntos").
  with holders as (
    select t.user_id, min(t.unlocked_at) since
    from public.user_special_tags t
    where t.tag_id = r.unlock_base_tag or t.tag_id ~ ('^' || r.unlock_base_tag || '-[0-9]+$')
    group by t.user_id
  ),
  members as (
    select p.id, p.username, p.avatar_url, p.avatar_frame, p.profile_visibility, h.since,
           coalesce(p.active_tag ->> 'name', '') ~ ('^' || r.unlock_tag_name || '( [IVXLCDM]+)?$') in_use,
           exists (select 1 from public.friendships f where f.status = 'accepted'
                    and ((f.requester_id = v_uid and f.addressee_id = p.id) or (f.addressee_id = v_uid and f.requester_id = p.id))) is_friend
    from holders h
    join public.profiles p on p.id = h.user_id
    where not exists (select 1 from public.bot_accounts b where b.user_id = p.id)
  ),
  visible as (
    select m.* from members m
    where m.id = v_uid or m.is_friend or coalesce(m.profile_visibility, 'public') = 'public' or m.id = v_via_id
  )
  select jsonb_build_object(
           'count', (select count(*) from members),
           'people', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'username', v.username, 'avatar_url', v.avatar_url,
                                 'avatar_frame', v.avatar_frame, 'in_use', v.in_use, 'is_friend', v.is_friend, 'is_me', v.id = v_uid, 'since', v.since)
                                 order by (v.id = v_via_id) desc, (v.id = v_uid) desc, v.is_friend desc, v.since)
                               from visible v), '[]'::jsonb))
    into v_members;

  -- As estantes X dos membros que você pode ver (quem te trouxe primeiro).
  with x as (select * from public.secret_room_mood_titles(r.mood_key)),
  people as (
    select (pp ->> 'id')::uuid id, pp ->> 'username' username, pp ->> 'avatar_url' avatar_url, pp ->> 'avatar_frame' avatar_frame,
           (pp ->> 'id')::uuid = v_via_id is_via, coalesce((pp ->> 'is_friend')::boolean, false) is_friend
    from jsonb_array_elements(v_members -> 'people') pp
    where (pp ->> 'id')::uuid <> v_uid
  ),
  rated as (
    select pe.id uid, um.movie_id, coalesce(um.media_type, 'movie') mt, um.rating, um.updated_at,
           row_number() over (partition by pe.id order by um.rating desc, coalesce(um.updated_at, um.created_at) desc) rn
    from people pe
    join public.user_movies um on um.user_id = pe.id and um.rating is not null and um.rating >= 7
    join x on x.id = um.movie_id and x.media_type = coalesce(um.media_type, 'movie')
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'user', jsonb_build_object('id', pe.id, 'username', pe.username, 'avatar_url', pe.avatar_url, 'avatar_frame', pe.avatar_frame, 'is_via', pe.is_via),
           'items', (select jsonb_agg(c.card || jsonb_build_object('rating', ra.rating) order by ra.rn)
                     from rated ra cross join lateral (select public.secret_room_card(ra.movie_id, ra.mt) card) c
                     where ra.uid = pe.id and ra.rn <= 14 and c.card is not null))
           order by pe.is_via desc, pe.is_friend desc, pe.username), '[]'::jsonb)
    into v_member_shelves
  from people pe
  where exists (select 1 from rated ra where ra.uid = pe.id);

  -- O seu medômetro: quantos X você já avaliou, a sua média e a sua posição
  -- entre os membros.
  with x as (select * from public.secret_room_mood_titles(r.mood_key)),
  holders as (
    select (pp ->> 'id')::uuid user_id from jsonb_array_elements(v_members -> 'people') pp
    union
    select t.user_id from public.user_special_tags t
    where t.tag_id = r.unlock_base_tag or t.tag_id ~ ('^' || r.unlock_base_tag || '-[0-9]+$')
  ),
  counts as (
    select um.user_id, count(*) n, avg(um.rating)::numeric(4,2) avg_rating
    from public.user_movies um
    join x on x.id = um.movie_id and x.media_type = coalesce(um.media_type, 'movie')
    where um.rating is not null
      and (um.user_id = v_uid or um.user_id in (select h.user_id from holders h))
      and not exists (select 1 from public.bot_accounts b where b.user_id = um.user_id)
    group by um.user_id
  )
  select jsonb_build_object(
           'x_total', (select count(*) from x),
           'x_rated', coalesce((select c.n from counts c where c.user_id = v_uid), 0),
           'x_avg', (select c.avg_rating from counts c where c.user_id = v_uid),
           'rank', case when (v_access ->> 'mode') = 'member'
                        then 1 + (select count(*) from counts c where c.user_id <> v_uid
                                   and c.n > coalesce((select c2.n from counts c2 where c2.user_id = v_uid), 0))
                        else null end)
    into v_me;

  return jsonb_build_object(
    'access', v_access,
    'room', jsonb_build_object('key', r.key, 'event', r.event_id, 'mood', r.mood_key),
    'shelves', v_shelves,
    'ritual', v_ritual,
    'members', v_members,
    'member_shelves', v_member_shelves,
    'me', v_me
  );
end;
$$;

-- As notas previstas de quem está na sala, para tudo que a sala mostra, mais
-- o que já está na biblioteca dele. "Para te assombrar" e a Sessão da
-- meia-noite saem daqui: os X ainda não vistos com a maior nota prevista.
create or replace function public.get_secret_room_predictions(p_room text, p_via text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_access jsonb;
  r public.secret_rooms;
  v_movies integer[];
  v_tv integer[];
  v_day integer := ((now() at time zone 'America/Sao_Paulo')::date - date '2026-01-01');
  v_result jsonb;
begin
  v_access := public.secret_room_access(v_uid, p_room, p_via);
  if not coalesce((v_access ->> 'granted')::boolean, false) then
    return null;
  end if;
  select * into r from public.secret_rooms where key = p_room;

  with ids as (
    select x.id, x.media_type mt from public.secret_room_mood_titles(r.mood_key) x
    union
    select (it ->> 'id')::int, coalesce(it ->> 'type', 'movie')
    from public.secret_room_shelves s cross join lateral jsonb_array_elements(s.items) it
    where s.room_key = p_room and s.is_active and s.kind <> 'real'
    union
    select (tt ->> 'id')::int, tt ->> 'type'
    from public.secret_room_shelves s cross join lateral jsonb_array_elements(s.items) it
    cross join lateral jsonb_array_elements(it -> 'titles') tt
    where s.room_key = p_room and s.is_active and s.kind = 'real'
  )
  select array_agg(id) filter (where mt = 'movie'), array_agg(id) filter (where mt = 'tv')
    into v_movies, v_tv
  from ids;

  with pred as (
    select 'movie' mt, p.id, p.mu, p.predicted_rating from public.predict_ratings_v4(v_uid, 'movie', coalesce(v_movies, '{}'), null) p
    union all
    select 'tv', p.id, p.mu, p.predicted_rating from public.predict_ratings_v4(v_uid, 'tv', coalesce(v_tv, '{}'), null) p
  ),
  seen as (
    select coalesce(um.media_type, 'movie') mt, um.movie_id id, um.rating
    from public.user_movies um
    where um.user_id = v_uid
      and ((coalesce(um.media_type, 'movie') = 'movie' and um.movie_id = any(coalesce(v_movies, '{}')))
        or (um.media_type = 'tv' and um.movie_id = any(coalesce(v_tv, '{}'))))
  ),
  x as (select * from public.secret_room_mood_titles(r.mood_key)),
  -- Os X ainda não vistos que ele deve amar. As séries têm notas previstas
  -- mais altas, e o Cypher (anime, asiáticos) é nicho: sem um limite, os
  -- dois tomariam a prateleira. Então: até 15 filmes e 4 séries dos outros
  -- oráculos, mais 3 filmes e 2 séries do Cypher, com uma série a cada
  -- quatro filmes.
  cand as (
    select p.mt, p.id, p.mu, p.predicted_rating, x.oracle,
           row_number() over (partition by p.mt, (x.oracle = 'cypher') order by p.mu desc, p.id) rk
    from pred p
    join x on x.id = p.id and x.media_type = p.mt
    where p.mu is not null and p.predicted_rating >= 7
      and not exists (select 1 from seen s where s.id = p.id and s.mt = p.mt)
  ),
  picked as (
    select c.*, row_number() over (partition by c.mt order by c.mu desc, c.id) pos
    from cand c
    where (c.mt = 'movie' and c.oracle <> 'cypher' and c.rk <= 15)
       or (c.mt = 'movie' and c.oracle = 'cypher' and c.rk <= 3)
       or (c.mt = 'tv' and c.oracle <> 'cypher' and c.rk <= 4)
       or (c.mt = 'tv' and c.oracle = 'cypher' and c.rk <= 2)
  ),
  haunt as (
    select pk.*, row_number() over (order by pk.pos * case when pk.mt = 'tv' then 4.5 else 1 end, pk.mt, pk.id) rn
    from picked pk
  ),
  -- A Sessão da meia-noite: um dos 7 filmes (fora do Cypher) com a maior
  -- nota prevista, trocando a cada dia.
  midnight_pool as (
    select c.*, row_number() over (order by c.mu desc, c.id) k
    from cand c where c.mt = 'movie' and c.oracle <> 'cypher' and c.rk <= 7
  )
  select jsonb_build_object(
    'pred', coalesce((select jsonb_object_agg(p.mt || ':' || p.id, p.predicted_rating) from pred p where p.predicted_rating is not null), '{}'::jsonb),
    'seen', coalesce((select jsonb_object_agg(s.mt || ':' || s.id, s.rating) from seen s), '{}'::jsonb),
    'haunt', coalesce((select jsonb_agg(c.card || jsonb_build_object('predicted', h.predicted_rating) order by h.rn)
                       from haunt h cross join lateral (select public.secret_room_card(h.id, h.mt) card) c
                       where h.rn <= 24 and c.card is not null), '[]'::jsonb),
    'midnight', (select public.secret_room_card(m.id, 'movie') || jsonb_build_object('predicted', m.predicted_rating)
                 from midnight_pool m
                 where m.k = 1 + (v_day % greatest(1, least(7, (select count(*) from midnight_pool))))
                 limit 1)
  ) into v_result;
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissões: só as quatro get_* ficam abertas para quem está logado.
-- ---------------------------------------------------------------------------

revoke all on function public.secret_room_has_tag(uuid, text) from public, anon, authenticated;
revoke all on function public.secret_room_tag_in_use(uuid, text, text) from public, anon, authenticated;
revoke all on function public.secret_room_event_live(text) from public, anon, authenticated;
revoke all on function public.secret_room_access(uuid, text, text) from public, anon, authenticated;
revoke all on function public.secret_room_card(integer, text) from public, anon, authenticated;
revoke all on function public.secret_room_mood_titles(text) from public, anon, authenticated;
revoke all on function public.get_secret_room_access(text, text) from public, anon;
revoke all on function public.get_secret_room_portal(uuid) from public, anon;
revoke all on function public.get_secret_room(text, text) from public, anon;
revoke all on function public.get_secret_room_predictions(text, text) from public, anon;
grant execute on function public.get_secret_room_access(text, text) to authenticated;
grant execute on function public.get_secret_room_portal(uuid) to authenticated;
grant execute on function public.get_secret_room(text, text) to authenticated;
grant execute on function public.get_secret_room_predictions(text, text) to authenticated;
