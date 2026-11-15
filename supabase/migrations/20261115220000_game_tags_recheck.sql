-- Tags de Jogos: devolver ao cadeado quem ganhou com a regra antiga (15/11/2026).
--
-- Aplicada com o ok do Bruno (15/11/2026, 18h39): "Beleza, agora remova as
-- tags dos indivíduos que não as merecem mas continuaram com elas".
--
-- Em 15/11/2026 as metas das tags de Jogos subiram duas vezes, a pedido do
-- Bruno: à tarde (migração 20261115191000_game_tags_harder.sql: "As tags
-- vermelhas estão muito fáceis de ganhar. Eu praticamente já ganhei todas só
-- testando os jogos") e à noite (20261115213000_game_tags_rare.sql: "estão
-- muito banais, tem que ser algo bem mais raro"). As duas só mudaram a regra
-- daqui para a frente: quem já tinha a tag continuou com ela. Na hora desta
-- migração eram 15 conquistas de 5 contas (8 do Bruno), e nenhuma cumpria a
-- regra nova.
--
-- Este arquivo esperou em supabase/pending/ (primeiro como 20261115193000_…;
-- ganhou um número depois do da migração da noite para que, numa
-- reconstrução do banco pela ordem dos arquivos, a conferência rode com as
-- regras finais).
--
-- O que faz, para cada tag de Jogos com contagem (requirement_data com metric
-- e goal) que a pessoa tem e não cumpre:
--   • copia a conquista para game_tags_revoked_20261115, com a contagem que a
--     pessoa tinha, a meta e a data do story (se havia);
--   • tira a tag (user_special_tags);
--   • tira o story da conquista do Feed dos Amigos, que mostra os dos últimos
--     30 dias: ele anunciaria uma tag que a pessoa não tem mais (o mesmo que
--     revalidate_seasonal_tags faz com as tags de evento);
--   • tira a tag do registro de avisos (user_unlocked_tags), para que quem
--     reconquistar a tag pela regra nova ganhe o sussurro e o story de novo;
--   • quem estava usando uma dessas tags no perfil fica sem tag ativa (na
--     hora, ninguém estava).
-- O sussurro antigo da conquista continua na caixa de quem recebeu, como
-- registro. As tags sem contagem (Poker Face, Seven Nights, Royal Flush) não
-- são conferidas; ninguém as tinha.
--
-- Para devolver tudo (calado, sem sussurro nem story novo):
--   select set_config('cineoracle.game_tags_silent', 'on', false);
--   insert into user_special_tags (user_id, tag_id, unlocked_at, is_permanent)
--     select user_id, tag_id, unlocked_at, is_permanent from game_tags_revoked_20261115
--     on conflict do nothing;
--   insert into feed_achievement_stories (owner_id, kind, tag_category, tag_name, tag_emoji, created_at)
--     select g.user_id, 'tag', 'games', st.name, coalesce(st.emoji, ''), g.story_at
--       from game_tags_revoked_20261115 g join special_tags st on st.id = g.tag_id
--      where g.story_at is not null
--     on conflict do nothing;
--   select set_config('cineoracle.game_tags_silent', 'off', false);

create table if not exists public.game_tags_revoked_20261115 (
  user_id uuid not null,
  tag_id text not null,
  unlocked_at timestamptz,
  is_permanent boolean,
  had_value integer,
  goal integer,
  story_at timestamptz,
  revoked_at timestamptz not null default now(),
  primary key (user_id, tag_id)
);
alter table public.game_tags_revoked_20261115 enable row level security;
revoke all on table public.game_tags_revoked_20261115 from anon, authenticated;

insert into public.game_tags_revoked_20261115 (user_id, tag_id, unlocked_at, is_permanent, had_value, goal, story_at)
select u.user_id, u.tag_id, u.unlocked_at, u.is_permanent,
       coalesce(public.game_tag_metric(u.user_id, st.requirement_data ->> 'metric'), 0),
       (st.requirement_data ->> 'goal')::int,
       (select a.created_at
          from public.feed_achievement_stories a
         where a.owner_id = u.user_id and a.kind = 'tag' and a.tag_category = 'games' and a.tag_name = st.name
         order by a.created_at
         limit 1)
  from public.user_special_tags u
  join public.special_tags st on st.id = u.tag_id
 where st.category = 'games'
   and st.requirement_data ? 'metric'
   and st.requirement_data ? 'goal'
   and coalesce(public.game_tag_metric(u.user_id, st.requirement_data ->> 'metric'), 0) < (st.requirement_data ->> 'goal')::int
on conflict (user_id, tag_id) do nothing;

delete from public.user_special_tags u
 using public.game_tags_revoked_20261115 g
 where u.user_id = g.user_id and u.tag_id = g.tag_id;

delete from public.feed_achievement_stories a
 using public.game_tags_revoked_20261115 g
  join public.special_tags st on st.id = g.tag_id
 where a.owner_id = g.user_id and a.kind = 'tag' and a.tag_category = 'games' and a.tag_name = st.name;

delete from public.user_unlocked_tags r
 using public.game_tags_revoked_20261115 g
  join public.special_tags st on st.id = g.tag_id
 where r.user_id = g.user_id and r.category = 'games' and r.tag_name = st.name;

-- quem estava com uma dessas tags no perfil fica sem tag ativa
update public.profiles p
   set active_tag = null
 where p.active_tag ->> 'category' = 'games'
   and not exists (
     select 1
       from public.user_special_tags u
       join public.special_tags st on st.id = u.tag_id
      where u.user_id = p.id and st.category = 'games' and st.name = p.active_tag ->> 'name');
