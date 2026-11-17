import React, { Suspense, lazy } from 'react';
import type MoodObjectCard from './MoodObjectCard';

// O cartão de um móvel de humor só é baixado quando alguém toca num móvel
// (17/11/2026): a home carrega o estúdio, e quase ninguém tem um móvel ainda.
const Card = lazy(() => import('./MoodObjectCard'));

const MoodObjectCardLazy: React.FC<React.ComponentProps<typeof MoodObjectCard>> = (props) => (
  <Suspense fallback={null}>
    <Card {...props} />
  </Suspense>
);

export default MoodObjectCardLazy;
