-- Pôster Poker — fase 3 (03/11/2026): o tipo 'poker_invite' nos Sussurros (convite para a
-- mesa com amigos). Troca a restrição CHECK numa instrução só, mantendo todos os tipos que
-- já existiam (lista conferida contra a produção antes de aplicar).
alter table public.friend_indications
  drop constraint recommendations_type_check,
  add constraint recommendations_type_check check (type = any (array[
    'movie', 'friend_request', 'new_episode', 'tag_unlocked', 'story_like', 'story_comment', 'story_reply', 'whisper_like',
    'jackpot_invite', 'poster_trade', 'poster_trade_result', 'poker_invite']));
