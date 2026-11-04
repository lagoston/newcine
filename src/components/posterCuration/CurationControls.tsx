import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Grid3x3, LayoutGrid, Search, SlidersHorizontal, Square, X } from 'lucide-react';
import { FOCUS_RING } from '../../lib/oracleTheme';
import { CURATION_EFFECTS, type CurationEffect, type CurationKind, type CurationSize } from '../../lib/posterCuration';

// Curadoria do catálogo (04/11/2026): a barra de controles, presa no alto da
// página ao rolar (logo abaixo da navbar). Efeito para todos os pôsteres, lote
// em destaque, tipo, tamanho da grade e busca.
//
// Computador largo (a partir de 1280 px): tudo à vista, em duas fileiras.
// Abaixo disso a barra fica numa fileira só (busca + "Ajustes") e os ajustes
// abrem numa gaveta por cima da grade, sem empurrar a página: assim a barra
// presa nunca passa de ~64 px e não cobre o conteúdo.

const KINDS: CurationKind[] = ['all', 'movie', 'tv'];
const SIZES: { key: CurationSize; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 's', icon: Grid3x3 },
  { key: 'm', icon: LayoutGrid },
  { key: 'l', icon: Square },
];

type Props = {
  effect: CurationEffect;
  onEffect: (value: CurationEffect) => void;
  batch: number | null;
  onBatch: (value: number | null) => void;
  batches: number[];
  batchCounts: Record<number, number>;
  kind: CurationKind;
  onKind: (value: CurationKind) => void;
  size: CurationSize;
  onSize: (value: CurationSize) => void;
  query: string;
  onQuery: (value: string) => void;
  // Quantos pôsteres a busca achou (null sem busca).
  results: number | null;
  // A altura da barra (a página usa para o rolar até uma seção).
  onHeight: (px: number) => void;
};

// Um grupo com o rótulo em versalete de latão.
const Group: React.FC<{ label: string; className?: string; children: React.ReactNode }> = ({ label, className = '', children }) => (
  <div role="group" aria-label={label} className={`flex flex-col xl:flex-row xl:items-center gap-1.5 xl:gap-2.5 min-w-0 ${className}`}>
    <span className="pc-label" aria-hidden>
      {label}
    </span>
    {children}
  </div>
);

const SearchField: React.FC<{ value: string; onChange: (value: string) => void; className?: string }> = ({ value, onChange, className = '' }) => {
  const { t } = useTranslation();
  return (
    <label className={`pc-search ${className}`}>
      <Search className="pc-search-icon" aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && value) {
            e.stopPropagation();
            onChange('');
          }
        }}
        placeholder={t('curation.posters.controls.search')}
        aria-label={t('curation.posters.controls.search')}
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label={t('curation.posters.controls.searchClear')}
          className={`shrink-0 grid place-items-center w-11 h-11 rounded-xl ${FOCUS_RING}`}
          style={{ color: 'var(--pc-mist)' }}
        >
          <X className="w-4 h-4" aria-hidden />
        </button>
      )}
    </label>
  );
};

const CurationControls: React.FC<Props> = ({
  effect,
  onEffect,
  batch,
  onBatch,
  batches,
  batchCounts,
  kind,
  onKind,
  size,
  onSize,
  query,
  onQuery,
  results,
  onHeight,
}) => {
  const { t } = useTranslation();
  const barRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [stuck, setStuck] = useState(false);
  const active = (effect !== 'none' ? 1 : 0) + (batch != null ? 1 : 0) + (kind !== 'all' ? 1 : 0);

  // A altura da barra vai para a página (o scroll-margin das seções).
  useLayoutEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const report = () => onHeight(el.offsetHeight);
    report();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(report);
    observer.observe(el);
    return () => observer.disconnect();
  }, [onHeight]);

  // Presa no alto: ganha a sombra (o marcador invisível logo acima dela saiu
  // de baixo da navbar).
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setStuck(!entry.isIntersecting), { rootMargin: '-64px 0px 0px 0px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // A gaveta fecha no Esc e num toque fora da barra.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onPointer = (e: PointerEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  const effectLabel = (value: CurationEffect) => (value === 'none' ? t('curation.posters.controls.effectNone') : t(`jackpot.effect.${value}`));

  const effectSeg = (grid: boolean) => (
    <div className={`pc-seg ${grid ? 'pc-seg--fill pc-seg--grid2' : ''}`}>
      {CURATION_EFFECTS.map((value) => (
        <button key={value} type="button" aria-pressed={effect === value} onClick={() => onEffect(value)} className={`pc-seg-btn ${FOCUS_RING}`}>
          <span className={`pc-swatch pc-swatch--${value}`} aria-hidden />
          {effectLabel(value)}
        </button>
      ))}
    </div>
  );

  const kindSeg = (fill: boolean) => (
    <div className={`pc-seg ${fill ? 'pc-seg--fill' : ''}`}>
      {KINDS.map((value) => (
        <button key={value} type="button" aria-pressed={kind === value} onClick={() => onKind(value)} className={`pc-seg-btn ${FOCUS_RING}`}>
          {t(`curation.posters.controls.kind.${value}`)}
        </button>
      ))}
    </div>
  );

  // No computador largo, só os ícones (com o nome no title e no leitor de tela).
  const sizeSeg = (withText: boolean) => (
    <div className={`pc-seg ${withText ? 'pc-seg--fill' : ''}`}>
      {SIZES.map(({ key, icon: Icon }) => (
        <button
          key={key}
          type="button"
          aria-pressed={size === key}
          onClick={() => onSize(key)}
          aria-label={withText ? undefined : t(`curation.posters.controls.sizes.${key}`)}
          title={withText ? undefined : t(`curation.posters.controls.sizes.${key}`)}
          className={`pc-seg-btn ${withText ? '' : '!px-0 w-11'} ${FOCUS_RING}`}
        >
          <Icon aria-hidden />
          {withText && t(`curation.posters.controls.sizes.${key}`)}
        </button>
      ))}
    </div>
  );

  const batchButtons = (
    <div className="pc-batches">
      <button
        type="button"
        aria-pressed={batch == null}
        onClick={() => onBatch(null)}
        className={`pc-batch-btn pc-batch-btn--all ${FOCUS_RING}`}
      >
        {t('curation.posters.controls.batchAll')}
      </button>
      {batches.map((value) => (
        <button
          key={value}
          type="button"
          aria-pressed={batch === value}
          onClick={() => onBatch(batch === value ? null : value)}
          aria-label={t('curation.posters.controls.batchOption', { batch: value, count: batchCounts[value] || 0 })}
          title={t('curation.posters.controls.batchOption', { batch: value, count: batchCounts[value] || 0 })}
          className={`pc-batch-btn ${FOCUS_RING}`}
        >
          {value}
        </button>
      ))}
    </div>
  );

  // "Lote 10 · 26 pôsteres em destaque" e "12 resultados" (lidos pelo leitor
  // de tela quando mudam).
  const status = [
    batch != null ? t('curation.posters.controls.batchCount', { batch, count: batchCounts[batch] || 0 }) : null,
    results != null ? t('curation.posters.controls.results', { count: results }) : null,
  ].filter(Boolean);

  return (
    <>
      <div ref={sentinelRef} aria-hidden className="h-px -mb-px" />
      <div ref={barRef} className={`pc-bar ${stuck ? 'is-stuck' : ''}`} role="region" aria-label={t('curation.posters.controls.label')}>
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-2.5">
          {/* Computador largo: tudo à vista. */}
          <div className="hidden xl:flex flex-wrap items-center gap-x-6 gap-y-2.5">
            <Group label={t('curation.posters.controls.effect')}>{effectSeg(false)}</Group>
            <Group label={t('curation.posters.controls.kindLabel')}>{kindSeg(false)}</Group>
            <Group label={t('curation.posters.controls.size')}>{sizeSeg(false)}</Group>
            <Group label={t('curation.posters.controls.batch')}>{batchButtons}</Group>
            <SearchField value={query} onChange={onQuery} className="flex-1 min-w-[220px]" />
          </div>

          {/* Celular, tablet e computador estreito: busca e "Ajustes". */}
          <div className="flex xl:hidden items-center gap-2">
            <SearchField value={query} onChange={onQuery} className="flex-1" />
            <button
              type="button"
              aria-expanded={open}
              aria-controls="pc-drawer"
              onClick={() => setOpen((value) => !value)}
              className={`pc-seg-btn shrink-0 !h-11 !px-3.5 ${FOCUS_RING}`}
              style={
                open
                  ? { background: 'var(--pc-paper)', color: '#221B36' }
                  : { background: 'rgba(255,255,255,0.045)', boxShadow: 'inset 0 0 0 1px var(--pc-brass-dim)', color: 'var(--pc-paper)' }
              }
            >
              <SlidersHorizontal aria-hidden />
              {t('curation.posters.controls.adjust')}
              {active > 0 && <span className="pc-badge">{active}</span>}
            </button>
          </div>

          {status.length > 0 && (
            <p className="mt-1.5 text-[12.5px] leading-snug truncate" style={{ color: '#FFE8A3' }} aria-live="polite">
              {status.join(' · ')}
            </p>
          )}
        </div>

        {open && (
          <div id="pc-drawer" className="pc-drawer xl:hidden">
            <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 pt-3 pb-4 grid sm:grid-cols-2 gap-x-6 gap-y-4">
              <Group label={t('curation.posters.controls.effect')} className="sm:col-span-2">
                {effectSeg(true)}
              </Group>
              <Group label={t('curation.posters.controls.kindLabel')}>{kindSeg(true)}</Group>
              <Group label={t('curation.posters.controls.size')}>{sizeSeg(true)}</Group>
              <Group label={t('curation.posters.controls.batch')} className="sm:col-span-2">
                {batchButtons}
              </Group>
              <div className="sm:col-span-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className={`h-11 px-5 rounded-xl text-sm font-semibold ${FOCUS_RING}`}
                  style={{ background: 'var(--pc-paper)', color: '#221B36' }}
                >
                  {t('curation.posters.controls.done')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default CurationControls;
