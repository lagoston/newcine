import React from 'react';
import { useTranslation } from 'react-i18next';
import type { Card } from '../../../lib/poker/cards';
import PlayingCard from './PlayingCard';

// Ranking das mãos (§7.4): as 10 combinações desenhadas em cartas de 28×40,
// da mais forte para a mais fraca, com os nomes em pt-BR.
const ROWS: { key: string; cards: Card[] }[] = [
  { key: 'royal', cards: ['As', 'Ks', 'Qs', 'Js', 'Ts'] },
  { key: 'straight_flush', cards: ['9h', '8h', '7h', '6h', '5h'] },
  { key: 'quads', cards: ['8s', '8h', '8d', '8c', 'Kd'] },
  { key: 'full_house', cards: ['Qs', 'Qh', 'Qd', '4c', '4s'] },
  { key: 'flush', cards: ['Ad', 'Jd', '9d', '6d', '2d'] },
  { key: 'straight', cards: ['Tc', '9d', '8s', '7h', '6c'] },
  { key: 'trips', cards: ['7s', '7d', '7c', 'Kh', '2s'] },
  { key: 'two_pair', cards: ['Ah', 'Ac', '9s', '9d', '5h'] },
  { key: 'pair', cards: ['Jh', 'Jc', 'As', '8d', '3c'] },
  { key: 'high_card', cards: ['Ks', 'Th', '7d', '4c', '2h'] },
];

const HandRanking: React.FC = () => {
  const { t } = useTranslation();
  return (
    <ol className="grid gap-2.5">
      {ROWS.map((r, i) => (
        <li key={r.key} className="flex items-center justify-between gap-3">
          <span className="text-[14px] min-w-0">
            <span className="pk-num mr-2" style={{ color: '#A7A0BF' }}>{i + 1}</span>
            {t(`poker.hands.${r.key}`)}
          </span>
          <span className="flex gap-[3px] flex-none" role="img" aria-label={t(`poker.hands.${r.key}`)}>
            {r.cards.map((c) => (
              <PlayingCard key={c} card={c} size="rank" decorative />
            ))}
          </span>
        </li>
      ))}
    </ol>
  );
};

export default HandRanking;
