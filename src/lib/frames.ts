export const frames = {
  gold: {
    id: 'gold',
    name: 'Gold Frame',
    isPremium: true,
    requiredTag: null,
    className: 'relative ring-4 ring-yellow-400 dark:ring-yellow-500 shadow-[0_0_30px_rgba(234,179,8,0.6)] dark:shadow-[0_0_40px_rgba(234,179,8,0.8)] animate-gold-shimmer before:absolute before:inset-0 before:rounded-full before:bg-gradient-to-tr before:from-yellow-200/30 before:via-yellow-400/20 before:to-yellow-600/30 before:animate-gold-rotate before:pointer-events-none'
  },
  matrix: {
    id: 'matrix',
    name: 'Matrix Frame',
    isPremium: true,
    requiredTag: 'red-pill-adept',
    // Rotação removida. O "glitch" agora é o próprio avatar desaparecendo
    // — um overlay opaco (verde-escuro digital) cobre a foto por completo
    // numa fração de segundo, a cada 5s, simulando falha de sinal. Como o
    // ::before/::after do quadro não conseguem alterar a <img> do avatar
    // diretamente (são caixas próprias, não "vazam" pra dentro de outros
    // elementos), a forma de fazer o avatar "sumir" é cobri-lo por cima
    // com uma camada opaca que pisca — visualmente idêntico a um
    // desaparecimento, mesmo sem tocar na imagem em si.
    className: 'relative ring-4 ring-green-400 dark:ring-green-500 shadow-[0_0_25px_rgba(34,197,94,0.8),0_0_50px_rgba(34,197,94,0.4)] dark:shadow-[0_0_30px_rgba(34,197,94,0.9),0_0_60px_rgba(34,197,94,0.5)] before:absolute before:inset-0 before:rounded-full before:border-2 before:border-green-400/50 after:absolute after:inset-0 after:rounded-full after:bg-[#020b02] after:animate-matrix-frame-glitch after:pointer-events-none'
  },
  saw: {
    id: 'saw',
    name: 'Saw Frame',
    isPremium: true,
    requiredTag: 'visceral-gamer',
    className: 'relative ring-4 ring-red-700 dark:ring-red-600 shadow-[0_0_20px_rgba(185,28,28,0.7),0_0_40px_rgba(185,28,28,0.4),inset_0_0_20px_rgba(185,28,28,0.2)] dark:shadow-[0_0_25px_rgba(185,28,28,0.8),0_0_50px_rgba(185,28,28,0.5),inset_0_0_25px_rgba(185,28,28,0.3)] animate-saw-throb before:absolute before:inset-0 before:rounded-full before:bg-gradient-to-b before:from-transparent before:via-red-900/20 before:to-red-950/60 before:animate-saw-drip after:absolute after:top-0 after:left-0 after:right-0 after:h-1/2 after:rounded-t-full after:bg-gradient-to-b after:from-red-600/30 after:to-transparent after:animate-saw-flicker after:pointer-events-none'
  },
  ice: {
    id: 'ice',
    name: 'Ice Age Frame',
    isPremium: true,
    requiredTag: 'nuts',
    className: 'relative ring-4 ring-cyan-400 dark:ring-cyan-300 shadow-[0_0_25px_rgba(34,211,238,0.7),0_0_50px_rgba(34,211,238,0.3),inset_0_0_20px_rgba(147,197,253,0.4)] dark:shadow-[0_0_30px_rgba(34,211,238,0.8),0_0_60px_rgba(34,211,238,0.4),inset_0_0_25px_rgba(147,197,253,0.5)] animate-ice-crystallize before:absolute before:inset-0 before:rounded-full before:bg-gradient-to-br before:from-cyan-200/40 before:via-blue-200/30 before:to-cyan-300/40 before:animate-ice-shimmer after:absolute after:inset-0 after:rounded-full after:bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.6)_0%,transparent_40%),radial-gradient(circle_at_70%_70%,rgba(147,197,253,0.4)_0%,transparent_40%)] after:animate-ice-sparkle after:pointer-events-none'
  },
  bttf: {
    id: 'bttf',
    name: 'Back to the Future Frame',
    isPremium: true,
    requiredTag: 'flux-capacitor-fan',
    // As listras diagonais laranjas (o "after" antigo, um padrão xadrez
    // repetido) saíram — sobrou só a borda, o brilho e a energia (before).
    // Rotação removida — fica estático, só a borda e o gradiente de
    // energia parados.
    className: 'relative ring-4 ring-orange-400 dark:ring-orange-500 shadow-[0_0_25px_rgba(251,146,60,0.8),0_0_50px_rgba(251,146,60,0.4)] dark:shadow-[0_0_30px_rgba(251,146,60,0.9),0_0_60px_rgba(251,146,60,0.5)] before:absolute before:inset-0 before:rounded-full before:bg-gradient-to-tr before:from-orange-200/30 before:via-yellow-300/40 before:to-orange-400/30 before:pointer-events-none'
  },
  potter: {
    id: 'potter',
    name: 'Harry Potter Frame',
    isPremium: true,
    requiredTag: 'hogwarts-graduate',
    className: 'relative ring-4 ring-purple-500 dark:ring-purple-400 shadow-[0_0_30px_rgba(168,85,247,0.8),0_0_60px_rgba(168,85,247,0.4),inset_0_0_25px_rgba(168,85,247,0.3)] dark:shadow-[0_0_40px_rgba(168,85,247,0.9),0_0_70px_rgba(168,85,247,0.5),inset_0_0_30px_rgba(168,85,247,0.4)] animate-hp-magic before:absolute before:inset-0 before:rounded-full before:bg-gradient-to-br before:from-purple-200/40 before:via-violet-300/30 before:to-purple-400/40 before:animate-hp-sparkle after:absolute after:inset-0 after:rounded-full after:bg-[radial-gradient(circle_at_30%_30%,rgba(168,85,247,0.4)_0%,transparent_40%),radial-gradient(circle_at_70%_70%,rgba(217,70,239,0.3)_0%,transparent_40%)] after:animate-hp-shimmer after:pointer-events-none'
  },
  transformers: {
    id: 'transformers',
    name: 'Transformers Frame',
    isPremium: true,
    requiredTag: 'cybertron-sentinel',
    // Não tinha nenhum efeito visível — "tf-mechanical"/"tf-gears"/
    // "tf-grid" nunca existiram de verdade no config. Efeito de
    // engrenagem girando de verdade: dentes desenhados via
    // repeating-conic-gradient, girando em "steps()" (movimento
    // mecânico, em saltos — não suave) usando "tf-gear-outer"/
    // "tf-gear-inner", que já existiam prontas mas nunca foram usadas.
    //
    // Os dentes transcendem a borda de verdade (inset bem negativo, pontas
    // saindo pra fora do círculo) e uma máscara radial garante que só a
    // faixa BEM na borda/exterior fica visível — nada do padrão aparece
    // "por dentro" em direção ao centro/foto, só as pontas na beirada,
    // como dentes de engrenagem de verdade ao redor da roda.
    className: 'relative ring-4 ring-gray-800 dark:ring-gray-700 shadow-[0_0_30px_rgba(23,23,23,0.9),0_0_50px_rgba(59,130,246,0.3),inset_0_0_25px_rgba(59,130,246,0.15)] dark:shadow-[0_0_40px_rgba(23,23,23,1),0_0_60px_rgba(59,130,246,0.4),inset_0_0_30px_rgba(59,130,246,0.2)] before:absolute before:-inset-3 before:rounded-full before:bg-[repeating-conic-gradient(rgba(226,232,240,0.9)_0deg_10deg,transparent_10deg_30deg)] before:[mask-image:radial-gradient(circle,transparent_0%,transparent_78%,white_85%,white_100%)] before:animate-tf-gear-outer before:pointer-events-none after:absolute after:-inset-1 after:rounded-full after:bg-[repeating-conic-gradient(rgba(59,130,246,0.75)_0deg_15deg,transparent_15deg_45deg)] after:[mask-image:radial-gradient(circle,transparent_0%,transparent_82%,white_90%,white_100%)] after:animate-tf-gear-inner after:pointer-events-none'
  },
'death-dodger': {
  id: 'death-dodger',
  name: 'Death Dodger Frame',
  isPremium: true,
  requiredTag: 'death-dodger',
  // O facho giratório (radar) saiu por completo — sem linhas brancas/
  // vermelhas girando. Só sobram 2 pseudo-elementos disponíveis (before/
  // after) pros 2 efeitos novos pedidos:
  //
  // "after" — sangue inundando de baixo pra cima a cada 10 segundos: sobe
  // rápido, fica cheio por um instante, drena de volta, na maior parte
  // do tempo fica invisível (scaleY(0)).
  //
  // "before" — o "toque de gênio": um brilho dourado/branco muito breve
  // (menos de 1s de um ciclo de 60s), quase imperceptível até acontecer.
  // Não é pra chamar atenção o tempo todo — é pra SER RARO, um detalhe
  // sutil e elegante contrastando com o tema sombrio do resto do quadro,
  // que aparece, gira de leve, e some antes que dê tempo de "esperar" por
  // ele — a perfeição sem incomodar.
  className: 'relative ring-4 ring-red-900 shadow-[0_0_18px_rgba(220,38,38,0.9),0_0_40px_rgba(185,28,28,0.5),inset_0_0_15px_rgba(185,28,28,0.2)] before:absolute before:inset-0 before:rounded-full before:bg-[radial-gradient(circle_at_50%_50%,rgba(254,240,180,0.9),rgba(251,191,36,0.4)_45%,transparent_70%)] before:animate-deathdodger-genius-detail before:pointer-events-none after:absolute after:inset-0 after:rounded-full after:origin-bottom after:bg-gradient-to-t after:from-red-800 after:via-red-700/90 after:to-red-600/60 after:animate-deathdodger-blood-flood after:pointer-events-none'
},
      'casual-drinker': {
    id: 'casual-drinker',
    name: 'Casual Drinker Frame',
    isPremium: true,
    requiredTag: 'casual-drinker',
    // Nível de líquido subindo/descendo (before) + bolhas subindo dentro dele
    // (after) — mais vivo que o brilho estático de antes.
        // O efeito que precisa aparecer POR CIMA da foto vai no "after" (nasce
    // depois da foto no empilhamento) — o "before" nasce atrás dela, por isso
    // o nível de líquido nunca aparecia com foto de perfil.
    className: 'relative ring-4 ring-amber-400 dark:ring-amber-300 shadow-[0_0_22px_rgba(251,191,36,0.75),0_0_45px_rgba(245,158,11,0.35),inset_0_0_18px_rgba(251,191,36,0.2)] before:absolute before:inset-0 before:rounded-full before:bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.55)_0%,transparent_28%),radial-gradient(circle_at_70%_75%,rgba(255,255,255,0.3)_0%,transparent_22%)] before:animate-[casual-drinker-frame-bubbles_2.5s_ease-in-out_infinite] before:pointer-events-none after:absolute after:inset-0 after:rounded-full after:bg-gradient-to-t after:from-amber-600/95 after:via-amber-400/85 after:to-transparent after:animate-[casual-drinker-frame-level_4s_ease-in-out_infinite] after:pointer-events-none'
  },
  default: {
    id: 'default',
    name: 'Default',
    isPremium: false,
    requiredTag: null,
    className: 'ring-0'
  }
} as const;

export type FrameId = keyof typeof frames;

export function getFrameClass(frameId: string = 'default', isPremium: boolean = false): string {
  if (!frameId) {
    return frames.default.className;
  }

  const frame = frames[frameId as FrameId];

  if (!frameId || !frame || (frame.isPremium && !isPremium)) {
    return frames.default.className;
  }

  return frame.className;
}