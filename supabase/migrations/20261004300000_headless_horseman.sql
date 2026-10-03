-- A última tag do Halloween passa a se chamar "Headless Horseman" (era
-- "Pumpkin Head"). O id continua 'pumpkin-head' e o símbolo continua 🎃 —
-- a abóbora é a cabeça do Cavaleiro Sem Cabeça.
--
-- O nome aparece gravado em três lugares além de special_tags, então todos
-- são renomeados juntos:
--   • profiles.active_tag — quem está usando a tag no perfil;
--   • user_unlocked_tags — o registro que evita avisar duas vezes da mesma
--     tag (sem isso, o nome novo viraria um aviso de "tag nova");
--   • friend_indications (avisos de tag desbloqueada já enviados).

update public.special_tags
set name = 'Headless Horseman'
where id = 'pumpkin-head';

update public.profiles
set active_tag = jsonb_set(active_tag, '{name}', '"Headless Horseman"'::jsonb)
where active_tag->>'category' = 'special'
  and active_tag->>'name' = 'Pumpkin Head';

update public.user_unlocked_tags u
set tag_name = 'Headless Horseman'
where u.category = 'special'
  and u.tag_name = 'Pumpkin Head'
  and not exists (
    select 1 from public.user_unlocked_tags u2
    where u2.user_id = u.user_id and u2.category = 'special' and u2.tag_name = 'Headless Horseman');

update public.friend_indications
set tag_name = 'Headless Horseman'
where type = 'tag_unlocked'
  and tag_name = 'Pumpkin Head';
