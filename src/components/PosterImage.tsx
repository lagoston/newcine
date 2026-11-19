import React from 'react';
import { Film } from 'lucide-react';
import OptimizedPoster from './OptimizedPoster';
import { posterSources, type TmdbPosterSize } from '../lib/tmdbImage';

// O pôster de um título, em qualquer grade (19/11/2026, Reborn, onda 2b,
// render.md A8). Um componente só decide o tamanho do TMDB: a partir da
// largura em que o pôster é desenhado (`width`, em px de CSS) monta um
// candidato por densidade de tela (srcSet 1x/2x/3x) e o navegador baixa o do
// aparelho. O resto é o OptimizedPoster de sempre: carregamento preguiçoso,
// decodificação fora da thread, o brilho enquanto não chega e o "florescer"
// quando chega.
//
// Num pôster de faixa (124 a 148 px): tela comum de computador baixa w154
// (≈6 kB em vez de ≈28 kB); celular (densidade 2 ou 3) continua em w342, que
// já era o degrau certo.

interface PosterImageProps {
  // caminho do TMDB ("/abc.jpg"); sem ele aparece o ícone de filme
  path: string | null | undefined;
  // a MAIOR largura em que este pôster é desenhado, em px de CSS
  width: number;
  alt: string;
  className?: string;
  // o maior tamanho do TMDB que este lugar pode pedir (padrão w342: uma grade
  // nunca baixa mais do que baixava antes)
  max?: TmdbPosterSize;
  priority?: boolean;
  onLoad?: () => void;
}

const PosterImage: React.FC<PosterImageProps> = ({ path, width, alt, className = '', max = 'w342', priority, onLoad }) => {
  if (!path) {
    return (
      <div className={`flex items-center justify-center ${className}`} style={{ background: '#1C1433' }}>
        <Film className="w-10 h-10 text-[#BDB4D6]/40" aria-hidden />
      </div>
    );
  }
  const { src, srcSet } = posterSources(path, width, max);
  return (
    <OptimizedPoster
      src={src}
      srcSet={srcSet}
      // a proporção de um pôster (2:3): reserva a caixa antes de a imagem chegar
      width={width}
      height={Math.round(width * 1.5)}
      alt={alt}
      className={className}
      priority={priority}
      onLoad={onLoad}
    />
  );
};

export default React.memo(PosterImage);
