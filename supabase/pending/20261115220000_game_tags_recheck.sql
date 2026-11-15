-- Tags de Jogos: devolver ao cadeado quem ganhou com a regra antiga (15/11/2026).
--
-- NÃO APLICADA. Espera o ok do Bruno, porque apaga conquistas de outras pessoas.
--
-- Em 15/11/2026 as metas das tags de Jogos subiram duas vezes, a pedido do
-- Bruno: à tarde (migração 20261115191000_game_tags_harder.sql: "As tags
-- vermelhas estão muito fáceis de ganhar. Eu praticamente já ganhei todas só
-- testando os jogos") e à noite (20261115213000_game_tags_rare.sql: "estão
-- muito banais, tem que ser algo bem mais raro"). As duas só mudaram a regra
-- daqui para a frente: quem já tinha a tag continuou com ela. No dia eram 15
-- conquistas de 5 contas (8 do Bruno), e nenhuma cumpria a meta nova.
--
-- Este arquivo se chamava 20261115193000_…; ganhou um número depois do da
-- migração da noite para que, numa reconstrução do banco pela ordem dos
-- arquivos, a conferência rode com as metas finais.
--
-- Esta migração confere as tags que têm contagem (requirement_data com metric
-- e goal) e tira de cada pessoa as que ela não cumpre mais:
--   • antes de tirar, copia a linha para game_tags_revoked_20261115 (dá para
--     devolver: insert into user_special_tags select user_id, tag_id,
--     unlocked_at, is_permanent from game_tags_revoked_20261115);
--   • quem estava usando uma dessas tags no perfil fica sem tag ativa;
--   • o sussurro e o story antigos da conquista continuam onde estão.
-- As tags sem contagem (Poker Face, Seven Nights, Royal Flush) não são
-- conferidas.
--
-- Depois de aplicar: mover este arquivo para supabase/migrations/.

create table if not exists public.game_tags_revoked_20261115 (
  user_id uuid not null,
  tag_id text not null,
  unlocked_at timestamptz,
  is_permanent boolean,
  had_value integer,
  goal integer,
  revoked_at timestamptz not null default now(),
  primary key (user_id, tag_id)
);
alter table public.game_tags_revoked_20261115 enable row level security;
revoke all on table public.game_tags_revoked_20261115 from anon, authenticated;

insert into public.game_tags_revoked_20261115 (user_id, tag_id, unlocked_at, is_permanent, had_value, goal)
select u.user_id, u.tag_id, u.unlocked_at, u.is_permanent,
       coalesce(public.game_tag_metric(u.user_id, st.requirement_data ->> 'metric'), 0),
       (st.requirement_data ->> 'goal')::int
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

-- quem estava com uma dessas tags no perfil fica sem tag ativa
update public.profiles p
   set active_tag = null
 where p.active_tag ->> 'category' = 'games'
   and not exists (
     select 1
       from public.user_special_tags u
       join public.special_tags st on st.id = u.tag_id
      where u.user_id = p.id and st.category = 'games' and st.name = p.active_tag ->> 'name');
