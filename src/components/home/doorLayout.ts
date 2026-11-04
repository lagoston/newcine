// As portas da home (02/11/2026): a Biblioteca dos Oráculos, o Poster Jackpot
// e a Sua Persona. Cada uma tem o seu mundo (neon e cartas dos oráculos; céu
// de cassino e ouro; as cores das prateleiras da pessoa), mas todas têm a
// mesma geometria, guardada aqui:
//   • celular e tablet: uma faixa — a arte à esquerda, o texto à direita;
//   • computador (lg): um tríptico — três portas lado a lado, em pé, com a
//     arte em cima (a mesma arte, só que maior), o texto centralizado e o
//     convite ("Entrar", "Jogar"…) no pé.
// 02/11/2026 (noite), pedido do Bruno: portas mais minimalistas. Saíram as
// etiquetas embaixo do texto (os oráculos, o saldo de fichas) e toda porta
// ganhou uma seta à direita, para se ler como botão: no celular e no tablet
// só a seta, centrada na altura da faixa; no computador, o convite com a
// seta no pé. Cada porta desenha a sua seta (DoorArrow, JackpotArrow).
// 04/11/2026: no computador as três portas têm sempre a mesma altura (a da
// mais alta da fileira) e cada uma tem um texto de tamanho diferente. Antes o
// texto ficava colado na arte e a sobra virava um vão entre a frase e o
// convite (o "espaço vazio" das vizinhas da Persona). Agora a arte fica no
// alto e o convite no pé, alinhados nas três, e o texto se centraliza no que
// sobra entre os dois: a folga se divide em cima e embaixo e some a olho. No
// celular nada muda (as classes novas são só lg).

export const DOOR_CLASS =
  'group relative w-full h-full flex items-center gap-4 sm:gap-6 lg:flex-col lg:items-center lg:gap-0 text-left lg:text-center rounded-2xl pl-3 pr-3.5 py-3.5 sm:pl-5 sm:pr-5 sm:py-4 lg:px-6 lg:pt-5 lg:pb-6 overflow-hidden transition hover:brightness-110';

// A caixa da arte e, dentro dela, o leque (no lg o leque cresce sem mudar a
// composição).
export const DOOR_ART = 'relative shrink-0 w-[104px] h-[92px] sm:w-[128px] sm:h-[108px] lg:w-full lg:h-[164px] lg:grid lg:place-items-center';
export const DOOR_FAN = 'relative block w-[104px] h-[92px] sm:w-[128px] sm:h-[108px] lg:scale-[1.38] lg:origin-center';

// lg:justify-center (04/11/2026): o texto no meio do espaço entre a arte e o
// convite (ver acima). O flex-1 já valia no celular (a faixa); no lg ele
// passa a crescer na vertical.
export const DOOR_BODY = 'relative min-w-0 flex-1 lg:w-full lg:flex lg:flex-col lg:items-center lg:justify-center lg:mt-3';
export const DOOR_HINT = 'block mt-1.5 text-[13px] sm:text-sm leading-snug lg:mt-2.5 lg:max-w-[30ch]';
export const DOOR_CHIPS = 'mt-2.5 flex flex-wrap items-center gap-1.5 lg:mt-3.5 lg:justify-center';
// A seta (e, no computador, o convite escrito ao lado dela).
export const DOOR_CTA = 'relative shrink-0 inline-flex items-center gap-2 text-sm font-semibold lg:mt-auto lg:pt-5';
export const DOOR_CTA_LABEL = 'hidden lg:inline';
