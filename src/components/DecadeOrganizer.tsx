import React, { useEffect, useRef, useState } from 'react';
import { Check, Film, GripVertical, Loader2, RotateCcw, Star, Tv } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import OracleSheet from './OracleSheet';
import OptimizedPoster from './OptimizedPoster';
import { Movie } from '../lib/tmdb';
import { titleKey } from '../lib/titleCards';
import { RANK_MEDALS, RatedTitle, decadeBadge, decadeColor } from '../lib/libraryLayouts';
import { findScrollParent, useTitleCards } from '../hooks/useLazyList';
import { VELVET, PAPER, MIST, PIXEL, FOCUS_RING, ratingTone, withAlpha } from '../lib/oracleTheme';

// Organizar uma década de "Melhores da Década" (11/10/2026). Os títulos da
// década, um embaixo do outro, com a posição. A pessoa:
//   • arrasta pela alça (a gaveta rola sozinha perto da borda);
//   • toca no número e digita a posição nova;
//   • usa as setas do teclado na alça (e Home/End).
// "Salvar ordem" grava a década inteira (library_decade_order); "Voltar à
// ordem das notas" apaga a ordem dela. Herdou o modo Organizar do Top 100.

const ROW_GAP = 8;

interface DecadeOrganizerProps {
  decade: number | null;
  // a década na ordem de agora
  entries: RatedTitle[];
  // a década já tem uma ordem salva
  customized: boolean;
  onSave: (keys: string[]) => Promise<void>;
  onClose: () => void;
}

const DecadeOrganizer: React.FC<DecadeOrganizerProps> = ({ decade, entries, customized, onSave, onClose }) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<RatedTitle[]>(entries);
  const [saving, setSaving] = useState<'save' | 'reset' | null>(null);
  const [editingPosition, setEditingPosition] = useState<number | null>(null);
  const [positionText, setPositionText] = useState('');
  const cardOf = useTitleCards(draft, draft.length, { ahead: 0 });
  const accent = decadeColor(decade);
  const title = decade === null ? t('library.decadeUnknown') : t('library.decadeTitle', { decade });
  const changed = draft.some((item, index) => titleKey(item) !== titleKey(entries[index]));

  const cardFor = (item: RatedTitle): Movie | undefined => {
    const card = item.movie ?? cardOf(item);
    return card && !card.title ? { ...card, title: t('library.unavailableTitle') } : card;
  };

  const move = (from: number, to: number) => {
    setDraft((prev) => {
      const target = Math.max(0, Math.min(prev.length - 1, to));
      if (from === target || from < 0 || from >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(target, 0, item);
      return next;
    });
  };

  // ---------------------------------------------------------------------
  // Arrastar pela alça: a linha segue o dedo/mouse e troca de lugar com as
  // vizinhas. A conta usa a rolagem da gaveta (não a da página).
  // ---------------------------------------------------------------------
  const listRef = useRef<HTMLOListElement | null>(null);
  const firstRowRef = useRef<HTMLLIElement | null>(null);
  const dragRef = useRef<{ index: number; startY: number; lastClientY: number; rowH: number } | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const autoScrollRef = useRef<number | null>(null);
  const lengthRef = useRef(draft.length);
  lengthRef.current = draft.length;

  const scroller = () => findScrollParent(listRef.current, 'y') as HTMLElement | null;
  const scrollTopNow = () => scroller()?.scrollTop ?? window.scrollY;

  const applyDrag = (clientY: number) => {
    const drag = dragRef.current;
    if (!drag) return;
    drag.lastClientY = clientY;
    const y = clientY + scrollTopNow();
    const steps = Math.trunc((y - drag.startY) / drag.rowH);
    if (steps !== 0) {
      const from = drag.index;
      const target = Math.max(0, Math.min(lengthRef.current - 1, from + steps));
      if (target !== from) {
        move(from, target);
        drag.startY += (target - from) * drag.rowH;
        drag.index = target;
        setDragIndex(target);
      }
    }
    setDragOffset(y - drag.startY);
  };

  const stopAutoScroll = () => {
    if (autoScrollRef.current !== null) cancelAnimationFrame(autoScrollRef.current);
    autoScrollRef.current = null;
  };

  const autoScroll = () => {
    const drag = dragRef.current;
    if (!drag) return;
    const box = scroller();
    const rect = box ? box.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
    const edge = 72;
    const y = drag.lastClientY;
    const speed = y < rect.top + edge ? -Math.ceil((rect.top + edge - y) / 6) : y > rect.bottom - edge ? Math.ceil((y - (rect.bottom - edge)) / 6) : 0;
    if (speed !== 0) {
      if (box) box.scrollBy(0, speed);
      else window.scrollBy(0, speed);
      applyDrag(drag.lastClientY);
    }
    autoScrollRef.current = requestAnimationFrame(autoScroll);
  };

  const onHandlePointerDown = (index: number, e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const rowH = (firstRowRef.current?.getBoundingClientRect().height || 64) + ROW_GAP;
    dragRef.current = { index, startY: e.clientY + scrollTopNow(), lastClientY: e.clientY, rowH };
    setDragIndex(index);
    setDragOffset(0);
    stopAutoScroll();
    autoScrollRef.current = requestAnimationFrame(autoScroll);
  };
  const onHandlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragRef.current) return;
    applyDrag(e.clientY);
  };
  const endDrag = () => {
    dragRef.current = null;
    stopAutoScroll();
    setDragIndex(null);
    setDragOffset(0);
  };
  useEffect(() => stopAutoScroll, []);

  const onHandleKeyDown = (index: number, e: React.KeyboardEvent<HTMLButtonElement>) => {
    const keys: Record<string, number> = { ArrowUp: index - 1, ArrowDown: index + 1, Home: 0, End: draft.length - 1 };
    if (!(e.key in keys)) return;
    e.preventDefault();
    move(index, keys[e.key]);
    // a alça acompanha o título
    requestAnimationFrame(() => {
      const target = Math.max(0, Math.min(draft.length - 1, keys[e.key]));
      document.getElementById(`decade-handle-${target}`)?.focus();
    });
  };

  const commitPosition = (index: number) => {
    const value = parseInt(positionText, 10);
    if (Number.isFinite(value)) move(index, value - 1);
    setEditingPosition(null);
  };

  const save = async (mode: 'save' | 'reset') => {
    setSaving(mode);
    try {
      await onSave(mode === 'reset' ? [] : draft.map(titleKey));
      toast.success(mode === 'reset' ? t('library.bestResetDone', { decade: title }) : t('library.bestSaved', { decade: title }));
      onClose();
    } catch (error) {
      console.error('Error saving decade order:', error);
      toast.error(t('common.error'));
      setSaving(null);
    }
  };

  const footer = (
    <div className="flex gap-2">
      <button
        onClick={onClose}
        disabled={saving !== null}
        className={`flex-1 h-12 rounded-xl border border-white/15 hover:bg-white/5 text-sm font-semibold transition disabled:opacity-60 ${FOCUS_RING}`}
        style={{ color: PAPER }}
      >
        {t('common.cancel')}
      </button>
      <button
        onClick={() => save('save')}
        disabled={saving !== null || !changed}
        className={`flex-1 inline-flex items-center justify-center gap-2 h-12 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:brightness-110 text-white text-sm font-semibold transition disabled:opacity-60 ${FOCUS_RING}`}
      >
        {saving === 'save' ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Check className="w-4 h-4" aria-hidden />}
        {t('library.bestSave')}
      </button>
    </div>
  );

  return (
    <OracleSheet
      open={true}
      onClose={onClose}
      escapeEnabled={editingPosition === null}
      title={title}
      subtitle={t('library.bestOrganizeSubtitle', { count: entries.length })}
      leading={
        <span
          className="grid place-items-center w-11 h-11 shrink-0 rounded-xl text-lg leading-none"
          style={{ ...PIXEL, background: VELVET, color: accent || PAPER, boxShadow: `inset 0 0 0 1.5px ${accent ? withAlpha(accent, 0.55) : 'rgba(196,181,253,0.3)'}` }}
          aria-hidden
        >
          {decadeBadge(decade)}
        </span>
      }
      footer={footer}
      size="lg"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <p className="text-sm leading-snug max-w-md" style={{ color: MIST }}>
          {t('library.bestOrganizeHint')}
        </p>
        {customized && (
          <button
            onClick={() => save('reset')}
            disabled={saving !== null}
            className={`-mr-2 inline-flex items-center gap-1.5 min-h-[36px] px-2 rounded-lg text-sm font-semibold hover:bg-white/10 transition disabled:opacity-60 ${FOCUS_RING}`}
            style={{ color: '#C4B5FD' }}
          >
            {saving === 'reset' ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <RotateCcw className="w-4 h-4" aria-hidden />}
            {t('library.bestResetOrder')}
          </button>
        )}
      </div>

      <ol ref={listRef} className="mt-5 space-y-2" aria-label={title}>
        {draft.map((item, index) => {
          const card = cardFor(item);
          const position = index + 1;
          const medal = position <= 3 ? RANK_MEDALS[position - 1] : null;
          const tone = ratingTone(item.userRating);
          const year = item.year || (card?.release_date || card?.first_air_date || '').slice(0, 4);
          const isDragging = dragIndex === index;
          const name = card?.title || '';

          return (
            <li
              key={titleKey(item)}
              ref={index === 0 ? firstRowRef : undefined}
              className={`relative flex items-center gap-2 sm:gap-3 rounded-2xl pl-1 pr-3 py-2 ring-1 select-none ${isDragging ? 'z-10 ring-violet-400/70 shadow-2xl' : 'ring-white/10'}`}
              style={{
                background: isDragging ? '#2A1F4A' : medal ? `linear-gradient(90deg, ${withAlpha(medal, 0.1)}, transparent 70%), ${VELVET}` : VELVET,
                transform: isDragging ? `translateY(${dragOffset}px) scale(1.02)` : undefined,
                transition: isDragging ? 'none' : 'transform 0.18s ease',
              }}
            >
              <button
                id={`decade-handle-${index}`}
                onPointerDown={(e) => onHandlePointerDown(index, e)}
                onPointerMove={onHandlePointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onKeyDown={(e) => onHandleKeyDown(index, e)}
                aria-label={t('library.bestDrag', { title: name, position })}
                className={`grid place-items-center w-9 h-11 shrink-0 rounded-lg cursor-grab active:cursor-grabbing hover:bg-white/5 ${FOCUS_RING}`}
                style={{ touchAction: 'none', color: MIST }}
              >
                <GripVertical className="w-5 h-5" aria-hidden />
              </button>

              {editingPosition === index ? (
                <input
                  autoFocus
                  inputMode="numeric"
                  aria-label={t('library.bestMoveTo', { title: name })}
                  value={positionText}
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => setPositionText(e.target.value.replace(/\D/g, '').slice(0, 3))}
                  onBlur={() => commitPosition(index)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitPosition(index);
                    if (e.key === 'Escape') setEditingPosition(null);
                  }}
                  className="w-11 sm:w-12 h-10 shrink-0 rounded-lg bg-black/40 ring-1 ring-violet-400/60 text-center text-xl outline-none"
                  style={{ ...PIXEL, color: PAPER }}
                />
              ) : (
                <button
                  onClick={() => {
                    setEditingPosition(index);
                    setPositionText(String(position));
                  }}
                  aria-label={t('library.bestMoveTo', { title: name })}
                  className={`w-11 sm:w-12 h-10 shrink-0 rounded-lg text-right pr-1 text-xl sm:text-2xl leading-none tabular-nums hover:bg-white/5 ${FOCUS_RING}`}
                  style={{ ...PIXEL, color: medal || PAPER }}
                >
                  {position}
                </button>
              )}

              <span className="relative block w-10 sm:w-11 aspect-[2/3] shrink-0 rounded-lg overflow-hidden ring-1 ring-white/10" style={{ background: VELVET }}>
                {card?.poster_path ? (
                  <OptimizedPoster src={`https://image.tmdb.org/t/p/w154${card.poster_path}`} alt="" className="absolute inset-0 w-full h-full object-cover" />
                ) : card ? (
                  <Film className="absolute inset-0 m-auto w-4 h-4" style={{ color: MIST }} aria-hidden />
                ) : (
                  <span className="absolute inset-0 poster-skeleton" />
                )}
              </span>

              <span className="min-w-0 flex-1">
                {card ? (
                  <span className="block text-sm sm:text-[15px] font-medium leading-snug line-clamp-2" style={{ color: PAPER }}>
                    {card.title}
                  </span>
                ) : (
                  <span className="block h-4 w-3/5 rounded poster-skeleton" />
                )}
                <span className="mt-1 flex items-center gap-2 text-xs" style={{ color: MIST }}>
                  {item.media_type === 'tv' && <Tv className="w-3 h-3 shrink-0 text-sky-300" aria-label={t('mobileSearch.series')} />}
                  {year && <span>{year}</span>}
                </span>
              </span>

              <span
                className="shrink-0 inline-flex items-center gap-1 pl-1.5 pr-2 py-0.5 rounded-md text-sm ring-1"
                style={{ ...PIXEL, background: 'rgba(18,13,34,0.86)', color: tone.color, '--tw-ring-color': tone.ring } as React.CSSProperties}
                title={t('home.desk.yourRating')}
              >
                <Star className="w-3 h-3 fill-current" aria-hidden />
                <span className="sr-only">{t('home.desk.yourRating')}:</span>
                {item.userRating}
              </span>
            </li>
          );
        })}
      </ol>
    </OracleSheet>
  );
};

export default DecadeOrganizer;
