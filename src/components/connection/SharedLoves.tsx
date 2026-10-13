import React, { useRef } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { PosterArt, ScoreBubble } from './connectionBits';
import { connectionPoster, connectionTitleName, type ConnectionSide, type ConnectionTitle } from '../../lib/connection';
import { MIST, FOCUS_RING } from '../../lib/oracleTheme';
import type { AvatarUser } from '../UserAvatar';

// Fileira de pôsteres que os dois amam (ou que nenhum dos dois salva), da
// gaveta Conexão (13/10/2026). Embaixo de cada pôster, duas bolhas
// "avatar + nota": o avatar é a legenda. A fileira rola por dentro (com
// encaixe); a página nunca rola de lado. Os pôsteres sobem 8px em sequência
// quando a fileira aparece (o único movimento além do número).

interface SharedLovesProps {
  items: ConnectionTitle[];
  me: AvatarUser | null;
  other: ConnectionSide;
  // 'loves': pôsteres de 96px; 'hates': menores, discretos.
  variant?: 'loves' | 'hates';
  onOpenTitle: (item: ConnectionTitle) => void;
}

const SharedLoves: React.FC<SharedLovesProps> = ({ items, me, other, variant = 'loves', onOpenTitle }) => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const reduceMotion = useReducedMotion();
  const listRef = useRef<HTMLUListElement>(null);
  const inView = useInView(listRef, { once: true, amount: 0.3 });
  const loves = variant === 'loves';

  // Amados: pela menor das duas notas (o quanto os DOIS amam). Detestados:
  // pela maior (o quanto os dois detestam).
  const sorted = [...items]
    .sort((a, b) =>
      loves
        ? Math.min(b.rating_me ?? 0, b.rating_other) - Math.min(a.rating_me ?? 0, a.rating_other) ||
          Math.max(b.rating_me ?? 0, b.rating_other) - Math.max(a.rating_me ?? 0, a.rating_other)
        : Math.max(a.rating_me ?? 0, a.rating_other) - Math.max(b.rating_me ?? 0, b.rating_other),
    )
    .slice(0, loves ? 10 : 6);

  return (
    <ul
      ref={listRef}
      className="-mx-5 sm:-mx-7 px-5 sm:px-7 scroll-px-5 sm:scroll-px-7 flex gap-3 overflow-x-auto snap-x snap-mandatory no-scrollbar pb-1"
    >
      {sorted.map((item, i) => {
        const title = connectionTitleName(item, lang);
        const mine = item.rating_me ?? 0;
        return (
          <motion.li
            key={`${item.media_type}:${item.movie_id}`}
            className={`snap-start shrink-0 ${loves ? 'w-24' : 'w-[88px]'}`}
            initial={reduceMotion || !loves ? false : { y: 8, opacity: 0 }}
            animate={inView || reduceMotion || !loves ? { y: 0, opacity: 1 } : undefined}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1], delay: Math.min(i, 6) * 0.06 }}
          >
            <button
              type="button"
              onClick={() => onOpenTitle(item)}
              aria-label={title}
              title={title}
              className={`block w-full min-h-0 min-w-0 text-left rounded-lg hover:brightness-110 transition ${FOCUS_RING}`}
            >
              <PosterArt path={connectionPoster(item, lang)} className={loves ? '' : 'opacity-90'} />
            </button>
            <div className="mt-2 flex items-center gap-1">
              <ScoreBubble user={me ?? {}} value={mine} language={lang} size="sm" label={t('connection.rated.you', { rating: mine })} />
              <ScoreBubble
                user={other}
                value={item.rating_other}
                language={lang}
                size="sm"
                label={t('connection.rated.other', { username: other.username, rating: item.rating_other })}
              />
            </div>
            {loves && (
              <p className="mt-1.5 text-[12px] leading-tight truncate" style={{ color: MIST }} aria-hidden>
                {title}
              </p>
            )}
          </motion.li>
        );
      })}
    </ul>
  );
};

export default SharedLoves;
