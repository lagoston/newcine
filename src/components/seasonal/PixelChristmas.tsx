import React from 'react';
import PixelSprite from '../pixel/PixelSprite';

// O Natal em pixel fora do painel da home (28/11/2026). Pedido do Bruno:
// "adaptar habooisticamente [...] ver se o site vai pegar o espírito natalino
// também, não somente aquele modalzinho" e "a tag 3 deve ser a de contagem de
// Natal normalmente, adaptada ao estilo habbo agora".
//
// São as peças que vestem o resto do site no mesmo traço da sala de Natal:
//   • PixelLights: o varal de pisca-pisca (barra do topo, perfil decorado);
//   • PixelSantaCap: o gorro no avatar de quem usa a 🎅 Ho Ho Ho;
//   • os desenhos soltos (o bilhete da raspadinha, o gorro pequeno).
// Tudo parado por padrão; só o pisca-pisca alterna duas imagens (opacidade em
// degraus, que o celular resolve sem repintar).

const RED = '#E5484D';
const GOLD = '#F5C451';
const GREEN = '#2FB36B';
const BLUE = '#7CC4F8';
const WIRE = '#1E2D26';
const CREAM = '#F8F4EC';

// ---------------------------------------------------------------------------
// O varal de luzes
// ---------------------------------------------------------------------------
// Um ladrilho de 48 × 9 pixels que se repete: o fio faz duas barrigas e leva
// quatro lâmpadas (vermelha, dourada, verde, azul). São duas imagens: numa
// acendem a 1ª e a 3ª; na outra, a 2ª e a 4ª.
const TILE_W = 48;
const TILE_H = 9;
const SAG = [0, 1, 1, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2, 2, 1, 1, 0];
const BULB_AT = [5, 17, 29, 41];
const BULB_COLORS = [RED, GOLD, GREEN, BLUE];

const dim = (hex: string): string => {
  const n = parseInt(hex.slice(1), 16);
  const part = (shift: number) => Math.round(((n >> shift) & 255) * 0.5 + 16);
  return `rgb(${part(16)},${part(8)},${part(0)})`;
};

const lightsTile = (phase: 0 | 1): string => {
  const rects: string[] = [];
  for (let x = 0; x < TILE_W; x += 1) rects.push(`<rect x="${x}" y="${SAG[x % 24]}" width="1" height="1" fill="${WIRE}"/>`);
  BULB_AT.forEach((x, i) => {
    const y = SAG[x % 24] + 1;
    const on = i % 2 === phase;
    const color = on ? BULB_COLORS[i] : dim(BULB_COLORS[i]);
    rects.push(`<rect x="${x}" y="${y}" width="2" height="1" fill="${WIRE}"/>`);
    rects.push(`<rect x="${x}" y="${y + 1}" width="2" height="3" fill="${color}"/>`);
    if (on) rects.push(`<rect x="${x}" y="${y + 1}" width="1" height="1" fill="#FFFFFF" fill-opacity="0.7"/>`);
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${TILE_W} ${TILE_H}" shape-rendering="crispEdges">${rects.join('')}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
};
const LIGHTS = [lightsTile(0), lightsTile(1)];

// `pixel`: o tamanho de cada pixel na tela (2 ou 3). `overlay`: preso ao topo
// do pai (que precisa de position), por cima do conteúdo; sem ele, ocupa a
// própria linha.
export const PixelLights: React.FC<{ pixel?: number; overlay?: boolean; className?: string; style?: React.CSSProperties }> = ({
  pixel = 2,
  overlay = false,
  className = '',
  style,
}) => {
  const layer = (image: string): React.CSSProperties => ({
    backgroundImage: image,
    backgroundRepeat: 'repeat-x',
    backgroundSize: `${TILE_W * pixel}px ${TILE_H * pixel}px`,
  });
  return (
    <span
      aria-hidden
      className={`pointer-events-none block ${overlay ? 'absolute inset-x-0 top-0' : 'relative'} ${className}`}
      style={{ height: TILE_H * pixel, ...style }}
    >
      <span className="absolute inset-0 block" style={layer(LIGHTS[0])} />
      <span className="co-pixel-blink absolute inset-0 block" style={layer(LIGHTS[1])} />
    </span>
  );
};

// ---------------------------------------------------------------------------
// O gorro
// ---------------------------------------------------------------------------
const CAP_ROWS = [
  '.........RRRR...',
  '.......RRRRRRR..',
  '.....RRRRRRRRRR.',
  '....RRRRRRRRrRWW',
  '...RRRRRRRRRrWWW',
  '..RRRRRRRRRRRWWW',
  '..RRRRRRRRRRR.W.',
  '.WWWWWWWWWWWWW..',
  'WWWWWWWWWWWWWWW.',
  '.sWWWsWWWWsWWs..',
];
const CAP_PALETTE: Record<string, string> = { R: '#D93A45', r: '#B42A35', W: CREAM, s: '#E3DCCD' };
const CAP_W = CAP_ROWS[0].length;
// a barra de pelúcia começa nesta linha
const CAP_BRIM_ROW = 7;

// O gorro pequeno, solto (ícone da contagem).
export const SantaCapIcon: React.FC<{ pixel?: number; className?: string }> = ({ pixel = 2, className }) => (
  <PixelSprite rows={CAP_ROWS} palette={CAP_PALETTE} pixel={pixel} className={className} />
);

// O gorro no avatar (um círculo de `size` px; o pai precisa ser `relative`).
// Sem girar (pixel girado borra): ele senta no topo, a barra de pelúcia sobre
// a borda. Sobe ~40% do tamanho acima do avatar: quem usa reserva esse espaço.
export const PixelSantaCap: React.FC<{ size: number; className?: string; style?: React.CSSProperties }> = ({ size, className = '', style }) => {
  const pixel = Math.max(2, Math.round((size * 0.86) / CAP_W));
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute block ${className}`}
      style={{ left: Math.round((size - CAP_W * pixel) / 2), top: Math.round(size * 0.11 - (CAP_BRIM_ROW + 1.5) * pixel), ...style }}
    >
      <PixelSprite rows={CAP_ROWS} palette={CAP_PALETTE} pixel={pixel} className="block" />
    </span>
  );
};

// ---------------------------------------------------------------------------
// Os desenhos soltos
// ---------------------------------------------------------------------------
const TICKET_ROWS = [
  'YYYYYYYYYYY',
  'YrrrrrrrrrY',
  'YrWWrWWrWWY',
  'YrWWrWWrWWY',
  'YrrrrrrrrrY',
  'YYYYYYYYYYY',
];
const TICKET_PALETTE: Record<string, string> = { Y: GOLD, r: '#8E1F2F', W: '#B9BEC9' };

// O bilhete da raspadinha (dourado, com as três janelas prateadas).
export const ScratchTicketIcon: React.FC<{ pixel?: number; className?: string }> = ({ pixel = 4, className }) => (
  <PixelSprite rows={TICKET_ROWS} palette={TICKET_PALETTE} pixel={pixel} className={className} />
);

const GIFT_ROWS = [
  '..YY.YY..',
  '...YYY...',
  'RRRRYRRRR',
  'RRRRYRRRR',
  'YYYYYYYYY',
  'RRRRYRRRR',
  'RRRRYRRRR',
  'RRRRYRRRR',
];
const GIFT_PALETTE: Record<string, string> = { R: RED, Y: GOLD };

export const GiftIcon: React.FC<{ pixel?: number; className?: string }> = ({ pixel = 3, className }) => (
  <PixelSprite rows={GIFT_ROWS} palette={GIFT_PALETTE} pixel={pixel} className={className} />
);
