// Os argumentos dos stories da Home (get_friends_feed), num arquivo pequeno:
// quem busca os stories (lib/friendsFeed.ts) e a partida da Home
// (lib/appBoot.ts, que pede os stories dentro do get_app_bootstrap) têm de
// pedir EXATAMENTE a mesma coisa. 19/11/2026 (Reborn, onda 2b).

// O que este site sabe desenhar além dos stories de sempre (p_kinds de
// get_friends_feed): o story do lendário ('jackpot') e os stories de tag da
// categoria Jogos ('games', que no banco continuam kind 'tag').
export const EXTRA_STORY_KINDS: string[] = ['jackpot', 'games'];

export const FEED_LIMIT = 50;
