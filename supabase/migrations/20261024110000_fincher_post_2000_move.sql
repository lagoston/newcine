-- Fincher só guarda obras até 1999 (24/10/2026, a pedido do Bruno: o perfil
-- dele mostrava "de 1920 a 2017"). Os cinco filmes de 2000 em diante que
-- estavam nas prateleiras dele mudam de oráculo, no mesmo humor, pela regra
-- de sempre (dos EUA, 2000+ e 500+ votos: Bogart; o resto: Cypher):
--   Fantasia 2000 (49948, 2000)            Psicodélico → Bogart
--   As Virgens Suicidas (1443, 2000)       Romântico   → Bogart
--   Karatê Kid (38575, 2010, a refilmagem) Catarse     → Bogart
--   Papillon (433498, 2017, a refilmagem)  Aventuras   → Bogart
--   A Life in Suitcases (3100, 2005, IT)   Psicodélico → Cypher
-- Os originais de Karatê Kid (1984) e Papillon (1973) continuam no Fincher.
-- A Surpresa Aleatória acompanha pelo gatilho das prateleiras.

with moves(id, mood, dest) as (
  values (49948, 'drug-trip', 'bogart'), (1443, 'romantic', 'bogart'), (38575, 'catharsis', 'bogart'),
         (433498, 'adventures', 'bogart'), (3100, 'drug-trip', 'cypher')
)
update public.recommendation_pools rp
   set movie_ids = (select coalesce(jsonb_agg(x order by o), '[]'::jsonb)
                      from jsonb_array_elements(rp.movie_ids) with ordinality t(x, o)
                     where (x #>> '{}')::int not in (select m.id from moves m where m.mood = rp.mood_key))
 where rp.card_type = 'fincher'
   and rp.mood_key in (select mood from moves);

with moves(id, mood, dest) as (
  values (49948, 'drug-trip', 'bogart'), (1443, 'romantic', 'bogart'), (38575, 'catharsis', 'bogart'),
         (433498, 'adventures', 'bogart'), (3100, 'drug-trip', 'cypher')
)
update public.recommendation_pools rp
   set movie_ids = coalesce(rp.movie_ids, '[]'::jsonb) || (
         select coalesce(jsonb_agg(to_jsonb(m.id)), '[]'::jsonb)
           from moves m
          where m.dest = rp.card_type and m.mood = rp.mood_key
            and not rp.movie_ids @> to_jsonb(m.id))
 where (rp.card_type, rp.mood_key) in (select dest, mood from moves);
