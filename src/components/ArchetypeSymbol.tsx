import React from 'react';
import { motion } from 'framer-motion';

interface ArchetypeSymbolProps {
  archetypeId: string;
  subcategoryId?: string | null;
  size?: number;
  animated?: boolean;
  className?: string;
}

const SUBCATEGORY_COLORS = {
  A: '#F59E0B', // Radiante - Amarelo
  B: '#8B5CF6', // Sombrio - Roxo
  K: '#EF4444', // Clássico - Vermelho
  X: '#3B82F6', // Experimental - Azul
  D: '#1F2937', // Denso - Preto
  L: '#10B981', // Leve - Verde
};

const DEFAULT_COLOR = '#9CA3AF'; // Cinza padrão

export default function ArchetypeSymbol({
  archetypeId,
  subcategoryId,
  size = 64,
  animated = true,
  className = ''
}: ArchetypeSymbolProps) {
  const color = subcategoryId ? SUBCATEGORY_COLORS[subcategoryId] || DEFAULT_COLOR : DEFAULT_COLOR;

  const getSymbolPath = () => {
    switch (archetypeId) {
      // Espectro Emocional (E)
      case 'EE': // Alma Sensível
        return (
          <g>
            <circle cx="32" cy="32" r="24" fill="none" stroke={color} strokeWidth="2.5" />
            <path d="M20,32 Q32,20 44,32 Q32,44 20,32" fill={color} opacity="0.3" />
            <circle cx="28" cy="28" r="3" fill={color} />
            <circle cx="36" cy="28" r="3" fill={color} />
            <path d="M24,36 Q32,42 40,36" stroke={color} strokeWidth="2.5" fill="none" strokeLinecap="round" />
          </g>
        );

      case 'EI': // Filósofo do Coração
        return (
          <g>
            <circle cx="32" cy="32" r="24" fill="none" stroke={color} strokeWidth="2.5" />
            <path d="M20,32 Q32,20 44,32 Q32,44 20,32" fill="none" stroke={color} strokeWidth="2" />
            <circle cx="32" cy="32" r="8" fill="none" stroke={color} strokeWidth="2" />
            <circle cx="32" cy="32" r="3" fill={color} />
          </g>
        );

      case 'EC': // Romântico Nostálgico
        return (
          <g>
            <path d="M32,44 Q20,32 20,24 Q20,16 26,16 Q32,16 32,22 Q32,16 38,16 Q44,16 44,24 Q44,32 32,44"
              fill="none" stroke={color} strokeWidth="2.5" />
            <circle cx="26" cy="24" r="2" fill={color} />
            <circle cx="38" cy="24" r="2" fill={color} />
            <path d="M18,20 L22,16 M46,20 L42,16" stroke={color} strokeWidth="2" strokeLinecap="round" />
          </g>
        );

      case 'ES': // Poeta Visual
        return (
          <g>
            <path d="M32,44 Q20,32 20,24 Q20,16 26,16 Q32,16 32,22 Q32,16 38,16 Q44,16 44,24 Q44,32 32,44"
              fill={color} opacity="0.2" stroke={color} strokeWidth="2" />
            <circle cx="26" cy="20" r="4" fill="none" stroke={color} strokeWidth="2" />
            <circle cx="38" cy="20" r="4" fill="none" stroke={color} strokeWidth="2" />
            <path d="M16,32 Q32,28 48,32" stroke={color} strokeWidth="1.5" strokeLinecap="round" fill="none" />
          </g>
        );

      case 'ER': // Comediante Trágico
        return (
          <g>
            <circle cx="32" cy="32" r="24" fill="none" stroke={color} strokeWidth="2.5" />
            <path d="M24,28 Q32,22 40,28" stroke={color} strokeWidth="2.5" fill="none" strokeLinecap="round" />
            <path d="M24,38 Q32,44 40,38" stroke={color} strokeWidth="2.5" fill="none" strokeLinecap="round" />
            <circle cx="24" cy="28" r="2" fill={color} />
            <circle cx="40" cy="28" r="2" fill={color} />
          </g>
        );

      // Espectro Intelectual (I)
      case 'IE': // Visionário
        return (
          <g>
            <circle cx="32" cy="32" r="24" fill="none" stroke={color} strokeWidth="2" />
            <circle cx="32" cy="32" r="16" fill="none" stroke={color} strokeWidth="2" />
            <circle cx="32" cy="32" r="8" fill="none" stroke={color} strokeWidth="2" />
            <circle cx="32" cy="32" r="3" fill={color} />
            <path d="M32,8 L32,18 M32,46 L32,56 M8,32 L18,32 M46,32 L56,32"
              stroke={color} strokeWidth="2" strokeLinecap="round" />
          </g>
        );

      case 'II': // Arquiteto da Lógica
        return (
          <g>
            <rect x="12" y="12" width="40" height="40" fill="none" stroke={color} strokeWidth="2.5" />
            <rect x="18" y="18" width="28" height="28" fill="none" stroke={color} strokeWidth="2" />
            <rect x="24" y="24" width="16" height="16" fill="none" stroke={color} strokeWidth="2" />
            <circle cx="32" cy="32" r="4" fill={color} />
            <line x1="12" y1="12" x2="20" y2="20" stroke={color} strokeWidth="1.5" />
            <line x1="52" y1="12" x2="44" y2="20" stroke={color} strokeWidth="1.5" />
            <line x1="12" y1="52" x2="20" y2="44" stroke={color} strokeWidth="1.5" />
            <line x1="52" y1="52" x2="44" y2="44" stroke={color} strokeWidth="1.5" />
          </g>
        );

      case 'IC': // Crítico Erudito
        return (
          <g>
            <rect x="16" y="12" width="32" height="40" rx="2" fill="none" stroke={color} strokeWidth="2.5" />
            <line x1="22" y1="20" x2="42" y2="20" stroke={color} strokeWidth="2" />
            <line x1="22" y1="26" x2="42" y2="26" stroke={color} strokeWidth="2" />
            <line x1="22" y1="32" x2="38" y2="32" stroke={color} strokeWidth="2" />
            <line x1="22" y1="38" x2="42" y2="38" stroke={color} strokeWidth="2" />
            <circle cx="32" cy="44" r="3" fill={color} />
          </g>
        );

      case 'IS': // Engenheiro de Sonhos
        return (
          <g>
            <path d="M32,12 L48,24 L48,44 L32,56 L16,44 L16,24 Z"
              fill="none" stroke={color} strokeWidth="2.5" />
            <circle cx="32" cy="32" r="12" fill="none" stroke={color} strokeWidth="2" />
            <circle cx="32" cy="32" r="6" fill="none" stroke={color} strokeWidth="2" />
            <circle cx="32" cy="32" r="2" fill={color} />
            <path d="M32,20 L32,24 M32,40 L32,44 M20,32 L24,32 M40,32 L44,32"
              stroke={color} strokeWidth="1.5" />
          </g>
        );

      case 'IR': // Arquiteto do Caos
        return (
          <g>
            <path d="M32,12 L44,24 L48,38 L36,48 L20,44 L16,28 Z"
              fill="none" stroke={color} strokeWidth="2.5" />
            <path d="M24,20 L40,44 M40,20 L24,44" stroke={color} strokeWidth="2" />
            <circle cx="24" cy="20" r="3" fill={color} />
            <circle cx="40" cy="20" r="3" fill={color} />
            <circle cx="24" cy="44" r="3" fill={color} />
            <circle cx="40" cy="44" r="3" fill={color} />
            <circle cx="32" cy="32" r="4" fill={color} />
          </g>
        );

      // Espectro Cultural (C)
      case 'CE': // Curador da Dor
        return (
          <g>
            <path d="M32,16 Q20,20 16,32 Q20,44 32,48 Q44,44 48,32 Q44,20 32,16"
              fill="none" stroke={color} strokeWidth="2.5" />
            <path d="M32,24 Q26,26 24,32 Q26,38 32,40 Q38,38 40,32 Q38,26 32,24"
              fill={color} opacity="0.2" stroke={color} strokeWidth="2" />
            <path d="M28,32 L32,36 L36,28" stroke={color} strokeWidth="2.5" strokeLinecap="round" fill="none" />
          </g>
        );

      case 'CI': // Guardião do Legado
        return (
          <g>
            <rect x="16" y="20" width="32" height="28" rx="2" fill="none" stroke={color} strokeWidth="2.5" />
            <rect x="20" y="16" width="24" height="4" rx="1" fill={color} />
            <line x1="24" y1="28" x2="40" y2="28" stroke={color} strokeWidth="2" />
            <line x1="24" y1="34" x2="40" y2="34" stroke={color} strokeWidth="2" />
            <line x1="24" y1="40" x2="36" y2="40" stroke={color} strokeWidth="2" />
            <path d="M32,44 L32,52 M28,52 L36,52" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
          </g>
        );

      case 'CC': // Patrono da História
        return (
          <g>
            <path d="M32,12 L42,22 L42,52 L22,52 L22,22 Z" fill="none" stroke={color} strokeWidth="2.5" />
            <path d="M22,22 L32,12 L32,22 Z" fill={color} opacity="0.3" />
            <line x1="26" y1="28" x2="38" y2="28" stroke={color} strokeWidth="2" />
            <line x1="26" y1="34" x2="38" y2="34" stroke={color} strokeWidth="2" />
            <line x1="26" y1="40" x2="38" y2="40" stroke={color} strokeWidth="2" />
            <circle cx="32" cy="46" r="2" fill={color} />
          </g>
        );

      case 'CS': // Esteta Clássico
        return (
          <g>
            <rect x="16" y="16" width="32" height="32" rx="4" fill="none" stroke={color} strokeWidth="2.5" />
            <rect x="20" y="20" width="24" height="24" rx="3" fill="none" stroke={color} strokeWidth="2" />
            <circle cx="32" cy="32" r="8" fill="none" stroke={color} strokeWidth="2" />
            <circle cx="32" cy="32" r="3" fill={color} />
            <path d="M16,16 L20,20 M48,16 L44,20 M16,48 L20,44 M48,48 L44,44"
              stroke={color} strokeWidth="1.5" strokeLinecap="round" />
          </g>
        );

      case 'CR': // Contador de Histórias
        return (
          <g>
            <path d="M20,44 Q20,20 32,16 Q44,20 44,44 L32,52 Z"
              fill="none" stroke={color} strokeWidth="2.5" />
            <path d="M26,28 Q32,24 38,28" stroke={color} strokeWidth="2" fill="none" />
            <path d="M26,36 L28,36 M30,36 L34,36 M36,36 L38,36"
              stroke={color} strokeWidth="2" strokeLinecap="round" />
            <circle cx="28" cy="28" r="2" fill={color} />
            <circle cx="36" cy="28" r="2" fill={color} />
          </g>
        );

      // Espectro Sensorial (S)
      case 'SE': // Pintor de Emoções
        return (
          <g>
            <rect x="14" y="18" width="36" height="28" rx="2" fill="none" stroke={color} strokeWidth="2.5" />
            <path d="M18,22 Q24,30 32,28 Q40,26 46,34" stroke={color} strokeWidth="2" fill="none" />
            <path d="M18,34 Q26,28 32,36 Q38,42 46,38" stroke={color} strokeWidth="2" fill="none" />
            <circle cx="24" cy="28" r="2" fill={color} />
            <circle cx="38" cy="30" r="2" fill={color} />
            <path d="M20,14 L24,18 M44,14 L40,18" stroke={color} strokeWidth="2" strokeLinecap="round" />
          </g>
        );

      case 'SI': // Alquimista Visual
        return (
          <g>
            <circle cx="32" cy="28" r="12" fill="none" stroke={color} strokeWidth="2.5" />
            <path d="M24,38 L40,38 L38,50 L26,50 Z" fill="none" stroke={color} strokeWidth="2.5" />
            <path d="M28,42 Q32,48 36,42" stroke={color} strokeWidth="2" fill="none" />
            <circle cx="32" cy="28" r="4" fill={color} opacity="0.3" />
            <path d="M32,16 L32,20 M26,20 L26,24 M38,20 L38,24"
              stroke={color} strokeWidth="2" strokeLinecap="round" />
          </g>
        );

      case 'SC': // Nostálgico Sensorial
        return (
          <g>
            <rect x="12" y="18" width="40" height="28" rx="3" fill="none" stroke={color} strokeWidth="2.5" />
            <circle cx="24" cy="32" r="6" fill="none" stroke={color} strokeWidth="2" />
            <circle cx="40" cy="32" r="6" fill="none" stroke={color} strokeWidth="2" />
            <path d="M16,26 L20,26 M44,26 L48,26 M16,38 L20,38 M44,38 L48,38"
              stroke={color} strokeWidth="2" strokeLinecap="round" />
            <circle cx="32" cy="32" r="2" fill={color} />
          </g>
        );

      case 'SS': // Arquiteto dos Sentidos
        return (
          <g>
            <path d="M32,12 L48,24 L48,44 L32,56 L16,44 L16,24 Z"
              fill="none" stroke={color} strokeWidth="2.5" />
            <path d="M32,20 L42,28 L42,40 L32,48 L22,40 L22,28 Z"
              fill="none" stroke={color} strokeWidth="2" />
            <circle cx="32" cy="32" r="6" fill={color} opacity="0.3" />
            <circle cx="32" cy="32" r="3" fill={color} />
          </g>
        );

      case 'SR': // Mestre do Espetáculo
        return (
          <g>
            <path d="M32,12 L38,26 L52,28 L42,38 L44,52 L32,44 L20,52 L22,38 L12,28 L26,26 Z"
              fill="none" stroke={color} strokeWidth="2.5" />
            <circle cx="32" cy="32" r="8" fill="none" stroke={color} strokeWidth="2" />
            <circle cx="32" cy="32" r="3" fill={color} />
          </g>
        );

      // Espectro Recreativo (R)
      case 'RE': // Aventureiro Sentimental
        return (
          <g>
            <path d="M32,12 L40,28 L56,28 L44,40 L48,56 L32,44 L16,56 L20,40 L8,28 L24,28 Z"
              fill={color} opacity="0.2" stroke={color} strokeWidth="2.5" />
            <path d="M20,32 Q32,20 44,32 Q32,40 20,32" fill={color} opacity="0.3" />
            <circle cx="28" cy="28" r="2" fill={color} />
            <circle cx="36" cy="28" r="2" fill={color} />
          </g>
        );

      case 'RI': // Estrategista Brincalhão
        return (
          <g>
            <circle cx="32" cy="32" r="24" fill="none" stroke={color} strokeWidth="2.5" />
            <path d="M20,24 L32,32 L44,24 M20,40 L32,32 L44,40"
              stroke={color} strokeWidth="2.5" strokeLinecap="round" fill="none" />
            <circle cx="20" cy="24" r="3" fill={color} />
            <circle cx="44" cy="24" r="3" fill={color} />
            <circle cx="20" cy="40" r="3" fill={color} />
            <circle cx="44" cy="40" r="3" fill={color} />
          </g>
        );

      case 'RC': // Menestrel Moderno
        return (
          <g>
            <circle cx="32" cy="32" r="24" fill="none" stroke={color} strokeWidth="2.5" />
            <path d="M26,24 Q32,18 38,24" stroke={color} strokeWidth="2" fill="none" strokeLinecap="round" />
            <circle cx="26" cy="24" r="3" fill={color} />
            <circle cx="38" cy="24" r="3" fill={color} />
            <path d="M24,36 Q32,42 40,36" stroke={color} strokeWidth="2.5" fill="none" strokeLinecap="round" />
            <path d="M28,32 L30,34 L34,30" stroke={color} strokeWidth="2" fill="none" strokeLinecap="round" />
          </g>
        );

      case 'RS': // Showman Visual
        return (
          <g>
            <path d="M32,8 L36,24 L52,26 L40,36 L44,52 L32,42 L20,52 L24,36 L12,26 L28,24 Z"
              fill="none" stroke={color} strokeWidth="2.5" />
            <path d="M24,28 Q32,34 40,28 M24,36 Q32,42 40,36"
              stroke={color} strokeWidth="2" fill="none" strokeLinecap="round" />
            <circle cx="28" cy="28" r="2" fill={color} />
            <circle cx="36" cy="28" r="2" fill={color} />
          </g>
        );

      case 'RR': // Espírito Livre
        return (
          <g>
            <circle cx="32" cy="32" r="24" fill="none" stroke={color} strokeWidth="2.5" />
            <circle cx="32" cy="32" r="16" fill="none" stroke={color} strokeWidth="2" strokeDasharray="4 4" />
            <circle cx="32" cy="32" r="8" fill="none" stroke={color} strokeWidth="2" />
            <circle cx="28" cy="28" r="2" fill={color} />
            <circle cx="36" cy="28" r="2" fill={color} />
            <path d="M26,36 Q32,40 38,36" stroke={color} strokeWidth="2" fill="none" strokeLinecap="round" />
          </g>
        );

      default:
        return (
          <circle cx="32" cy="32" r="24" fill="none" stroke={color} strokeWidth="2.5" />
        );
    }
  };

  const symbol = (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      style={{ filter: `drop-shadow(0 0 ${size / 16}px ${color}40)` }}
    >
      {getSymbolPath()}
    </svg>
  );

  if (animated) {
    return (
      <motion.div
        initial={{ scale: 0, rotate: -180 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{
          type: "spring",
          stiffness: 200,
          damping: 15,
          duration: 0.6
        }}
        whileHover={{
          scale: 1.1,
          rotate: 5,
          transition: { duration: 0.3 }
        }}
      >
        {symbol}
      </motion.div>
    );
  }

  return symbol;
}
