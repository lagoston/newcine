import React from 'react';
import { motion } from 'framer-motion';
// Importando uma seleção pro-level do Lucide
import { 
  Heart, Flame, Eye, Sparkles, BrainCircuit, Shield, 
  Lightbulb, Compass, Target, Crown, Zap, Infinity,
  Hexagon, CircleDashed, Triangle, Gem, Aperture, 
  Orbit, Dna, Fingerprint
} from 'lucide-react';

interface ArchetypeSymbolProps {
  archetypeId: string;
  subcategoryId?: string | null;
  size?: number;
  animated?: boolean;
  className?: string;
}

const SUBCATEGORY_COLORS: Record<string, string> = {
  A: '#F59E0B', // Radiante - Amarelo
  B: '#8B5CF6', // Sombrio - Roxo
  K: '#EF4444', // Clássico - Vermelho
  X: '#3B82F6', // Experimental - Azul
  D: '#FFFFFF', // Denso - Branco
  L: '#10B981', // Leve - Verde
};

const DEFAULT_COLOR = '#9CA3AF'; // Cinza padrão

const ArchetypeSymbol = React.memo(function ArchetypeSymbol({
  archetypeId,
  subcategoryId,
  size = 64,
  animated = true,
  className = ''
}: ArchetypeSymbolProps) {
  const color = subcategoryId ? SUBCATEGORY_COLORS[subcategoryId] || DEFAULT_COLOR : DEFAULT_COLOR;

  // Função que mapeia cada ID para um ícone Lucide limpo e semântico
  const renderIcon = () => {
    const props = { size, color, strokeWidth: 1.5 };
    
    switch (archetypeId) {
      // Espectro Emocional (E) - Foco em sentir e conexões
      case 'EI': return <Heart {...props} />;
      case 'EC': return <Flame {...props} />;
      case 'ES': return <Eye {...props} />;
      case 'ER': return <Sparkles {...props} />;

      // Espectro Intelectual (I) - Foco na mente e estrutura
      case 'IE': return <BrainCircuit {...props} />;
      case 'IC': return <Shield {...props} />;
      case 'IS': return <Lightbulb {...props} />;
      case 'IR': return <Hexagon {...props} />;

      // Espectro Cultural (C) - Foco em tempo, arte e legado
      case 'CE': return <Orbit {...props} />;
      case 'CI': return <Crown {...props} />;
      case 'CS': return <Gem {...props} />;
      case 'CR': return <Compass {...props} />;

      // Espectro Sensorial (S) - Foco em percepção bruta
      case 'SE': return <Aperture {...props} />;
      case 'SI': return <Fingerprint {...props} />;
      case 'SC': return <CircleDashed {...props} />;
      case 'SR': return <Triangle {...props} />;

      // Espectro Recreativo (R) - Foco em ação e energia
      case 'RE': return <Target {...props} />;
      case 'RI': return <Zap {...props} />;
      case 'RC': return <Infinity {...props} />;
      case 'RS': return <Dna {...props} />;

      // Fallback pra se der ruim
      default: return <CircleDashed {...props} />;
    }
  };

  const symbol = (
    <div 
      className={className}
      style={{ filter: `drop-shadow(0 0 ${size / 16}px ${color}40)` }}
    >
      {renderIcon()}
    </div>
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
});

export default ArchetypeSymbol;
