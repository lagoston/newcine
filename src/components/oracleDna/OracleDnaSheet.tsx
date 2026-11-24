import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Bookmark, ChevronDown, Dna, Film, Info, Loader2, RotateCcw, X } from 'lucide-react';
import OracleSheet, { SheetFade } from '../OracleSheet';
import OptimizedPoster from '../OptimizedPoster';
import DnaHelix, { DNA_ACCENT } from './DnaHelix';
import { posterOf, titleOf } from '../oracleAcervo/titles';
import {
  DNA_CLOSEST,
  DNA_SECTIONS,
  familyOf,
  getOracleDna,
  peekOracleDna,
  sharesThemes,
  type DnaMedia,
  type DnaPredLabel,
  type DnaRelative,
  type DnaResult,
  type DnaSection,
} from '../../lib/oracleDna';
import { MOOD_BY_KEY } from '../../lib/moods';
import { FOCUS_RING, INK, MIST, ORACLE_BY_ID, PAPER, PIXEL, VELVET, ratingTone, withAlpha, type OracleId } from '../../lib/oracleTheme';

import EquippedCover from '../EquippedCover';
// Oracle DNA (18/11/2026) — o símbolo de DNA na linha de ações do menu do
// título abre esta gaveta POR CIMA do menu: o oráculo "sequencia" o título e
// mostra a família dele em todas as prateleiras (qualquer oráculo, qualquer
// humor, filme ou série). O cálculo é do banco (public.oracle_dna) — ver
// lib/oracleDna.ts.
//
// 24/11/2026 — REDESENHO ("tudo muito colorido e uma explosão de informações
// que se confundem"). O que saiu e por quê:
//   • doze cores de gene, três bolinhas de raridade e a contagem em cada ficha
//     do genoma: as fichas agora são todas iguais (a ordem já é do mais raro
//     ao mais comum); só a ficha escolhida se destaca;
//   • as seis lentes em abas: mostravam quase os mesmos títulos (cada parente
//     aparecia em duas, em média). Viraram seções de uma página só, e cada
//     parente aparece uma vez (lib/oracleDna.ts → familyOf);
//   • em cada parente: a régua colorida das quatro fitas, a porcentagem em
//     quatro cores, o avatar do oráculo, o humor colorido, os genes cada um
//     numa cor, os ícones dos porquês, a bandeira do país, "anime" e "preto e
//     branco" (o "corpo" pesa no máximo 0,1 da conta e só quando os temas já
//     batem: não é motivo para mostrar);
//   • a porcentagem de quem NÃO divide temas (seção "A mesma mão"): era sempre
//     39% ou 50%, o piso do diretor em comum, e não dizia nada.
// O que ficou: a voz do oráculo, a hélice, o genoma com o filtro por gene, e
// em cada parente o título, o ano e o humor, os genes em comum, a mão em
// comum, a afinidade e a sua nota (ou a prevista). Duas cores de texto, uma
// cor de destaque (a do DNA) e a cor da nota, que é a língua do site inteiro.
//
// Tocar num parente abre o menu dele por cima desta gaveta (fechar volta
// para cá); quem cuida disso é o menu do filme (onOpenTitle).

interface OracleDnaSheetProps {
  open: boolean;
  onClose: () => void;
  titleId: number;
  mediaType: DnaMedia;
  title: string;
  year?: number | null;
  onOpenTitle: (id: number, mediaType: DnaMedia) => void;
  // O parente que está abrindo agora (mostra o carregando no pôster).
  loadingId?: number | null;
  // Com o menu de outro título aberto por cima, o Esc é dele.
  escapeEnabled?: boolean;
  // Muda quando o menu aberto por cima fecha: o DNA é lido de novo sem
  // apagar a tela (a pessoa pode ter dado nota a um parente).
  refreshKey?: number;
  // 18/11/2026: o z do menu do título que abriu o DNA (ele pode estar acima
  // do padrão, vindo do Jackpot ou das Resenhas); sem ele o DNA abria atrás.
  zIndexClass?: string;
}

// Frase do oráculo: fixa por título (o mesmo filme, a mesma frase).
const VOICE_COUNT = 3;
// Quantos parentes cada seção mostra antes do "Mostrar mais".
const SECTION_FIRST = 4;
// As seções que levam uma linha explicando o critério.
const HINTED: DnaSection[] = ['roots', 'heirs', 'screen', 'hand'];

const OracleDnaSheet: React.FC<OracleDnaSheetProps> = ({
  open,
  onClose,
  titleId,
  mediaType,
  title,
  year = null,
  onOpenTitle,
  loadingId = null,
  escapeEnabled = true,
  refreshKey = 0,
  zIndexClass = 'z-[9999]',
}) => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language || 'pt';
  const isPt = lang.startsWith('pt');

  const [data, setData] = useState<DnaResult | null>(() => (open ? peekOracleDna(titleId, mediaType) : null));
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [gene, setGene] = useState<number | null>(null);
  const [howOpen, setHowOpen] = useState(false);
  const [expanded, setExpanded] = useState<DnaSection[]>([]);

  // Título novo (ou gaveta reaberta): filtro e seções do zero.
  const key = `${mediaType}:${titleId}`;
  useEffect(() => {
    setGene(null);
    setHowOpen(false);
    setExpanded([]);
  }, [key]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const cached = peekOracleDna(titleId, mediaType);
    if (cached) {
      setData(cached);
      setStatus('ready');
      return;
    }
    setData(null);
    setStatus('loading');
    getOracleDna(titleId, mediaType)
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setStatus('ready');
      })
      .catch(() => !cancelled && setStatus('error'));
    return () => {
      cancelled = true;
    };
  }, [open, titleId, mediaType, attempt]);

  // Voltou do menu de um parente: lê de novo por trás, sem apagar a tela.
  const firstRefresh = useRef(refreshKey);
  useEffect(() => {
    if (!open || refreshKey === firstRefresh.current) return;
    firstRefresh.current = refreshKey;
    let cancelled = false;
    getOracleDna(titleId, mediaType, { fresh: true })
      .then((result) => !cancelled && setData(result))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [refreshKey, open, titleId, mediaType]);

  const items = useMemo(() => data?.items ?? [], [data]);
  const source = data?.source ?? null;
  const genome = useMemo(() => data?.genome ?? [], [data]);
  const sourceYear = source?.year ?? year ?? null;

  // A família em seções; cada parente aparece uma vez (o filtro por gene vale
  // para todas).
  const family = useMemo(() => familyOf(items, sourceYear, mediaType, gene), [items, sourceYear, mediaType, gene]);
  const sectionsShown = DNA_SECTIONS.filter((section) => family[section].length > 0);

  // Quantos parentes carregam cada gene do genoma (sem nenhum, a ficha não filtra).
  const carriers = useMemo(() => {
    const map = new Map<number, number>();
    items.forEach((it) => it.shared.forEach((id) => map.set(id, (map.get(id) || 0) + 1)));
    return map;
  }, [items]);
  const canFilter = genome.some((g) => (carriers.get(g.id) || 0) > 0);

  const geneLabel = (id: number) => {
    const g = genome.find((entry) => entry.id === id) || data?.genes[String(id)];
    if (!g) return null;
    return isPt ? g.pt : g.en;
  };

  // A voz: o oráculo da prateleira do título; fora das prateleiras, o do
  // parente mais forte (ou a Cypher, que mora no escuro).
  const voiceOracle: OracleId = source?.oracle ?? items[0]?.oracle ?? 'cypher';
  const voice = ORACLE_BY_ID[voiceOracle];
  // Sem nenhum parente a frase ("olha a família que apareceu") desmentia a
  // tela: quem fala é o aviso de órfão.
  const voiceLine = !source || items.length === 0
    ? null
    : !source.in_shelf
      ? t('oracleDna.voice.outside')
      : t(`oracleDna.voice.${voiceOracle}.${titleId % VOICE_COUNT}`);

  const predLabel: DnaPredLabel = data?.predLabel ?? 'hidden';
  const sectionTitle = (section: DnaSection) =>
    section === 'screen' ? t(mediaType === 'tv' ? 'oracleDna.section.screenMovies' : 'oracleDna.section.screenSeries') : t(`oracleDna.section.${section}`);

  // ---------- Topo: a voz, a hélice e o genoma ----------
  const hero = (
    <section>
      {voiceLine && (
        <SheetFade id={`voice-${key}`} className="flex items-start gap-3">
          <img src={voice.avatar} alt="" aria-hidden className="w-8 h-8 mt-0.5 rounded-full object-cover shrink-0 ring-1 ring-white/15" />
          <p className="min-w-0 text-[14.5px] leading-snug" style={{ color: PAPER }}>
            <span className="sr-only">{voice.name}: </span>“{voiceLine}”
            <span className="block mt-1 text-xs" style={{ color: MIST }} aria-hidden>
              {voice.name}
            </span>
          </p>
        </SheetFade>
      )}

      <DnaHelix className={voiceLine ? 'mt-4' : ''} />

      <div className="mt-3">
        {status === 'loading' ? (
          <p className="text-sm" style={{ color: MIST }} aria-live="polite">
            {t('oracleDna.sequencing')}
          </p>
        ) : status === 'ready' && source && source.genes > 0 ? (
          <>
            <h3 style={{ ...PIXEL, color: PAPER }} className="text-lg leading-tight">
              {t('oracleDna.genomeTitle')}
            </h3>
            {genome.length > 0 ? (
              <>
                <p className="mt-1 text-[12.5px] leading-snug" style={{ color: MIST }}>
                  {t('oracleDna.genomeCount', { count: source.genes })}
                  {genome.length < source.genes && t('oracleDna.genomeNamed', { count: genome.length })}.
                  {canFilter && ` ${t('oracleDna.genomeTap')}`}
                </p>
                <ul className="mt-2.5 flex flex-wrap gap-1.5" aria-label={t('oracleDna.genomeAria')}>
                  {genome.map((g) => {
                    const count = carriers.get(g.id) || 0;
                    const active = gene === g.id;
                    const label = isPt ? g.pt : g.en;
                    return (
                      <li key={g.id}>
                        <button
                          type="button"
                          disabled={count === 0}
                          aria-pressed={active}
                          onClick={() => setGene(active ? null : g.id)}
                          aria-label={t('oracleDna.geneAria', { gene: label, count })}
                          className={`inline-flex items-center h-8 px-3 rounded-full text-[13px] font-medium transition-colors disabled:cursor-default ${count > 0 && !active ? 'hover:bg-white/[0.12]' : ''} ${FOCUS_RING}`}
                          style={
                            active
                              ? { background: PAPER, color: INK }
                              : count > 0
                                ? { background: 'rgba(255,255,255,0.07)', color: PAPER }
                                : { color: withAlpha(MIST, 0.62), boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.07)' }
                          }
                        >
                          {label}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : (
              <p className="mt-1.5 text-sm leading-snug" style={{ color: MIST }}>
                {t('oracleDna.genomeUnnamed')}
              </p>
            )}
          </>
        ) : null}
      </div>
    </section>
  );

  // ---------- Um parente ----------
  const renderRelative = (rel: DnaRelative, section: DnaSection) => {
    const name = titleOf(rel, lang) || '—';
    const poster = posterOf(rel, lang);
    const mood = MOOD_BY_KEY[rel.mood];
    const kin = sharesThemes(rel);
    const loading = loadingId === rel.id;

    // Onde ele mora: o tipo (só quando é da outra tela e a seção não diz), o
    // ano e o humor da prateleira.
    const meta = [
      rel.media_type !== mediaType && section !== 'screen' ? t(rel.media_type === 'tv' ? 'oracleDna.series' : 'oracleDna.film') : null,
      rel.year ? String(rel.year) : null,
      mood ? t(mood.labelKey) : ORACLE_BY_ID[rel.oracle].name,
    ].filter(Boolean);

    // Os genes em comum que têm nome (até três); o resto vira "+N".
    const named = rel.shared.filter((id) => geneLabel(id));
    const shownGenes = named.slice(0, 3);
    const moreGenes = rel.n_shared - shownGenes.length;

    // A mão em comum e a plateia: no máximo dois, do mais forte ao mais leve.
    const whys: string[] = [];
    // Série com série: o "diretor" do banco é quem criou a série.
    if (rel.same_director) whys.push(t(mediaType === 'tv' && rel.media_type === 'tv' ? 'oracleDna.why.creator' : 'oracleDna.why.director'));
    if (rel.cast.length > 0) whys.push(t('oracleDna.why.cast', { name: rel.cast[0] }));
    if (rel.co_lovers >= 2) whys.push(t('oracleDna.why.crowd', { count: rel.co_lovers }));
    const shownWhys = whys.slice(0, 2);

    // A sua relação com ele: a nota, ou a watchlist e a nota prevista.
    const rated = rel.my_rating !== null;
    const pred = !rated && rel.pred !== null && predLabel !== 'hidden' ? rel.pred : null;

    const aria = kin
      ? rel.year
        ? t('oracleDna.openRelative', { title: name, year: rel.year, pct: rel.pct })
        : t('oracleDna.openRelativeNoYear', { title: name, pct: rel.pct })
      : rel.year
        ? t('oracleDna.openTitle', { title: name, year: rel.year })
        : t('oracleDna.openTitleNoYear', { title: name });

    return (
      <li key={`${rel.media_type}:${rel.id}`}>
        <button
          type="button"
          onClick={() => onOpenTitle(rel.id, rel.media_type)}
          aria-label={aria}
          className={`w-full flex items-start gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-white/[0.05] active:bg-white/[0.08] ${FOCUS_RING}`}
        >
          <span className="relative w-[52px] shrink-0 aspect-[2/3] rounded-md overflow-hidden ring-1 ring-white/10" style={{ background: VELVET }}>
            {poster ? (
              <EquippedCover id={rel.id} type={rel.media_type} size="w185" animated={false}>
                <OptimizedPoster src={`https://image.tmdb.org/t/p/w154${poster}`} alt="" className="absolute inset-0 w-full h-full object-cover" />
              </EquippedCover>
            ) : (
              <span className="absolute inset-0 grid place-items-center" style={{ color: MIST }}>
                <Film className="w-4 h-4" aria-hidden />
              </span>
            )}
            {loading && (
              <span className="absolute inset-0 bg-black/55 grid place-items-center">
                <Loader2 className="w-4 h-4 text-white animate-spin" aria-hidden />
              </span>
            )}
          </span>

          <span className="min-w-0 flex-1">
            <span className="block font-medium leading-snug line-clamp-2 break-words" style={{ color: PAPER }}>
              {name}
            </span>
            <span className="block mt-0.5 text-[12.5px] truncate" style={{ color: MIST }}>
              {meta.join(' · ')}
            </span>

            {(shownGenes.length > 0 || moreGenes > 0) && (
              <span className="mt-1.5 flex items-start gap-1.5 text-[12.5px] leading-snug">
                <Dna className="w-3.5 h-3.5 mt-[2px] shrink-0" style={{ color: MIST }} aria-hidden />
                <span className="min-w-0 line-clamp-2 break-words" style={{ color: withAlpha(PAPER, 0.84) }}>
                  <span className="sr-only">{t('oracleDna.sharedAria', { count: rel.n_shared })}: </span>
                  {shownGenes.map((id, i) => (
                    <React.Fragment key={id}>
                      {i > 0 && ', '}
                      <span style={gene === id ? { color: PAPER, fontWeight: 700 } : undefined}>{geneLabel(id)}</span>
                    </React.Fragment>
                  ))}
                  {moreGenes > 0 && (
                    <span className="tabular-nums" style={{ color: MIST }}>
                      {/* espaço que não quebra: o "+1" não fica sozinho na linha de baixo */}
                      {shownGenes.length > 0 ? `\u00A0${t('oracleDna.moreGenes', { count: moreGenes })}` : t('oracleDna.unnamedGenes', { count: moreGenes })}
                    </span>
                  )}
                </span>
              </span>
            )}

            {shownWhys.length > 0 && (
              <span className="block mt-1 text-xs leading-snug" style={{ color: MIST }}>
                {shownWhys.join(' · ')}
              </span>
            )}
          </span>

          <span className="shrink-0 pl-1 text-right">
            {kin && (
              <span style={{ ...PIXEL, color: PAPER }} className="block text-[17px] leading-none tabular-nums" title={t('oracleDna.pctHint')}>
                {rel.pct}%
              </span>
            )}
            {rated ? (
              <span className={`block text-[11.5px] font-semibold leading-none ${kin ? 'mt-2' : 'mt-0.5'}`} style={{ color: ratingTone(rel.my_rating).color }}>
                {t('oracleDna.yours', { n: rel.my_rating })}
              </span>
            ) : rel.in_watchlist || pred !== null ? (
              <span
                className={`inline-flex items-center justify-end gap-1 text-[11.5px] leading-none ${kin ? 'mt-2' : 'mt-0.5'}`}
                style={{ color: MIST }}
                title={pred !== null ? t('oracleDna.predHint') : undefined}
              >
                {rel.in_watchlist && (
                  <>
                    <Bookmark className="w-3 h-3" aria-hidden />
                    <span className={pred !== null ? 'sr-only' : undefined}>{t('oracleDna.saved')}</span>
                  </>
                )}
                {pred !== null && (predLabel === 'guess' ? t('acervo.pred.guess', { n: pred }) : t('oracleDna.predicted', { n: pred }))}
              </span>
            ) : null}
          </span>
        </button>
      </li>
    );
  };

  // ---------- Uma seção da família ----------
  const renderSection = (section: DnaSection, index: number) => {
    const list = family[section];
    const first = section === 'closest' ? DNA_CLOSEST : SECTION_FIRST;
    // Um só escondido não vale um botão: a seção mostra todos.
    const showAll = expanded.includes(section) || list.length <= first + 1;
    const shown = showAll ? list : list.slice(0, first);
    const hidden = list.length - shown.length;
    const headingId = `dna-section-${section}`;
    return (
      <section key={section} aria-labelledby={headingId} className={index === 0 ? 'mt-7' : 'mt-6'}>
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
          <h3 id={headingId} style={{ ...PIXEL, color: PAPER }} className="text-lg leading-tight">
            {sectionTitle(section)}
          </h3>
          {HINTED.includes(section) && (
            <p className="text-[12.5px] leading-snug" style={{ color: MIST }}>
              {t(`oracleDna.sectionHint.${section}`)}
            </p>
          )}
        </div>
        <ol className="mt-1.5 -mx-2">{shown.map((rel) => renderRelative(rel, section))}</ol>
        {hidden > 0 && (
          <button
            type="button"
            onClick={() => setExpanded((current) => [...current, section])}
            className={`mt-0.5 inline-flex items-center gap-1 h-9 px-2 -ml-2 rounded-lg text-[13px] font-medium transition-colors hover:bg-white/[0.06] ${FOCUS_RING}`}
            style={{ color: MIST }}
          >
            {t('oracleDna.more', { count: hidden })}
            <ChevronDown className="w-4 h-4" aria-hidden />
          </button>
        )}
      </section>
    );
  };

  // ---------- Corpo ----------
  let body: React.ReactNode = null;
  if (status === 'loading') {
    body = (
      <ul className="mt-7 space-y-2" aria-busy="true" aria-label={t('common.loading')}>
        {[0, 1, 2, 3].map((i) => (
          <li key={i} className="flex items-center gap-3 py-2">
            <span className="w-[52px] aspect-[2/3] rounded-md animate-pulse" style={{ background: VELVET }} />
            <span className="flex-1 space-y-2">
              <span className="block h-4 w-3/5 rounded animate-pulse" style={{ background: VELVET }} />
              <span className="block h-3 w-2/5 rounded animate-pulse" style={{ background: VELVET }} />
              <span className="block h-3 w-4/5 rounded animate-pulse" style={{ background: VELVET }} />
            </span>
          </li>
        ))}
      </ul>
    );
  } else if (status === 'error') {
    body = (
      <div className="mt-6 rounded-xl px-4 py-4 ring-1 ring-white/10" style={{ background: VELVET }}>
        <p className="flex items-start gap-2 text-sm" style={{ color: PAPER }}>
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: MIST }} aria-hidden />
          {t('oracleDna.error')}
        </p>
        <button
          type="button"
          onClick={() => setAttempt((n) => n + 1)}
          className={`mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm ring-1 ring-white/15 hover:bg-white/10 transition ${FOCUS_RING}`}
          style={{ color: PAPER }}
        >
          <RotateCcw className="w-3.5 h-3.5" aria-hidden />
          {t('oracleDna.retry')}
        </button>
      </div>
    );
  } else if (items.length === 0) {
    body = (
      <p className="mt-6 rounded-xl px-4 py-4 text-[15px] leading-snug ring-1 ring-white/10" style={{ background: VELVET, color: PAPER }}>
        {source && source.genes === 0 ? t('oracleDna.noGenes') : t('oracleDna.orphan')}
      </p>
    );
  } else {
    body = (
      <>
        {gene !== null && (
          <div className="mt-5">
            <button
              type="button"
              onClick={() => setGene(null)}
              className={`inline-flex items-center gap-1.5 h-8 pl-3 pr-2 rounded-full text-[13px] ring-1 ring-white/15 hover:bg-white/10 transition ${FOCUS_RING}`}
              style={{ color: PAPER }}
            >
              {t('oracleDna.onlyGene', { gene: geneLabel(gene) || '' })}
              <X className="w-4 h-4" style={{ color: MIST }} aria-hidden />
              <span className="sr-only">{t('oracleDna.clearGene')}</span>
            </button>
          </div>
        )}
        <SheetFade id={gene ?? 'all'}>
          {sectionsShown.length > 0 ? (
            sectionsShown.map(renderSection)
          ) : (
            <p className="mt-5 text-sm" style={{ color: MIST }}>
              {t('oracleDna.emptyGene')}
            </p>
          )}
        </SheetFade>
      </>
    );
  }

  // ---------- Como se lê ----------
  const how = status === 'ready' && items.length > 0 && (
    <section className="mt-7 pt-4 border-t border-white/[0.07]">
      <button
        type="button"
        onClick={() => setHowOpen((v) => !v)}
        aria-expanded={howOpen}
        className={`inline-flex items-center gap-2 text-[13px] font-medium rounded ${FOCUS_RING}`}
        style={{ color: MIST }}
      >
        <Info className="w-4 h-4" aria-hidden />
        {t('oracleDna.how.title')}
        <ChevronDown className={`w-4 h-4 transition-transform ${howOpen ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {howOpen && (
        <SheetFade id="how" className="mt-3 space-y-2.5 max-w-[62ch] text-[13px] leading-relaxed">
          <p style={{ color: PAPER }}>{t('oracleDna.how.genes')}</p>
          <p style={{ color: PAPER }}>{t('oracleDna.how.pct')}</p>
          <p style={{ color: MIST }}>{t('oracleDna.how.note')}</p>
        </SheetFade>
      )}
    </section>
  );

  return (
    <OracleSheet
      open={open}
      onClose={onClose}
      title={t('oracleDna.title')}
      subtitle={[title, year].filter(Boolean).join(' · ')}
      leading={
        <span className="grid place-items-center w-10 h-10 shrink-0 rounded-xl" style={{ background: withAlpha(DNA_ACCENT, 0.12), color: DNA_ACCENT }}>
          <Dna className="w-5 h-5" aria-hidden />
        </span>
      }
      size="lg"
      zIndexClass={zIndexClass}
      escapeEnabled={escapeEnabled}
      contentKey={key}
    >
      {hero}
      {body}
      {how}
    </OracleSheet>
  );
};

export default OracleDnaSheet;
