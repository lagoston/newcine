// Banners do cartão de perfil. O desenho de cada um mora em
// src/styles/cosmetics.css (classes .co-banner--<id>): fundo noite com a luz
// do tema vindo de um canto (o lado do texto fica escuro), uma textura
// temática e um movimento só, lento. Aqui ficam os metadados, a classe e a
// cor do contorno (accent), que também tinge os blocos do perfil do dono.
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
    accent: null,
    className: '',
  },
  gold: {
    id: 'gold',
    name: 'Gold Banner',
    isPremium: true,
    requiredTag: null,
    // cor do contorno (a mesma do --co-line em cosmetics.css)
    accent: '#FAE596',
    // cor escolhida pro fundo das informações/blocos (substitui a calculada)
    surface: '#BFA869',
    className: 'co-banner co-banner--gold co-banner--fade-left',
  },
  matrix: {
    id: 'matrix',
    name: 'Matrix Banner',
    isPremium: true,
    requiredTag: 'red-pill-adept',
    // cor do contorno (a mesma do --co-line em cosmetics.css)
    accent: '#4ADE80',
    className: 'co-banner co-banner--matrix',
  },
  saw: {
    id: 'saw',
    name: 'Saw Banner',
    isPremium: true,
    requiredTag: 'visceral-gamer',
    // cor do contorno (a mesma do --co-line em cosmetics.css)
    accent: '#F87171',
    className: 'co-banner co-banner--saw',
  },
  ice: {
    id: 'ice',
    name: 'Ice Age Banner',
    isPremium: true,
    requiredTag: 'nuts',
    // cor do contorno (a mesma do --co-line em cosmetics.css)
    accent: '#BAE6FD',
    className: 'co-banner co-banner--ice co-banner--fade-left',
  },
  bttf: {
    id: 'bttf',
    name: 'Back to the Future Banner',
    isPremium: true,
    requiredTag: 'flux-capacitor-fan',
    // cor do contorno (a mesma do --co-line em cosmetics.css)
    accent: '#FDBA74',
    // cor escolhida pro fundo das informações/blocos (substitui a calculada)
    surface: '#25162E',
    className: 'co-banner co-banner--bttf',
  },
  potter: {
    id: 'potter',
    name: 'Harry Potter Banner',
    isPremium: true,
    requiredTag: 'hogwarts-graduate',
    // cor do contorno (a mesma do --co-line em cosmetics.css)
    accent: '#C4B5FD',
    // cor escolhida pro fundo das informações/blocos (substitui a calculada)
    surface: '#5C2D87',
    className: 'co-banner co-banner--potter',
  },
  transformers: {
    id: 'transformers',
    name: 'Transformers Banner',
    isPremium: true,
    requiredTag: 'cybertron-sentinel',
    // cor do contorno (a mesma do --co-line em cosmetics.css)
    accent: '#93C5FD',
    // cor escolhida pro fundo das informações/blocos (substitui a calculada)
    surface: '#151C3D',
    className: 'co-banner co-banner--transformers co-banner--fade-left',
  },
  hellrider: {
    id: 'hellrider',
    name: 'Spirit of Vengeance Banner',
    isPremium: true,
    requiredTag: 'hell-rider',
    // cor do contorno (a mesma do --co-line em cosmetics.css)
    accent: '#C5B358',
    // cor escolhida pro fundo das informações/blocos (substitui a calculada)
    surface: '#521A00',
    className: 'co-banner co-banner--hellrider co-banner--fade-left',
  },
  deathdodger: {
    id: 'deathdodger',
    name: 'Final Destination Banner',
    isPremium: true,
    requiredTag: 'death-dodger',
    // cor do contorno (a mesma do --co-line em cosmetics.css)
    accent: '#F87171',
    // cor escolhida pro fundo das informações/blocos (substitui a calculada)
    surface: '#300202',
    className: 'co-banner co-banner--deathdodger',
  },
  'casual-drinker': {
    id: 'casual-drinker',
    name: 'Casual Drinker Banner',
    isPremium: true,
    requiredTag: 'casual-drinker',
    // cor do contorno (a mesma do --co-line em cosmetics.css)
    accent: '#FCD34D',
    // cor escolhida pro fundo das informações/blocos (substitui a calculada)
    surface: '#573100',
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

// "#RRGGBB" → [matiz 0-360, saturação 0-1].
function hueSat(hex: string): [number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return [Math.round(h), s];
}

// Tom do banner pra pintar o resto do perfil: a parte de informações do
// cartão da Comunidade e os blocos do perfil (Números, Década favorita,
// Atlas…). Quando o banner tem `surface` (cor escolhida à mão: Ouro, De
// Volta para o Futuro, Harry Potter, Transformers, Motoqueiro, Premonição e
// Se Beber), é ela; senão, é a cor do contorno escurecida até uma
// luminosidade fixa de 13% (saturação no máximo 50%) — texto papel/névoa
// com contraste >= 7:1. Atenção: o Ouro (#BFA869) é claro e o texto claro
// fica com pouco contraste em cima dele — escolha feita de propósito.
// Sem banner (ou banner Premium de quem não é Premium): null → VELVET.
export interface BannerTone {
  accent: string;
  surface: string;
}

export function getBannerTone(bannerId?: string | null, isPremium: boolean = false): BannerTone | null {
  const banner = bannerId ? banners[bannerId as BannerId] : undefined;
  if (!banner || !banner.accent || (banner.isPremium && !isPremium)) return null;
  // Alguns banners têm a cor escolhida à mão (surface); os outros usam a
  // calculada a partir do contorno.
  if ('surface' in banner && banner.surface) return { accent: banner.accent, surface: banner.surface };
  const [h, s] = hueSat(banner.accent);
  return { accent: banner.accent, surface: `hsl(${h}, ${Math.round(Math.min(s, 0.5) * 100)}%, 13%)` };
}
