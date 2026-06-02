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
      // base: deep burnished gold darkness
      'bg-[radial-gradient(ellipse_at_60%_40%,#2d1e00,#1a0e00_60%,#0d0700)]',
      'border-[3px] border-yellow-500',
      'shadow-[0_0_0_1px_#fbbf24_inset,0_0_40px_rgba(245,158,11,0.45)]',
      // ornamental gold grid lines
      'before:absolute before:inset-0',
      'before:bg-[repeating-linear-gradient(90deg,transparent,transparent_79px,rgba(253,230,138,0.08)_79px,rgba(253,230,138,0.08)_80px),repeating-linear-gradient(0deg,transparent,transparent_39px,rgba(253,230,138,0.05)_39px,rgba(253,230,138,0.05)_40px)]',
      'before:pointer-events-none',
      // sweeping shimmer beam across the full width
      'after:absolute after:inset-0',
      'after:bg-[linear-gradient(105deg,transparent_30%,rgba(253,230,138,0.25)_50%,transparent_70%)]',
      'after:animate-[gold-banner-sweep_4s_ease-in-out_infinite]',
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
    className: 'relative overflow-hidden border-4 border-cyan-400 dark:border-cyan-300 bg-gradient-to-br from-cyan-950/60 via-blue-950/40 to-cyan-900/60 dark:from-cyan-950/80 dark:via-blue-950/60 dark:to-cyan-900/80 shadow-[0_0_35px_rgba(34,211,238,0.6),inset_0_0_35px_rgba(147,197,253,0.3)] dark:shadow-[0_0_45px_rgba(34,211,238,0.7),inset_0_0_45px_rgba(147,197,253,0.4)] before:absolute before:inset-0 before:bg-gradient-to-br before:from-cyan-200/30 before:via-blue-200/20 before:to-cyan-300/30 before:animate-ice-crystallize-banner before:-z-10 before:pointer-events-none after:absolute after:inset-0 after:bg-[radial-gradient(circle_at_25%_25%,rgba(255,255,255,0.5)_0%,transparent_30%),radial-gradient(circle_at_75%_75%,rgba(147,197,253,0.4)_0%,transparent_30%),radial-gradient(circle_at_50%_50%,rgba(34,211,238,0.3)_0%,transparent_40%)] after:animate-ice-sparkle-banner after:-z-10 after:pointer-events-none'
  },
  bttf: {
    id: 'bttf',
    name: 'Back to the Future Banner',
    isPremium: true,
    requiredTag: 'flux-capacitor-fan',
    className: 'relative overflow-hidden border-4 border-orange-400 dark:border-orange-500 bg-gradient-to-br from-orange-950/60 via-yellow-900/40 to-orange-900/60 dark:from-orange-950/80 dark:via-yellow-900/60 dark:to-orange-900/80 shadow-[0_0_35px_rgba(251,146,60,0.7),inset_0_0_30px_rgba(251,146,60,0.2)] dark:shadow-[0_0_45px_rgba(251,146,60,0.8),inset_0_0_40px_rgba(251,146,60,0.3)] before:absolute before:inset-0 before:bg-gradient-to-r before:from-orange-400/20 before:via-yellow-300/30 before:to-orange-400/20 before:animate-bttf-time-wave before:-z-10 before:pointer-events-none after:absolute after:inset-0 after:bg-[linear-gradient(45deg,transparent_40%,rgba(251,146,60,0.4)_50%,transparent_60%)] after:bg-[length:200%_200%] after:animate-bttf-lightning-strike after:-z-10 after:pointer-events-none'
  },
  potter: {
    id: 'potter',
    name: 'Harry Potter Banner',
    isPremium: true,
    requiredTag: 'hogwarts-graduate',
    className: 'relative overflow-hidden border-4 border-purple-500 dark:border-purple-400 bg-gradient-to-br from-purple-950/70 via-violet-900/50 to-purple-950/70 dark:from-purple-950/90 dark:via-violet-900/70 dark:to-purple-950/90 shadow-[0_0_40px_rgba(168,85,247,0.7),inset_0_0_35px_rgba(168,85,247,0.25)] dark:shadow-[0_0_50px_rgba(168,85,247,0.8),inset_0_0_45px_rgba(168,85,247,0.35)] before:absolute before:inset-0 before:bg-gradient-to-br before:from-purple-300/30 before:via-violet-400/20 before:to-fuchsia-300/30 before:animate-hp-magic-wave before:-z-10 before:pointer-events-none after:absolute after:inset-0 after:bg-[radial-gradient(circle_at_25%_25%,rgba(168,85,247,0.4)_0%,transparent_40%),radial-gradient(circle_at_75%_75%,rgba(217,70,239,0.3)_0%,transparent_40%),radial-gradient(circle_at_50%_50%,rgba(192,132,252,0.3)_0%,transparent_50%)] after:animate-hp-sparkle-banner after:-z-10 after:pointer-events-none'
  },
  transformers: {
    id: 'transformers',
    name: 'Transformers Banner',
    isPremium: true,
    requiredTag: 'cybertron-sentinel',
    className: 'relative overflow-hidden border-4 border-gray-800 dark:border-gray-700 bg-gradient-to-br from-black/90 via-gray-950/80 to-black/90 dark:from-black dark:via-gray-950 dark:to-black shadow-[0_0_40px_rgba(23,23,23,0.9),0_0_60px_rgba(59,130,246,0.4),inset_0_0_40px_rgba(59,130,246,0.2)] dark:shadow-[0_0_50px_rgba(23,23,23,1),0_0_70px_rgba(59,130,246,0.5),inset_0_0_50px_rgba(59,130,246,0.25)] before:absolute before:inset-0 before:bg-[conic-gradient(from_90deg_at_50%_50%,transparent,rgba(59,130,246,0.3),transparent)] before:animate-tf-gears-banner before:-z-10 before:pointer-events-none after:absolute after:inset-0 after:bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,rgba(59,130,246,0.15)_2px,rgba(59,130,246,0.15)_4px),repeating-linear-gradient(90deg,transparent,transparent_2px,rgba(59,130,246,0.15)_2px,rgba(59,130,246,0.15)_4px)] after:animate-tf-circuit after:-z-10 after:pointer-events-none'
  }
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
