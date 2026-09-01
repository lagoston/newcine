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
    // Rotação removida. O "glitch" é o avatar desaparecendo — mas agora,
    // em vez de cobrir com um verde-escuro quase sólido, o overlay é um
    // brilho radial verde saturado emanando do centro (mais forte no
    // meio, decaindo pras bordas) — dá a sensação de o avatar sumindo
    // dentro de uma explosão de energia verde, não só apagando pra preto.
    className: 'relative ring-4 ring-green-400 dark:ring-green-500 shadow-[0_0_25px_rgba(34,197,94,0.8),0_0_50px_rgba(34,197,94,0.4)] dark:shadow-[0_0_30px_rgba(34,197,94,0.9),0_0_60px_rgba(34,197,94,0.5)] before:absolute before:inset-0 before:rounded-full before:border-2 before:border-green-400/50 after:absolute after:inset-0 after:rounded-full after:bg-[radial-gradient(circle,rgba(74,222,128,0.95)_0%,rgba(21,128,61,0.9)_55%,rgba(2,11,2,0.85)_100%)] after:animate-matrix-frame-glitch after:pointer-events-none'
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
    // repetido) saíram. Rotação removida, e o flash de raio voltou — o
    // gradiente de energia agora pisca com um clarão branco/dourado
    // intermitente (2 flashes rápidos por ciclo, como um raio de
    // verdade), em vez de ficar parado ou girando.
    className: 'relative ring-4 ring-orange-400 dark:ring-orange-500 shadow-[0_0_25px_rgba(251,146,60,0.8),0_0_50px_rgba(251,146,60,0.4)] dark:shadow-[0_0_30px_rgba(251,146,60,0.9),0_0_60px_rgba(251,146,60,0.5)] before:absolute before:inset-0 before:rounded-full before:bg-gradient-to-tr before:from-orange-100/70 before:via-yellow-200/80 before:to-orange-300/70 before:animate-bttf-frame-flash before:pointer-events-none'
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
    // Ideia de engrenagem/dentes abandonada por completo — não funcionava
    // bem visualmente. O formato REAL do avatar muda — círculo →
    // pentágono → quadrado → triângulo → círculo, 2s em cada, via
    // clip-path aplicado direto no elemento principal (corta tudo dentro,
    // incluindo a foto de verdade, não só decoração por cima). Sem
    // rounded-full fixo, já que o formato agora varia com o tempo.
    //
    // Trocado "ring-4" (que usa box-shadow por baixo dos panos) por
    // "border-4" (borda de verdade) — box-shadow não acompanha o
    // clip-path de forma confiável em todos os navegadores (a borda
    // ficava sempre circular, presa no formato original, enquanto só o
    // conteúdo interno mudava de forma) — border, sendo literalmente a
    // borda geométrica da caixa, é cortado pelo clip-path com garantia,
    // seguindo cada forma corretamente.
    className: 'relative border-4 border-gray-800 dark:border-gray-700 shadow-[0_0_30px_rgba(23,23,23,0.9),0_0_50px_rgba(59,130,246,0.3)] dark:shadow-[0_0_40px_rgba(23,23,23,1),0_0_60px_rgba(59,130,246,0.4)] animate-tf-shape-morph'
  },
'death-dodger': {
  id: 'death-dodger',
  name: 'Death Dodger Frame',
  isPremium: true,
  requiredTag: 'death-dodger',
  // O facho giratório (radar) saiu por completo. O efeito de sangue
  // periódico saiu também — a tentativa de escondê-lo atrás da caveira
  // reduzindo a escala não funcionava de verdade (o emoji continuava
  // perceptível, mesmo pequeno — daí o bug da "mini caveirinha" a cada
  // 10s). Agora é só a entrada da caveira, MAIS LUMINOSA (centro quase
  // branco/amarelo estourado, sombra externa bem mais intensa em
  // camadas), e ela entra UMA VEZ SÓ aos 30 segundos e PERMANECE lá —
  // não volta a sumir nem reinicia o ciclo (animation com
  // iteration-count:1 + fill-mode:both, configurada no tailwind.config).
  className: 'relative ring-4 ring-red-900 shadow-[0_0_18px_rgba(220,38,38,0.9),0_0_40px_rgba(185,28,28,0.5),inset_0_0_15px_rgba(185,28,28,0.2)] before:absolute before:inset-0 before:rounded-full before:shadow-[inset_0_0_20px_rgba(220,38,38,0.5)] before:pointer-events-none after:absolute after:inset-0 after:rounded-full after:flex after:items-center after:justify-center after:text-4xl after:content-["💀"] after:bg-[radial-gradient(circle,rgba(255,255,255,1)_0%,rgba(254,202,202,1)_25%,rgba(239,68,68,1)_60%,rgba(127,29,29,1)_100%)] after:shadow-[0_0_25px_rgba(255,255,255,0.9),0_0_55px_rgba(239,68,68,1),0_0_90px_rgba(220,38,38,0.8)] after:animate-deathdodger-skull-reveal after:pointer-events-none'
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