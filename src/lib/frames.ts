export const frames = {
  gold: {
    id: 'gold',
    name: 'Gold Frame',
    isPremium: true,
    className: 'ring-[3px] md:ring-4 ring-yellow-400 dark:ring-yellow-500 animate-gold-pulse'
  },
  matrix: {
    id: 'matrix',
    name: 'Matrix Frame',
    isPremium: true,
    className: 'ring-[3px] md:ring-4 ring-green-500 dark:ring-green-400 animate-matrix-glitch shadow-[0_0_10px_rgba(0,255,0,0.5)] dark:shadow-[0_0_15px_rgba(0,255,0,0.7)]'
  },
  saw: {
    id: 'saw',
    name: 'Saw Frame',
    isPremium: true,
    className: 'ring-[3px] md:ring-4 ring-red-700 dark:ring-red-600 rounded-full overflow-hidden relative saw-blood-frame'
  },
  ice: {
    id: 'ice',
    name: 'Ice Age Frame',
    isPremium: true,
    className: 'ring-[3px] md:ring-4 ring-sky-400 dark:ring-sky-500 rounded-full overflow-hidden relative ice-frame'
  },
  bttf: {
    id: 'bttf',
    name: 'Back to the Future Frame',
    isPremium: true,
    className: 'ring-[3px] md:ring-4 ring-blue-500 dark:ring-blue-400 rounded-full overflow-hidden relative bttf-frame'
  },
  default: {
    id: 'default',
    name: 'Default',
    isPremium: false,
    className: 'ring-0'
  }
} as const;

export type FrameId = keyof typeof frames;

export function getFrameClass(frameId: string = 'default', isPremium: boolean = false): string {
  // Handle empty strings or undefined/null values
  if (!frameId) {
    return frames.default.className;
  }
  
  const frame = frames[frameId as FrameId];
  
  // Return default frame class if:
  // 1. Frame doesn't exist
  // 2. Frame is premium but user is not premium
  // 3. frameId is empty string (which isn't a valid key)
  if (!frameId || !frame || (frame.isPremium && !isPremium)) {
    return frames.default.className;
  }
  
  return frame.className;
}