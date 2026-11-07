import React from 'react';
import { MARK_LAYERS, MARK_VIEWBOX } from '../brand/brandArt';

// Peças de arte da Mesa (05/11/2026): o Olho Lunar da marca e o arco de quatro
// cores, sempre como SVG PARADO. A lição do MoodGrid vale aqui: SVG animado com
// framer-motion falha em alguns celulares; quem se mexe é o div em volta.

// As 4 camadas do arco (lavanda, rosa, céu, menta), na ordem de MARK_LAYERS.
export const ARC_LAYERS = MARK_LAYERS.slice(0, 4);
export const ARC_COLORS = ['#B9A6FF', '#E2A9F3', '#A6CFF5', '#86E3CC'];

export const EyeMark: React.FC<{ size: number; className?: string; style?: React.CSSProperties; title?: string; mono?: string }> = ({ size, className, style, title, mono }) => (
  <svg
    viewBox={MARK_VIEWBOX}
    width={size}
    height={Math.round((size * 21) / 24)}
    className={className}
    style={{ shapeRendering: 'crispEdges', ...style }}
    role={title ? 'img' : undefined}
    aria-label={title}
    aria-hidden={title ? undefined : true}
  >
    {MARK_LAYERS.map((l, i) =>
      // Monocromático (o selo de cera): a pupila escura continua escura.
      mono && l.fill === '#120D22' ? null : <path key={i} d={l.d} fill={mono ?? l.fill} />
    )}
  </svg>
);

// Só o arco da lua (recortado do olho), como no alto de cada carta.
export const MoonArc: React.FC<{ width: number; className?: string; style?: React.CSSProperties; layers?: number[] }> = ({ width, className, style, layers = [0, 1, 2, 3] }) => (
  <svg viewBox="0 3 24 10" width={width} height={(width * 10) / 24} className={className} style={{ shapeRendering: 'crispEdges', ...style }} aria-hidden>
    {layers.map((i) => (
      <path key={i} d={ARC_LAYERS[i].d} fill={ARC_LAYERS[i].fill} />
    ))}
  </svg>
);
