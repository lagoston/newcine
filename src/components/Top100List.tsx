import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDownUp, Check, Film, GripVertical, Loader2, Plus, Star, Swords, Tv, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Movie } from '../lib/tmdb';
import { getFullTitle, prefetchFullTitle, titleKey } from '../lib/titleCards';
import { EMPTY_TOP100, RatedTitle, TOP_LIMIT, Top100Saved } from '../lib/libraryLayouts';
import Top100Duel from './Top100Duel';
import { useProgressiveCount, useReveal, useTitleCards } from '../hooks/useLazyList';
import MovieDetailsModal from './MovieDetailsModal';
import OptimizedPoster from './OptimizedPoster';
import { VELVET, PAPER, MIST, PIXEL, FOCUS_RING, ratingTone, withAlpha } from '../lib/oracleTheme';

// Top 100 da Biblioteca (10/10/2026): até 100 avaliados (filmes e séries),
// um embaixo do outro, com a posição. Na Biblioteca, "Duelo" ordena em
// confrontos de 1 contra 1 (Top100Duel) e "Organizar" deixa a pessoa:
//   • arrastar pela alça (ou usar as setas do teclado na alça);
//   • tocar no número e digitar a posição nova;
//   • tirar um filme (ele não volta sozinho) e pôr outros avaliados.
// A ordem fica salva (lib/libraryLayouts → library_top100) mesmo quando a
// pessoa troca de organização. No perfil da comunidade, a lista é só leitura.

const MEDAL = ['#F5C451', '#D5DCE6', '#D99A6C'];
const ROW_GAP = 8;

interface Top100ListProps {
  entries: RatedTitle[];
  // Avaliados fora do Top 100 (só quando dá pra organizar).
  others?: RatedTitle[];
  // O que está guardado (ordem, tirados e o andamento dos duelos).
  saved?: Top100Saved | null;
  editable?: boolean;
  onSave?: (next: Top100Saved) => Promise<void>;
  isOtherUserProfile?: boolean;
  profileUserId?: string;
  anchorId?: string;
}

const Top100List: React.FC<Top100ListProps> = ({
  entries,
  others = [],
  saved = null,
  editable = false,
  onSave,
  isOtherUserProfile = false,
  profileUserId,
  anchorId,
}) => {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<RatedTitle[]>(entries);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [dueling, setDueling] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showOthers, setShowOthers] = useState(20);
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [openingKey, setOpeningKey] = useState<string | null>(null);
  const [editingPosition, setEditingPosition] = useState<number | null>(null);
  const [positionText, setPositionText] = useState('');

  // Fora do modo de organizar, a lista acompanha o que vem da página.
  useEffect(() => {
    if (!editing) setDraft(entries);
  }, [entries, editing]);

  const list = editing ? draft : entries;

  // Sob demanda fora da edição; na edição, a lista inteira.
  const { count, endRef, hasMore } = useProgressiveCount({
    total: list.length,
    initial: 20,
    step: 20,
    enabled: true,
    axis: 'y',
    margin: 900,
    resetKey: editing ? 'edit' : 'view',
  });
  const shown = editing ? list.length : count;
  // Quem já trouxe os títulos inteiros (perfil) não precisa dos cartões.
  const needsCards = useMemo(() => list.some((title) => !title.movie), [list]);
  const cardOf = useTitleCards(needsCards ? list : [], shown, { ahead: editing ? 0 : 10 });
  const othersPool = useMemo(() => {
    const inDraft = new Set(draft.map(titleKey));
    const back = entries.filter((title) => !inDraft.has(titleKey(title)));
    const pool = [...back, ...others.filter((title) => !inDraft.has(titleKey(title)))];
    const seen = new Set<string>();
    return pool
      .filter((title) => (seen.has(titleKey(title)) ? false : (seen.add(titleKey(title)), true)))
      .sort((a, b) => b.userRating - a.userRating);
  }, [draft, entries, others]);
  const othersShown = othersPool.slice(0, showOthers);
  const othersCard = useTitleCards(editing ? othersShown : [], othersShown.length, { enabled: editing, ahead: 0 });
  const reveal = useReveal();

  const cardFor = (title: RatedTitle): Movie | undefined => {
    const card = title.movie ?? cardOf(title) ?? othersCard(title);
    return card && !card.title ? { ...card, title: t('library.unavailableTitle') } : card;
  };

  const openTitle = async (title: RatedTitle) => {
    if (title.movie) {
      setSelectedMovie(title.movie);
      return;
    }
    const key = titleKey(title);
    if (openingKey) return;
    setOpeningKey(key);
    try {
      const full = await getFullTitle(title);
      setSelectedMovie({ ...full, userRating: title.userRating });
    } catch {
      const card = cardFor(title);
      if (card) setSelectedMovie({ ...card, userRating: title.userRating });
    } finally {
      setOpeningKey(null);
    }
  };

  // ---------------------------------------------------------------------
  // Organizar
  // ---------------------------------------------------------------------

  const startEditing = () => {
    setDraft(entries);
    setRemoved(new Set());
    setShowOthers(20);
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    setEditingPosition(null);
    setDraft(entries);
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

  const removeAt = (index: number) => {
    const title = draft[index];
    if (!title) return;
    setDraft((prev) => prev.filter((_, i) => i !== index));
    setRemoved((prev) => new Set(prev).add(titleKey(title)));
  };

  const add = (title: RatedTitle) => {
    if (draft.length >= TOP_LIMIT) return;
    setDraft((prev) => [...prev, title]);
    setRemoved((prev) => {
      const next = new Set(prev);
      next.delete(titleKey(title));
      return next;
    });
  };

  const save = async () => {
    if (!onSave) return;
    setSaving(true);
    try {
      const base = saved || EMPTY_TOP100;
      const inDraft = new Set(draft.map(titleKey));
      const nextExcluded = new Set(base.excluded);
      removed.forEach((key) => nextExcluded.add(key));
      inDraft.forEach((key) => nextExcluded.delete(key));
      // O que os duelos confirmaram continua valendo até onde a ordem não mudou.
      await onSave({ ...base, items: draft.map(titleKey), excluded: Array.from(nextExcluded) });
      setEditing(false);
      setEditingPosition(null);
      toast.success(t('library.top100Saved'));
    } catch (error) {
      console.error('Error saving top 100:', error);
      toast.error(t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  // Arrastar pela alça: a linha segue o dedo/mouse e troca de lugar com as
  // vizinhas; perto da borda da tela, a página rola sozinha.
  const dragRef = useRef<{ index: number; startY: number; lastClientY: number; rowH: number } | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const autoScrollRef = useRef<number | null>(null);
  const firstRowRef = useRef<HTMLLIElement | null>(null);
  const draftLengthRef = useRef(draft.length);
  draftLengthRef.current = draft.length;

  const applyDrag = (clientY: number) => {
    const drag = dragRef.current;
    if (!drag) return;
    drag.lastClientY = clientY;
    const pageY = clientY + window.scrollY;
    const steps = Math.trunc((pageY - drag.startY) / drag.rowH);
    if (steps !== 0) {
      const from = drag.index;
      const target = Math.max(0, Math.min(draftLengthRef.current - 1, from + steps));
      if (target !== from) {
        move(from, target);
        drag.startY += (target - from) * drag.rowH;
        drag.index = target;
        setDragIndex(target);
      }
    }
    setDragOffset(pageY - drag.startY);
  };

  const stopAutoScroll = () => {
    if (autoScrollRef.current !== null) cancelAnimationFrame(autoScrollRef.current);
    autoScrollRef.current = null;
  };

  const autoScroll = () => {
    const drag = dragRef.current;
    if (!drag) return;
    const edge = 90;
    const y = drag.lastClientY;
    const speed = y < edge ? -Math.ceil((edge - y) / 6) : y > window.innerHeight - edge ? Math.ceil((y - (window.innerHeight - edge)) / 6) : 0;
    if (speed !== 0) {
      window.scrollBy(0, speed);
      applyDrag(drag.lastClientY);
    }
    autoScrollRef.current = requestAnimationFrame(autoScroll);
  };

  const onHandlePointerDown = (index: number, e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const rowH = (firstRowRef.current?.getBoundingClientRect().height || 72) + ROW_GAP;
    dragRef.current = { index, startY: e.clientY + window.scrollY, lastClientY: e.clientY, rowH };
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
    // a alça acompanha o filme
    requestAnimationFrame(() => {
      const target = Math.max(0, Math.min(draft.length - 1, keys[e.key]));
      document.getElementById(`top100-handle-${target}`)?.focus();
    });
  };

  const commitPosition = (index: number) => {
    const value = parseInt(positionText, 10);
    if (Number.isFinite(value)) move(index, value - 1);
    setEditingPosition(null);
  };

  const yearOfTitle = (title: RatedTitle, card?: Movie) => title.year || (card?.release_date || '').slice(0, 4) || '';

  const header = (count: number) => (
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex items-center gap-3.5 min-w-0">
          <span
            className="grid place-items-center w-12 h-12 sm:w-14 sm:h-14 shrink-0 rounded-xl text-xl sm:text-2xl leading-none"
            style={{ ...PIXEL, background: VELVET, color: MEDAL[0], boxShadow: `inset 0 0 0 1.5px ${withAlpha(MEDAL[0], 0.55)}` }}
            aria-hidden
          >
            100
          </span>
          <div className="min-w-0">
            <h2 style={{ ...PIXEL, color: PAPER }} className="text-2xl sm:text-3xl leading-tight truncate">
              {t('library.top100Title')}
            </h2>
            <p className="mt-0.5 text-sm" style={{ color: MIST }}>
              {t('library.top100Count', { count })}
            </p>
          </div>
        </div>
        {editable && onSave && !editing && entries.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {entries.length > 1 && (
              <button
                onClick={() => setDueling(true)}
                className={`inline-flex items-center gap-2 h-11 px-4 rounded-full border border-white/15 hover:border-white/35 hover:bg-white/5 text-sm font-medium transition ${FOCUS_RING}`}
                style={{ color: PAPER }}
              >
                <Swords className="w-4 h-4 text-pink-300" aria-hidden />
                {t('library.top100Duel')}
              </button>
            )}
            <button
              onClick={startEditing}
              className={`inline-flex items-center gap-2 h-11 px-4 rounded-full border border-white/15 hover:border-white/35 hover:bg-white/5 text-sm font-medium transition ${FOCUS_RING}`}
              style={{ color: PAPER }}
            >
              <ArrowDownUp className="w-4 h-4 text-violet-300" aria-hidden />
              {t('library.top100Organize')}
            </button>
          </div>
        )}
      </div>
  );


  if (entries.length === 0 && !editing) {
    return (
      <section id={anchorId} className="border-t border-white/[0.07] py-10 sm:py-12" aria-label={t('library.top100Title')}>
        <div className="mx-auto max-w-3xl px-5 sm:px-8">
          {header(0)}
          <p className="mt-6 flex items-center gap-3 rounded-xl px-4 py-4 text-sm ring-1 ring-white/10" style={{ background: VELVET, color: MIST }}>
            <Film className="w-5 h-5 shrink-0 text-violet-300" aria-hidden />
            {t('library.top100Empty')}
          </p>
        </div>
      </section>
    );
  }

  return (
    <>
      <section id={anchorId} className="border-t border-white/[0.07] py-10 sm:py-12" aria-label={t('library.top100Title')}>
        <div className="mx-auto max-w-3xl px-5 sm:px-8">
          {header(list.length)}

          {editing && (
            <p className="mt-4 text-sm" style={{ color: MIST }}>
              {t('library.top100EditHint')}
            </p>
          )}

          <ol className="mt-6 space-y-2" aria-label={t('library.top100Title')}>
            {list.slice(0, shown).map((title, index) => {
              const card = cardFor(title);
              const position = index + 1;
              const medal = position <= 3 ? MEDAL[position - 1] : null;
              const tone = ratingTone(title.userRating);
              const year = yearOfTitle(title, card);
              const isDragging = dragIndex === index;
              const key = titleKey(title);

              const positionLabel = editing && editingPosition === index ? (
                <input
                  autoFocus
                  inputMode="numeric"
                  aria-label={t('library.top100MoveTo', { title: card?.title || '' })}
                  value={positionText}
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => setPositionText(e.target.value.replace(/\D/g, '').slice(0, 3))}
                  onBlur={() => commitPosition(index)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitPosition(index);
                    if (e.key === 'Escape') setEditingPosition(null);
                  }}
                  className="w-12 sm:w-14 h-10 rounded-lg bg-black/40 ring-1 ring-violet-400/60 text-center text-2xl outline-none"
                  style={{ ...PIXEL, color: PAPER }}
                />
              ) : editing ? (
                <button
                  onClick={() => {
                    setEditingPosition(index);
                    setPositionText(String(position));
                  }}
                  aria-label={t('library.top100MoveTo', { title: card?.title || '' })}
                  className={`w-12 sm:w-14 h-10 shrink-0 rounded-lg text-right pr-1 text-2xl sm:text-3xl leading-none hover:bg-white/5 ${FOCUS_RING}`}
                  style={{ ...PIXEL, color: medal || PAPER }}
                >
                  {position}
                </button>
              ) : (
                <span className="w-12 sm:w-14 shrink-0 text-right pr-1 text-2xl sm:text-3xl leading-none" style={{ ...PIXEL, color: medal || withAlpha(PAPER, 0.75) }}>
                  {position}
                </span>
              );

              const poster = (
                <span className={`relative block ${editing ? 'w-10 sm:w-12' : 'w-12 sm:w-14'} aspect-[2/3] shrink-0 rounded-lg overflow-hidden ring-1 ring-white/10`} style={{ background: VELVET }}>
                  {card?.poster_path ? (
                    <OptimizedPoster src={`https://image.tmdb.org/t/p/w154${card.poster_path}`} alt="" className="absolute inset-0 w-full h-full object-cover" />
                  ) : card ? (
                    <Film className="absolute inset-0 m-auto w-5 h-5" style={{ color: MIST }} aria-hidden />
                  ) : (
                    <span className="absolute inset-0 poster-skeleton" />
                  )}
                  {openingKey === key && (
                    <span className="absolute inset-0 grid place-items-center bg-black/55">
                      <Loader2 className="w-4 h-4 animate-spin text-white" aria-hidden />
                    </span>
                  )}
                </span>
              );

              const info = (
                <span className="min-w-0 flex-1">
                  {card ? (
                    <span className="block text-[15px] font-medium leading-snug line-clamp-2" style={{ color: PAPER }}>
                      {card.title}
                    </span>
                  ) : (
                    <span className="block h-4 w-3/5 rounded poster-skeleton" />
                  )}
                  <span className="mt-1 flex items-center gap-2 text-xs" style={{ color: MIST }}>
                    {title.media_type === 'tv' && <Tv className="w-3 h-3 shrink-0 text-sky-300" aria-label={t('mobileSearch.series')} />}
                    {year && <span>{year}</span>}
                    {card?.genres?.[0]?.name && <span className="truncate">{card.genres[0].name}</span>}
                  </span>
                </span>
              );

              const ratingBadge = (
                <span
                  className="shrink-0 inline-flex items-center gap-1 pl-1.5 pr-2 py-0.5 rounded-md text-sm ring-1"
                  style={{ ...PIXEL, background: 'rgba(18,13,34,0.86)', color: tone.color, '--tw-ring-color': tone.ring } as React.CSSProperties}
                  title={t('home.desk.yourRating')}
                >
                  <Star className="w-3 h-3 fill-current" aria-hidden />
                  <span className="sr-only">{t('home.desk.yourRating')}:</span>
                  {title.userRating}
                </span>
              );

              const rowSurface: React.CSSProperties = {
                background: medal ? `linear-gradient(90deg, ${withAlpha(medal, 0.1)}, transparent 70%)` : undefined,
              };

              if (editing) {
                return (
                  <li
                    key={key}
                    ref={index === 0 ? firstRowRef : undefined}
                    className={`relative flex items-center gap-2 sm:gap-3 rounded-2xl pl-1 pr-2 py-2 ring-1 select-none ${isDragging ? 'z-10 ring-violet-400/70 shadow-2xl' : 'ring-white/10'}`}
                    style={{
                      ...rowSurface,
                      background: isDragging ? '#2A1F4A' : rowSurface.background || VELVET,
                      transform: isDragging ? `translateY(${dragOffset}px) scale(1.02)` : undefined,
                      transition: isDragging ? 'none' : 'transform 0.18s ease',
                    }}
                  >
                    <button
                      id={`top100-handle-${index}`}
                      onPointerDown={(e) => onHandlePointerDown(index, e)}
                      onPointerMove={onHandlePointerMove}
                      onPointerUp={endDrag}
                      onPointerCancel={endDrag}
                      onKeyDown={(e) => onHandleKeyDown(index, e)}
                      aria-label={t('library.top100Drag', { title: card?.title || '', position })}
                      className={`grid place-items-center w-9 h-11 shrink-0 rounded-lg cursor-grab active:cursor-grabbing hover:bg-white/5 ${FOCUS_RING}`}
                      style={{ touchAction: 'none', color: MIST }}
                    >
                      <GripVertical className="w-5 h-5" aria-hidden />
                    </button>
                    {positionLabel}
                    {poster}
                    {info}
                    {ratingBadge}
                    <button
                      onClick={() => removeAt(index)}
                      aria-label={t('library.top100Remove', { title: card?.title || '' })}
                      className={`grid place-items-center w-10 h-10 shrink-0 rounded-full hover:bg-red-500/15 text-red-300 ${FOCUS_RING}`}
                    >
                      <X className="w-4 h-4" aria-hidden />
                    </button>
                  </li>
                );
              }

              return (
                <li key={key} ref={reveal} className="reveal-tile reveal-row">
                  <button
                    onClick={() => openTitle(title)}
                    onPointerEnter={() => !title.movie && prefetchFullTitle(title)}
                    onPointerDown={() => !title.movie && prefetchFullTitle(title)}
                    className={`w-full flex items-center gap-3 sm:gap-4 rounded-2xl pl-1 pr-3 py-2 text-left hover:bg-white/[0.04] transition ${FOCUS_RING}`}
                    style={rowSurface}
                  >
                    {positionLabel}
                    {poster}
                    {info}
                    {ratingBadge}
                  </button>
                </li>
              );
            })}
            {!editing && hasMore && <li ref={endRef} aria-hidden className="h-px" />}
          </ol>

          {editing && (
            <div className="mt-10">
              <h3 style={{ ...PIXEL, color: PAPER }} className="text-xl leading-tight">
                {t('library.top100Others')}
              </h3>
              <p className="mt-1 text-sm" style={{ color: MIST }}>
                {draft.length >= TOP_LIMIT ? t('library.top100Full') : t('library.top100OthersHint', { count: TOP_LIMIT - draft.length })}
              </p>
              {othersPool.length === 0 ? (
                <p className="mt-4 text-sm" style={{ color: MIST }}>
                  {t('library.top100NoOthers')}
                </p>
              ) : (
                <ul className="mt-4 space-y-2">
                  {othersShown.map((title) => {
                    const card = cardFor(title);
                    const tone = ratingTone(title.userRating);
                    return (
                      <li key={titleKey(title)} className="flex items-center gap-3 rounded-2xl pl-3 pr-2 py-2 ring-1 ring-white/10" style={{ background: VELVET }}>
                        <span className="relative block w-10 aspect-[2/3] shrink-0 rounded-md overflow-hidden ring-1 ring-white/10">
                          {card?.poster_path ? (
                            <OptimizedPoster src={`https://image.tmdb.org/t/p/w92${card.poster_path}`} alt="" className="absolute inset-0 w-full h-full object-cover" />
                          ) : (
                            <span className="absolute inset-0 poster-skeleton" />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium truncate" style={{ color: PAPER }}>
                            {card?.title || '…'}
                          </span>
                          <span className="block text-xs" style={{ color: MIST }}>
                            {yearOfTitle(title, card)}
                          </span>
                        </span>
                        <span className="shrink-0 text-sm" style={{ ...PIXEL, color: tone.color }}>
                          {title.userRating}
                        </span>
                        <button
                          onClick={() => add(title)}
                          disabled={draft.length >= TOP_LIMIT}
                          aria-label={t('library.top100Add', { title: card?.title || '' })}
                          className={`grid place-items-center w-10 h-10 shrink-0 rounded-full hover:bg-violet-500/20 text-violet-200 disabled:opacity-30 disabled:hover:bg-transparent ${FOCUS_RING}`}
                        >
                          <Plus className="w-4 h-4" aria-hidden />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              {othersPool.length > othersShown.length && (
                <button
                  onClick={() => setShowOthers((n) => n + 20)}
                  className={`mt-3 w-full h-11 rounded-xl border border-white/15 hover:border-white/35 hover:bg-white/5 text-sm font-medium transition ${FOCUS_RING}`}
                  style={{ color: PAPER }}
                >
                  {t('library.top100ShowMore')}
                </button>
              )}
            </div>
          )}

          {editing && (
            <div className="sticky bottom-24 sm:bottom-6 z-20 mt-8 flex gap-2 rounded-2xl p-2 ring-1 ring-white/15 shadow-2xl backdrop-blur-md" style={{ background: 'rgba(18,13,34,0.92)' }}>
              <button
                onClick={cancelEditing}
                disabled={saving}
                className={`flex-1 h-12 rounded-xl border border-white/15 hover:bg-white/5 text-sm font-semibold transition disabled:opacity-60 ${FOCUS_RING}`}
                style={{ color: PAPER }}
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={save}
                disabled={saving}
                className={`flex-1 inline-flex items-center justify-center gap-2 h-12 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:brightness-110 text-white text-sm font-semibold transition disabled:opacity-60 ${FOCUS_RING}`}
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Check className="w-4 h-4" aria-hidden />}
                {t('library.top100Save')}
              </button>
            </div>
          )}
        </div>
      </section>

      {dueling && onSave && (
        <Top100Duel
          entries={entries}
          outside={others}
          saved={saved}
          onSave={onSave}
          onClose={() => setDueling(false)}
        />
      )}

      {selectedMovie &&
        createPortal(
          <MovieDetailsModal
            movie={selectedMovie}
            isOpen={true}
            onClose={() => setSelectedMovie(null)}
            isOtherUserProfile={isOtherUserProfile}
            profileUserId={profileUserId}
          />,
          document.body
        )}
    </>
  );
};

export default Top100List;
