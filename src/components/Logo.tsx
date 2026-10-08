import React from 'react';
import { MARK_LAYERS, MARK_VIEWBOX, WORDMARK_LAYERS, WORDMARK_VIEWBOX } from './brand/brandArt';

// Marca do CineOracle, desenhada em pixel art na linguagem das cartas dos
// oráculos (os desenhos vêm de scripts/brand/build-brand.py):
//
// • LogoMark — o "Olho Lunar": a pálpebra de cima é a lua crescente
//   iridescente do topo das cartas, a íris é violeta e fúcsia e a estrela
//   de quatro pontas das cartas brilha no canto.
// • LogoWordmark — "CineOracle" letra por letra na grade: "Cine" em papel
//   creme, "Oracle" nas faixas da lua; o pingo do i é a estrela das cartas.
// • LogoLockup — os dois lado a lado.
//
// Tudo em SVG com shape-rendering="crispEdges": os pixels ficam nítidos em
// qualquer tamanho. A altura vem da className (h-7, h-5…), a largura segue
// a proporção do desenho.

interface ArtProps {
  className?: string;
  style?: React.CSSProperties;
  // Com title, vira imagem com nome (para leitores de tela); sem title, é
  // decorativo (o texto ao lado já diz "CineOracle").
  title?: string;
}

const Art: React.FC<ArtProps & { viewBox: string; layers: { fill: string; d: string }[] }> = ({ viewBox, layers, className, style, title }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox={viewBox}
    shapeRendering="crispEdges"
    className={className}
    style={style}
    role={title ? 'img' : undefined}
    aria-label={title}
    aria-hidden={title ? undefined : true}
    focusable="false"
  >
    {layers.map((layer, i) => (
      <path key={i} fill={layer.fill} d={layer.d} />
    ))}
  </svg>
);

export const LogoMark: React.FC<ArtProps> = ({ className = 'h-7 w-auto', ...rest }) => (
  <Art viewBox={MARK_VIEWBOX} layers={MARK_LAYERS} className={className} {...rest} />
);

export const LogoWordmark: React.FC<ArtProps> = ({ className = 'h-4 w-auto', ...rest }) => (
  <Art viewBox={WORDMARK_VIEWBOX} layers={WORDMARK_LAYERS} className={className} {...rest} />
);

export const LogoLockup: React.FC<{ className?: string; markClassName?: string; wordClassName?: string; title?: string }> = ({
  className = '',
  markClassName = 'h-7 w-auto',
  wordClassName = 'h-[15px] w-auto',
  title,
}) => (
  <span className={`inline-flex items-center gap-2.5 ${className}`} role={title ? 'img' : undefined} aria-label={title}>
    <LogoMark className={markClassName} />
    <LogoWordmark className={wordClassName} />
  </span>
);

// Compatibilidade com o uso antigo (<Logo size="small" | "large" />).
interface LogoProps {
  className?: string;
  size?: 'small' | 'large';
}

const Logo: React.FC<LogoProps> = ({ className = '', size = 'small' }) => (
  <LogoMark className={`${size === 'large' ? 'w-32' : 'w-8'} h-auto ${className}`} title="CineOracle" />
);

export default Logo;
