// Banners do cartão de perfil. O desenho de cada um mora em
// src/styles/cosmetics.css (classes .co-banner--<id>): fundo noite com a luz
// do tema vindo de um canto (o lado do texto fica escuro), uma textura
// temática e um movimento só, lento. Aqui ficam só os metadados e a classe.
//
// requiredTag precisa bater com is_required_tag_met() no banco, que é quem
// valida o desbloqueio de verdade (set_user_cosmetic).

export const banners = {
  default: {
    id: 'default',
    name: 'Default',
    isPremium: false,
    requiredTag: null,
    // Sem banner: quem renderiza usa o fundo violeta padrão do cartão.
    className: '',
  },
  gold: {
    id: 'gold',
    name: 'Gold Banner',
    isPremium: true,
    requiredTag: null,
    className: 'co-banner co-banner--gold co-banner--fade-left',
  },
  matrix: {
    id: 'matrix',
    name: 'Matrix Banner',
    isPremium: true,
    requiredTag: 'red-pill-adept',
    className: 'co-banner co-banner--matrix',
  },
  saw: {
    id: 'saw',
    name: 'Saw Banner',
    isPremium: true,
    requiredTag: 'visceral-gamer',
    className: 'co-banner co-banner--saw',
  },
  ice: {
    id: 'ice',
    name: 'Ice Age Banner',
    isPremium: true,
    requiredTag: 'nuts',
    className: 'co-banner co-banner--ice co-banner--fade-left',
  },
  bttf: {
    id: 'bttf',
    name: 'Back to the Future Banner',
    isPremium: true,
    requiredTag: 'flux-capacitor-fan',
    className: 'co-banner co-banner--bttf',
  },
  potter: {
    id: 'potter',
    name: 'Harry Potter Banner',
    isPremium: true,
    requiredTag: 'hogwarts-graduate',
    className: 'co-banner co-banner--potter',
  },
  transformers: {
    id: 'transformers',
    name: 'Transformers Banner',
    isPremium: true,
    requiredTag: 'cybertron-sentinel',
    className: 'co-banner co-banner--transformers co-banner--fade-left',
  },
  hellrider: {
    id: 'hellrider',
    name: 'Spirit of Vengeance Banner',
    isPremium: true,
    requiredTag: 'hell-rider',
    className: 'co-banner co-banner--hellrider co-banner--fade-left',
  },
  deathdodger: {
    id: 'deathdodger',
    name: 'Final Destination Banner',
    isPremium: true,
    requiredTag: 'death-dodger',
    className: 'co-banner co-banner--deathdodger',
  },
  'casual-drinker': {
    id: 'casual-drinker',
    name: 'Casual Drinker Banner',
    isPremium: true,
    requiredTag: 'casual-drinker',
    className: 'co-banner co-banner--casual-drinker',
  },
} as const;

export type BannerId = keyof typeof banners;

export function getBannerClass(bannerId: string = 'default', isPremium: boolean = false): string {
  const banner = bannerId ? banners[bannerId as BannerId] : undefined;
  if (!banner || (banner.isPremium && !isPremium)) {
    return banners.default.className;
  }
  return banner.className;
}
