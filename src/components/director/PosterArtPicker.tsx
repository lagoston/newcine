import { useEffect, useMemo, useState } from 'react';
import { Check, ImageOff, RotateCw, X } from 'lucide-react';
import { NIGHT, PAPER, MIST, VELVET, FOCUS_RING } from '../../lib/oracleTheme';
import { tmdbImage } from '../../lib/tmdbImage';
import { posterPathFromLink, type TmdbImage } from '../../lib/directorTools';

// A escolha da arte de um pôster novo (Sala do Diretor, /diretor/posteres).
//
// 24/11/2026, pedido do Bruno: "Pôsteres às vezes não carregam no modo diretor
// quando tento implantar um novo". Nos registros do servidor, as duas
// tentativas daquela manhã receberam a lista de artes sem erro; o que falhava
// estava na tela, e ela tinha quatro pontos fracos:
//   1. só as 40 primeiras artes apareciam (títulos conhecidos têm 100, 160);
//   2. só artes marcadas como português, inglês ou "sem idioma" (um pôster
//      japonês ou francês nunca aparecia);
//   3. as miniaturas eram `loading="lazy"` sem nenhum estado: uma que demorasse
//      ou falhasse ficava um quadro vazio para sempre, sem dizer nada;
//   4. qualquer erro ao buscar a lista virava "o TMDB não tem outras artes".
// Agora: todas as artes, em lotes; um filtro por idioma; cada miniatura mostra
// que está carregando, tenta de novo sozinha num tamanho maior e, se não vier,
// diz que não veio e deixa tentar; a arte escolhida aparece grande antes de
// criar; e dá para colar o link de uma arte do TMDB (para a que acabou de ser
// enviada e ainda não entrou na lista guardada).

type Lang = 'pt' | 'en';

const COPY = {
  pt: {
    main: 'Português, inglês e sem texto',
    all: 'Todos os idiomas',
    textless: 'Sem texto',
    count: (shown: number, total: number) => `${shown} de ${total} artes`,
    more: (left: number) => `Mostrar mais ${left}`,
    emptyFilter: 'Nenhuma arte neste filtro.',
    used: 'já na roleta',
    failed: 'Não carregou',
    retry: 'Tentar de novo',
    pasteLabel: 'Não achou a arte? Cole o link dela no TMDB',
    pastePh: 'https://image.tmdb.org/t/p/original/….jpg',
    pasteBad: 'Não reconheci um arquivo de imagem do TMDB neste texto.',
    pasteUsed: 'Esta arte já está na roleta.',
    pasteOutside: 'Esta arte não está na lista do TMDB deste título (pode ser nova, ou de outro título). Confira a prévia antes de criar.',
    chosen: 'A arte escolhida',
    clear: 'Trocar',
    previewFailed: 'A prévia não carregou. Confira o link antes de criar.',
    noLang: 'sem texto',
  },
  en: {
    main: 'Portuguese, English and textless',
    all: 'All languages',
    textless: 'Textless',
    count: (shown: number, total: number) => `${shown} of ${total} artworks`,
    more: (left: number) => `Show ${left} more`,
    emptyFilter: 'No artwork in this filter.',
    used: 'already in the reel',
    failed: 'Did not load',
    retry: 'Try again',
    pasteLabel: "Can't find the artwork? Paste its TMDB link",
    pastePh: 'https://image.tmdb.org/t/p/original/….jpg',
    pasteBad: "I couldn't find a TMDB image file in this text.",
    pasteUsed: 'This artwork is already in the reel.',
    pasteOutside: "This artwork isn't in TMDB's list for this title (it may be new, or belong to another title). Check the preview before creating.",
    chosen: 'Chosen artwork',
    clear: 'Change',
    previewFailed: "The preview didn't load. Check the link before creating.",
    noLang: 'textless',
  },
} as const;

// Um lote por vez: as miniaturas do lote carregam JUNTAS (sem `loading="lazy"`,
// que dentro desta grade deixava quadros vazios). 30 miniaturas são ~300 KB.
const BATCH = 30;
// A miniatura tenta o tamanho da grade e, se falhar, o de cima (o TMDB às
// vezes ainda não tem um dos tamanhos de uma arte recém-enviada).
const THUMB_SIZES = ['w185', 'w342'] as const;

type ThumbState = 'loading' | 'ok' | 'failed';

function ArtThumb({ path, label, failedText, retryText }: { path: string; label: string; failedText: string; retryText: string }) {
  const [attempt, setAttempt] = useState(0);
  const [round, setRound] = useState(0);
  const [state, setState] = useState<ThumbState>('loading');
  const src = `${tmdbImage(path, THUMB_SIZES[Math.min(attempt, THUMB_SIZES.length - 1)])}${round ? `?r=${round}` : ''}`;
  return (
    <>
      {state !== 'ok' && <span className={`absolute inset-0 ${state === 'loading' ? 'poster-skeleton' : ''}`} style={{ background: VELVET }} aria-hidden />}
      {state !== 'failed' && (
        <img
          key={src}
          src={src}
          alt={label}
          decoding="async"
          draggable={false}
          onLoad={() => setState('ok')}
          onError={() => {
            if (attempt < THUMB_SIZES.length - 1) setAttempt(attempt + 1);
            else setState('failed');
          }}
          className="absolute inset-0 w-full h-full object-cover"
          style={{ opacity: state === 'ok' ? 1 : 0 }}
        />
      )}
      {state === 'failed' && (
        <span
          role="button"
          tabIndex={0}
          onClick={(event) => {
            // tentar de novo não escolhe a arte
            event.stopPropagation();
            setAttempt(0);
            setRound(round + 1);
            setState('loading');
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            event.stopPropagation();
            setAttempt(0);
            setRound(round + 1);
            setState('loading');
          }}
          className="absolute inset-0 grid place-items-center content-center gap-1 px-1 text-center text-[10px] leading-tight"
          style={{ color: MIST }}
        >
          <ImageOff className="w-4 h-4" aria-hidden />
          {failedText}
          <span className="inline-flex items-center gap-1 font-semibold" style={{ color: PAPER }}>
            <RotateCw className="w-3 h-3" aria-hidden />
            {retryText}
          </span>
        </span>
      )}
    </>
  );
}

interface PosterArtPickerProps {
  lang: Lang;
  images: TmdbImage[];
  usedPaths: Set<string>;
  value: string | null;
  onChange: (path: string | null) => void;
  // a cor da raridade escolhida (o aro da arte selecionada)
  accent: string;
}

type Filter = 'main' | 'all' | 'textless' | string;

export default function PosterArtPicker({ lang, images, usedPaths, value, onChange, accent }: PosterArtPickerProps) {
  const c = COPY[lang];
  const [filter, setFilter] = useState<Filter>('main');
  const [shown, setShown] = useState(BATCH);
  const [pasted, setPasted] = useState('');
  const [previewFailed, setPreviewFailed] = useState(false);

  // título novo: tudo de volta ao começo
  useEffect(() => {
    setFilter('main');
    setShown(BATCH);
    setPasted('');
  }, [images]);
  useEffect(() => setPreviewFailed(false), [value]);

  const isMain = (img: TmdbImage) => img.lang === null || img.lang === 'pt' || img.lang === 'en';
  // os outros idiomas que este título tem, do mais farto ao mais raro
  const otherLangs = useMemo(() => {
    const counts = new Map<string, number>();
    images.forEach((img) => {
      if (img.lang && img.lang !== 'pt' && img.lang !== 'en') counts.set(img.lang, (counts.get(img.lang) ?? 0) + 1);
    });
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [images]);
  const mainCount = useMemo(() => images.filter(isMain).length, [images]);
  const textlessCount = useMemo(() => images.filter((img) => img.lang === null).length, [images]);

  // sem nenhuma arte "principal", abre em todos os idiomas (senão a grade abriria vazia)
  const active: Filter = filter === 'main' && mainCount === 0 ? 'all' : filter;
  const list = useMemo(() => {
    if (active === 'all') return images;
    if (active === 'main') return images.filter(isMain);
    if (active === 'textless') return images.filter((img) => img.lang === null);
    return images.filter((img) => img.lang === active);
  }, [images, active]);
  const visible = list.slice(0, shown);

  const pick = (next: Filter) => {
    setFilter(next);
    setShown(BATCH);
  };
  const chip = (id: Filter, label: string, count: number) => (
    <button
      key={id}
      type="button"
      aria-pressed={active === id}
      onClick={() => pick(id)}
      className={`h-9 min-h-0 px-3 rounded-full text-xs font-semibold ${FOCUS_RING}`}
      style={active === id ? { background: PAPER, color: NIGHT } : { background: VELVET, color: MIST, border: '1px solid rgba(243,234,211,0.12)' }}
    >
      {label} · {count}
    </button>
  );

  const pastedPath = pasted.trim() ? posterPathFromLink(pasted) : null;
  const pastedUsed = Boolean(pastedPath && usedPaths.has(pastedPath));
  const onPaste = (text: string) => {
    setPasted(text);
    const path = text.trim() ? posterPathFromLink(text) : null;
    if (path && !usedPaths.has(path)) onChange(path);
  };
  const chosen = value ? images.find((img) => img.file_path === value) ?? null : null;
  const outside = Boolean(value && !chosen);

  return (
    <div>
      {images.length > 0 && (
        <>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {mainCount > 0 && chip('main', c.main, mainCount)}
            {chip('all', c.all, images.length)}
            {textlessCount > 0 && chip('textless', c.textless, textlessCount)}
            {otherLangs.map(([code, count]) => chip(code, code.toUpperCase(), count))}
          </div>
          <p className="mt-2 text-xs" style={{ color: MIST }} aria-live="polite">
            {c.count(visible.length, list.length)}
          </p>
          {list.length === 0 ? (
            <p className="mt-1 text-xs" style={{ color: MIST }}>{c.emptyFilter}</p>
          ) : (
            <div role="radiogroup" aria-label={c.chosen} className="mt-2 grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-6 gap-2">
              {visible.map((img) => {
                const used = usedPaths.has(img.file_path);
                const selected = value === img.file_path;
                const langLabel = img.lang ?? c.noLang;
                return (
                  <button
                    key={img.file_path}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={`${langLabel}${used ? `, ${c.used}` : ''}`}
                    disabled={used}
                    onClick={() => {
                      setPasted('');
                      onChange(img.file_path);
                    }}
                    className={`relative block min-h-0 rounded-lg overflow-hidden disabled:opacity-35 ${FOCUS_RING}`}
                    style={{ aspectRatio: '2 / 3', boxShadow: selected ? `0 0 0 3px ${accent}` : '0 0 0 1px rgba(243,234,211,0.12)' }}
                  >
                    <ArtThumb path={img.file_path} label="" failedText={c.failed} retryText={c.retry} />
                    <span className="absolute left-1 top-1 rounded px-1 text-[10px] font-semibold uppercase" style={{ background: 'rgba(18,13,34,0.75)', color: PAPER }}>
                      {img.lang ?? '—'}
                    </span>
                    {selected && (
                      <span className="absolute right-1 top-1 grid place-items-center w-6 h-6 rounded-full" style={{ background: accent, color: NIGHT }}>
                        <Check className="w-4 h-4" aria-hidden />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
          {list.length > visible.length && (
            <button
              type="button"
              onClick={() => setShown(shown + BATCH)}
              className={`mt-3 h-10 min-h-0 px-4 rounded-full text-sm font-semibold ${FOCUS_RING}`}
              style={{ background: VELVET, color: PAPER, border: '1px solid rgba(243,234,211,0.18)' }}
            >
              {c.more(Math.min(BATCH, list.length - visible.length))}
            </button>
          )}
        </>
      )}

      <label className="mt-4 block text-xs" style={{ color: MIST }}>
        {c.pasteLabel}
        <input
          value={pasted}
          onChange={(event) => onPaste(event.target.value)}
          placeholder={c.pastePh}
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          className={`mt-1 w-full h-10 px-3 rounded-lg text-sm ${FOCUS_RING}`}
          style={{ background: VELVET, color: PAPER, border: '1px solid rgba(243,234,211,0.12)' }}
        />
      </label>
      {pasted.trim() && !pastedPath && <p className="mt-1 text-xs" style={{ color: '#FCA5A5' }}>{c.pasteBad}</p>}
      {pastedUsed && <p className="mt-1 text-xs" style={{ color: '#FCD34D' }}>{c.pasteUsed}</p>}

      {value && (
        <div className="mt-4 flex items-start gap-3 rounded-xl p-3" style={{ background: 'rgba(18,13,34,0.55)', border: `1px solid ${accent}55` }}>
          <span className="relative block w-28 shrink-0 rounded-lg overflow-hidden" style={{ aspectRatio: '2 / 3', boxShadow: `0 0 0 2px ${accent}`, background: VELVET }}>
            {!previewFailed && (
              <img key={value} src={tmdbImage(value, 'w342')} alt="" decoding="async" onError={() => setPreviewFailed(true)} className="absolute inset-0 w-full h-full object-cover" />
            )}
            {previewFailed && (
              <span className="absolute inset-0 grid place-items-center" style={{ color: MIST }}>
                <ImageOff className="w-5 h-5" aria-hidden />
              </span>
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold" style={{ color: PAPER }}>{c.chosen}</p>
            <p className="mt-0.5 text-xs break-all" style={{ color: MIST }}>
              {value.slice(1)}
              {chosen ? ` · ${chosen.lang ?? c.noLang}${chosen.width ? ` · ${chosen.width}×${chosen.height}` : ''}` : ''}
            </p>
            {outside && <p className="mt-1.5 text-xs" style={{ color: '#FCD34D' }}>{c.pasteOutside}</p>}
            {previewFailed && <p className="mt-1.5 text-xs" style={{ color: '#FCA5A5' }}>{c.previewFailed}</p>}
            <button
              type="button"
              onClick={() => {
                setPasted('');
                onChange(null);
              }}
              className={`mt-2 inline-flex items-center gap-1.5 h-9 min-h-0 px-3 rounded-full text-xs font-semibold ${FOCUS_RING}`}
              style={{ color: MIST, border: '1px solid rgba(243,234,211,0.18)' }}
            >
              <X className="w-3.5 h-3.5" aria-hidden />
              {c.clear}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
