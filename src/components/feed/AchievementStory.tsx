import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { MIST, NIGHT, PAPER, PIXEL, tagCategoryStyle, withAlpha } from '../../lib/oracleTheme';
import { SEASONAL_THEMES, isSeasonalEventId, toRoman } from '../../lib/seasonalEvents';
import { tagRequirementText } from '../../lib/tags';
import { eventAchievementOf, tagAchievementOf, type FeedStory } from '../../lib/friendsFeed';
import { BatFlights, LightsGarland, MoonGlow, Snowfall } from '../seasonal/SeasonalArt';

// Stories de conquista no visualizador do Feed dos Amigos:
//   • tag desbloqueada: medalhão com o emoji na cor da categoria, o nome, a
//     categoria e o que a tag pede;
//   • missões de um evento concluídas (Halloween, Natal…): a cena do tema
//     (morcegos e lua / luzes e neve) com as três tags da edição.

const DEFAULT_ACCENT = '#A78BFA';

// Fundo do cartão (fica atrás de tudo, no lugar da capa borrada dos filmes).
export const AchievementBackdrop: React.FC<{ story: FeedStory }> = ({ story }) => {
  const event = eventAchievementOf(story);
  if (event && isSeasonalEventId(event.event_id)) {
    const theme = SEASONAL_THEMES[event.event_id];
    return (
      <div aria-hidden className="absolute inset-0 overflow-hidden" style={{ background: theme.panelBackground }}>
        {theme.id === 'halloween' ? (
          <>
            <MoonGlow size={110} style={{ top: 70, right: -30 }} strength={0.7} />
            <BatFlights
              flights={[
                { top: '18%', size: 24, dur: 10, delay: -3 },
                { top: '34%', size: 16, dur: 14, delay: -9 },
                { top: '62%', size: 18, dur: 12, delay: -5 },
              ]}
              color="#0B0612"
              glow={withAlpha(theme.accent, 0.5)}
            />
          </>
        ) : (
          <>
            <LightsGarland count={11} className="absolute inset-x-0 top-[88px]" sag={10} bulb={8} />
            <Snowfall count={26} seed={17} speed={[8, 16]} opacity={[0.3, 0.8]} />
          </>
        )}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.35), transparent 24%, transparent 62%, rgba(0,0,0,0.75))' }} />
      </div>
    );
  }
  const tag = tagAchievementOf(story);
  const accent = tag ? tagCategoryStyle(tag.category).accent : DEFAULT_ACCENT;
  return (
    <div
      aria-hidden
      className="absolute inset-0"
      style={{
        background: `radial-gradient(ellipse 75% 45% at 50% 36%, ${withAlpha(accent, 0.3)}, transparent 70%), radial-gradient(ellipse 60% 50% at 10% 100%, rgba(139,92,246,0.22), transparent 70%), ${NIGHT}`,
      }}
    >
      {/* pontinhos de brilho em volta do medalhão (longe do texto) */}
      {[
        [16, 24, 3],
        [80, 22, 2],
        [88, 44, 3],
        [9, 47, 2],
        [92, 66, 2],
        [7, 74, 3],
      ].map(([x, y, r], i) => (
        <span
          key={i}
          className="co-pollen absolute rounded-full"
          style={{ left: `${x}%`, top: `${y}%`, width: r * 2, height: r * 2, background: accent, boxShadow: `0 0 10px 2px ${withAlpha(accent, 0.6)}`, animationDelay: `${-i * 0.6}s` }}
        />
      ))}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(18,13,34,0.6), transparent 22%, transparent 60%, rgba(18,13,34,0.95) 85%)' }} />
    </div>
  );
};

// O conteúdo do cartão (no centro, onde fica a capa nos filmes).
export const AchievementCard: React.FC<{ story: FeedStory }> = ({ story }) => {
  const { t, i18n } = useTranslation();
  const reduceMotion = useReducedMotion();
  const pop = (delay: number) =>
    reduceMotion
      ? {}
      : {
          initial: { scale: 0.4, rotate: -14, opacity: 0 },
          animate: { scale: 1, rotate: 0, opacity: 1 },
          transition: { type: 'spring' as const, stiffness: 240, damping: 15, delay },
        };

  const event = eventAchievementOf(story);
  if (event) {
    const theme = isSeasonalEventId(event.event_id) ? SEASONAL_THEMES[event.event_id] : null;
    const accent = theme?.accent ?? DEFAULT_ACCENT;
    const glow = theme?.glow ?? '#F5D0FE';
    const eventName = t(`feed.event.${event.event_id}`, { defaultValue: event.event_id });
    return (
      <div className="flex flex-col items-center text-center w-full">
        <p style={{ ...PIXEL, color: theme?.accentText ?? PAPER }} className="text-sm tracking-wide uppercase">
          {t('feed.achievement.eventEyebrow', { event: eventName, edition: event.edition })}
          {event.level > 1 && <span className="ml-1.5">· {toRoman(event.level)}</span>}
        </p>
        <div className="mt-6 flex items-start justify-center gap-3 sm:gap-4">
          {event.tags.map((tag, i) => (
            <div key={tag.tag} className="flex flex-col items-center w-[86px]">
              <motion.span
                {...pop(0.12 + i * 0.12)}
                className="grid place-items-center w-[78px] h-[78px] rounded-full text-[42px] leading-none"
                style={{
                  background: `radial-gradient(circle, ${withAlpha(glow, 0.35)}, ${withAlpha(accent, 0.14)} 60%, transparent 72%)`,
                  boxShadow: `inset 0 0 0 2px ${withAlpha(accent, 0.75)}, 0 0 34px ${withAlpha(accent, 0.45)}`,
                }}
                aria-hidden
              >
                {tag.emoji}
              </motion.span>
              <span className="mt-2 text-[11px] font-semibold leading-tight" style={{ color: PAPER }}>
                {tag.name}
              </span>
            </div>
          ))}
        </div>
        <h3 style={{ ...PIXEL, color: PAPER }} className="mt-6 text-3xl leading-tight">
          {t(`events.${event.event_id}.doneTitle`, { defaultValue: t('feed.achievement.eventDone') })}
        </h3>
        <p className="mt-2 max-w-xs text-sm leading-relaxed" style={{ color: PAPER, opacity: 0.85 }}>
          {t('feed.achievement.eventText', { event: eventName })}
        </p>
      </div>
    );
  }

  const tag = tagAchievementOf(story);
  if (!tag) return null;
  const style = tagCategoryStyle(tag.category);
  const requirement = tagRequirementText(tag.category, tag.name, i18n.language);
  return (
    <div className="flex flex-col items-center text-center w-full">
      <p style={{ ...PIXEL, color: style.accent }} className="text-sm tracking-wide uppercase">
        {t('feed.achievement.tagEyebrow')}
      </p>
      <motion.span
        {...pop(0.1)}
        className="mt-6 grid place-items-center w-[150px] h-[150px] rounded-full text-[76px] leading-none"
        style={{
          background: `radial-gradient(circle, ${withAlpha(style.accent, 0.32)}, ${withAlpha(style.accent, 0.1)} 60%, transparent 72%)`,
          boxShadow: `inset 0 0 0 3px ${withAlpha(style.accent, 0.8)}, 0 0 60px ${withAlpha(style.accent, 0.45)}`,
        }}
        aria-hidden
      >
        {tag.emoji}
      </motion.span>
      <h3 style={{ ...PIXEL, color: PAPER }} className="mt-6 text-3xl leading-tight break-words">
        {tag.name}
      </h3>
      <span className={`mt-3 inline-flex items-center h-7 px-3 rounded-full text-xs font-semibold ${style.pill}`}>
        {t(`feed.achievement.category.${tag.category}`)}
      </span>
      {requirement && (
        <p className="mt-3 max-w-xs text-sm leading-relaxed" style={{ color: MIST }}>
          {requirement}
        </p>
      )}
    </div>
  );
};
