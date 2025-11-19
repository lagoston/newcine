export const banners = {
  default: {
    id: 'default',
    name: 'Default',
    isPremium: false,
    className: ''
  },
  gold: {
    id: 'gold',
    name: 'Gold Banner',
    isPremium: true,
    className: 'relative overflow-hidden border-4 border-yellow-400 dark:border-yellow-500 bg-gradient-to-br from-yellow-900/30 via-yellow-800/20 to-amber-900/30 dark:from-yellow-900/40 dark:via-yellow-800/30 dark:to-amber-900/40 shadow-[0_0_40px_rgba(234,179,8,0.4),inset_0_0_30px_rgba(234,179,8,0.2)] dark:shadow-[0_0_50px_rgba(234,179,8,0.5),inset_0_0_40px_rgba(234,179,8,0.3)] before:absolute before:inset-0 before:bg-gradient-to-r before:from-transparent before:via-yellow-200/30 before:to-transparent before:animate-gold-sweep before:-z-10 before:pointer-events-none after:absolute after:inset-0 after:bg-[radial-gradient(circle_at_20%_50%,rgba(234,179,8,0.2),transparent_50%),radial-gradient(circle_at_80%_50%,rgba(234,179,8,0.2),transparent_50%)] after:animate-gold-shimmer-banner after:-z-10 after:pointer-events-none'
  },
  matrix: {
    id: 'matrix',
    name: 'Matrix Banner',
    isPremium: true,
    className: 'relative overflow-hidden border-4 border-green-400 dark:border-green-500 bg-gradient-to-br from-green-950/60 via-green-900/40 to-emerald-950/60 dark:from-green-950/80 dark:via-green-900/60 dark:to-emerald-950/80 shadow-[0_0_30px_rgba(34,197,94,0.6),inset_0_0_30px_rgba(34,197,94,0.15)] dark:shadow-[0_0_40px_rgba(34,197,94,0.7),inset_0_0_40px_rgba(34,197,94,0.2)] before:absolute before:inset-0 before:bg-[linear-gradient(0deg,transparent_0%,rgba(34,197,94,0.3)_50%,transparent_100%)] before:bg-[length:100%_200%] before:animate-matrix-code-rain before:-z-10 before:pointer-events-none after:absolute after:inset-0 after:bg-[linear-gradient(90deg,transparent_0%,rgba(34,197,94,0.2)_50%,transparent_100%)] after:animate-matrix-scan-horizontal after:-z-10 after:pointer-events-none'
  },
  saw: {
    id: 'saw',
    name: 'Saw Banner',
    isPremium: true,
    className: 'relative overflow-hidden border-4 border-red-700 dark:border-red-600 bg-gradient-to-br from-red-950/70 via-red-900/50 to-red-950/70 dark:from-red-950/90 dark:via-red-900/70 dark:to-red-950/90 shadow-[0_0_30px_rgba(185,28,28,0.6),inset_0_0_30px_rgba(185,28,28,0.2)] dark:shadow-[0_0_40px_rgba(185,28,28,0.7),inset_0_0_40px_rgba(185,28,28,0.3)] before:absolute before:top-0 before:left-0 before:right-0 before:h-full before:bg-gradient-to-b before:from-red-600/40 before:via-transparent before:to-transparent before:animate-saw-blood-cascade before:-z-10 before:pointer-events-none after:absolute after:inset-0 after:bg-[radial-gradient(circle_at_center,rgba(185,28,28,0.4)_0%,transparent_70%)] after:animate-saw-pulse-intense after:-z-10 after:pointer-events-none'
  },
  ice: {
    id: 'ice',
    name: 'Ice Age Banner',
    isPremium: true,
    className: 'relative overflow-hidden border-4 border-cyan-400 dark:border-cyan-300 bg-gradient-to-br from-cyan-950/60 via-blue-950/40 to-cyan-900/60 dark:from-cyan-950/80 dark:via-blue-950/60 dark:to-cyan-900/80 shadow-[0_0_35px_rgba(34,211,238,0.6),inset_0_0_35px_rgba(147,197,253,0.3)] dark:shadow-[0_0_45px_rgba(34,211,238,0.7),inset_0_0_45px_rgba(147,197,253,0.4)] before:absolute before:inset-0 before:bg-gradient-to-br before:from-cyan-200/30 before:via-blue-200/20 before:to-cyan-300/30 before:animate-ice-crystallize-banner before:-z-10 before:pointer-events-none after:absolute after:inset-0 after:bg-[radial-gradient(circle_at_25%_25%,rgba(255,255,255,0.5)_0%,transparent_30%),radial-gradient(circle_at_75%_75%,rgba(147,197,253,0.4)_0%,transparent_30%),radial-gradient(circle_at_50%_50%,rgba(34,211,238,0.3)_0%,transparent_40%)] after:animate-ice-sparkle-banner after:-z-10 after:pointer-events-none'
  },
  bttf: {
    id: 'bttf',
    name: 'Back to the Future Banner',
    isPremium: true,
    className: 'relative overflow-hidden border-4 border-orange-400 dark:border-orange-500 bg-gradient-to-br from-orange-950/60 via-yellow-900/40 to-orange-900/60 dark:from-orange-950/80 dark:via-yellow-900/60 dark:to-orange-900/80 shadow-[0_0_35px_rgba(251,146,60,0.7),inset_0_0_30px_rgba(251,146,60,0.2)] dark:shadow-[0_0_45px_rgba(251,146,60,0.8),inset_0_0_40px_rgba(251,146,60,0.3)] before:absolute before:inset-0 before:bg-gradient-to-r before:from-orange-400/20 before:via-yellow-300/30 before:to-orange-400/20 before:animate-bttf-time-wave before:-z-10 before:pointer-events-none after:absolute after:inset-0 after:bg-[linear-gradient(45deg,transparent_40%,rgba(251,146,60,0.4)_50%,transparent_60%)] after:bg-[length:200%_200%] after:animate-bttf-lightning-strike after:-z-10 after:pointer-events-none'
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
