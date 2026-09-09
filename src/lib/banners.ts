export const banners = {
  default: {
    id: 'default',
    textTheme: 'auto',
    name: 'Default',
    isPremium: false,
    requiredTag: null,
    className: ''
  },
  gold: {
  id: 'gold',
    textTheme: 'dark',
  name: 'Gold Banner',
  isPremium: true,
  requiredTag: null,
  // Redesenhado como Gold Glass Frutiger Aero — a estética de vidro
  // brilhante do Windows Vista/macOS Aqua de meados dos anos 2000: fundo
  // vibrante simulando uma esfera de vidro iluminada (não mais um
  // degradê escuro e chapado), o icônico reflexo convexo cobrindo a
  // metade superior (a marca registrada visual do Aero/Aqua), bolhas
  // translúcidas flutuantes, e bordas com luz/sombra internas simulando
  // a superfície convexa de verdade.
  className: [
    'relative overflow-hidden backdrop-blur-xl',

    // Fundo — esfera de vidro DOURADO-AMARELADO iluminada (paleta
    // deslocada de âmbar/laranja pra amarelo puro), e os stops do
    // gradiente principal agora usam rgba com transparência real (em
    // vez de hex sólido) — deixa o que está atrás se misturar, seguindo
    // o mesmo conceito de vidro translúcido usado no resto do site, em
    // vez de uma superfície opaca.
    'bg-[radial-gradient(circle_at_25%_20%,rgba(255,255,255,0.4)_0%,transparent_9%),radial-gradient(circle_at_70%_60%,rgba(255,250,205,0.2)_0%,transparent_7%),radial-gradient(circle_at_55%_88%,rgba(255,255,255,0.14)_0%,transparent_5%),radial-gradient(ellipse_at_35%_15%,rgba(254,249,195,0.9)_0%,rgba(250,204,21,0.8)_22%,rgba(202,138,4,0.72)_48%,rgba(133,77,14,0.65)_75%,rgba(66,32,6,0.55)_100%)]',

    // Borda e sombra — mais clara e translúcida (yellow em vez de
    // amber), luz no topo interno, sombra suave embaixo.
    '!border-[3px] !border-yellow-200/60',
    'shadow-[0_0_35px_rgba(250,204,21,0.3),inset_0_2px_0_rgba(255,255,255,0.55),inset_0_-3px_6px_rgba(66,32,6,0.35)]',

    // O reflexo convexo icônico do Aero/Aqua — faixa clara cobrindo a
    // metade superior, com a borda inferior arredondada simulando o
    // brilho de uma cúpula de vidro (o elemento mais reconhecível
    // desse estilo visual).
    'before:absolute before:inset-x-0 before:top-0 before:h-[52%]',
    'before:bg-gradient-to-b before:from-white/45 before:via-white/12 before:to-transparent',
    'before:rounded-b-[100%]',
    'before:pointer-events-none',

    // Feixe de brilho reluzente (mantido) — cruza o banner periodicamente,
    // como um reflexo de luz deslizando sobre a superfície de vidro.
    'after:absolute after:top-0 after:left-0 after:h-full after:w-1/2',
    'after:bg-gradient-to-r after:from-transparent after:via-white/40 after:to-transparent',
    'after:pointer-events-none',
    'after:animate-[gold-shine_6s_ease-in-out_infinite]',
    ].join(' '),
  },
  matrix: {
  id: 'matrix',
    textTheme: 'light',
  name: 'Matrix Banner',
  isPremium: true,
  requiredTag: 'red-pill-adept',
  className: [
    'relative overflow-hidden',
    // Fundo do monitor desligado (preto com um levíssimo tom esverdeado)
    'bg-[#020b02]',
    // Borda fina e moderna (glassmorphism style) em vez da borda grossa antiga
    '!border-[3px] !border-green-500',
    // Vignette (bordas profundamente escurecidas simulando a tela CRT) + Brilho neon
    'shadow-[0_0_20px_rgba(34,197,94,0.15),inset_0_0_50px_rgba(0,0,0,0.95)]',
    
    // CAMADA 1: A Chuva Digital (Matrix Rain)
    'before:absolute before:inset-0',
    'before:matrix-digital-rain',
    'before:pointer-events-none',
    
    // CAMADA 2: O Vidro do Monitor (Scanline de Varredura + Reflexo de Tela)
    'after:absolute after:inset-0',
    'after:crt-scanline-effect',
    'after:shadow-[inset_0_0_15px_rgba(34,197,94,0.2)]', // Brilho interno no vidro
    'after:pointer-events-none',
  ].join(' '),
},
  saw: {
    id: 'saw',
    textTheme: 'light',
    name: 'Saw Banner',
    isPremium: true,
    requiredTag: 'visceral-gamer',
    className: [
      'relative overflow-hidden',
      'bg-[radial-gradient(ellipse_at_50%_0%,#3b0000_0%,#1c0000_50%,#0d0000_100%)]',
      '!border-[3px] !border-red-700',
      'shadow-[0_0_35px_rgba(185,28,28,0.6)_inset,0_0_20px_rgba(185,28,28,0.4)]',
      // pulsing core radial that breathes like a heartbeat
      'before:absolute before:inset-0',
      'before:bg-[radial-gradient(ellipse_at_50%_30%,rgba(220,38,38,0.45),transparent_65%)]',
      'before:animate-[saw-banner-pulse_1.2s_ease-in-out_infinite]',
      'before:pointer-events-none',
      // dripping top edge: bright line that fades downward
      'after:absolute after:top-0 after:left-0 after:right-0 after:h-[3px]',
      'after:bg-gradient-to-r after:from-transparent after:via-red-500 after:to-transparent',
      'after:shadow-[0_0_8px_#ef4444,0_2px_16px_rgba(220,38,38,0.6)]',
      'after:animate-[saw-banner-drip_2.5s_ease-in-out_infinite]',
    ].join(' '),
  },
  ice: {
    id: 'ice',
    textTheme: 'light',
    name: 'Ice Age Banner',
    isPremium: true,
    requiredTag: 'nuts',
    className: [
      'relative overflow-hidden',
      'bg-[radial-gradient(ellipse_at_40%_60%,#00243f,#001a2e_55%,#000c18_100%)]',
      '!border-[3px] !border-cyan-400',
      'shadow-[0_0_40px_rgba(103,232,249,0.4)_inset,0_0_25px_rgba(103,232,249,0.5)]',
      // frost facet pattern: diagonal crossing lines
      'before:absolute before:inset-0',
      'before:bg-[repeating-linear-gradient(60deg,transparent,transparent_24px,rgba(103,232,249,0.06)_24px,rgba(103,232,249,0.06)_25px),repeating-linear-gradient(120deg,transparent,transparent_24px,rgba(147,197,253,0.05)_24px,rgba(147,197,253,0.05)_25px)]',
      'before:pointer-events-none',
      // sweeping ice-glint highlight
      'after:absolute after:inset-0',
      'after:bg-[linear-gradient(120deg,transparent_20%,rgba(255,255,255,0.12)_50%,transparent_80%)]',
      'after:animate-[ice-banner-glint_4s_ease-in-out_infinite]',
      'after:pointer-events-none',
    ].join(' '),
  },
  bttf: {
    id: 'bttf',
    textTheme: 'light',
    name: 'Back to the Future Banner',
    isPremium: true,
    requiredTag: 'flux-capacitor-fan',
    className: [
      'relative overflow-hidden',
      'bg-[radial-gradient(ellipse_at_50%_50%,#150d00,#0a0500_60%,#030200_100%)]',
      '!border-[3px] !border-orange-500',
      'shadow-[0_0_40px_rgba(251,146,60,0.5)_inset,0_0_25px_rgba(251,146,60,0.4)]',
      // warp lines
      'before:absolute before:inset-0',
      'before:bg-[repeating-linear-gradient(90deg,transparent,transparent_19px,rgba(251,191,36,0.1)_19px,rgba(251,191,36,0.1)_20px)]',
      'before:animate-[bttf-banner-warp_0.4s_linear_infinite]',
      'before:pointer-events-none',
      // teleport flash azul+laranja
      'after:absolute after:inset-0',
      'after:bg-[radial-gradient(ellipse_at_48%_50%,rgba(59,130,246,0.85)_0%,rgba(251,146,60,0.6)_35%,transparent_65%)]',
      'after:animate-[bttf-banner-flash_3.5s_ease-in-out_infinite]',
      'after:pointer-events-none',
    ].join(' '),
  },
  potter: {
    id: 'potter',
    textTheme: 'light',
    name: 'Harry Potter Banner',
    isPremium: true,
    requiredTag: 'hogwarts-graduate',
    className: [
      'relative overflow-hidden',
      'bg-[radial-gradient(ellipse_at_30%_50%,#1a0030,#0d0014_55%,#060008_100%)]',
      '!border-[3px] !border-purple-600',
      'shadow-[0_0_40px_rgba(168,85,247,0.45)_inset,0_0_30px_rgba(168,85,247,0.5)]',
      // dual orb nebula glows
      'before:absolute before:inset-0',
      'before:bg-[radial-gradient(circle_at_20%_50%,rgba(168,85,247,0.3),transparent_45%),radial-gradient(circle_at_80%_50%,rgba(217,70,239,0.25),transparent_45%)]',
      'before:animate-[potter-banner-orbs_4s_ease-in-out_infinite]',
      'before:pointer-events-none',
      // shimmer wave across the full width
      'after:absolute after:inset-0',
      'after:bg-[linear-gradient(90deg,transparent_25%,rgba(216,180,254,0.15)_50%,transparent_75%)]',
      'after:animate-[potter-banner-shimmer_6s_ease-in-out_infinite]',
      'after:pointer-events-none',
    ].join(' '),
  },
  transformers: {
    id: 'transformers',
    textTheme: 'light',
    name: 'Transformers Banner',
    isPremium: true,
    requiredTag: 'cybertron-sentinel',
    className: [
      'relative overflow-hidden',
      'bg-[#020202]',
      '!border-[3px] !border-blue-900',
      'shadow-[0_0_40px_rgba(59,130,246,0.25)_inset,0_0_30px_rgba(59,130,246,0.35),0_0_0_1px_rgba(59,130,246,0.15)_inset]',
      // circuit board grid
      'before:absolute before:inset-0',
      'before:bg-[repeating-linear-gradient(0deg,transparent,transparent_15px,rgba(59,130,246,0.07)_15px,rgba(59,130,246,0.07)_16px),repeating-linear-gradient(90deg,transparent,transparent_15px,rgba(59,130,246,0.07)_15px,rgba(59,130,246,0.07)_16px)]',
      'before:pointer-events-none',
      // energy scan beam sweeping left→right
      'after:absolute after:inset-0',
      'after:bg-[linear-gradient(90deg,transparent_0%,rgba(59,130,246,0.3)_50%,transparent_100%)]',
      'after:w-[50%] after:animate-[tf-banner-scan_3s_linear_infinite]',
      'after:pointer-events-none',
    ].join(' '),
  },
  hellrider: {
    id: 'hellrider',
    textTheme: 'light',
    name: 'Spirit of Vengeance Banner',
    isPremium: true,
    requiredTag: 'hell-rider',
    className: [
      'relative overflow-hidden',
      // Preto profundo, com um leve gradiente radial pra dar profundidade
      // em vez de uma cor sólida completamente chapada.
      'bg-[radial-gradient(ellipse_at_50%_50%,#0d0d0d_0%,#000000_70%)]',
      // Borda dourada — mesma cor do ring do Ghost Rider Frame (#c5b358),
      // consistência visual entre os dois itens do mesmo desbloqueio.
      '!border-[3px] !border-[#c5b358]',
      'shadow-[0_0_30px_rgba(197,179,88,0.25)_inset,0_0_25px_rgba(197,179,88,0.3)]',
      // Padrão de correntes: duas faixas diagonais cruzadas (X), simulando
      // elos metálicos entrelaçados. Balança devagar, como o peso de uma
      // corrente pendurada.
      'before:absolute before:inset-0',
      'before:bg-[repeating-linear-gradient(45deg,transparent,transparent_9px,rgba(197,179,88,0.14)_9px,rgba(197,179,88,0.14)_13px,transparent_13px,transparent_22px),repeating-linear-gradient(-45deg,transparent,transparent_9px,rgba(140,126,58,0.12)_9px,rgba(140,126,58,0.12)_13px,transparent_13px,transparent_22px)]',
      'before:animate-[hellrider-chain-sway_4s_ease-in-out_infinite]',
      'before:pointer-events-none',
      // Brilho metálico percorrendo os elos, da esquerda pra direita.
      'after:absolute after:inset-0 after:w-1/2',
      'after:bg-gradient-to-r after:from-transparent after:via-[#c5b358]/25 after:to-transparent',
      'after:animate-[hellrider-chain-glint_3.5s_ease-in-out_infinite]',
      'after:pointer-events-none',
    ].join(' '),
  },
  deathdodger: {
    id: 'deathdodger',
    textTheme: 'light',
    name: 'Final Destination Banner',
    isPremium: true,
    requiredTag: 'death-dodger',
    className: [
      'relative overflow-hidden',
      // Fundo agora via background-color normal — antes usava um hack de
      // box-shadow inset gigante (9999px) só pra forçar cor de fundo, mais
      // pesado pro navegador calcular e frágil em telas muito grandes.
      'bg-[#0a0a0a]',
      '!border-[3px] !border-red-900',
      'shadow-[0_0_0_1px_#3f0000,0_0_35px_rgba(185,28,28,0.6),0_0_60px_rgba(100,0,0,0.4)]',
      'before:absolute before:inset-0',
      'before:bg-[repeating-linear-gradient(0deg,transparent,transparent_17px,rgba(180,180,180,0.08)_17px,rgba(180,180,180,0.08)_18px),repeating-linear-gradient(90deg,transparent,transparent_17px,rgba(180,180,180,0.08)_17px,rgba(180,180,180,0.08)_18px)]',
      'before:pointer-events-none',
      'after:absolute after:top-0 after:left-0 after:right-0 after:h-[2px]',
      'after:bg-[linear-gradient(90deg,transparent_0%,rgba(239,68,68,0.4)_10%,rgba(255,50,50,1)_40%,rgba(255,80,80,1)_50%,rgba(255,50,50,1)_60%,rgba(239,68,68,0.4)_90%,transparent_100%)]',
      'after:shadow-[0_0_6px_#ef4444,0_0_16px_rgba(239,68,68,0.9)]',
      'after:animate-[deathdodger-banner-laser_6s_linear_infinite]',
    ].join(' '),
  },
  'casual-drinker': {
    id: 'casual-drinker',
    textTheme: 'light',
    name: 'Casual Drinker Banner',
    isPremium: true,
    requiredTag: 'casual-drinker',
    className: [
      'relative overflow-hidden',
      // Fundo agora via background-color normal — mesmo motivo do banner
      // acima, trocado o hack de box-shadow inset gigante.
      'bg-[#060810]',
      '!border-[3px] !border-amber-500',
      'shadow-[0_0_25px_rgba(251,191,36,0.5)]',
            // líquido âmbar — sobe e desce de verdade agora, em loop
      'before:absolute before:bottom-0 before:left-0 before:right-0',
      'before:bg-[linear-gradient(180deg,#fbbf24_0%,#f59e0b_30%,#d97706_65%,#92400e_100%)]',
      'before:shadow-[0_-6px_24px_rgba(251,191,36,0.9)]',
      'before:animate-[casual-drinker-liquid-level_4s_ease-in-out_infinite]',
      'before:pointer-events-none',
            // espuma branca — agora usa a MESMA duração/curva (4s ease-in-out) do
      // nível do líquido, então sobem e descem exatamente juntos.
      'after:absolute after:left-0 after:right-0 after:h-[20px]',
      'after:bg-[linear-gradient(180deg,rgba(255,255,255,0.95)_0%,rgba(255,255,255,1)_50%,rgba(255,248,200,0.9)_100%)]',
      'after:shadow-[0_-4px_16px_rgba(255,255,255,0.7)]',
      'after:animate-[casual-drinker-foam-level_4s_ease-in-out_infinite]',
      'after:pointer-events-none',
    ].join(' '),
  },
} as const;

export type BannerId = keyof typeof banners;

export function getBannerClass(bannerId: string = 'default', isPremium: boolean = false): string {
  if (!bannerId) {
    return banners.default.className;
  }

  const banner = banners[bannerId as BannerId];

  if (!bannerId || !banner || (banner.isPremium && !isPremium)) {
    return banners.default.className;
  }

  return banner.className;
}

// Cor de texto pra conteúdo renderizado POR CIMA do banner (username,
// bio, stats) — problema real descoberto com o Gold Banner: texto
// usava classes fixas (dark:text-white) relativas ao TEMA do site, não
// à cor real do banner por trás. Um banner CLARO como o Gold, com o
// site em modo escuro, deixava o texto branco quase invisível sobre um
// fundo amarelo claro. Cada banner agora declara seu próprio
// textTheme, e essa função devolve a classe certa — escala pra
// qualquer banner futuro sem precisar detectar contraste em tempo de
// execução: 'light' (banners escuros, a maioria) sempre usa texto
// branco; 'dark' (banners claros, como o Gold) sempre usa texto escuro;
// 'auto' (default, sem banner equipado) mantém o comportamento padrão
// de seguir o tema claro/escuro do site.
export function getBannerTextClass(bannerId: string = 'default', isPremium: boolean = false): string {
  const banner = banners[bannerId as BannerId];
  const theme = (!banner || (banner.isPremium && !isPremium)) ? 'auto' : banner.textTheme;

  if (theme === 'dark') return 'text-gray-900';
  if (theme === 'light') return 'text-white';
  return 'text-gray-900 dark:text-white';
}

// Variante pra textos secundários (bio, labels de stats) — um pouco
// mais suave que o texto principal, mas ainda com contraste seguro
// contra o banner por trás.
export function getBannerSecondaryTextClass(bannerId: string = 'default', isPremium: boolean = false): string {
  const banner = banners[bannerId as BannerId];
  const theme = (!banner || (banner.isPremium && !isPremium)) ? 'auto' : banner.textTheme;

  if (theme === 'dark') return 'text-gray-700';
  if (theme === 'light') return 'text-gray-200';
  return 'text-gray-600 dark:text-gray-300';
}