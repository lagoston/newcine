import React, { useState } from 'react';
import { Film } from 'lucide-react';

interface OptimizedPosterProps {
  src: string;
  alt: string;
  className?: string;
  onLoad?: () => void;
  priority?: boolean;
}

// Pôster com carregamento preguiçoso. Enquanto a imagem não chega, um brilho
// passa devagar pelo lugar dela (poster-skeleton); quando chega, ela sai do
// desfoque e acende (poster-bloom) — as duas classes estão em index.css.
const OptimizedPoster: React.FC<OptimizedPosterProps> = ({
  src,
  alt,
  className = '',
  onLoad,
  priority = false
}) => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  const handleLoad = () => {
    setImageLoaded(true);
    onLoad?.();
  };

  const handleError = () => {
    setImageError(true);
  };

  if (imageError) {
    return (
      <div className={`flex items-center justify-center ${className}`} style={{ background: '#1C1433' }}>
        <Film className="w-10 h-10 text-[#BDB4D6]/40" aria-hidden />
      </div>
    );
  }

  return (
    <>
      {!imageLoaded && (
        <span className={`absolute inset-0 poster-skeleton ${className}`} aria-hidden>
          <span className="absolute inset-0 flex items-center justify-center">
            <Film className="w-9 h-9 text-[#BDB4D6]/25" />
          </span>
        </span>
      )}
      <img
        src={src}
        alt={alt}
        draggable={false}
        className={`${className} poster-bloom`}
        data-loaded={imageLoaded ? '1' : undefined}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        onLoad={handleLoad}
        onError={handleError}
        onDragStart={(e) => e.preventDefault()}
        style={{
          userSelect: 'none',
          WebkitUserDrag: 'none',
        } as React.CSSProperties}
      />
    </>
  );
};

export default React.memo(OptimizedPoster);
