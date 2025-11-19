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
    className: 'relative ring-4 ring-green-400 dark:ring-green-500 shadow-[0_0_25px_rgba(34,197,94,0.8),0_0_50px_rgba(34,197,94,0.4)] dark:shadow-[0_0_30px_rgba(34,197,94,0.9),0_0_60px_rgba(34,197,94,0.5)] animate-matrix-digital before:absolute before:inset-0 before:rounded-full before:border-2 before:border-green-400/50 before:animate-matrix-scan after:absolute after:inset-0 after:rounded-full after:bg-[radial-gradient(circle_at_50%_0%,rgba(34,197,94,0.3),transparent_50%)] after:animate-matrix-pulse after:pointer-events-none'
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
    className: 'relative ring-4 ring-orange-400 dark:ring-orange-500 shadow-[0_0_25px_rgba(251,146,60,0.8),0_0_50px_rgba(251,146,60,0.4)] dark:shadow-[0_0_30px_rgba(251,146,60,0.9),0_0_60px_rgba(251,146,60,0.5)] animate-bttf-lightning before:absolute before:inset-0 before:rounded-full before:bg-gradient-to-tr before:from-orange-200/30 before:via-yellow-300/40 before:to-orange-400/30 before:animate-bttf-energy after:absolute after:inset-0 after:rounded-full after:bg-[linear-gradient(45deg,transparent_25%,rgba(251,146,60,0.3)_25%,rgba(251,146,60,0.3)_50%,transparent_50%,transparent_75%,rgba(251,146,60,0.3)_75%)] after:bg-[length:20px_20px] after:animate-bttf-flux after:pointer-events-none'
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
