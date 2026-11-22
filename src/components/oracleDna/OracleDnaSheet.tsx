import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Bookmark, Clapperboard, Film, Info, Loader2, RotateCcw, Tv, Users, X } from 'lucide-react';
import OracleSheet, { SheetFade } from '../OracleSheet';
import OptimizedPoster from '../OptimizedPoster';
import DnaHelix from './DnaHelix';
import { posterOf, titleOf } from '../oracleAcervo/titles';
import {
  DNA_LENSES,
  GENE_COLORS,
  geneRarity,
  getOracleDna,
  peekOracleDna,
  relativesFor,
  type DnaLens,
  type DnaMedia,
  type DnaPredLabel,
  type DnaRelative,
  type DnaResult,
} from '../../lib/oracleDna';
import { MOOD_BY_KEY } from '../../lib/moods';
import { FOCUS_RING, INK, MIST, ORACLE_BY_ID, PAPER, PIXEL, VELVET, ratingTone, withAlpha, type OracleId } from '../../lib/oracleTheme';

import EquippedCover from '../EquippedCover';
// Oracle DNA (18/11/2026) — o botão do menu do filme abre esta gaveta POR
// CIMA do menu: o oráculo "sequencia" o título e mostra os parentes dele em
// todas as prateleiras (qualquer oráculo, qualquer humor, filme ou série).
//
//   • No alto, a voz do oráculo (frases escritas à mão, sem IA), a hélice e
//     o genoma: os genes do título que têm nome, do mais raro ao mais comum.
//     Tocar num gene filtra os parentes que carregam aquele gene.
//   • As lentes: Gêmeos, Outras prateleiras (o mesmo tema em outro humor ou
//     com outro oráculo), Raízes (mais antigos), Herdeiros (mais novos), Na
//     outra tela (série ↔ filme) e Assinatura (mesmo diretor ou elenco).
//   • Cada parente: a afinidade (%), os genes em comum, o porquê (diretor,
//     elenco, cinéfilos que amaram os dois, país) e a sua nota / a prevista.
//   • Tocar num parente abre o menu dele por cima desta gaveta (fechar volta
//     para cá); quem cuida disso é o menu do filme (onOpenTitle).
// O cálculo é do banco (public.oracle_dna) — ver lib/oracleDna.ts.

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

const PCT_TONES: { min: number; color: string }[] = [
  { min: 85, color: '#F0ABFC' },
  { min: 70, color: '#5EEAD4' },
  { min: 55, color: '#FDE68A' },
  { min: 0, color: MIST },
];
const pctColor = (pct: number) => (PCT_TONES.find((tone) => pct >= tone.min) || PCT_TONES[PCT_TONES.length - 1]).color;

// As quatro fitas, nas cores usadas na régua de cada parente e na explicação.
const STRANDS = [
  { key: 'themes', color: '#E879F9' },
  { key: 'author', color: '#FB923C' },
  { key: 'crowd', color: '#38BDF8' },
  { key: 'body', color: '#A3E635' },
] as const;

const countryFlag = (code: string) => {
  if (!code || code.length !== 2) return '🌍';
  return String.fromCodePoint(...code.toUpperCase().split('').map((c) => 127397 + c.charCodeAt(0)));
};

const regionName = (code: string, lang: string) => {
  try {
    return new Intl.DisplayNames([lang], { type: 'region' }).of(code) || code;
  } catch {
    return code;
  }
};

// Frase do oráculo: fixa por título (o mesmo filme, a mesma frase).
const VOICE_COUNT = 3;

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
  const [lens, setLens] = useState<DnaLens>('twins');
  const [gene, setGene] = useState<number | null>(null);
  const [howOpen, setHowOpen] = useState(false);

  // Título novo (ou gaveta reaberta): lente e filtro do zero.
  const key = `${mediaType}:${titleId}`;
  useEffect(() => {
    setLens('twins');
    setGene(null);
    setHowOpen(false);
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

  // As lentes com algum parente (as vazias somem); a contagem respeita o gene.
  const lensCounts = useMemo(() => {
    const out = {} as Record<DnaLens, number>;
    DNA_LENSES.forEach((l) => {
      out[l] = relativesFor(items, l, gene).length;
    });
    return out;
  }, [items, gene]);
  const lensesShown = useMemo(
    () => DNA_LENSES.filter((l) => items.some((i) => i.lenses.includes(l))),
    [items]
  );
  useEffect(() => {
    if (lensesShown.length && !lensesShown.includes(lens)) setLens(lensesShown[0]);
  }, [lensesShown, lens]);

  const list = useMemo(() => relativesFor(items, lens, gene), [items, lens, gene]);

  // Genoma: a cor de cada gene e quantos parentes carregam cada um.
  const genome = useMemo(() => data?.genome ?? [], [data]);
  const geneColor = useMemo(() => {
    const map = new Map<number, string>();
    genome.forEach((g, i) => map.set(g.id, GENE_COLORS[i % GENE_COLORS.length]));
    return map;
  }, [genome]);
  const carriers = useMemo(() => {
    const map = new Map<number, number>();
    items.forEach((it) => it.shared.forEach((id) => map.set(id, (map.get(id) || 0) + 1)));
    return map;
  }, [items]);
  const highlightIndex = gene === null ? null : genome.findIndex((g) => g.id === gene);

  const geneLabel = (id: number) => {
    const fromGenome = genome.find((g) => g.id === id);
    const g = fromGenome || data?.genes[String(id)];
    if (!g) return null;
    return isPt ? g.pt : g.en;
  };

  // A voz: o oráculo da prateleira do título; fora das prateleiras, o do
  // parente mais forte (ou a Cypher, que mora no escuro).
  const voiceOracle: OracleId = source?.oracle ?? items[0]?.oracle ?? 'cypher';
  const voice = ORACLE_BY_ID[voiceOracle];
  const voiceLine = !source
    ? null
    : !source.in_shelf
      ? t('oracleDna.voice.outside')
      : t(`oracleDna.voice.${voiceOracle}.${titleId % VOICE_COUNT}`);

  const otherScreenLabel = mediaType === 'tv' ? t('oracleDna.lens.screenMovies') : t('oracleDna.lens.screenSeries');
  const lensLabel = (l: DnaLens) => (l === 'screen' ? otherScreenLabel : t(`oracleDna.lens.${l}`));

  const predLabel: DnaPredLabel = data?.predLabel ?? 'hidden';

  // ---------- Topo: voz, hélice e genoma ----------
  const hero = (
    <section>
      {voiceLine && (
        <SheetFade id={`voice-${key}`} className="flex items-start gap-3">
          <img
            src={voice.avatar}
            alt=""
            aria-hidden
            className="w-9 h-9 rounded-full object-cover shrink-0"
            style={{ boxShadow: `0 0 0 1.5px ${voice.color}` }}
          />
          <p className="text-[15px] leading-snug" style={{ color: PAPER }}>
            <span className="sr-only">{voice.name}: </span>
            <span style={{ color: voice.color }} className="font-semibold mr-1.5" aria-hidden>
              {voice.name}
            </span>
            “{voiceLine}”
          </p>
        </SheetFade>
      )}

      <div className="mt-4 rounded-2xl ring-1 ring-white/[0.08] overflow-hidden" style={{ background: withAlpha('#1C1433', 0.9) }}>
        <div className="h-[72px] w-full">
          <DnaHelix
            className="w-full h-full"
            bases={genome.map((g) => geneColor.get(g.id) || MIST)}
            highlight={highlightIndex !== null && highlightIndex >= 0 ? highlightIndex : null}
            busy={status === 'loading'}
          />
        </div>
        <div className="px-4 pb-4 pt-1">
          {status === 'loading' ? (
            <p className="text-sm" style={{ color: MIST }} aria-live="polite">
              {t('oracleDna.sequencing')}
            </p>
          ) : status === 'ready' && source ? (
            <>
              <p className="flex items-baseline justify-between gap-3 text-xs uppercase tracking-wide" style={{ color: MIST }}>
                <span>{t('oracleDna.genomeTitle')}</span>
                {source.genes > 0 && (
                  <span className="normal-case tracking-normal">{t('oracleDna.genomeCount', { count: source.genes })}</span>
                )}
              </p>
              {genome.length > 0 ? (
                <ul className="mt-2.5 flex flex-wrap gap-1.5" aria-label={t('oracleDna.genomeAria')} title={t('oracleDna.genomeAria')}>
                  {genome.map((g) => {
                    const color = geneColor.get(g.id) || MIST;
                    const count = carriers.get(g.id) || 0;
                    const active = gene === g.id;
                    const rarity = geneRarity(g.df);
                    return (
                      <li key={g.id}>
                        <button
                          type="button"
                          disabled={count === 0}
                          aria-pressed={active}
                          onClick={() => setGene(active ? null : g.id)}
                          aria-label={t('oracleDna.geneAria', {
                            gene: isPt ? g.pt : g.en,
                            rarity: t(`oracleDna.rarity.${rarity}`),
                            count,
                          })}
                          title={t(`oracleDna.rarity.${rarity}`)}
                          className={`inline-flex items-center gap-1.5 h-7 pl-2 pr-2 rounded-full text-[12.5px] font-medium transition disabled:opacity-40 disabled:cursor-not-allowed ${FOCUS_RING}`}
                          style={
                            active
                              ? { background: color, color: INK, boxShadow: `0 0 14px ${withAlpha(color, 0.45)}` }
                              : { background: withAlpha(color, 0.1), color, boxShadow: `inset 0 0 0 1px ${withAlpha(color, 0.35)}` }
                          }
                        >
                          <span className="inline-flex gap-[2px]" aria-hidden>
                            {[1, 2, 3].map((dot) => (
                              <span
                                key={dot}
                                className="w-1 h-1 rounded-full"
                                style={{ background: active ? INK : color, opacity: dot <= rarity ? 1 : 0.22 }}
                              />
                            ))}
                          </span>
                          {isPt ? g.pt : g.en}
                          {count > 0 && (
                            <span className="ml-0.5 text-[11px] tabular-nums" style={{ opacity: active ? 0.75 : 0.7 }} aria-hidden>
                              {count}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="mt-2 text-sm leading-snug" style={{ color: MIST }}>
                  {source.genes > 0 ? t('oracleDna.genomeUnnamed') : t('oracleDna.genomeEmpty')}
                </p>
              )}
            </>
          ) : null}
        </div>
      </div>
    </section>
  );

  // ---------- As lentes ----------
  const lensBar = lensesShown.length > 1 && (
    <div className="mt-5 -mx-5 sm:-mx-7 px-5 sm:px-7 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div role="tablist" aria-label={t('oracleDna.lensesAria')} className="flex gap-1.5 w-max">
        {lensesShown.map((l) => {
          const active = l === lens;
          return (
            <button
              key={l}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls="dna-relatives"
              id={`dna-lens-${l}`}
              onClick={() => setLens(l)}
              className={`shrink-0 inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-[13px] font-medium transition ${FOCUS_RING}`}
              style={
                active
                  ? { background: PAPER, color: INK }
                  : { background: VELVET, color: PAPER, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.1)' }
              }
            >
              {lensLabel(l)}
              <span className="text-[11px] tabular-nums" style={{ opacity: 0.65 }}>
                {lensCounts[l]}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );

  // ---------- Um parente ----------
  const renderRelative = (rel: DnaRelative, index: number) => {
    const name = titleOf(rel, lang) || '—';
    const poster = posterOf(rel, lang);
    const oracle = ORACLE_BY_ID[rel.oracle];
    const mood = MOOD_BY_KEY[rel.mood];
    const named = rel.shared.filter((id) => geneLabel(id));
    const shownGenes = named.slice(0, 4);
    const moreGenes = rel.n_shared - shownGenes.length;
    const loading = loadingId === rel.id;

    // O porquê além dos temas: no máximo dois, do mais forte ao mais leve.
    const whys: { key: string; icon: React.ReactNode; text: string }[] = [];
    if (rel.same_director) {
      // Série com série: o "diretor" do banco é quem criou a série.
      const creator = mediaType === 'tv' && rel.media_type === 'tv';
      whys.push({ key: 'dir', icon: <Clapperboard className="w-3.5 h-3.5" aria-hidden />, text: t(creator ? 'oracleDna.why.creator' : 'oracleDna.why.director') });
    }
    if (rel.cast.length > 0) whys.push({ key: 'cast', icon: <Film className="w-3.5 h-3.5" aria-hidden />, text: t('oracleDna.why.cast', { name: rel.cast[0] }) });
    if (rel.co_lovers >= 2) whys.push({ key: 'crowd', icon: <Users className="w-3.5 h-3.5" aria-hidden />, text: t('oracleDna.why.crowd', { count: rel.co_lovers }) });
    if (rel.countries.length > 0) whys.push({ key: 'country', icon: <span aria-hidden>{countryFlag(rel.countries[0])}</span>, text: regionName(rel.countries[0], lang) });
    if (rel.anime) whys.push({ key: 'anime', icon: null, text: t('oracleDna.why.anime') });
    if (rel.bw) whys.push({ key: 'bw', icon: null, text: t('oracleDna.why.bw') });
    const shownWhys = whys.slice(0, 2);

    // A régua das quatro fitas (só desenho; o texto ao lado diz o mesmo).
    const strandLevels = [
      Math.min(1, rel.kw / 0.15),
      rel.same_director ? 1 : rel.cast.length ? 0.6 : 0,
      rel.co_lovers >= 2 ? Math.min(1, rel.co_lovers / 4) : 0,
      Math.min(1, (rel.countries.length ? 0.5 : 0) + (rel.anime || rel.bw ? 0.3 : 0) + (source?.mood && rel.mood === source.mood ? 0.3 : 0)),
    ];

    const myTone = rel.my_rating !== null ? ratingTone(rel.my_rating) : rel.in_watchlist ? ratingTone(null) : null;
    const showPred = rel.my_rating === null && rel.pred !== null && predLabel !== 'hidden';
    const predTone = showPred ? ratingTone(rel.pred) : null;
    const pColor = pctColor(rel.pct);

    return (
      <li key={`${rel.media_type}:${rel.id}`} className="search-row" style={{ '--row-i': Math.min(index, 12) } as React.CSSProperties}>
        <button
          type="button"
          onClick={() => onOpenTitle(rel.id, rel.media_type)}
          aria-label={rel.year ? t('oracleDna.openRelative', { title: name, year: rel.year, pct: rel.pct }) : t('oracleDna.openRelativeNoYear', { title: name, pct: rel.pct })}
          className={`group w-full flex items-start gap-3 rounded-xl px-2 py-2.5 text-left transition hover:bg-white/[0.05] active:bg-white/[0.08] ${FOCUS_RING}`}
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
            <span className="flex items-center gap-1.5 min-w-0">
              <span className="font-medium leading-snug truncate" style={{ color: PAPER }}>{name}</span>
              {rel.media_type === 'tv' && (
                <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-[1px] rounded text-[10px] font-semibold uppercase tracking-wide" style={{ background: withAlpha('#A78BFA', 0.16), color: '#C4B5FD' }}>
                  <Tv className="w-3 h-3" aria-hidden />
                  {t('oracleDna.series')}
                </span>
              )}
            </span>
            <span className="mt-0.5 flex items-center gap-1.5 text-[12.5px] min-w-0" style={{ color: MIST }}>
              {rel.year && <span className="shrink-0">{rel.year}</span>}
              {rel.year && <span aria-hidden className="shrink-0 opacity-50">·</span>}
              <img
                src={oracle.avatar}
                alt=""
                aria-hidden
                title={oracle.name}
                className="w-4 h-4 rounded-full object-cover shrink-0"
                style={{ boxShadow: `0 0 0 1px ${oracle.color}` }}
              />
              <span className="sr-only">{t('oracleDna.shelfOf', { oracle: oracle.name })}</span>
              {mood ? (
                <span className="truncate" style={{ color: mood.color }}>{t(mood.labelKey)}</span>
              ) : (
                <span className="truncate" style={{ color: oracle.color }}>{oracle.name}</span>
              )}
            </span>

            {(shownGenes.length > 0 || moreGenes > 0) && (
              <span className="mt-1 text-[12.5px] leading-snug line-clamp-2 break-words">
                <span className="sr-only">{t('oracleDna.sharedAria', { count: rel.n_shared })}: </span>
                {shownGenes.map((id, i) => {
                  const c = geneColor.get(id) || '#E9D5FF';
                  const hot = gene === id;
                  return (
                    <React.Fragment key={id}>
                      {i > 0 && (
                        <span aria-hidden className="mx-1" style={{ color: MIST, opacity: 0.5 }}>
                          ·
                        </span>
                      )}
                      <span style={{ color: c, fontWeight: hot ? 700 : 500, textShadow: hot ? `0 0 10px ${withAlpha(c, 0.6)}` : undefined }}>{geneLabel(id)}</span>
                    </React.Fragment>
                  );
                })}
                {moreGenes > 0 && (
                  <span className="tabular-nums" style={{ color: MIST }}>
                    {shownGenes.length > 0 ? ` ${t('oracleDna.moreGenes', { count: moreGenes })}` : t('oracleDna.unnamedGenes', { count: moreGenes })}
                  </span>
                )}
              </span>
            )}

            {shownWhys.length > 0 && (
              <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]" style={{ color: MIST }}>
                {shownWhys.map((w) => (
                  <span key={w.key} className="inline-flex items-center gap-1 min-w-0">
                    {w.icon}
                    <span className="truncate">{w.text}</span>
                  </span>
                ))}
              </span>
            )}
          </span>

          <span className="shrink-0 flex flex-col items-end gap-1.5 pl-1">
            <span className="flex items-end gap-1.5">
              <span className="flex items-end gap-[2px] h-5 pb-[3px]" aria-hidden>
                {STRANDS.map((s, i) => (
                  <span
                    key={s.key}
                    className="w-[3px] rounded-full"
                    style={{ height: `${4 + strandLevels[i] * 13}px`, background: s.color, opacity: strandLevels[i] > 0 ? 0.35 + 0.65 * strandLevels[i] : 0.18 }}
                  />
                ))}
              </span>
              <span className="text-right leading-none">
                <span style={{ ...PIXEL, color: pColor, textShadow: rel.pct >= 85 ? `0 0 14px ${withAlpha('#F0ABFC', 0.5)}` : undefined }} className="block text-[22px] tabular-nums">
                  {rel.pct}%
                </span>
              </span>
            </span>
            {myTone ? (
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-semibold leading-none"
                style={{ color: myTone.color, boxShadow: `inset 0 0 0 1px ${myTone.ring}` }}
              >
                {rel.my_rating !== null ? (
                  t('person.yourRating', { rating: rel.my_rating })
                ) : (
                  <>
                    <Bookmark className="w-3 h-3" aria-hidden />
                    {t('person.inWatchlist')}
                  </>
                )}
              </span>
            ) : null}
            {showPred && predTone && (
              <span
                className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-semibold leading-none"
                style={{ color: predTone.color, background: withAlpha('#8B5CF6', 0.12) }}
                title={t('oracleDna.predHint')}
              >
                {predLabel === 'guess' ? t('acervo.pred.guess', { n: rel.pred }) : t('oracleDna.predicted', { n: rel.pred })}
              </span>
            )}
          </span>
        </button>
      </li>
    );
  };

  // ---------- Corpo ----------
  let body: React.ReactNode = null;
  if (status === 'loading') {
    body = (
      <ul className="mt-6 space-y-2" aria-busy="true" aria-label={t('common.loading')}>
        {[0, 1, 2, 3].map((i) => (
          <li key={i} className="flex items-center gap-3 px-2 py-2">
            <span className="w-[52px] aspect-[2/3] rounded-md animate-pulse" style={{ background: VELVET }} />
            <span className="flex-1 space-y-2">
              <span className="block h-4 w-3/5 rounded animate-pulse" style={{ background: VELVET }} />
              <span className="block h-3 w-2/5 rounded animate-pulse" style={{ background: VELVET }} />
              <span className="block h-5 w-4/5 rounded-full animate-pulse" style={{ background: VELVET }} />
            </span>
            <span className="w-10 h-6 rounded animate-pulse" style={{ background: VELVET }} />
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
        {lensBar}
        <p className="mt-3 text-[13px] leading-snug" style={{ color: MIST }}>
          {t(`oracleDna.lensHint.${lens}`)}
        </p>
        {gene !== null && (
          <div className="mt-3">
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
        <SheetFade id={`${lens}-${gene ?? 'all'}`}>
          {list.length === 0 ? (
            <p className="mt-5 text-sm" style={{ color: MIST }}>
              {t('oracleDna.emptyLens')}
            </p>
          ) : (
            <ol
              id="dna-relatives"
              role={lensesShown.length > 1 ? 'tabpanel' : undefined}
              aria-labelledby={lensesShown.length > 1 ? `dna-lens-${lens}` : undefined}
              aria-label={lensesShown.length > 1 ? undefined : lensLabel(lens)}
              className="mt-3 -mx-2 space-y-0.5"
            >
              {list.map(renderRelative)}
            </ol>
          )}
        </SheetFade>
      </>
    );
  }

  // ---------- Como se lê ----------
  const how = status === 'ready' && items.length > 0 && (
    <section className="mt-6 pt-4 border-t border-white/[0.07]">
      <button
        type="button"
        onClick={() => setHowOpen((v) => !v)}
        aria-expanded={howOpen}
        className={`inline-flex items-center gap-2 text-sm font-medium rounded ${FOCUS_RING}`}
        style={{ color: '#F0ABFC' }}
      >
        <Info className="w-4 h-4" aria-hidden />
        {t('oracleDna.how.title')}
      </button>
      {howOpen && (
        <SheetFade id="how" className="mt-3 space-y-2.5">
          <ul className="space-y-2.5">
            {STRANDS.map((s) => (
              <li key={s.key} className="flex items-start gap-2.5 text-[13px] leading-snug" style={{ color: PAPER }}>
                <span className="mt-[3px] w-[3px] h-3.5 rounded-full shrink-0" style={{ background: s.color }} aria-hidden />
                <span>
                  <span className="font-semibold" style={{ color: s.color }}>{t(`oracleDna.how.${s.key}Title`)}</span>
                  {' — '}
                  {t(`oracleDna.how.${s.key}`)}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-[12.5px] leading-snug" style={{ color: MIST }}>{t('oracleDna.how.note')}</p>
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
        <span className="grid place-items-center w-10 h-10 shrink-0 rounded-xl overflow-hidden" style={{ background: withAlpha('#E879F9', 0.14) }}>
          <DnaHelix size="icon" bases={GENE_COLORS.slice(0, 4)} className="w-9 h-9" />
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
