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
    className: 'ring-4 ring-yellow-400 dark:ring-yellow-500 animate-gold-pulse'
  },
  matrix: {
    id: 'matrix',
    name: 'Matrix Banner',
    isPremium: true,
    className: 'border-2 border-green-500 dark:border-green-400 bg-gradient-to-r from-green-900/20 to-green-800/20 dark:from-green-900/40 dark:to-green-800/40 animate-matrix-glitch relative overflow-hidden'
  },
  saw: {
    id: 'saw',
    name: 'Saw Banner',
    isPremium: true,
    className: 'border-2 border-red-700 dark:border-red-600 bg-gradient-to-r from-red-950/30 to-red-900/20 dark:from-red-950/50 dark:to-red-900/40 relative overflow-hidden saw-blood-banner'
  },
  ice: {
    id: 'ice',
    name: 'Ice Age Banner',
    isPremium: true,
    className: 'border-2 border-sky-400 dark:border-sky-500 bg-gradient-to-r from-sky-900/20 to-sky-800/20 dark:from-sky-900/30 dark:to-sky-800/30 relative overflow-hidden ice-banner'
  },
  bttf: {
    id: 'bttf',
    name: 'Back to the Future Banner',
    isPremium: true,
    className: 'border-2 border-blue-500 dark:border-blue-400 bg-gradient-to-r from-blue-900/20 to-indigo-800/20 dark:from-blue-900/30 dark:to-indigo-800/30 relative overflow-hidden bttf-banner'
  }
} as const;

export type BannerId = keyof typeof banners;

export function getBannerClass(bannerId: string = 'default', isPremium: boolean = false): string {
  // Handle empty strings or undefined/null values
  if (!bannerId) {
    return banners.default.className;
  }
  
  const banner = banners[bannerId as BannerId];
  
  // Return default banner class if:
  // 1. Banner doesn't exist
  // 2. Banner is premium but user is not premium
  // 3. bannerId is empty string (which isn't a valid key)
  if (!bannerId || !banner || (banner.isPremium && !isPremium)) {
    return banners.default.className;
  }
  
  return banner.className;
}