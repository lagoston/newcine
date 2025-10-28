import React from 'react';

interface LogoProps {
  className?: string;
  size?: 'small' | 'large';
}

const Logo: React.FC<LogoProps> = ({ className = '', size = 'small' }) => {
  const dimensions = size === 'large' ? 'w-32 h-32' : 'w-8 h-8';
  
  return (
    <img
      src="/assets/ball.svg"
      alt="CineOracle Logo"
      className={`${dimensions} ${size === 'small' ? 'text-current' : 'text-indigo-600 dark:text-indigo-400'} ${className}`}
      style={{ filter: size === 'small' ? 'brightness(0) saturate(100%) invert(var(--logo-invert))' : undefined }}
    />
  );
};

export default Logo;