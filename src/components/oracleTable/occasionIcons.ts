import type React from 'react';
import { Brain, CloudRain, Coffee, Droplet, Ghost, Gift, Heart, Laugh, PartyPopper, Skull, Sofa, Timer, Tv, Clapperboard } from 'lucide-react';

// O ícone de cada ocasião (SPEC §4.2), 05/11/2026: aparece na ficha da mão, na
// gaveta "Todas" e no porquê das cartas de pergunta.
export const OCCASION_ICON: Record<string, React.ElementType> = {
  chuva: CloudRain,
  amor: Heart,
  familia: Sofa,
  galera: PartyPopper,
  noventa: Timer,
  episodio: Tv,
  maratona: Clapperboard,
  chorar: Droplet,
  rir: Laugh,
  susto: Ghost,
  no: Brain,
  colo: Coffee,
  halloween: Skull,
  christmas: Gift,
};
