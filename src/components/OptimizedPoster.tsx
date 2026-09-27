import React, { useState } from 'react';
import { Film } from 'lucide-react';

interface OptimizedPosterProps {
  src: string;
  alt: string;
  className?: string;
  onLoad?: () => void;
  priority?: boolean;
}

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
        <div className={`absolute inset-0 animate-pulse ${className}`} style={{ background: '#1C1433' }}>
          <div className="absolute inset-0 flex items-center justify-center">
            <Film className="w-10 h-10 text-[#BDB4D6]/30" aria-hidden />
          </div>
        </div>
      )}
      <img
        src={src}
        alt={alt}
        draggable={false}
        className={`${className} ${!imageLoaded ? 'opacity-0' : 'opacity-100'} transition-opacity duration-300`}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        onLoad={handleLoad}
        onError={handleError}
        onDragStart={(e) => e.preventDefault()}
        style={{
          contentVisibility: 'auto',
          willChange: imageLoaded ? 'auto' : 'opacity',
          userSelect: 'none',
          WebkitUserDrag: 'none',
        } as React.CSSProperties}
      />
    </>
  );
};

export default React.memo(OptimizedPoster);
