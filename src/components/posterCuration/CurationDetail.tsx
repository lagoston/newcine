import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronLeft, ChevronRight, ExternalLink, X } from 'lucide-react';
import PosterArt, { EffectTag, RarityTag } from '../posterJackpot/PosterArt';
import { RarityGem, SerialLine } from '../posterJackpot/CollectorMark';
import { ChipFace } from '../posterJackpot/Chips';
import { FOCUS_RING } from '../../lib/oracleTheme';
import { posterUrl, titleOf } from '../../lib/posterJackpot';
import {
  sectionTone,
  tileEffect,
  tmdbPageUrl,
  type CurationEffect,
  type CurationPoster,
  type CurationSectionKey,
} from '../../lib/posterCuration';

// Curadoria do catálogo (04/11/2026): a folha de detalhe de um pôster. O
// pôster grande com o efeito escolhido na barra, os dados que importam para a
// curadoria (raridade, número, lote, quem tem, se está na roleta), o link do
// TMDB e as setas para o anterior e o próximo da mesma seção (também pelas
// setas do teclado), para percorrer uma raridade inteira sem fechar.
//
// Folha própria (e não a OracleSheet): o pôster precisa ser grande no
// computador (pôster ao lado dos dados), o fechar e as setas precisam de
// 44 px, e o Jackpot fala em Cinzel, não em Pixelify. No celular abre como
// gaveta de baixo para cima; no computador, centralizada. Fecha no X, no
// fundo e no Esc; trava a rolagem da página e prende o Tab dentro dela.

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

type Props = {
  poster: CurationPoster | null;
  sectionKey: CurationSectionKey | null;
  // Posição na seção (já com os filtros de tipo e de busca).
  index: number;
  total: number;
  effect: CurationEffect;
  // Ausentes nas pontas da seção.
  onPrev?: () => void;
  onNext?: () => void;
  onClose: () => void;
  // Vizinhos para a imagem grande já vir carregada ao passar.
  neighbors: CurationPoster[];
};

const CurationDetail: React.FC<Props> = ({ poster, sectionKey, index, total, effect, onPrev, onNext, onClose, neighbors }) => {
  const { t, i18n } = useTranslation();
  const isPt = i18n.language.startsWith('pt');
  const reduceMotion = !!useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const open = !!poster && !!sectionKey;

  // Trava a rolagem da página por trás.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // Ao abrir, o foco vai para a folha (as setas do teclado já funcionam).
  useEffect(() => {
    if (open) panelRef.current?.focus({ preventScroll: true });
  }, [open]);

  // Esc fecha; ← e → passam; o Tab fica preso dentro da folha.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowLeft' && onPrev && !e.altKey && !e.metaKey) {
        e.preventDefault();
        onPrev();
      } else if (e.key === 'ArrowRight' && onNext && !e.altKey && !e.metaKey) {
        e.preventDefault();
        onNext();
      } else if (e.key === 'Tab' && panelRef.current) {
        const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        const current = document.activeElement;
        if (e.shiftKey && (current === first || current === panelRef.current)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && current === last) {
          e.preventDefault();
          first.focus();
        } else if (!panelRef.current.contains(current)) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onPrev, onNext, onClose]);

  // A imagem grande dos vizinhos já vem baixada.
  useEffect(() => {
    neighbors.forEach((p) => {
      const img = new Image();
      img.src = posterUrl(p.file_path, 'w500');
    });
  }, [neighbors]);

  const title = poster ? titleOf(poster, isPt) || t('curation.posters.untitled') : '';
  const other = poster ? (isPt ? poster.title_en : poster.title_pt) : null;
  const shown = poster ? tileEffect(poster, effect) : 'none';
  const added = (() => {
    if (!poster?.added_at) return null;
    const date = new Date(poster.added_at);
    if (Number.isNaN(date.getTime())) return null;
    return new Intl.DateTimeFormat(isPt ? 'pt-BR' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
  })();
  const status = !poster
    ? null
    : poster.exclusive
      ? { color: '#F4C454', label: t('curation.posters.detail.statusPoker') }
      : poster.is_active
        ? { color: '#4ADE80', label: t('curation.posters.detail.statusOn') }
        : { color: '#9CA3AF', label: t('curation.posters.detail.statusOff') };

  const navButton = (direction: 'prev' | 'next') => {
    const handler = direction === 'prev' ? onPrev : onNext;
    const Icon = direction === 'prev' ? ChevronLeft : ChevronRight;
    return (
      <button
        type="button"
        onClick={handler}
        disabled={!handler}
        className={`inline-flex items-center gap-1.5 h-11 min-w-[44px] px-3 sm:px-4 rounded-xl text-sm font-semibold transition disabled:opacity-35 disabled:cursor-not-allowed ${FOCUS_RING}`}
        style={{ color: 'var(--pc-paper)', background: 'rgba(255,255,255,0.05)', boxShadow: 'inset 0 0 0 1px var(--pc-brass-dim)' }}
      >
        {direction === 'prev' && <Icon className="w-4 h-4" aria-hidden />}
        {t(`curation.posters.detail.${direction}`)}
        {direction === 'next' && <Icon className="w-4 h-4" aria-hidden />}
      </button>
    );
  };

  return createPortal(
    <AnimatePresence>
      {open && poster && sectionKey && (
        <div className="fixed inset-0 z-[9990] pc-vars" role="dialog" aria-modal="true" aria-labelledby={titleId}>
          <motion.div
            className="absolute inset-0 bg-black/75"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <div className="absolute inset-0 flex items-end md:items-center justify-center md:p-6 pointer-events-none">
            <motion.div
              ref={panelRef}
              tabIndex={-1}
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 28 }}
              transition={reduceMotion ? { duration: 0.15 } : { type: 'spring', stiffness: 320, damping: 32 }}
              className="pc-sheet pointer-events-auto relative w-full md:max-w-3xl max-h-[calc(100dvh-0.75rem)] md:max-h-[calc(100dvh-3rem)] flex flex-col rounded-t-2xl md:rounded-2xl overflow-hidden outline-none"
              style={sectionTone(sectionKey)}
            >
              {/* A seção e a posição; o fechar. */}
              <div className="shrink-0 flex items-center justify-between gap-3 pl-5 pr-2 pt-2 pb-2 border-b border-white/[0.07]">
                <p className="flex items-center gap-2 min-w-0 pc-label" style={{ color: 'var(--pc-tone)' }}>
                  {sectionKey === 'poker' ? (
                    <ChipFace kind="special" className="w-[18px] h-[18px] shrink-0" />
                  ) : (
                    <RarityGem rarity={sectionKey} className="w-[18px] h-[18px] shrink-0" />
                  )}
                  {/* A posição ("4 de 24") fica embaixo, entre as setas. */}
                  <span className="truncate">{t(`curation.posters.sections.${sectionKey}`)}</span>
                </p>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label={t('common.close')}
                  className={`shrink-0 grid place-items-center w-11 h-11 rounded-full hover:bg-white/10 transition ${FOCUS_RING}`}
                  style={{ color: 'var(--pc-mist)' }}
                >
                  <X className="w-5 h-5" aria-hidden />
                </button>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
                <div className="px-5 sm:px-7 py-5 md:py-6 flex flex-col md:flex-row gap-5 md:gap-7">
                  <motion.div
                    key={poster.id}
                    className="pc-sheet-poster shrink-0"
                    initial={reduceMotion ? false : { opacity: 0.35 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.18, ease: 'easeOut' }}
                  >
                    <span className={`relative block overflow-hidden rounded-[14px] ${poster.is_active || poster.exclusive ? '' : 'pc-sheet-off'}`}>
                      <PosterArt
                        filePath={poster.file_path}
                        effect={shown}
                        alt={title}
                        size="w500"
                        loading="eager"
                        className="pc-sheet-art"
                        mark={{ rarity: poster.rarity, serial: poster.serial, size: 'md' }}
                      />
                      {!poster.is_active && !poster.exclusive && (
                        <span className="pc-off" aria-hidden>
                          {t('curation.posters.tile.off')}
                        </span>
                      )}
                    </span>
                  </motion.div>

                  <div className="min-w-0 flex-1">
                    <h2 id={titleId} className="pc-cinzel text-[22px] sm:text-[26px] font-bold leading-tight" style={{ color: 'var(--pc-paper)' }}>
                      {title}
                    </h2>
                    {other && other !== title && (
                      <p className="mt-1 text-[13px]" style={{ color: 'var(--pc-mist)' }}>
                        {t(isPt ? 'curation.posters.detail.otherEn' : 'curation.posters.detail.otherPt', { title: other })}
                      </p>
                    )}

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <RarityTag rarity={poster.rarity} />
                      <SerialLine rarity={poster.rarity} serial={poster.serial} gem={false} className="text-[13px]" />
                      {poster.media_type === 'tv' && <span className="pc-series">{t('curation.posters.tile.series')}</span>}
                      <EffectTag effect={shown} />
                    </div>

                    <dl className="pc-facts mt-5">
                      <dt>{t('curation.posters.detail.year')}</dt>
                      <dd>{poster.year || '—'}</dd>
                      <dt>{t('curation.posters.detail.kind')}</dt>
                      <dd>{t(poster.media_type === 'tv' ? 'curation.posters.detail.kindTv' : 'curation.posters.detail.kindMovie')}</dd>
                      <dt>{t('curation.posters.detail.batch')}</dt>
                      <dd>
                        {poster.batch
                          ? t('curation.posters.detail.batchValue', { batch: poster.batch })
                          : poster.exclusive
                            ? t('curation.posters.detail.batchPoker')
                            : '—'}
                        {added && (
                          <span style={{ color: 'var(--pc-mist)' }}> · {t('curation.posters.detail.added', { date: added })}</span>
                        )}
                      </dd>
                      <dt>{t('curation.posters.detail.owners')}</dt>
                      <dd>
                        {poster.owners > 0
                          ? t('curation.posters.detail.ownersValue', { count: poster.owners })
                          : t('curation.posters.detail.ownersNone')}
                      </dd>
                      <dt>{t('curation.posters.detail.status')}</dt>
                      <dd>
                        {status && (
                          <>
                            <span className="pc-dot" style={{ background: status.color }} aria-hidden />
                            {status.label}
                          </>
                        )}
                      </dd>
                    </dl>

                    <a
                      href={tmdbPageUrl(poster)}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={t('curation.posters.detail.tmdbAria')}
                      className={`mt-6 !inline-flex items-center gap-2 h-11 px-4 rounded-xl text-sm font-semibold transition hover:brightness-110 ${FOCUS_RING}`}
                      style={{ background: 'var(--pc-paper)', color: '#221B36' }}
                    >
                      {t('curation.posters.detail.tmdb')}
                      <ExternalLink className="w-4 h-4" aria-hidden />
                    </a>
                    <p className="hidden md:block mt-4 text-[12px]" style={{ color: 'var(--pc-mist)' }}>
                      {t('curation.posters.detail.keysHint')}
                    </p>
                  </div>
                </div>
              </div>

              {/* Anterior e próximo da mesma seção. */}
              <div className="shrink-0 flex items-center justify-between gap-3 px-3 sm:px-5 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] border-t border-white/[0.07]">
                {navButton('prev')}
                <span className="text-[13px] tabular-nums" style={{ color: 'var(--pc-mist)' }} aria-live="polite">
                  {t('curation.posters.detail.position', { index: index + 1, total })}
                </span>
                {navButton('next')}
              </div>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default CurationDetail;
