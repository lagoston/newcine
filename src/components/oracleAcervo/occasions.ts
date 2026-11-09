import type React from 'react';
import type { AcervoOccasion } from '../../lib/mesa/types';
import { Brain, Clapperboard, CloudRain, Coffee, Droplet, Ghost, Gift, Heart, Laugh, PartyPopper, Skull, Sofa, Timer, Tv } from 'lucide-react';

// As ocasiões do Acervo (09/11/2026): o ícone de cada uma (de 05/11, da Mesa)
// e as 12 fixas que aparecem na hora, enquanto a lista do banco
// (mesa_occasions, com a da época quando o evento está no ar) não chega. As
// chaves são os ids do site ('galera', 'christmas'); os nomes moram em
// mesa.occasions.<id> nos locales.
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

// `media` fixa o tipo ("Só um episódio" é série); `pass`: quem passa a vez.
export const BASE_OCCASIONS: AcervoOccasion[] = [
  { id: 'chuva', grp: 'who', sort: 1, media: 'movie', pass: [] },
  { id: 'amor', grp: 'who', sort: 2, media: null, pass: [] },
  { id: 'familia', grp: 'who', sort: 3, media: null, pass: [] },
  { id: 'galera', grp: 'who', sort: 4, media: null, pass: [] },
  { id: 'noventa', grp: 'time', sort: 5, media: 'movie', pass: [] },
  { id: 'episodio', grp: 'time', sort: 6, media: 'tv', pass: [] },
  { id: 'maratona', grp: 'time', sort: 7, media: 'tv', pass: [] },
  { id: 'chorar', grp: 'feel', sort: 8, media: null, pass: [] },
  { id: 'rir', grp: 'feel', sort: 9, media: null, pass: [] },
  { id: 'susto', grp: 'feel', sort: 10, media: null, pass: [] },
  { id: 'no', grp: 'feel', sort: 11, media: null, pass: [] },
  { id: 'colo', grp: 'feel', sort: 12, media: null, pass: ['cypher'] },
];
