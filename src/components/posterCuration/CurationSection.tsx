import React, { memo, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import PosterArt from '../posterJackpot/PosterArt';
import { RarityGem } from '../posterJackpot/CollectorMark';
import { ChipFace } from '../posterJackpot/Chips';
import { FOCUS_RING } from '../../lib/oracleTheme';
import { titleOf } from '../../lib/posterJackpot';
import {
  goalStatus,
  sectionDomId,
  sectionTone,
  tileEffect,
  type CurationEffect,
  type CurationPoster,
  type CurationSectionKey,
  type CurationSize,
} from '../../lib/posterCuration';

// Curadoria do catálogo (04/11/2026): uma seção da vitrine (o cabeçalho da
// raridade, com a contagem contra a meta, e a grade dos pôsteres) e o pôster
// da grade.

// ---------------------------------------------------------------------------
// Só anima o que está na tela. São ~190 pôsteres e o holográfico tem três
// camadas que repintam a cada quadro: com todos animando ao mesmo tempo o
// celular engasga. Um IntersectionObserver só para a página inteira liga a
// animação de cada pôster quando ele chega perto da tela e desliga quando sai.
// ---------------------------------------------------------------------------

const inViewCallbacks = new WeakMap<Element, (visible: boolean) => void>();
let inViewObserver: IntersectionObserver | null = null;
const getInViewObserver = () => {
  if (!inViewObserver && typeof IntersectionObserver !== 'undefined') {
    inViewObserver = new IntersectionObserver(
      (entries) => entries.forEach((entry) => inViewCallbacks.get(entry.target)?.(entry.isIntersecting)),
      { rootMargin: '160px 0px' }
    );
  }
  return inViewObserver;
};

function useInView(ref: React.RefObject<Element>, enabled: boolean) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el) return;
    const observer = getInViewObserver();
    // Navegador sem IntersectionObserver: anima tudo, como antes.
    if (!observer) {
      setVisible(true);
      return;
    }
    inViewCallbacks.set(el, setVisible);
    observer.observe(el);
    return () => {
      observer.unobserve(el);
      inViewCallbacks.delete(el);
    };
  }, [ref, enabled]);
  return visible;
}

// ---------------------------------------------------------------------------
// O pôster da grade
// ---------------------------------------------------------------------------

type TileProps = {
  poster: CurationPoster;
  sectionKey: CurationSectionKey;
  effect: CurationEffect;
  size: CurationSize;
  // Lote escolhido na barra: os do lote em destaque, os outros esmaecidos.
  highlight: boolean;
  dim: boolean;
  onOpen: (key: CurationSectionKey, id: number) => void;
};

export const CurationTile = memo(function CurationTile({ poster, sectionKey, effect, size, highlight, dim, onOpen }: TileProps) {
  const { t, i18n } = useTranslation();
  const isPt = i18n.language.startsWith('pt');
  const ref = useRef<HTMLButtonElement>(null);
  const shown = tileEffect(poster, effect);
  // Só o holográfico e o gold têm movimento; os outros nem precisam do observador.
  const moving = shown === 'holo' || shown === 'gold';
  const visible = useInView(ref, moving);
  const off = !poster.is_active && !poster.exclusive;
  const title = titleOf(poster, isPt) || t('curation.posters.untitled');
  const label = [
    title,
    poster.year ? String(poster.year) : null,
    poster.media_type === 'tv' ? t('curation.posters.tile.series') : null,
    poster.serial ? t('jackpot.mark.label', { rarity: t(`jackpot.rarity.${poster.rarity}`), number: poster.serial }) : t(`jackpot.rarity.${poster.rarity}`),
    off ? t('curation.posters.tile.off') : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <button
      ref={ref}
      type="button"
      onClick={() => onOpen(sectionKey, poster.id)}
      aria-label={label}
      title={size === 's' ? title : undefined}
      data-pc-tile={`${sectionKey}:${poster.id}`}
      data-hl={highlight || undefined}
      data-dim={dim || undefined}
      data-off={off || undefined}
      className={`pc-tile group ${FOCUS_RING}`}
    >
      <span className="pc-tile-frame block">
        <PosterArt
          filePath={poster.file_path}
          effect={shown}
          alt=""
          size={size === 'l' ? 'w500' : 'w342'}
          animated={visible}
          className="pc-tile-art"
          mark={{ rarity: poster.rarity, serial: poster.serial, size: size === 'l' ? 'sm' : 'xs' }}
        />
        {off && (
          <span className="pc-off" aria-hidden>
            {t('curation.posters.tile.off')}
          </span>
        )}
      </span>
      {/* No tamanho pequeno a grade é para ver o conjunto de longe: sem
          legenda (o título aparece ao passar o mouse e na folha de detalhe). */}
      {size !== 's' && (
        <span className="pc-cap block" aria-hidden>
          <span className="pc-cap-title">{title}</span>
          <span className="pc-cap-meta">
            {poster.year && <span>{poster.year}</span>}
            {poster.media_type === 'tv' && <span className="pc-series">{t('curation.posters.tile.series')}</span>}
          </span>
        </span>
      )}
    </button>
  );
});

// ---------------------------------------------------------------------------
// A barrinha da meta (cabeçalho das seções e resumo do topo)
// ---------------------------------------------------------------------------

export const GoalMeter: React.FC<{ count: number; goal: number; className?: string }> = ({ count, goal, className = '' }) => {
  const over = goal > 0 && count > goal;
  // Acima da meta, a barra vira "meta + excesso": o marco fica onde a meta
  // acaba e o excesso, listrado, depois dele.
  const scale = over ? count : goal;
  const fill = scale > 0 ? Math.min(100, (Math.min(count, goal) / scale) * 100) : 0;
  return (
    <span className={`pc-meter block ${className}`} aria-hidden>
      <span className="pc-meter-fill" style={{ width: `${fill}%` }} />
      {over && (
        <>
          <span className="pc-meter-over" style={{ width: `${100 - fill}%` }} />
          <span className="pc-meter-mark" style={{ left: `calc(${fill}% - 1px)` }} />
        </>
      )}
    </span>
  );
};

// ---------------------------------------------------------------------------
// A seção
// ---------------------------------------------------------------------------

const CurationSection: React.FC<{
  sectionKey: CurationSectionKey;
  // Na roleta (ativos) — ou, nos exclusivos, quantos são.
  count: number;
  // Meta da raridade (os exclusivos não têm).
  goal?: number;
  // Desta raridade, fora da roleta.
  inactive?: number;
  // O que a grade mostra (depois dos filtros de tipo e de busca), em ordem.
  posters: CurationPoster[];
  // Algum filtro (tipo ou busca) está escondendo pôsteres desta seção.
  filtered: boolean;
  batch: number | null;
  effect: CurationEffect;
  size: CurationSize;
  onOpen: (key: CurationSectionKey, id: number) => void;
}> = ({ sectionKey, count, goal, inactive = 0, posters, filtered, batch, effect, size, onOpen }) => {
  const { t } = useTranslation();
  const headingId = `${sectionDomId(sectionKey)}-title`;
  const poker = sectionKey === 'poker';
  const inBatch = batch == null ? 0 : posters.filter((p) => p.batch === batch).length;

  return (
    <section id={sectionDomId(sectionKey)} aria-labelledby={headingId} className="pc-section" style={sectionTone(sectionKey)}>
      <header className="pc-head">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {poker ? <ChipFace kind="special" className="pc-head-gem" /> : <RarityGem rarity={sectionKey} glint={sectionKey === 'legendary'} className="pc-head-gem" />}
          <div className="min-w-0">
            <h2 id={headingId} className={`pc-display pc-head-name ${poker ? 'pc-gold' : ''}`}>
              {t(`curation.posters.sections.${sectionKey}`)}
            </h2>
            {poker && (
              <p className="mt-1 text-[12.5px] leading-snug" style={{ color: 'var(--pc-mist)' }}>
                {t('curation.posters.section.pokerNote')}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col items-start sm:items-end gap-1.5 w-full sm:w-auto sm:min-w-[220px]">
          <p className="pc-head-count flex items-baseline gap-1.5 text-[15px]" style={{ color: 'var(--pc-paper)' }}>
            {goal != null ? (
              <>
                <strong className="text-[22px] leading-none font-bold">{count}</strong>
                <span style={{ color: 'var(--pc-mist)' }}>{t('curation.posters.section.ofGoal', { goal })}</span>
              </>
            ) : (
              <>
                <strong className="text-[22px] leading-none font-bold">{count}</strong>
                <span style={{ color: 'var(--pc-mist)' }}>{t('curation.posters.section.posters', { count })}</span>
              </>
            )}
          </p>
          {goal != null && <GoalMeter count={count} goal={goal} className="w-full sm:w-[220px]" />}
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] leading-snug" style={{ color: 'var(--pc-mist)' }}>
            {goal != null && (
              <span className="inline-flex items-center gap-1">
                {count >= goal && <Check className="w-3.5 h-3.5" style={{ color: 'var(--pc-tone)' }} aria-hidden />}
                {goalStatus(t, count, goal)}
              </span>
            )}
            {inactive > 0 && <span>· {t('curation.posters.section.inactive', { count: inactive })}</span>}
            {filtered && <span>· {t('curation.posters.section.showing', { count: posters.length })}</span>}
            {batch != null && (
              <span style={{ color: inBatch ? '#FFE8A3' : undefined }}>· {t('curation.posters.section.inBatch', { count: inBatch, batch })}</span>
            )}
          </p>
        </div>
      </header>

      {posters.length === 0 ? (
        <p className="mt-4 px-1 text-sm" style={{ color: 'var(--pc-mist)' }}>
          {t('curation.posters.section.empty')}
        </p>
      ) : (
        <ul className="pc-grid mt-4" data-size={size}>
          {posters.map((poster) => (
            <li key={poster.id} className="min-w-0">
              <CurationTile
                poster={poster}
                sectionKey={sectionKey}
                effect={effect}
                size={size}
                highlight={batch != null && poster.batch === batch}
                dim={batch != null && poster.batch !== batch}
                onOpen={onOpen}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default CurationSection;
