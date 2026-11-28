-- Os óvnis (as fichas voadoras) só param ACIMA de 150 pôsteres (28/11/2026).
--
-- Em 25/11 o Bruno pediu: "A partir de 70 pôsteres na coleção a chance de ovni
-- diminui pela metade, e depois de 150 os ovnis não aparecem mais". Li "depois
-- de 150" como "150 ou mais" e avisei; ele respondeu: "Acima de 150". Então
-- quem tem exatamente 150 ainda vê óvni (com metade da chance); com 151, não.
--
-- Muda só a comparação do corte (>= vira >). A metade continua "a partir de 70".
-- Os números continuam em poster_jackpot_settings (ufo_half_at, ufo_stop_at).
create or replace function public.jackpot_ufo_chance(p_uid uuid)
returns numeric
language sql
stable security definer
set search_path to 'public'
as $function$
  select case
           when o.n > s.ufo_stop_at then 0
           when o.n >= s.ufo_half_at then s.ufo_chance / 2
           else s.ufo_chance
         end
    from poster_jackpot_settings s,
         lateral (select count(*) as n
                    from user_posters up
                    join poster_items pi on pi.id = up.item_id
                   where up.user_id = p_uid and up.reset_at is null and pi.exclusive is null) o
   limit 1;
$function$;
