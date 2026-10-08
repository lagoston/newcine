import type React from 'react';

// Sistema visual do CineOracle — fonte única de verdade para cores, fonte
// e os três oráculos. Toda tela redesenhada importa daqui, pra que o site
// inteiro fale a mesma língua visual da home de visitante.
//
// Origem de cada cor: o papel creme e as cores dos bichos vêm direto das
// cartas dos oráculos (arte própria do app); o fundo é um violeta-noite
// (não preto) pra combinar com o violeta/fúcsia da marca.

export const NIGHT = '#120D22';   // fundo das páginas
export const VELVET = '#1C1433';  // superfícies elevadas (campos, pôsteres, selos)
export const PAPER = '#F3EAD3';   // texto principal no escuro / faixas "papel"
export const INK = '#221B36';     // texto sobre papel
export const MIST = '#BDB4D6';    // texto secundário no escuro

// Superfície dos blocos de um perfil (Números, Década favorita, Atlas…).
// Nos perfis, a página define --co-surface com a cor do banner do dono
// (lib/banners.ts → getBannerTone); fora deles vale o VELVET de sempre.
export const SURFACE_VAR = '--co-surface';
export const SURFACE = `var(${SURFACE_VAR}, ${VELVET})`;
// A mesma cor, translúcida, para os painéis de vidro (glassPanel). A página
// do perfil define as duas a partir do banner do dono (surfaceVars).
export const SURFACE_GLASS_VAR = '--co-surface-glass';
export const SURFACE_GLASS = `var(${SURFACE_GLASS_VAR}, rgba(28,20,51,0.56))`;

// Fundo padrão de página: noite com um brilho violeta no canto superior.
export const NIGHT_BACKGROUND = `radial-gradient(ellipse 80% 50% at 75% 0%, rgba(139,92,246,0.16), transparent 60%), ${NIGHT}`;

// Pixelify Sans é carregada no index.html; o fallback monoespaçado mantém
// o ar "blocado" enquanto a fonte não chega. Ligaduras desligadas: a
// ligadura "fi" dessa fonte faz "filme" ser lido como "Alme".
// "CineOracle Glyphs" vem primeiro e só cobre 2, 5, 7, L e Z (ver
// index.css): na Pixelify o 5 é igual ao S, o 7 parece um 1, o 2 e o Z
// parecem um S invertido e o L parece um J invertido em tamanho pequeno.
export const PIXEL_FONT_STACK = '"CineOracle Glyphs", "Pixelify Sans", ui-monospace, "SF Mono", Menlo, monospace';
// Texto de amostra pra document.fonts.load() baixar também a fonte dos
// glifos redesenhados antes de desenhar num canvas.
export const PIXEL_FONT_SAMPLE = 'Aa257LZ';

export const PIXEL: React.CSSProperties = {
  fontFamily: PIXEL_FONT_STACK,
  fontVariantLigatures: 'none',
  fontFeatureSettings: '"liga" 0, "clig" 0',
};

// Anel de foco padrão pra tudo que é clicável (teclado).
export const FOCUS_RING = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-300';

// Nome de uma obra embaixo do pôster (carrosséis, prateleiras, grades): no
// máximo duas linhas, com reticências, e sempre com a altura de duas linhas
// — assim o que vem depois (ano, nota, botão "Avaliar") fica alinhado em
// todos os cartões, com título curto ou comprido. Não junte com "block",
// "flex" ou "grid" na mesma className: o display deles anula o line-clamp.
export const POSTER_TITLE = 'line-clamp-2 min-h-[2.75em] leading-snug break-words';

// Faixa de cor de uma nota de 0 a 10 sobre o fundo noite — a mesma lógica
// das rating boxes: vermelho pras baixas, amarelo pras medianas, verde pras
// boas, rosa pro 10. `null` é "só na watchlist" (azul-céu, neutro).
export const ratingTone = (rating: number | null): { color: string; ring: string } => {
  if (rating === null) return { color: '#7DD3FC', ring: 'rgba(125,211,252,0.45)' };
  if (rating === 10) return { color: '#F9A8D4', ring: 'rgba(249,168,212,0.45)' };
  if (rating >= 7) return { color: '#86EFAC', ring: 'rgba(134,239,172,0.4)' };
  if (rating >= 4) return { color: '#FCD34D', ring: 'rgba(252,211,77,0.4)' };
  if (rating >= 1) return { color: '#FCA5A5', ring: 'rgba(252,165,165,0.4)' };
  return { color: MIST, ring: 'rgba(189,180,214,0.35)' };
};

// Cor de PREENCHIMENTO (barras, faixas) da mesma faixa de notas — tons mais
// fechados que os de ratingTone (que são pra texto), validados contra o
// fundo noite: todos com contraste >= 3:1 e distinguíveis entre si. Sempre
// acompanhados do número da nota (nunca só a cor).
const RATING_BAR = { low: '#D93A45', mid: '#C58300', good: '#30A46C', top: '#D6409F', zero: '#7A7196' };
export const ratingBarColor = (rating: number | null): string => {
  if (rating === null) return '#3B9BD1';
  if (rating === 10) return RATING_BAR.top;
  if (rating >= 7) return RATING_BAR.good;
  if (rating >= 4) return RATING_BAR.mid;
  if (rating >= 1) return RATING_BAR.low;
  return RATING_BAR.zero;
};

// "#RRGGBB" + opacidade → "rgba(r,g,b,a)", pra tingir fundos com a cor da nota.
export const withAlpha = (hex: string, alpha: number): string => {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
};

// Como withAlpha, mas aceita também "hsl(h, s%, l%)" (o tom dos banners sem
// cor escolhida à mão vem assim).
export const colorWithAlpha = (color: string, alpha: number): string => {
  const hsl = color.match(/^hsl\((.+)\)$/i);
  if (hsl) return `hsla(${hsl[1]}, ${alpha})`;
  return withAlpha(color, alpha);
};

// Variáveis da superfície dos blocos de um perfil, a partir do tom do banner
// do dono: a sólida (SURFACE) e a translúcida dos painéis de vidro.
export const surfaceVars = (surface: string): React.CSSProperties =>
  ({ [SURFACE_VAR]: surface, [SURFACE_GLASS_VAR]: colorWithAlpha(surface, 0.56) }) as React.CSSProperties;

// Cor de cada bloco de estatística do perfil (o reflexo no vidro).
export const PROFILE_ACCENTS = {
  rated: '#A78BFA',
  time: '#38BDF8',
  genres: '#E879F9',
  directors: '#FB923C',
  gem: '#34D399',
  atlas: '#2DD4BF',
  pins: '#C084FC',
  essence: '#F472B6',
};

// Painel de vidro dos blocos de estatística do perfil: a superfície do
// perfil translúcida, com desfoque do que está atrás, um brilho fino no
// alto e o reflexo da cor do próprio painel (accent) no canto de cima e no
// contorno — cada bloco puxa a cor do que ele mostra.
export const glassPanel = (accent?: string): React.CSSProperties => ({
  background: [
    accent ? `radial-gradient(120% 95% at 100% 0%, ${colorWithAlpha(accent, 0.22)}, transparent 62%)` : '',
    accent ? `radial-gradient(90% 70% at 0% 100%, ${colorWithAlpha(accent, 0.1)}, transparent 70%)` : '',
    'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.012) 55%)',
    SURFACE_GLASS,
  ]
    .filter(Boolean)
    .join(', '),
  WebkitBackdropFilter: 'blur(16px) saturate(150%)',
  backdropFilter: 'blur(16px) saturate(150%)',
  boxShadow: [
    'inset 0 1px 0 rgba(255,255,255,0.09)',
    `inset 0 0 0 1px ${accent ? colorWithAlpha(accent, 0.3) : 'rgba(243,234,211,0.1)'}`,
    '0 18px 40px -26px rgba(0,0,0,0.7)',
  ].join(', '),
});

// Cores das categorias de tag (pin ativo no perfil, abas e cartões do Tag
// Pins): básico = verde, tema = âmbar, comunidade = azul-céu, oráculo =
// rosa, especial = preto com contorno claro.
export type TagCategory = 'basic' | 'theme' | 'community' | 'oracle' | 'special';
export const tagCategoryStyle = (category: string): { pill: string; accent: string } => {
  switch (category) {
    case 'basic':
      return { pill: 'bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-400/30', accent: '#34D399' };
    case 'theme':
      return { pill: 'bg-amber-500/15 text-amber-200 ring-1 ring-amber-400/30', accent: '#FBBF24' };
    case 'community':
      return { pill: 'bg-sky-500/15 text-sky-200 ring-1 ring-sky-400/30', accent: '#38BDF8' };
    case 'oracle':
      return { pill: 'bg-pink-500/15 text-pink-200 ring-1 ring-pink-400/30', accent: '#F472B6' };
    case 'special':
      return { pill: 'bg-black text-[#F3EAD3] ring-1 ring-white/30', accent: '#F3EAD3' };
    default:
      return { pill: 'bg-white/10 text-[#BDB4D6] ring-1 ring-white/15', accent: MIST };
  }
};

export type OracleId = 'bogart' | 'fincher' | 'cypher';

export interface OracleCard {
  id: OracleId;
  name: string;
  img: string;     // carta pixel art (creme)
  altImg: string;  // carta estilo Yu-Gi-Oh
  avatar: string;  // retrato redondo do bicho (sapo, raposa, cobra)
  color: string;   // cor do bicho, usada como informação (nome, brilho)
}

export const ORACLES: OracleCard[] = [
  { id: 'bogart', name: 'Bogart', img: '/assets/BOGART.webp', altImg: '/assets/BOGART2.webp', avatar: '/avatar-sapo.webp', color: '#7BC25A' },
  { id: 'fincher', name: 'Fincher', img: '/assets/FINCHER.webp', altImg: '/assets/FINCHER2.webp', avatar: '/avatar-raposa.webp', color: '#EE7A3E' },
  { id: 'cypher', name: 'Cypher', img: '/assets/CYPHER.webp', altImg: '/assets/CYPHER2.webp', avatar: '/avatar-cobra.webp', color: '#E2C84A' },
];

export const ORACLE_BY_ID: Record<OracleId, OracleCard> = {
  bogart: ORACLES[0],
  fincher: ORACLES[1],
  cypher: ORACLES[2],
};

// Estilo de carta escolhido no Personalizar perfil (profiles.card_style):
// troca o sufixo do arquivo — BOGART.webp, BOGART2.webp (Yu-Gi-Oh!),
// BOGART3.webp (Horror).
export type OracleCardStyle = 'default' | 'yugioh' | 'horror';
const CARD_STYLE_SUFFIX: Record<OracleCardStyle, string> = { default: '', yugioh: '2', horror: '3' };
export const oracleCardImage = (id: OracleId, style: string | null | undefined): string => {
  const suffix = CARD_STYLE_SUFFIX[(style as OracleCardStyle) ?? 'default'] ?? '';
  return `/assets/${id.toUpperCase()}${suffix}.webp`;
};
