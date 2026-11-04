import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useReducedMotion } from 'framer-motion';
import { Loader2, Lock, RefreshCw, WifiOff } from 'lucide-react';
import CurationControls from '../components/posterCuration/CurationControls';
import CurationSection from '../components/posterCuration/CurationSection';
import CurationSummary from '../components/posterCuration/CurationSummary';
import CurationDetail from '../components/posterCuration/CurationDetail';
import { RarityGem } from '../components/posterJackpot/CollectorMark';
import { FOCUS_RING } from '../lib/oracleTheme';
import { RARITIES, loadJackpotFont } from '../lib/posterJackpot';
import {
  CURATION_RARITIES,
  bySerial,
  curationErrorCode,
  curationTotals,
  fetchPosterCatalogReview,
  foldText,
  sectionDomId,
  type CurationCatalog,
  type CurationEffect,
  type CurationKind,
  type CurationPoster,
  type CurationSectionKey,
  type CurationSize,
} from '../lib/posterCuration';
import '../styles/posterJackpot.css';
import '../styles/posterCuration.css';

// Curadoria do catálogo de pôsteres (/curadoria/posteres, 04/11/2026).
//
// Pedido do Bruno: "Queria ver todos os pôsteres que adicionamos até agora lado
// a lado em suas respectivas categorias, para ver como eles estão funcionando
// como um conjunto e se está coerente." É a vitrine de trabalho da curadoria
// do Poster Jackpot: as quatro raridades (do lendário ao comum), cada uma com
// a contagem contra a meta, e os exclusivos do Pôster Poker à parte. A barra
// presa no alto aplica um efeito em todos de uma vez, destaca um lote (os
// outros esmaecem, para ver como a leva nova conversa com o resto), filtra
// filmes ou séries, muda a densidade da grade e busca por título. Tocar num
// pôster abre o detalhe, com setas para percorrer a raridade.
//
// Só os testadores do Poster Jackpot entram: a função do banco
// (get_poster_catalog_review) levanta 'forbidden' para os outros, e a página
// mostra "Página só para a curadoria". Não há link para cá no site ainda: o
// get_jackpot_state não diz quem é testador (ver NOTES da entrega).

const SIZE_KEY = 'cineoracle:posterCuration:size';
const readSize = (): CurationSize => {
  try {
    const value = localStorage.getItem(SIZE_KEY);
    return value === 's' || value === 'm' || value === 'l' ? value : 'm';
  } catch {
    return 'm';
  }
};
const writeSize = (value: CurationSize) => {
  try {
    localStorage.setItem(SIZE_KEY, value);
  } catch {
    // Sem armazenamento (aba anônima, bloqueado): vale só nesta visita.
  }
};

// A Cinzel sem enfeite (rótulos, título do pôster no detalhe). A Cinzel
// Decorative vem do loadJackpotFont; esta só é pedida nesta página.
let cinzelRequested = false;
function loadCinzelFont() {
  if (cinzelRequested || typeof document === 'undefined') return;
  cinzelRequested = true;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600;700&display=swap';
  document.head.appendChild(link);
}

type LoadState = { status: 'loading' } | { status: 'ready'; catalog: CurationCatalog } | { status: 'forbidden' } | { status: 'error' };
type OpenRef = { key: CurationSectionKey; id: number };

// Os exclusivos: do lendário ao comum e, dentro da raridade, pelo número.
const rarityRank = (p: CurationPoster) => RARITIES.indexOf(p.rarity);
const byRarityThenSerial = (a: CurationPoster, b: CurationPoster) => rarityRank(a) - rarityRank(b) || bySerial(a, b);

const BUTTON = `inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl text-sm font-semibold transition ${FOCUS_RING}`;

// Moldura dos estados de "não abriu" (sem permissão, erro).
const StatePanel: React.FC<{ icon: React.ReactNode; title: string; body: string; children: React.ReactNode }> = ({ icon, title, body, children }) => (
  <div className="max-w-xl mx-auto px-4 pt-10 sm:pt-16 pb-20">
    <div className="pc-panel px-6 py-9 sm:px-10 text-center">
      <span className="pc-panel-stars" aria-hidden />
      <div
        className="mx-auto grid place-items-center w-16 h-16 rounded-full"
        style={{ background: 'rgba(10,14,44,0.85)', boxShadow: 'inset 0 0 0 1.5px rgba(233,208,138,0.6), 0 0 30px -8px rgba(244,196,84,0.45)', color: '#F4C454' }}
      >
        {icon}
      </div>
      <div className="mt-4 flex justify-center gap-2.5" aria-hidden>
        {CURATION_RARITIES.map((rarity) => (
          <RarityGem key={rarity} rarity={rarity} className="w-5 h-5 opacity-70" />
        ))}
      </div>
      <h1 className="pc-display pc-gold mt-5 text-[25px] sm:text-[30px] font-black leading-tight">{title}</h1>
      <p className="mt-3 text-[15px] leading-relaxed" style={{ color: 'var(--pc-mist)' }}>
        {body}
      </p>
      <div className="mt-7 flex flex-wrap justify-center gap-3">{children}</div>
    </div>
  </div>
);

export default function PosterCuration() {
  const { t } = useTranslation();
  const reduceMotion = !!useReducedMotion();
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [effect, setEffect] = useState<CurationEffect>('none');
  const [batch, setBatch] = useState<number | null>(null);
  const [kind, setKind] = useState<CurationKind>('all');
  const [size, setSizeState] = useState<CurationSize>(readSize);
  const [query, setQuery] = useState('');
  const [barHeight, setBarHeight] = useState(64);
  const [openRef, setOpenRef] = useState<OpenRef | null>(null);

  const fetchCatalog = useCallback(async () => {
    setLoad({ status: 'loading' });
    try {
      const catalog = await fetchPosterCatalogReview();
      setLoad({ status: 'ready', catalog });
    } catch (error) {
      console.error('Poster curation catalog:', error);
      setLoad({ status: curationErrorCode(error) === 'forbidden' ? 'forbidden' : 'error' });
    }
  }, []);

  useEffect(() => {
    loadJackpotFont();
    loadCinzelFont();
    fetchCatalog();
  }, [fetchCatalog]);

  const setSize = useCallback((value: CurationSize) => {
    setSizeState(value);
    writeSize(value);
  }, []);

  const catalog = load.status === 'ready' ? load.catalog : null;
  const totals = useMemo(() => (catalog ? curationTotals(catalog) : null), [catalog]);

  // Quantos pôsteres cada lote tem (no catálogo inteiro, sem os filtros).
  const batchCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    catalog?.posters.forEach((p) => {
      if (p.batch) counts[p.batch] = (counts[p.batch] || 0) + 1;
    });
    return counts;
  }, [catalog]);

  // Os títulos (pt e en) já sem acento, para a busca não refazer a conta a
  // cada letra.
  const searchIndex = useMemo(() => {
    const index = new Map<number, string>();
    catalog?.posters.forEach((p) => index.set(p.id, foldText(`${p.title_pt || ''} ${p.title_en || ''}`)));
    return index;
  }, [catalog]);

  const needle = foldText(query);
  const sections = useMemo(() => {
    if (!catalog) return [];
    const matches = (p: CurationPoster) =>
      (kind === 'all' || p.media_type === kind) && (!needle || (searchIndex.get(p.id) || '').includes(needle));
    const keys: CurationSectionKey[] = [...CURATION_RARITIES, 'poker'];
    return keys
      .map((key) => {
        const all = catalog.posters
          .filter((p) => (key === 'poker' ? p.exclusive === 'poker' : !p.exclusive && p.rarity === key))
          .sort(key === 'poker' ? byRarityThenSerial : bySerial);
        return { key, all, visible: all.filter(matches) };
      })
      .filter((section) => section.key !== 'poker' || section.all.length > 0);
  }, [catalog, kind, needle, searchIndex]);

  const filtered = kind !== 'all' || !!needle;
  const results = needle ? sections.reduce((sum, section) => sum + section.visible.length, 0) : null;
  // Com busca, só as seções que acharam alguma coisa (senão são quatro
  // cabeçalhos vazios até o resultado). Sem busca, todas, mesmo vazias.
  const shownSections = needle ? sections.filter((section) => section.visible.length > 0) : sections;

  // Buscou ou trocou o tipo com a página rolada lá embaixo: a grade encolhe e
  // a pessoa ficaria olhando o vazio. Volta para o começo das seções, logo
  // abaixo da barra (só se já tinha passado dele).
  const sectionsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sectionsRef.current;
    if (!el) return;
    const barBottom = document.querySelector('.pc-bar')?.getBoundingClientRect().bottom ?? 0;
    const top = el.getBoundingClientRect().top;
    if (top < barBottom) window.scrollTo({ top: window.scrollY + top - barBottom - 8, behavior: 'instant' });
  }, [needle, kind]);

  // O pôster aberto na folha: a posição é dentro do que a seção mostra agora.
  const openSection = openRef ? sections.find((section) => section.key === openRef.key) : undefined;
  const openList = openSection?.visible || [];
  const openIndex = openRef ? openList.findIndex((p) => p.id === openRef.id) : -1;
  const openPoster = openIndex >= 0 ? openList[openIndex] : null;

  // Um filtro tirou da grade o pôster aberto: a folha fecha.
  useEffect(() => {
    if (openRef && catalog && openIndex < 0) setOpenRef(null);
  }, [openRef, catalog, openIndex]);

  const onOpen = useCallback((key: CurationSectionKey, id: number) => setOpenRef({ key, id }), []);

  // Ao fechar, o foco volta para o pôster que estava na folha (que pode não
  // ser o que abriu, depois das setas), já rolado para a vista.
  const onClose = useCallback(() => {
    const current = openRef;
    setOpenRef(null);
    if (!current) return;
    requestAnimationFrame(() => {
      const tile = document.querySelector<HTMLElement>(`[data-pc-tile="${current.key}:${current.id}"]`);
      if (!tile) return;
      tile.focus({ preventScroll: true });
      tile.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'instant' : 'smooth' });
    });
  }, [openRef, reduceMotion]);

  const prevPoster = openIndex > 0 ? openList[openIndex - 1] : null;
  const nextPoster = openIndex >= 0 && openIndex < openList.length - 1 ? openList[openIndex + 1] : null;
  const onPrev = useMemo(
    () => (prevPoster && openRef ? () => setOpenRef({ key: openRef.key, id: prevPoster.id }) : undefined),
    [prevPoster, openRef]
  );
  const onNext = useMemo(
    () => (nextPoster && openRef ? () => setOpenRef({ key: openRef.key, id: nextPoster.id }) : undefined),
    [nextPoster, openRef]
  );
  const neighbors = useMemo(() => [prevPoster, nextPoster].filter((p): p is CurationPoster => !!p), [prevPoster, nextPoster]);

  // O html do site rola sempre suave (index.css); com "reduzir movimento" o
  // pulo é seco ('instant', e não 'auto', que seguiria o suave do CSS).
  const onJump = useCallback(
    (key: CurationSectionKey) => {
      document.getElementById(sectionDomId(key))?.scrollIntoView({ behavior: reduceMotion ? 'instant' : 'smooth', block: 'start' });
    },
    [reduceMotion]
  );

  return (
    <div className="pc-page pb-16" style={{ ['--pc-bar-h' as string]: `${barHeight}px` }}>
      <div className="pc-backdrop" aria-hidden />

      {load.status === 'loading' && (
        <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3" role="status">
          <Loader2 className="w-8 h-8 animate-spin text-amber-200" aria-hidden />
          <p className="text-sm font-medium" style={{ color: 'var(--pc-mist)' }}>
            {t('curation.posters.loading')}
          </p>
        </div>
      )}

      {load.status === 'forbidden' && (
        <StatePanel icon={<Lock className="w-7 h-7" aria-hidden />} title={t('curation.posters.forbidden.title')} body={t('curation.posters.forbidden.body')}>
          <Link to="/" className={BUTTON} style={{ background: 'var(--pc-paper)', color: '#221B36' }}>
            {t('curation.posters.forbidden.home')}
          </Link>
        </StatePanel>
      )}

      {load.status === 'error' && (
        <StatePanel icon={<WifiOff className="w-7 h-7" aria-hidden />} title={t('curation.posters.error.title')} body={t('curation.posters.error.body')}>
          <button type="button" onClick={fetchCatalog} className={BUTTON} style={{ background: 'var(--pc-paper)', color: '#221B36' }}>
            <RefreshCw className="w-4 h-4" aria-hidden />
            {t('curation.posters.error.retry')}
          </button>
          <Link to="/" className={BUTTON} style={{ color: 'var(--pc-paper)', boxShadow: 'inset 0 0 0 1px rgba(243,234,211,0.3)' }}>
            {t('curation.posters.forbidden.home')}
          </Link>
        </StatePanel>
      )}

      {catalog && totals && (
        <>
          <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 pt-3 sm:pt-6 pb-5">
            <header>
              <p className="pc-label">{t('curation.posters.eyebrow')}</p>
              <h1 className="pc-display pc-gold mt-1.5 text-[28px] sm:text-[38px] font-black leading-[1.08]">{t('curation.posters.title')}</h1>
              <p className="mt-2 max-w-2xl text-[14.5px] leading-relaxed" style={{ color: 'var(--pc-mist)' }}>
                {t('curation.posters.lead')}
              </p>
            </header>
            <div className="mt-5">
              <CurationSummary catalog={catalog} totals={totals} onJump={onJump} />
            </div>
          </div>

          <CurationControls
            effect={effect}
            onEffect={setEffect}
            batch={batch}
            onBatch={setBatch}
            batches={totals.batches}
            batchCounts={batchCounts}
            kind={kind}
            onKind={setKind}
            size={size}
            onSize={setSize}
            query={query}
            onQuery={setQuery}
            results={results}
            onHeight={setBarHeight}
          />

          <div ref={sectionsRef} className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 pt-6 flex flex-col gap-10 sm:gap-12">
            {shownSections.length === 0 && (
              <p className="py-16 text-center text-[15px]" style={{ color: 'var(--pc-mist)' }}>
                {t('curation.posters.searchEmpty', { query: query.trim() })}
              </p>
            )}
            {shownSections.map((section) => (
              <CurationSection
                key={section.key}
                sectionKey={section.key}
                count={section.key === 'poker' ? section.all.length : totals.byRarity[section.key]}
                goal={section.key === 'poker' ? undefined : catalog.goal[section.key]}
                inactive={section.key === 'poker' ? 0 : totals.inactiveByRarity[section.key]}
                posters={section.visible}
                filtered={filtered}
                batch={batch}
                effect={effect}
                size={size}
                onOpen={onOpen}
              />
            ))}
          </div>

          <CurationDetail
            poster={openPoster}
            sectionKey={openPoster ? openRef?.key ?? null : null}
            index={openIndex}
            total={openList.length}
            effect={effect}
            onPrev={onPrev}
            onNext={onNext}
            onClose={onClose}
            neighbors={neighbors}
          />
        </>
      )}
    </div>
  );
}
