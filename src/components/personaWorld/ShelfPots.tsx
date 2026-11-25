import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowUpRight, X } from 'lucide-react';
import { MOODS, MOOD_BY_LETTER, withMoodAlpha } from '../../lib/moods';
import type { PersonaWorld, WorldState, WorldTitle } from '../../lib/personaWorld';
import type { ThemeReading } from '../../lib/personaThemes';
import { FOCUS_RING, MIST, NIGHT, PAPER, PIXEL, ratingTone } from '../../lib/oracleTheme';
import KeywordCloud from '../profile/KeywordCloud';
import { formatOne } from '../profile/observatoryKit';
import { Heading, Note, TitleThumb } from './bits';

// Os potinhos: as nove prateleiras, uma ao lado da outra, e os dados de cada
// uma (15/11/2026).
//
// Pedido do Bruno, ao unificar o "Sua Persona" da home e o do perfil: "vamos
// colocar os 'potinhos' das prateleiras, que aparecem no modal reduzido do
// profile, que quando clicados aparecem os dados das prateleiras
// individualmente: quantidade de filmes, nota média, top filmes e as tags com
// suas notas médias". E a barra da Evolução "deve alterar o conteúdo dos
// potinhos também quando mexida".
//
// Até aqui os potinhos moravam no bloco do perfil (profile/EssenceRing), feitos
// com a biblioteca inteira que a página do perfil carrega. Vieram para dentro
// do modal, que é o mesmo na home e no perfil, e passaram a ler tudo da cena:
//   • a parte dos títulos, quantos são e a média de cada prateleira vêm do
//     estúdio (worldState);
//   • os mais bem avaliados vêm do estúdio (world.best);
//   • os temas vêm de get_persona_themes (lib/personaThemes.ts).
// Como o modal entrega aqui o estúdio do ponto em que a barra da Evolução está
// (e os temas daquele ponto), os potinhos voltam no tempo junto com o resto.
//
// 15/11/2026 (tarde), correção do Bruno: os temas "só devem aparecer quando a
// caixinha é clicada. Porque elas já estão aparecendo automaticamente. […] A
// hora que você clica na caixinha, que expande o modal daquela categoria, que
// deve aparecer." Sem nenhum potinho escolhido aparecia a lista geral ("Os
// temas que você mais ama"), rodando sozinha embaixo dos potinhos; ela saiu.
// Agora, sem potinho escolhido, ficam só os potinhos e o convite para tocar.

// celular: menos etiquetas por vez
function useCompact() {
  const query = '(max-width: 639px)';
  const [compact, setCompact] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setCompact(media.matches);
    update();
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);
  return compact;
}

interface ShelfPotsProps {
  world: PersonaWorld;
  st: WorldState;
  isOwn: boolean;
  // "@fulano", no estúdio de outra pessoa
  ownerName: string | null;
  // os temas do ponto em que a barra da Evolução está (null = ainda chegando)
  themes: ThemeReading | null;
  themesFailed: boolean;
  onOpenTitle: (title: WorldTitle) => void;
  openingKey: string | null;
  // sair do modal (ao seguir para a Mesa dos Oráculos)
  onLeave?: () => void;
}

const ShelfPots: React.FC<ShelfPotsProps> = ({ world, st, isOwn, ownerName, themes, themesFailed, onOpenTitle, openingKey, onLeave }) => {
  const { t, i18n } = useTranslation();
  const compact = useCompact();
  const [selected, setSelected] = useState<string | null>(null);
  const pt = i18n.language.startsWith('pt');

  const share = (letter: string) => (st.counted > 0 ? (st.films[letter] ?? 0) / st.counted : 0);
  const pct = (value: number) => `${Math.round(value * 100)}%`;
  const average = (letter: string): number | null => ((st.films[letter] ?? 0) > 0 ? (st.score[letter] ?? 0) / st.films[letter] : null);
  const avgText = (value: number | null) => (value === null ? '–' : formatOne(value, i18n.language));
  const titleName = (title: WorldTitle) => (pt ? title.titlePt || title.titleEn : title.titleEn || title.titlePt) || t('personaWorld.untitled');
  const maxShare = Math.max(0.0001, ...MOODS.map((mood) => share(mood.letter)));

  // as etiquetas de um tema: chegando, falhou, ou a nuvem
  const cloud = (words: ThemeReading['byLetter'][string] | undefined, accent: string, emptyText: string) =>
    themes ? (
      <KeywordCloud words={words ?? []} perGroup={compact ? 4 : 5} accent={accent} emptyText={emptyText} compact={compact} />
    ) : themesFailed ? (
      <Note>{t('personaWorld.pots.themesError')}</Note>
    ) : (
      <div className="flex gap-2" aria-busy="true" aria-label={t('personaWorld.pots.themesLoading')}>
        {[88, 112, 72].map((width) => (
          <span key={width} className="h-8 rounded-full bg-white/[0.06] animate-pulse" style={{ width }} />
        ))}
      </div>
    );

  const mood = selected ? MOOD_BY_LETTER[selected] : null;
  const rank = selected ? st.trio.indexOf(selected) : -1;
  const best = selected ? (world.best[selected] ?? []) : [];
  const selectedAvg = selected ? average(selected) : null;

  return (
    <section className="space-y-3">
      <div>
        <Heading>{t('personaWorld.pots.title')}</Heading>
        <Note>{t('personaWorld.pots.hint')}</Note>
      </div>

      <ul className="grid grid-cols-9 gap-1 sm:gap-1.5" aria-label={t('profile.observatory.gridLabel')}>
        {MOODS.map((item) => {
          const value = share(item.letter);
          const position = st.trio.indexOf(item.letter);
          const isSel = selected === item.letter;
          const label = t('profile.observatory.arcLabel', { mood: t(item.labelKey), pct: pct(value), count: st.films[item.letter] ?? 0, avg: avgText(average(item.letter)) });
          return (
            <li key={item.key} className="min-w-0">
              <button
                type="button"
                onClick={() => setSelected((current) => (current === item.letter ? null : item.letter))}
                aria-pressed={isSel}
                aria-label={label}
                title={label}
                className={`relative block w-full min-w-0 h-[58px] overflow-hidden rounded-[10px] transition ${FOCUS_RING}`}
                style={{
                  background: 'rgba(13,9,25,0.72)',
                  boxShadow: isSel ? `0 0 0 2px ${item.color}, 0 10px 22px -12px ${item.color}` : position >= 0 ? `inset 0 0 0 1.5px ${withMoodAlpha(item, 0.75)}` : 'inset 0 0 0 1px rgba(255,255,255,0.1)',
                  opacity: selected !== null && !isSel ? 0.55 : 1,
                }}
              >
                {/* o nível: a prateleira mais cheia vai até perto do alto */}
                <span aria-hidden className="absolute inset-x-0 bottom-0 transition-[height] duration-300" style={{ height: `${value > 0 ? 10 + (value / maxShare) * 62 : 0}%`, background: withMoodAlpha(item, isSel ? 0.5 : 0.3) }} />
                <span className="relative flex h-full flex-col items-center justify-center gap-[3px]">
                  <span style={{ ...PIXEL, color: item.color, textShadow: '0 1px 6px rgba(13,9,25,0.9)' }} className="text-[18px] leading-none">
                    {item.glyph}
                  </span>
                  <span style={{ ...PIXEL, color: PAPER, textShadow: '0 1px 6px rgba(13,9,25,0.9)' }} className="text-[11px] leading-none tabular-nums">
                    {pct(value)}
                  </span>
                </span>
                {position >= 0 && (
                  <span aria-hidden className="absolute right-[3px] top-[3px] grid h-[13px] w-[13px] place-items-center rounded-full text-[9px] leading-none" style={{ ...PIXEL, background: item.color, color: NIGHT }}>
                    {position + 1}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {mood && selected && (
        // ---------- a prateleira escolhida ----------
        <div className="rounded-2xl p-4" style={{ background: `linear-gradient(180deg, ${withMoodAlpha(mood, 0.08)}, transparent 60%), rgba(255,255,255,0.03)`, boxShadow: `inset 0 0 0 1px ${withMoodAlpha(mood, 0.35)}` }} aria-live="polite">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span
                className="grid place-items-center w-12 h-12 shrink-0 rounded-2xl text-[28px] leading-none"
                style={{ ...PIXEL, color: mood.color, background: withMoodAlpha(mood, 0.14), boxShadow: `inset 0 0 0 1px ${withMoodAlpha(mood, 0.4)}` }}
                aria-hidden
              >
                {mood.glyph}
              </span>
              <span className="min-w-0">
                <span className="block text-lg font-semibold leading-snug" style={{ color: PAPER }}>
                  {t(mood.labelKey)}
                </span>
                {rank >= 0 && (
                  <span className="block text-[12px]" style={{ color: mood.color }}>
                    {t('profile.observatory.codeRank', { rank: rank + 1 })}
                  </span>
                )}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className={`grid place-items-center w-11 h-11 shrink-0 -mr-2 -mt-2 rounded-full transition hover:bg-white/[0.06] ${FOCUS_RING}`}
              aria-label={t('personaWorld.pots.close')}
              title={t('personaWorld.pots.close')}
            >
              <X className="w-[18px] h-[18px]" style={{ color: MIST }} aria-hidden />
            </button>
          </div>

          <dl className="mt-3 grid grid-cols-3 gap-2">
            {[
              { label: t('profile.observatory.moodShareLabel'), value: pct(share(selected)), color: PAPER },
              { label: t('profile.observatory.moodFilmsLabel'), value: String(st.films[selected] ?? 0), color: PAPER },
              {
                label: isOwn ? t('profile.observatory.moodAvgLabel') : t('profile.observatory.moodAvgLabelOf'),
                value: avgText(selectedAvg),
                color: selectedAvg === null ? MIST : ratingTone(Math.round(selectedAvg)).color,
              },
            ].map((cell) => (
              <div key={cell.label} className="rounded-xl px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.04)' }}>
                <dd style={{ ...PIXEL, color: cell.color }} className="text-2xl leading-none tabular-nums">
                  {cell.value}
                </dd>
                <dt className="mt-1 text-[11px] leading-tight" style={{ color: MIST }}>
                  {cell.label}
                </dt>
              </div>
            ))}
          </dl>

          <p className="mt-3 text-[14px] leading-relaxed" style={{ color: 'rgba(243,234,211,0.86)' }}>
            {t(mood.readingKey)}
          </p>

          {best.length > 0 && (
            <div className="mt-4">
              <p className="text-[12px] font-medium" style={{ color: MIST }}>
                {isOwn ? t('profile.observatory.moodTop') : t('profile.observatory.moodTopOf', { name: ownerName ?? '' })}
              </p>
              <ul className="mt-2 grid grid-cols-4 gap-2 max-w-[320px]">
                {best.map((title) => (
                  <li key={`${title.type}:${title.id}`} className="min-w-0">
                    <TitleThumb title={title} name={titleName(title)} onOpen={onOpenTitle} opening={openingKey === `${title.type}:${title.id}`} />
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-4">
            <p className="text-[12px] font-medium" style={{ color: MIST }}>
              {t('profile.observatory.keywordsInMood', { mood: t(mood.labelKey) })}
            </p>
            <div className="mt-2">{cloud(themes?.byLetter[selected], mood.color, t('profile.observatory.keywordsEmptyMood'))}</div>
          </div>

          {/* a prateleira dela no Acervo (a página única da Mesa dos Oráculos) */}
          <Link to={`/oracle/acervo?mood=${mood.key}`} onClick={onLeave} className={`mt-3 inline-flex items-center justify-start gap-1.5 text-sm font-medium rounded ${FOCUS_RING}`} style={{ color: mood.color }}>
            {t('profile.observatory.openShelf')}
            <ArrowUpRight className="w-4 h-4" aria-hidden />
          </Link>
        </div>
      )}
    </section>
  );
};

export default ShelfPots;
