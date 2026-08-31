export const banners = {
  default: {
    id: 'default',
    name: 'Default',
    isPremium: false,
    requiredTag: null,
    className: ''
  },
  gold: {
    id: 'gold',
    name: 'Gold Banner',
    isPremium: true,
    requiredTag: null,
    className: [
      'relative overflow-hidden',
      // Antes: fundo marrom/preto "queimado", borda grossa sólida amarela,
      // padrão de grade decorativa — visual datado, tipo interface de jogo
      // antigo. Agora: gradiente escuro sofisticado com um toque quente
      // de dourado, borda fina e translúcida (mesma linguagem visual das
      // bordas glassmorphism já usadas no resto do site, só que no tom do
      // tema), sem padrão de grade repetitivo.
      'bg-gradient-to-br from-neutral-950 via-[#594f17] to-neutral-950',
      'border border-amber-400/25',
      'shadow-[0_0_35px_rgba(251,191,36,0.18),inset_0_1px_0_rgba(251,191,36,0.15)]',
      // Brilho de canto sutil e estático — dá profundidade e um ponto
      // focal de luz, sem o excesso "gamer" do padrão de grade repetitivo
      // do design anterior.
      'before:absolute before:inset-0',
      'before:bg-[radial-gradient(circle_at_85%_15%,rgba(251,191,36,0.16),transparent_50%)]',
      'before:pointer-events-none',
      // Brilho que aparece, atravessa e desaparece de verdade — técnica
      // de referência trazida pelo usuário (efeito de hover holográfico),
      // adaptada pra disparar sozinha a cada 5 segundos.
      //
      // As duas tentativas anteriores (deslocar um elemento do tamanho do
      // banner de um lado a outro) tinham um problema de fundo: mesmo com
      // a posição correta, o brilho ficava sempre 100% visível enquanto
      // se movia — só "saía" da view por posição, nunca por opacidade.
      // Isso fazia parecer que ele "pendula" dentro do banner em vez de
      // sumir de verdade. Essa técnica nova resolve isso combinando DUAS
      // coisas ao mesmo tempo: o elemento sempre começa e termina com
      // opacity:0 (genuinamente invisível, não só fora de posição), E se
      // desloca diagonalmente enquanto isso acontece — ele desvanece
      // ANTES mesmo de terminar o movimento, garantindo que "sumir" seja
      // sempre visível de verdade, não dependente só de geometria.
      'after:absolute after:-top-1/2 after:-left-1/2 after:w-[200%] after:h-[200%]',
      'after:bg-[linear-gradient(0deg,transparent,transparent_40%,rgba(255,255,255,0.35))]',
      'after:pointer-events-none',
    ].join(' '),
  },
  matrix: {
    id: 'matrix',
    name: 'Matrix Banner',
    isPremium: true,
    requiredTag: 'red-pill-adept',
    className: [
      'relative overflow-hidden',
      'bg-[#000e00]',
      'border-[3px] border-green-500',
      'shadow-[0_0_30px_rgba(34,197,94,0.5),0_0_0_1px_rgba(34,197,94,0.2)_inset]',
      // falling digital rain: vertical repeating stripes of varying opacity
      'before:absolute before:inset-0',
      'before:bg-[repeating-linear-gradient(0deg,transparent,transparent_5px,rgba(34,197,94,0.12)_5px,rgba(34,197,94,0.12)_6px)]',
      'before:animate-[matrix-banner-rain_0.7s_linear_infinite]',
      'before:pointer-events-none',
      // horizontal bright scanline sweeping top→bottom
      'after:absolute after:inset-0',
      'after:bg-[linear-gradient(180deg,transparent_40%,rgba(34,197,94,0.35)_50%,transparent_60%)]',
      'after:animate-[matrix-banner-scan_2s_linear_infinite]',
      'after:pointer-events-none',
    ].join(' '),
  },
  saw: {
    id: 'saw',
    name: 'Saw Banner',
    isPremium: true,
    requiredTag: 'visceral-gamer',
    className: [
      'relative overflow-hidden',
      'bg-[radial-gradient(ellipse_at_50%_0%,#3b0000_0%,#1c0000_50%,#0d0000_100%)]',
      'border-[3px] border-red-700',
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
    name: 'Ice Age Banner',
    isPremium: true,
    requiredTag: 'nuts',
    className: [
      'relative overflow-hidden',
      'bg-[radial-gradient(ellipse_at_40%_60%,#00243f,#001a2e_55%,#000c18_100%)]',
      'border-[3px] border-cyan-400',
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
    name: 'Back to the Future Banner',
    isPremium: true,
    requiredTag: 'flux-capacitor-fan',
    className: [
      'relative overflow-hidden',
      'bg-[radial-gradient(ellipse_at_50%_50%,#150d00,#0a0500_60%,#030200_100%)]',
      'border-[3px] border-orange-500',
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
    name: 'Harry Potter Banner',
    isPremium: true,
    requiredTag: 'hogwarts-graduate',
    className: [
      'relative overflow-hidden',
      'bg-[radial-gradient(ellipse_at_30%_50%,#1a0030,#0d0014_55%,#060008_100%)]',
      'border-[3px] border-purple-600',
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
    name: 'Transformers Banner',
    isPremium: true,
    requiredTag: 'cybertron-sentinel',
    className: [
      'relative overflow-hidden',
      'bg-[#020202]',
      'border-[3px] border-blue-900',
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
  deathdodger: {
    id: 'deathdodger',
    name: 'Final Destination Banner',
    isPremium: true,
    requiredTag: 'death-dodger',
    className: [
      'relative overflow-hidden',
      // Fundo agora via background-color normal — antes usava um hack de
      // box-shadow inset gigante (9999px) só pra forçar cor de fundo, mais
      // pesado pro navegador calcular e frágil em telas muito grandes.
      'bg-[#0a0a0a]',
      'border-[3px] border-red-900',
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
    name: 'Casual Drinker Banner',
    isPremium: true,
    requiredTag: 'casual-drinker',
    className: [
      'relative overflow-hidden',
      // Fundo agora via background-color normal — mesmo motivo do banner
      // acima, trocado o hack de box-shadow inset gigante.
      'bg-[#060810]',
      'border-[3px] border-amber-500',
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