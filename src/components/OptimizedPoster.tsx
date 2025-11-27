import React, { useState, useEffect } from 'react';
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

  useEffect(() => {
    // Preload image
    const img = new Image();
    img.src = src;

    img.onload = () => {
      setImageLoaded(true);
      onLoad?.();
    };

    img.onerror = () => {
      setImageError(true);
    };

    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [src, onLoad]);

  if (imageError) {
    return (
      <div className={`flex items-center justify-center bg-gray-800 ${className}`}>
        <Film className="w-16 h-16 text-gray-600" />
      </div>
    );
  }

  return (
    <>
      {!imageLoaded && (
        <div className={`absolute inset-0 bg-gray-800 animate-pulse ${className}`}>
          <div className="absolute inset-0 flex items-center justify-center">
            <Film className="w-16 h-16 text-gray-600" />
          </div>
        </div>
      )}
      <img
        src={src}
        alt={alt}
        className={`${className} ${!imageLoaded ? 'opacity-0' : 'opacity-100'} transition-opacity duration-300`}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        style={{
          contentVisibility: 'auto',
          willChange: imageLoaded ? 'auto' : 'opacity'
        }}
      />
    </>
  );
};

export default React.memo(OptimizedPoster);
