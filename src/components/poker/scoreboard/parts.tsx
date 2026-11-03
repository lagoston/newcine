import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Loader2 } from 'lucide-react';
import { FOCUS_RING, MIST, PAPER, PIXEL, oracleCardImage } from '../../../lib/oracleTheme';
import { POKER_ORACLES, SEAT_ORDER, TITLE_STEPS, titleProgress, type PokerOracleId } from '../jackpot/pokerMeta';
import type { BestHand, MarkView, PlayerNumber, RecentMatch, Stats } from './model';

// Peças do placar. Os gráficos seguem o método do skill de dataviz:
// marcas finas, 2 px de vão entre blocos, legenda sempre que há duas
// séries, texto nunca na cor do dado, e todo valor também escrito (o balão
// de hover/foco só reforça, nunca é o único caminho).

export const fmt = (value: number, lang: string, digits = 0) =>
  value.toLocaleString(lang, { minimumFractionDigits: digits, maximumFractionDigits: digits });

// ---------------------------------------------------------------------------
// A carreira: o título atual e a película com os 6 títulos
// ---------------------------------------------------------------------------

export const TitleReel: React.FC<{ wins: number; titleId: string | null }> = ({ wins, titleId }) => {
  const { t } = useTranslation();
  const progress = titleProgress(wins, titleId);
  const aria = progress.next
    ? t('pokerEntry.score.reelAria', { title: t(`pokerEntry.titles.${progress.current.id}`), n: progress.index + 1, count: progress.toNext, next: t(`pokerEntry.titles.${progress.next.id}`) })
    : t('pokerEntry.score.reelTopAria', { title: t(`pokerEntry.titles.${progress.current.id}`) });
  return (
    <div>
      <div className="pe-reel" role="img" aria-label={aria}>
        {TITLE_STEPS.map((step, i) => {
          const done = i <= progress.index;
          const isNext = i === progress.index + 1;
          return (
            <span key={step.id} className={`pe-frame ${done ? 'is-done' : ''} ${i === progress.index ? 'is-current' : ''}`}>
              {isNext && progress.share > 0 && <span className="pe-frame-fill" style={{ width: `${Math.round(progress.share * 100)}%` }} />}
            </span>
          );
        })}
      </div>
      <div className="mt-1.5 flex items-baseline justify-between gap-3 text-[12px]" style={{ color: MIST }} aria-hidden>
        <span>{t(`pokerEntry.titles.${TITLE_STEPS[0].id}`)}</span>
        <span>{t(`pokerEntry.titles.${TITLE_STEPS[TITLE_STEPS.length - 1].id}`)}</span>
      </div>
      <p className="mt-2.5 text-[13.5px] leading-snug" style={{ color: PAPER }}>
        {progress.next
          ? t('pokerEntry.score.toNext', { count: progress.toNext, title: t(`pokerEntry.titles.${progress.next.id}`) })
          : t('pokerEntry.score.topTitle')}
      </p>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Colocações: barra segmentada alta (1º a 4º), rampa ordinal de ouro
// ---------------------------------------------------------------------------

const PLACE_FILL = ['var(--pe-p1)', 'var(--pe-p2)', 'var(--pe-p3)', 'var(--pe-p4)'];
// Rótulo dentro do bloco: tinta escura nos 3 claros, branco no último (APCA).
const PLACE_INK = ['#1A1206', '#1A1206', '#1A1206', '#FFFFFF'];

export const PlacementBar: React.FC<{ counts: [number, number, number, number] }> = ({ counts }) => {
  const { t, i18n } = useTranslation();
  const [hover, setHover] = useState<number | null>(null);
  const total = counts.reduce((a, b) => a + b, 0);
  if (!total) return null;
  const parts = counts.map((count, i) => ({ i, count, share: count / total })).filter((p) => p.count > 0);
  return (
    <figure>
      <div className="relative">
        <div className="pe-segbar" role="group" aria-label={t('pokerEntry.score.placesAria')}>
          {parts.map((part) => {
            const pct = Math.round(part.share * 100);
            const label = t('pokerEntry.score.placeTip', { place: part.i + 1, count: part.count, pct });
            return (
              <button
                key={part.i}
                type="button"
                aria-label={label}
                onPointerEnter={() => setHover(part.i)}
                onPointerLeave={() => setHover(null)}
                onFocus={() => setHover(part.i)}
                onBlur={() => setHover(null)}
                className={FOCUS_RING}
                style={{ flex: `${part.count} 1 0%`, background: PLACE_FILL[part.i], color: PLACE_INK[part.i] }}
              >
                {/* A parte só imprime a % se couber (≥ 12% da barra). */}
                {part.share >= 0.12 ? <span aria-hidden>{pct}%</span> : null}
              </button>
            );
          })}
        </div>
        {hover !== null && (
          <span
            className="pe-tip"
            style={{
              left: `${Math.min(88, Math.max(12, (parts.filter((p) => p.i < hover).reduce((a, p) => a + p.share, 0) + (counts[hover] / total) / 2) * 100))}%`,
            }}
          >
            <strong className="text-[13px]">{fmt(counts[hover], i18n.language)}</strong> {t('pokerEntry.score.placeShort', { place: hover + 1 })}
          </span>
        )}
      </div>
      <figcaption className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5 text-[12.5px]" style={{ color: MIST }}>
        {counts.map((count, i) => (
          <span key={i} className="inline-flex items-center gap-1.5">
            <span className="pe-swatch" style={{ background: PLACE_FILL[i] }} aria-hidden />
            <span style={{ color: PAPER }}>{t('pokerEntry.score.placeShort', { place: i + 1 })}</span>
            <span className="tabular-nums">{fmt(count, i18n.language)}</span>
          </span>
        ))}
      </figcaption>
    </figure>
  );
};

// ---------------------------------------------------------------------------
// Livre × Valendo (só no Geral): o aproveitamento de cada modo
// ---------------------------------------------------------------------------

export const ModeSplit: React.FC<{ free: Stats; bounty: Stats }> = ({ free, bounty }) => {
  const { t, i18n } = useTranslation();
  const rows = [
    { key: 'free', label: t('pokerEntry.score.modeFree'), s: free },
    { key: 'bounty', label: t('pokerEntry.score.modeBounty'), s: bounty },
  ];
  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const rate = row.s.matches ? row.s.wins / row.s.matches : 0;
        return (
          <div key={row.key}>
            <div className="flex items-baseline justify-between gap-3 text-[13px]">
              <span style={{ color: PAPER }}>{row.label}</span>
              <span className="tabular-nums" style={{ color: MIST }}>
                {t('pokerEntry.score.modeLine', { wins: fmt(row.s.wins, i18n.language), matches: fmt(row.s.matches, i18n.language), pct: Math.round(rate * 100) })}
              </span>
            </div>
            <div className="mt-1.5 h-2 rounded-full" style={{ background: 'rgba(255,255,255,0.07)' }} aria-hidden>
              <div className="h-full rounded-full" style={{ width: `${Math.max(rate > 0 ? 2 : 0, rate * 100)}%`, background: 'var(--pe-p2)' }} />
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Você × cada oráculo: barras de costas uma para a outra
// ---------------------------------------------------------------------------

const FEMININE = new Set<PokerOracleId>(['cypher']);

export const RivalRows: React.FC<{ vs: Stats['vs']; cardStyle: string }> = ({ vs, cardStyle }) => {
  const { t } = useTranslation();
  const rows = SEAT_ORDER.map((id) => ({ id, elim: vs[id]?.elim ?? 0, elimBy: vs[id]?.elimBy ?? 0 }));
  const max = Math.max(1, ...rows.map((r) => Math.max(r.elim, r.elimBy)));
  // Nêmesis = quem mais te elimina (≥ 3); Freguês = quem você mais elimina (≥ 3).
  const nemesis = rows.reduce((best, r) => (r.elimBy >= 3 && r.elimBy > (best?.elimBy ?? 0) ? r : best), null as (typeof rows)[number] | null);
  const customer = rows.reduce((best, r) => (r.elim >= 3 && r.elim > (best?.elim ?? 0) ? r : best), null as (typeof rows)[number] | null);
  return (
    <div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]" style={{ color: MIST }}>
        <span className="inline-flex items-center gap-1.5">
          <span className="pe-swatch" style={{ background: 'var(--pe-you)' }} aria-hidden />
          {t('pokerEntry.score.youElim')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="pe-swatch" style={{ background: 'var(--pe-them)' }} aria-hidden />
          {t('pokerEntry.score.theyElim')}
        </span>
      </div>
      <ul className="mt-3 space-y-2.5">
        {rows.map((row) => {
          const oracle = POKER_ORACLES[row.id];
          const g = FEMININE.has(row.id) ? 'f' : 'm';
          return (
            <li key={row.id} className="pe-panel flex items-center gap-3 p-2.5 pr-3.5">
              <img
                src={oracleCardImage(row.id, cardStyle)}
                alt=""
                loading="lazy"
                className="w-[52px] h-[65px] shrink-0 rounded-lg object-cover"
                style={{ objectPosition: cardStyle === 'yugioh' ? '50% 28%' : '50% 62%', boxShadow: `0 0 0 1.5px ${oracle.color}` }}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-[16px] leading-none" style={{ ...PIXEL, color: oracle.color }}>
                    {t(`pokerEntry.oracles.${row.id}.short`)}
                  </span>
                  {nemesis?.id === row.id && (
                    <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: 'rgba(116,128,230,0.2)', color: '#C9CEFF' }}>
                      {t('pokerEntry.score.nemesis')}
                    </span>
                  )}
                  {customer?.id === row.id && (
                    <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: 'rgba(184,137,46,0.22)', color: '#FFE8A3' }}>
                      {t('pokerEntry.score.customer')}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[12.5px] leading-snug" style={{ color: MIST }}>
                  {t(`pokerEntry.score.elimLine_${g}`, { a: row.elim, b: row.elimBy })}
                </p>
                {/* Costas com costas: à esquerda quem te eliminou, à direita quem você eliminou. */}
                <div className="mt-2 grid grid-cols-2 gap-[2px]" aria-hidden>
                  <span className="flex justify-end h-2 rounded-l-full" style={{ background: 'rgba(255,255,255,0.05)' }}>
                    <span className="h-full rounded-l-[4px]" style={{ width: `${(row.elimBy / max) * 100}%`, background: 'var(--pe-them)' }} />
                  </span>
                  <span className="flex h-2 rounded-r-full" style={{ background: 'rgba(255,255,255,0.05)' }}>
                    <span className="h-full rounded-r-[4px]" style={{ width: `${(row.elim / max) * 100}%`, background: 'var(--pe-you)' }} />
                  </span>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

// ---------------------------------------------------------------------------
// A melhor mão, desenhada
// ---------------------------------------------------------------------------

const SUIT_GLYPH: Record<string, string> = { s: '♠', h: '♥', d: '♦', c: '♣' };
const SUIT_NAME_KEY: Record<string, string> = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' };
const RANK_LABEL: Record<string, string> = { T: '10', J: 'J', Q: 'Q', K: 'K', A: 'A' };

export const HandCards: React.FC<{ hand: BestHand }> = ({ hand }) => {
  const { t } = useTranslation();
  const spoken = hand.cards
    .map((card) => t('pokerEntry.score.cardSpoken', { rank: t(`pokerEntry.ranks.${card[0]}`), suit: t(`pokerEntry.suits.${SUIT_NAME_KEY[card[1]]}`) }))
    .join(', ');
  return (
    <div role="img" aria-label={spoken} className="flex gap-1.5 sm:gap-2">
      {hand.cards.map((card) => {
        const red = card[1] === 'h' || card[1] === 'd';
        return (
          <span key={card} className={`pe-card ${red ? 'is-red' : 'is-black'}`} aria-hidden>
            <span className="text-[15px] sm:text-[17px]">
              {RANK_LABEL[card[0]] ?? card[0]}
              <span className="block text-[13px] sm:text-[15px]">{SUIT_GLYPH[card[1]]}</span>
            </span>
            <span className="self-end justify-self-end text-[20px] sm:text-[24px] leading-none">{SUIT_GLYPH[card[1]]}</span>
          </span>
        );
      })}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Sorte nos all-ins: o que você ganhou × o que a matemática esperava
// ---------------------------------------------------------------------------

export const LuckBullet: React.FC<{ won: number; total: number; expected: number }> = ({ won, total, expected }) => {
  const { t, i18n } = useTranslation();
  if (!total) return null;
  const at = (v: number) => `${Math.max(0, Math.min(100, (v / total) * 100))}%`;
  return (
    <figure aria-hidden>
      <div className="relative h-[34px]">
        <div className="absolute inset-x-0 top-[14px] h-2 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }} />
        <div className="absolute left-0 top-[14px] h-2 rounded-l-full rounded-r-[4px]" style={{ width: at(won), background: 'var(--pe-p2)' }} />
        {/* O esperado: um traço vertical na cor do texto. */}
        <div className="absolute top-[8px] h-5 w-[2px] rounded-full" style={{ left: at(expected), background: PAPER, transform: 'translateX(-1px)' }} />
      </div>
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]" style={{ color: MIST }}>
        <span className="inline-flex items-center gap-1.5">
          <span className="pe-swatch" style={{ background: 'var(--pe-p2)' }} />
          {t('pokerEntry.score.luckWon', { count: won })}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-[2px] h-3 rounded-full" style={{ background: PAPER }} />
          {t('pokerEntry.score.luckExpected', { value: fmt(expected, i18n.language, 1) })}
        </span>
      </figcaption>
    </figure>
  );
};

// ---------------------------------------------------------------------------
// Números de jogador: valor, explicação e a faixa normal numa mesa de 4
// ---------------------------------------------------------------------------

export const NumberRow: React.FC<{ item: PlayerNumber }> = ({ item }) => {
  const { t, i18n } = useTranslation();
  const span = item.max - item.min;
  const pos = (v: number) => `${Math.max(0, Math.min(100, ((v - item.min) / span) * 100))}%`;
  const show = (v: number) =>
    item.unit === '%' ? `${fmt(v, i18n.language)}%` : item.unit === 'x' ? fmt(v, i18n.language, 1) : `${fmt(v, i18n.language, 1)}º`;
  return (
    <li className="py-3 border-t first:border-t-0" style={{ borderColor: 'var(--pe-hair)' }}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[14px] font-semibold" style={{ color: PAPER }}>
          {t(`pokerEntry.score.numbers.${item.key}.label`)}
        </span>
        <span className="text-[15px] font-bold tabular-nums" style={{ color: item.value === null ? MIST : PAPER }}>
          {item.value === null ? '—' : show(item.value)}
        </span>
      </div>
      <p className="mt-0.5 text-[12.5px] leading-snug" style={{ color: MIST }}>
        {t(`pokerEntry.score.numbers.${item.key}.help`)}
      </p>
      <div className="mt-2.5 pe-range" aria-hidden>
        <span className="pe-range-band" style={{ left: pos(item.band[0]), width: `calc(${pos(item.band[1])} - ${pos(item.band[0])})` }} />
        {item.value !== null && <span className="pe-range-dot" style={{ left: pos(item.value) }} />}
      </div>
      <p className="mt-1.5 text-[11.5px]" style={{ color: MIST }}>
        {item.value === null
          ? t('pokerEntry.score.numbers.fewHands')
          : t('pokerEntry.score.numbers.normal', { from: show(item.band[0]), to: show(item.band[1]) })}
      </p>
    </li>
  );
};

// ---------------------------------------------------------------------------
// Marcos: os 5, conquistados em cor; os outros em silhueta com a regra
// ---------------------------------------------------------------------------

export const MarkRow: React.FC<{ mark: MarkView; equipped: boolean; busy: boolean; onEquip: () => void }> = ({ mark, equipped, busy, onEquip }) => {
  const { t, i18n } = useTranslation();
  const earned = !!mark.unlockedAt;
  return (
    <li className="pe-panel flex items-center gap-3 p-3" style={earned ? { boxShadow: 'inset 0 0 0 1px rgba(244,196,84,0.45)' } : undefined}>
      <span
        className="grid place-items-center w-12 h-12 shrink-0 rounded-full text-[24px]"
        style={
          earned
            ? { background: 'radial-gradient(circle at 35% 30%, #2a3590, #0f1645)', boxShadow: '0 0 0 1.5px #F4C454, 0 0 14px -4px rgba(244,196,84,0.8)' }
            : { background: 'rgba(255,255,255,0.04)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.12)', filter: 'grayscale(1)', opacity: 0.45 }
        }
        aria-hidden
      >
        {mark.emoji}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14.5px] font-semibold leading-tight" style={{ color: earned ? PAPER : MIST }}>
          {t(`pokerEntry.marks.${mark.key}.name`)}
        </p>
        <p className="mt-0.5 text-[12.5px] leading-snug" style={{ color: MIST }}>
          {earned
            ? t('pokerEntry.score.markEarned', { tag: mark.name, date: new Date(mark.unlockedAt as string).toLocaleDateString(i18n.language, { day: '2-digit', month: '2-digit' }) })
            : mark.requirement || t(`pokerEntry.marks.${mark.key}.rule`)}
        </p>
      </div>
      {earned && (
        <button
          type="button"
          onClick={onEquip}
          disabled={busy || equipped}
          className={`shrink-0 inline-flex items-center gap-1 h-9 px-3 rounded-full text-[12.5px] font-semibold transition disabled:cursor-default ${FOCUS_RING}`}
          style={equipped ? { color: '#A7F3D0', boxShadow: 'inset 0 0 0 1px rgba(167,243,208,0.4)' } : { background: '#F3EAD3', color: '#221B36' }}
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : equipped ? <Check className="w-3.5 h-3.5" aria-hidden /> : null}
          {equipped ? t('pokerEntry.score.inUse') : t('pokerEntry.score.equip')}
        </button>
      )}
    </li>
  );
};

// ---------------------------------------------------------------------------
// Últimas partidas: V/D escrito, colocação, modo e empréstimo
// ---------------------------------------------------------------------------

export const RecentRow: React.FC<{ match: RecentMatch }> = ({ match }) => {
  const { t, i18n } = useTranslation();
  const isPt = i18n.language.startsWith('pt');
  const win = match.place === 1;
  const date = match.at ? new Date(match.at).toLocaleDateString(i18n.language, { day: '2-digit', month: '2-digit' }) : '';
  const detail = [
    match.mode === 'bounty' ? t('pokerEntry.score.modeBountyShort') : t('pokerEntry.score.modeFreeShort'),
    match.loan ? t('pokerEntry.score.withLoan') : null,
    match.status === 'forfeit' ? t('pokerEntry.score.forfeit') : match.status === 'abandoned' ? t('pokerEntry.score.abandoned') : null,
  ].filter(Boolean);
  return (
    <li className="flex items-center gap-3 py-2.5 border-t first:border-t-0" style={{ borderColor: 'var(--pe-hair)' }}>
      <span
        className="grid place-items-center w-9 h-9 shrink-0 rounded-lg text-[15px] font-extrabold"
        style={win ? { background: '#F4C454', color: '#2A1A00' } : { color: PAPER, boxShadow: 'inset 0 0 0 1.5px rgba(243,234,211,0.35)' }}
      >
        <span aria-hidden>{match.status === 'active' ? '…' : win ? t('pokerEntry.score.win') : t('pokerEntry.score.loss')}</span>
        {match.status !== 'active' && <span className="sr-only">{win ? t('pokerEntry.score.winLong') : t('pokerEntry.score.lossLong')}</span>}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold leading-tight" style={{ color: PAPER }}>
          {match.status === 'active' ? t('pokerEntry.score.inProgress') : match.place ? t('pokerEntry.score.placeLong', { place: match.place }) : '—'}
          {match.captured && match.prize ? (
            <span className="font-normal" style={{ color: '#FFE8A3' }}>
              {' '}
              · {t('pokerEntry.score.tookPrize', { prize: isPt ? match.prize.namePt : match.prize.nameEn })}
            </span>
          ) : null}
        </p>
        <p className="mt-0.5 text-[12.5px] truncate" style={{ color: MIST }}>
          {detail.join(' · ')}
        </p>
      </div>
      <span className="shrink-0 text-right text-[12px] leading-tight tabular-nums" style={{ color: MIST }}>
        {date}
        {match.hands > 0 && <span className="block">{t('pokerEntry.score.hands', { count: match.hands })}</span>}
      </span>
    </li>
  );
};
