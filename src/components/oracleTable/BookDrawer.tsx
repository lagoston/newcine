import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import OracleSheet from '../OracleSheet';
import { MIST, PAPER, PIXEL, FOCUS_RING, ORACLE_BY_ID, ratingTone } from '../../lib/oracleTheme';
import { mesaBook } from '../../lib/mesa/api';
import { brtDay, daysBetween, weekdayOf } from '../../lib/mesa/day';
import type { BookEntry, BookPage, OracleSlot } from '../../lib/mesa/types';
import { getMesaDirector } from './director';
import SignedBalloon from './SignedBalloon';
import { useDialogFocus, useMesaLayerEntry } from './MesaLayer';
import { askName, cardTitle, posterSrc } from './mesaText';

// O Livro (SPEC §2.12, decisão do Bruno de 05/11 00h41), 05/11/2026: uma gaveta
// pequena e secundária. Não tem placar e NÃO mostra nota prevista. O valor dele
// é a memória do que a Mesa deu (a carta, o oráculo, a pergunta, a fala selada)
// e, quando a pessoa avaliou, a reação do oráculo, escrita à mão e sempre a
// mesma para aquela carta (verdictLineFor é determinístico por card_id).

interface BookDrawerProps {
  open: boolean;
  onClose: () => void;
  reduced: boolean;
  onOpenTitle: (ref: { id: number; media_type: 'movie' | 'tv' }) => void;
  modalOpen: boolean;
}

const BookDrawer: React.FC<BookDrawerProps> = ({ open, onClose, reduced, onOpenTitle, modalOpen }) => {
  const { t, i18n } = useTranslation();
  const lang: 'pt' | 'en' = i18n.language.startsWith('pt') ? 'pt' : 'en';
  useMesaLayerEntry(open, onClose, { ownEscape: true, modal: true });
  useDialogFocus(open);
  const [pages, setPages] = useState<BookPage[]>([]);
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');

  const load = useCallback(async (before: string | null) => {
    setState('loading');
    try {
      const page = await mesaBook(before);
      setPages((prev) => (before ? [...prev, page] : [page]));
      setState('idle');
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => {
    if (open) void load(null);
  }, [open, load]);

  const today = brtDay();
  const dayLabel = (day: string) => {
    const diff = daysBetween(day, today);
    if (diff <= 0) return t('mesa.book.today');
    if (diff === 1) return t('mesa.book.yesterday');
    return new Intl.DateTimeFormat(lang === 'pt' ? 'pt-BR' : 'en-US', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`));
  };
  const who: OracleSlot | null = pages[0]?.who_knows_best ?? null;
  const days = pages.flatMap((p) => p.days);
  const next = pages[pages.length - 1]?.next_before ?? null;
  const director = getMesaDirector();

  const entryState = (e: BookEntry) => {
    if (e.state === 'seen' && e.rating !== null) return t('mesa.book.state.seen', { n: e.rating });
    if (e.state === 'want') return t('mesa.book.state.want');
    if (e.state === 'refused') return t('mesa.book.state.refused');
    if (e.state === 'not_seen') return t('mesa.book.state.not_seen');
    return t('mesa.book.state.up');
  };

  return (
    <OracleSheet open={open} onClose={onClose} title={t('mesa.book.title')} subtitle={t('mesa.book.subtitle')} size="md" escapeEnabled={!modalOpen}>
      {who && (
        <p className="-mt-1 mb-4 text-[12px]" style={{ color: MIST }}>
          {t(`mesa.book.knowsBest.${who}`)}
        </p>
      )}
      {state === 'loading' && !days.length && (
        <div className="space-y-4" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex gap-3">
              <span className="w-10 h-[60px] rounded ms-skel shrink-0" />
              <span className="flex-1 space-y-2 pt-1">
                <span className="block h-3 w-1/2 rounded ms-skel" />
                <span className="block h-3 w-4/5 rounded ms-skel" />
              </span>
            </div>
          ))}
        </div>
      )}
      {state === 'error' && !days.length && (
        <div className="py-4">
          <p className="text-[14px]" style={{ color: PAPER }}>
            {t('mesa.book.error')}
          </p>
          <button type="button" onClick={() => load(null)} className={`mt-3 h-11 px-4 rounded-lg ${FOCUS_RING}`} style={{ color: PAPER, boxShadow: 'inset 0 0 0 1px rgba(243,234,211,0.28)' }}>
            {t('mesa.error.retry')}
          </button>
        </div>
      )}
      {state !== 'loading' && state !== 'error' && !days.length && (
        <p className="py-6 text-[14px]" style={{ color: MIST }}>
          {t('mesa.book.empty')}
        </p>
      )}
      <div className="space-y-6">
        {days.flatMap((d) => {
          // Uma seção por dia e por pergunta ("Hoje · a tiragem do dia",
          // "Ontem · Pergunta: Só eu e a chuva").
          const groups = new Map<string, BookEntry[]>();
          d.entries.forEach((e) => groups.set(e.ask ?? '', [...(groups.get(e.ask ?? '') ?? []), e]));
          return [...groups.entries()].map(([askKey, entries]) => (
            <section key={`${d.day}|${askKey}`}>
              <h3 className="text-[13px] mb-3 first-letter:uppercase" style={{ ...PIXEL, color: PAPER }}>
                {dayLabel(d.day)}
                <span style={{ color: MIST }}> · {askKey ? t('mesa.book.asked', { name: askName(t, askKey) }) : t('mesa.book.daily')}</span>
              </h3>
              <ul className="space-y-4">
                {entries.map((e) => {
                  const o = ORACLE_BY_ID[e.oracle];
                  const comment = (lang === 'pt' ? e.comment.pt || e.comment.en : e.comment.en || e.comment.pt) ?? '';
                  const title = cardTitle(e.title, lang);
                  const src = posterSrc(e.title, lang, 'w92');
                  const reaction =
                    e.state === 'seen' && e.rating !== null && e.verdict
                      ? director.verdictLineFor(e.card_id, e.oracle, e.verdict, lang, { rating: e.rating, title, weekday: weekdayOf(d.day) })
                      : null;
                  return (
                    <li key={e.card_id} className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => onOpenTitle({ id: e.title.tmdb_id, media_type: e.title.media_type })}
                        aria-label={title}
                        className={`relative shrink-0 w-10 h-[60px] rounded-[4px] overflow-hidden ${FOCUS_RING}`}
                        style={{ background: '#1C1433', boxShadow: '0 0 0 1px rgba(243,234,211,0.15)' }}
                      >
                        {src && <img src={src} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />}
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 text-[14px] leading-tight" style={{ color: PAPER }}>
                          <span className="truncate font-medium">{title}</span>
                          <img src={o.avatar} alt="" aria-hidden className="ml-1 w-5 h-5 rounded-full object-cover shrink-0" />
                          <span className="shrink-0 text-[12px]" style={{ ...PIXEL, color: o.color }}>
                            {o.name}
                          </span>
                        </p>
                        {comment && <SignedBalloon who={e.oracle} text={comment} variant="line" reduced={reduced} typed={false} className="mt-2" />}
                        <p className="mt-2 text-[12.5px]" style={{ color: e.rating !== null ? ratingTone(e.rating).color : MIST }}>
                          {entryState(e)}
                        </p>
                        {reaction && (
                          <p className="mt-1 text-[13px] leading-snug" style={{ color: PAPER }}>
                            <span style={{ ...PIXEL, color: o.color }}>{o.name}</span> «{reaction}»
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ));
        })}
      </div>
      {next && (
        <button
          type="button"
          onClick={() => load(next)}
          disabled={state === 'loading'}
          className={`mt-6 w-full h-11 rounded-[10px] text-[14px] ${FOCUS_RING} disabled:opacity-50`}
          style={{ color: PAPER, boxShadow: 'inset 0 0 0 1px rgba(243,234,211,0.24)' }}
        >
          {t('mesa.book.more')}
        </button>
      )}
    </OracleSheet>
  );
};

export default BookDrawer;
