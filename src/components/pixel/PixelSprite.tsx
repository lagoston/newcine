import React from 'react';

// Um desenho de pixel pequeno e parado (28/11/2026), para os lugares onde um
// canvas seria exagero: um ícone ao lado de um texto, o gorro no avatar, o
// bilhete da raspadinha. Cada letra de `rows` é um pixel na cor de `palette`
// (o ponto é vazio). `pixel` é o tamanho de cada pixel na tela: sempre um
// número inteiro, para a borda não borrar.

interface PixelSpriteProps {
  rows: string[];
  palette: Record<string, string>;
  pixel?: number;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
}

const PixelSprite: React.FC<PixelSpriteProps> = ({ rows, palette, pixel = 2, className = '', style, title }) => {
  const width = Math.max(...rows.map((row) => row.length));
  const size = Math.max(1, Math.round(pixel));
  const rects: React.ReactNode[] = [];
  rows.forEach((row, y) => {
    // trechos seguidos da mesma cor viram um retângulo só
    let x = 0;
    while (x < row.length) {
      const color = palette[row[x]];
      let end = x + 1;
      while (end < row.length && row[end] === row[x]) end += 1;
      if (color) rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={end - x} height={1} fill={color} />);
      x = end;
    }
  });
  return (
    <svg
      viewBox={`0 0 ${width} ${rows.length}`}
      width={width * size}
      height={rows.length * size}
      shapeRendering="crispEdges"
      className={`shrink-0 ${className}`}
      style={style}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {rects}
    </svg>
  );
};

export default PixelSprite;
