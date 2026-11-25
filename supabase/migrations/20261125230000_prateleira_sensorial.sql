-- A prateleira Psicodélico passa a se chamar Sensorial (25/11/2026).
--
-- Pedido do Bruno: "Vamos trocar 'Psicodélico' e 'Drug-Trip' por 'Sensorial' e
-- sua letra de P para S em todos os modais em que se conecta e suas
-- consequências."
--
-- No banco muda só o NOME (pt "Sensorial", en "Sensory"). Quem lê o nome daqui:
-- get_user_complete_personality (o texto das prateleiras que vai para a Resenha
-- do Oráculo).
--
-- O que NÃO muda, de propósito:
--   * a chave interna continua 'drug-trip' (recommendation_pools.mood_key e
--     tudo o que aponta para ela): ninguém vê;
--   * a LETRA continua 'P' aqui (cine_moods.letter, os códigos em
--     profiles.personalidade_completa, cine_personas.code, persona_molts e as
--     chaves que get_persona_world devolve). O APK antigo lê esses mesmos dados
--     com o "P" embutido: trocar a letra no banco zeraria a prateleira e
--     derrubaria a tela "Sua Persona" dele. Quem mostra "S" é a tela nova
--     (src/lib/moods.ts: `letter` é a letra interna, `glyph` é a que aparece).
update public.cine_moods
   set name_pt = 'Sensorial', name_en = 'Sensory'
 where mood_key = 'drug-trip';
