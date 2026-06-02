export const frames = {
gold: {
    id: 'gold',
    name: 'Gold Frame',
    isPremium: true,
    requiredTag: null,
    className: [
      // outer glow
      'drop-shadow-[0_0_10px_rgba(251,191,36,0.9)]',
      'drop-shadow-[0_0_28px_rgba(245,158,11,0.55)]',
      // container
      'relative w-16 h-16',
      // spinning metallic ring via pseudo
      'before:absolute before:-inset-1 before:rounded-full',
      'before:bg-[conic-gradient(from_0deg,#f59e0b,#fde68a_15%,#b45309_30%,#fde68a_45%,#f59e0b_55%,#d97706_70%,#fde68a_85%,#f59e0b)]',
      'before:animate-[gold-ring-spin_3s_linear_infinite]',
      // avatar sits on top
      'before:z-0 [&>img]:relative [&>img]:z-10 [&>img]:m-1',
    ].join(' '),
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
    className: 'relative ring-4 ring-gray-800 dark:ring-gray-700 shadow-[0_0_30px_rgba(23,23,23,0.9),0_0_50px_rgba(59,130,246,0.3),inset_0_0_25px_rgba(59,130,246,0.15)] dark:shadow-[0_0_40px_rgba(23,23,23,1),0_0_60px_rgba(59,130,246,0.4),inset_0_0_30px_rgba(59,130,246,0.2)] animate-tf-mechanical before:absolute before:inset-0 before:rounded-full before:bg-[conic-gradient(from_0deg,rgba(23,23,23,0.8),rgba(59,130,246,0.3),rgba(23,23,23,0.8))] before:animate-tf-gears after:absolute after:inset-0 after:rounded-full after:bg-[linear-gradient(45deg,transparent_30%,rgba(59,130,246,0.2)_50%,transparent_70%)] after:bg-[length:40px_40px] after:animate-tf-grid after:pointer-events-none'
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
