import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowUpRight, BookOpen, DoorOpen, Film, Info, Scroll, X } from 'lucide-react';
import { MOODS, MOOD_BY_KEY, MOOD_BY_LETTER, withMoodAlpha } from '../../lib/moods';
import { personaText, topMoodKeys, PERSONA_THRESHOLD, type UserPersona } from '../../lib/persona';
import { fetchPersonaWorld, worldState, type PersonaWorld, type WorldTitle } from '../../lib/personaWorld';
import { PAPER, MIST, PIXEL, VELVET, INK, NIGHT, FOCUS_RING, glassPanel, ratingTone } from '../../lib/oracleTheme';
import { getMovieDetailsFromDB, type Movie } from '../../lib/tmdb';
import type { Affinity, MoodSlice } from '../../lib/tasteStats';
import type { MovieWithRating } from '../../hooks/useProfileData';
import { PersonaCode, PersonaCard } from '../PersonaBits';
import { PersonaRevelationSheet, PersonaHowItWorksSheet } from '../PersonaSheets';
import MovieDetailsModal from '../MovieDetailsModal';
import { MothCloseUp, PersonaScene } from '../personaWorld/PersonaScene';
import type { SceneHit } from '../personaWorld/draw';
import { useStudioDoors } from '../personaWorld/useStudioDoors';
import KeywordCloud from './KeywordCloud';
import { ModuleTitle, formatOne } from './observatoryKit';

// Personalidade cinematográfica, no perfil: o estúdio da pessoa e a mariposa
// dela, num bloco só.
//
// 14/11/2026, pedido do Bruno: "Deve converter o modal de profile
// completamente para se tornar análogo ao projeto do 'estúdio' do usuário,
// com sua borboleta majestosa." Até aqui o bloco era a grade 3×3 de frascos
// (um por humor, de 13/10/2026) e, desde 13/11, uma cabine em miniatura no
// lugar da carta do personagem. Agora:
//   • à esquerda, o estúdio inteiro, vivo, do mesmo jeito da home e da gaveta
//     (2× no celular, 3× no computador). Os objetos funcionam: o livro abre a
//     história da mariposa; no seu perfil, a máquina, a mesa e o aquário levam
//     aos jogos e à Watchlist; a caixa de papelão leva ao Clube do Terror.
//     Tocar numa prateleira da estante escolhe aquele humor; tocar num pôster
//     da parede abre o título; qualquer outro ponto abre a gaveta do estúdio;
//   • embaixo dele, as nove prateleiras numa fileira de plaquinhas (a letra,
//     a parte dos títulos e o nível): o que os frascos mostravam, agora na
//     língua do estúdio, e o caminho de quem usa teclado;
//   • à direita, a mariposa da pessoa bem grande (os olhos da asa abrem os
//     títulos de nota 9 e 10), o código, o título, a bitola, o começo da
//     revelação e os temas que ela mais ama.
// Escolher um humor troca o painel da direita pela leitura dele (a %, quantos
// títulos, a média, o que ele revela, os mais bem avaliados, os temas e a
// prateleira), como antes. O "i" do canto abre o Como funciona.
//
// No seu perfil a gaveta abre completa; no dos outros, só para olhar. Enquanto
// a cena não chega (ou se não chegar), fica a carta do personagem.

interface EssenceRingProps {
  slices: MoodSlice[];
  counted: number;
  persona: UserPersona | null;
  personaLoading?: boolean;
  topKeywords: Affinity[];
  isOwn: boolean;
  // "@fulano" no perfil de outra pessoa
  ownerName?: string;
  // De quem é o perfil (para buscar a cabine dessa pessoa).
  ownerId?: string;
  // Seu perfil: o seu nome de usuário (vai no cartão de compartilhar).
  shareName?: string | null;
}

// A gaveta e o livro só são baixados na primeira abertura.
const PersonaWorldSheet = lazy(() => import('../personaWorld/PersonaWorldSheet'));
const EvolutionBook = lazy(() => import('../personaWorld/EvolutionBook'));

// Celular estreito: frascos mais baixos e menos palavras por vez.
function useCompact() {
  const query = '(max-width: 639px)';
  const [compact, setCompact] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setCompact(media.matches);
    update();
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);
  return compact;
}

const EssenceRing: React.FC<EssenceRingProps> = ({ slices, counted, persona, personaLoading = false, topKeywords, isOwn, ownerName, ownerId, shareName = null }) => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const compact = useCompact();
  const panelRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [showRevelation, setShowRevelation] = useState(false);
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [movie, setMovie] = useState<Movie | null>(null);
  const [opening, setOpening] = useState<number | null>(null);
  const [world, setWorld] = useState<PersonaWorld | null>(null);
  const [showWorld, setShowWorld] = useState(false);
  // a gaveta fica montada depois da primeira abertura (para a saída animar)
  const [worldMounted, setWorldMounted] = useState(false);
  const [bookOpen, setBookOpen] = useState(false);

  const bySlice = useMemo(() => new Map(slices.map((s) => [s.key, s])), [slices]);
  const codeKeys = useMemo(() => topMoodKeys(persona), [persona]);
  const hasPersona = Boolean(persona?.code && persona.persona);
  const text = hasPersona && persona?.persona ? personaText(persona.persona, i18n.language) : null;

  const selectedMood = selected ? MOOD_BY_KEY[selected] : null;
  const selectedSlice = selected ? bySlice.get(selected as MoodSlice['key']) : undefined;
  const accent = selectedMood?.color ?? (codeKeys[0] ? MOOD_BY_KEY[codeKeys[0]]?.color : undefined) ?? '#8B5CF6';
  const pct = (share: number) => `${Math.round(share * 100)}%`;
  const avgText = (avg: number | null | undefined) => (typeof avg === 'number' ? formatOne(avg, i18n.language) : '–');
  const username = ownerName?.replace(/^@/, '');

  const toggle = (key: string) => setSelected((prev) => (prev === key ? null : key));

  // O estúdio da pessoa (some se o perfil mudar de dono). Quem ainda não tem
  // Persona também tem estúdio: o do ovo ou o da lagarta.
  const personaCode = persona?.code ?? null;
  const personaCounted = persona?.counted ?? 0;
  useEffect(() => {
    setWorld(null);
    if (!ownerId) return;
    let alive = true;
    fetchPersonaWorld(ownerId)
      .then((value) => alive && setWorld(value))
      .catch((error) => console.error('Persona world:', error));
    return () => {
      alive = false;
    };
  }, [ownerId, personaCode, personaCounted]);
  const worldSt = useMemo(() => (world ? worldState(world) : null), [world]);
  const openWorld = () => {
    setWorldMounted(true);
    setShowWorld(true);
  };
  const openBook = useCallback(() => setBookOpen(true), []);
  const doors = useStudioDoors({ world, isOwn, ownerUsername: isOwn ? shareName : username, onOpenBook: openBook });

  // No celular o painel fica embaixo da grade: ao escolher um humor, traz o
  // painel para a tela se ele estiver escondido.
  useEffect(() => {
    if (!selected || !compact || !panelRef.current) return;
    const rect = panelRef.current.getBoundingClientRect();
    if (rect.top > window.innerHeight - 160) panelRef.current.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
  }, [selected, compact, reduceMotion]);

  const openMovie = async (item: MovieWithRating) => {
    setOpening(item.id);
    try {
      setMovie(await getMovieDetailsFromDB(item.id, item.media_type === 'tv' ? 'tv' : 'movie'));
    } catch {
      toast.error(t('common.error'));
    } finally {
      setOpening(null);
    }
  };

  const openTitle = async (title: WorldTitle) => {
    try {
      setMovie(await getMovieDetailsFromDB(title.id, title.type));
    } catch {
      toast.error(t('common.error'));
    }
  };
  // Um toque na cena: a prateleira escolhe o humor, o pôster abre o título e o
  // resto abre a gaveta do estúdio.
  const pickScene = (hit: SceneHit) => {
    if (hit.kind === 'shelf') {
      const mood = MOOD_BY_LETTER[hit.letter];
      if (mood) toggle(mood.key);
    } else if (hit.kind === 'poster') openTitle(hit.title);
    else openWorld();
  };

  if (counted === 0 && !hasPersona && !personaLoading && !world) {
    return (
      <section className="h-full rounded-3xl p-5 sm:p-7" style={glassPanel('#8B5CF6')}>
        <ModuleTitle title={isOwn ? t('oracle.cinematicEssenceLabel') : t('profile.essenceOf', { username })} hint={isOwn ? t('home.desk.essenceEmptyDesc') : t('profile.essenceEmptyOther', { username })} />
        {isOwn && (
          <Link to="/" state={{ openPersona: true }} className={`mt-4 inline-flex items-center justify-start gap-1.5 text-sm font-medium rounded ${FOCUS_RING}`} style={{ color: '#F0ABFC' }}>
            {t('oracle.discoverYourEssence')}
            <ArrowUpRight className="w-4 h-4" aria-hidden />
          </Link>
        )}
      </section>
    );
  }

  const sectionLabel = (label: string) => (
    <p className="text-[12px] font-medium" style={{ color: MIST }}>
      {label}
    </p>
  );

  // A mariposa da pessoa, grande (o ovo ou a lagarta, para quem ainda não tem
  // Persona). Os olhos da asa abrem os títulos de nota 9 e 10.
  const creature =
    world && worldSt ? (
      <div className="rounded-2xl pt-2 pb-1" style={{ background: 'radial-gradient(70% 70% at 50% 45%, rgba(243,234,211,0.07), transparent 75%), #0D0919', boxShadow: 'inset 0 0 0 1px rgba(243,234,211,0.1)' }}>
        <MothCloseUp
          world={world}
          state={worldSt}
          onOpenTitle={openTitle}
          maxScale={3}
          label={worldSt.hasTrio ? t('personaWorld.mothLabel') : world.rated === 0 ? t('personaWorld.eggLabel') : t('personaWorld.larvaLabel')}
        />
      </div>
    ) : null;
  const gaugeChip =
    world && worldSt ? (
      <span style={{ ...PIXEL, background: PAPER, color: INK }} className="self-start px-2 py-[5px] rounded-md text-[13px] leading-none">
        {t(`personaWorld.gauges.${worldSt.gaugeKey}`)}
      </span>
    ) : null;
  const studioLinks = (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
      {ownerId && (
        <button type="button" onClick={openWorld} className={`inline-flex items-center justify-start gap-1.5 text-[13px] font-medium rounded ${FOCUS_RING}`} style={{ color: '#FCD34D' }}>
          <DoorOpen className="w-4 h-4" aria-hidden />
          {t('personaWorld.enter')}
        </button>
      )}
      {world && (
        <button type="button" onClick={openBook} className={`inline-flex items-center justify-start gap-1.5 text-[13px] font-medium rounded ${FOCUS_RING}`} style={{ color: '#7DD3FC' }}>
          <BookOpen className="w-4 h-4" aria-hidden />
          {t('personaWorld.book.title')}
        </button>
      )}
      {hasPersona && (
        <button type="button" onClick={() => setShowRevelation(true)} className={`inline-flex items-center justify-start gap-1.5 text-[13px] font-medium rounded ${FOCUS_RING}`} style={{ color: '#F9A8D4' }}>
          <Scroll className="w-4 h-4" aria-hidden />
          {t('profile.observatory.readRevelation')}
        </button>
      )}
    </div>
  );

  // ---------- painel: personalidade ----------
  const personaPanel = (() => {
    const themes = (
      <div className="mt-5 pt-4 border-t border-white/[0.07]">
        {sectionLabel(ownerName ? t('profile.observatory.keywordsTitleOf', { name: ownerName }) : t('profile.observatory.keywordsTitle'))}
        <div className="mt-2">
          <KeywordCloud words={topKeywords} perGroup={compact ? 4 : 5} accent={accent} emptyText={t('profile.observatory.keywordsEmpty')} compact={compact} />
        </div>
      </div>
    );

    if (personaLoading) {
      return (
        <div className="flex gap-4" aria-busy="true">
          <span className="w-[84px] sm:w-[100px] aspect-[4/5] rounded-[14px] bg-white/10 animate-pulse" />
          <span className="flex-1 space-y-3">
            <span className="block h-9 w-28 rounded-lg bg-white/10 animate-pulse" />
            <span className="block h-4 w-full rounded bg-white/10 animate-pulse" />
            <span className="block h-4 w-2/3 rounded bg-white/10 animate-pulse" />
          </span>
        </div>
      );
    }
    if (!hasPersona || !persona?.persona || !text) {
      const threshold = persona?.threshold || PERSONA_THRESHOLD;
      const missing = Math.max(0, threshold - (persona?.counted ?? counted));
      return (
        <div>
          {creature && <div className="mb-4">{creature}</div>}
          <p className="font-semibold" style={{ color: PAPER }}>
            {isOwn ? t('home.desk.essenceEmptyTitle') : t('profile.essenceEmptyOther', { username })}
          </p>
          <div className="mt-3 h-1.5 rounded-full bg-white/[0.07] overflow-hidden" aria-hidden>
            <span className="block h-full rounded-full" style={{ width: `${Math.min(100, ((threshold - missing) / threshold) * 100)}%`, background: 'linear-gradient(90deg,#8B5CF6,#F0ABFC)' }} />
          </div>
          <p className="mt-2 text-[13px]" style={{ color: MIST }}>
            {t('profile.observatory.personaProgress', { counted: threshold - missing, threshold })}
          </p>
          {isOwn && !world && (
            <Link to="/" state={{ openPersona: true }} className={`mt-4 inline-flex items-center justify-start gap-1.5 text-sm font-medium rounded ${FOCUS_RING}`} style={{ color: '#F0ABFC' }}>
              {t('oracle.discoverYourEssence')}
              <ArrowUpRight className="w-4 h-4" aria-hidden />
            </Link>
          )}
          {world && studioLinks}
          {themes}
        </div>
      );
    }
    // Sem a cena (ainda chegando, ou sem o dono do perfil): a carta do personagem, como antes.
    const identity = (
      <span className="min-w-0 flex flex-col">
        <PersonaCode code={persona.code as string} className="text-4xl sm:text-[44px] leading-none" />
        <span className="mt-1.5 text-lg font-semibold leading-snug" style={{ color: PAPER }}>
          {text.title}
        </span>
        <span className="mt-0.5 text-[13px]" style={{ color: MIST }}>
          {text.sameAsFilm ? text.filmWithYear : t('oracle.persona.characterIn', { character: text.character, film: text.filmWithYear })}
        </span>
        {gaugeChip && <span className="mt-2 flex">{gaugeChip}</span>}
      </span>
    );
    return (
      <div>
        {creature ? (
          <>
            {creature}
            <div className="mt-4">{identity}</div>
          </>
        ) : (
          <button
            type="button"
            onClick={ownerId ? openWorld : () => setShowRevelation(true)}
            className={`group w-full flex items-start justify-start gap-4 text-left rounded-2xl p-2 -m-2 transition hover:bg-white/[0.04] ${FOCUS_RING}`}
            aria-label={ownerId ? `${t('personaWorld.enter')}: ${text.title}` : `${t('oracle.revelation')}: ${text.title}`}
          >
            <PersonaCard persona={persona.persona} code={persona.code} foot={false} className="w-[84px] sm:w-[100px] shrink-0" />
            {identity}
          </button>
        )}
        {text.blurb && (
          <p className="mt-3 text-[14px] leading-relaxed line-clamp-3" style={{ color: 'rgba(243,234,211,0.82)' }}>
            {text.blurb}
          </p>
        )}
        {studioLinks}
        {/* As obras do personagem saíram daqui em 24/10/2026 (continuam no
            Oracle Hub e na Revelação): logo depois da revelação, os temas. */}
        {themes}
      </div>
    );
  })();

  // ---------- painel: humor escolhido ----------
  const moodPanel = selectedMood ? (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span
            className="grid place-items-center w-14 h-14 shrink-0 rounded-2xl text-3xl leading-none"
            style={{ ...PIXEL, color: selectedMood.color, background: withMoodAlpha(selectedMood, 0.14), boxShadow: `inset 0 0 0 1px ${withMoodAlpha(selectedMood, 0.4)}` }}
            aria-hidden
          >
            {selectedMood.letter}
          </span>
          <span className="min-w-0">
            <span className="block text-lg font-semibold leading-snug" style={{ color: PAPER }}>
              {t(selectedMood.labelKey)}
            </span>
            {codeKeys.includes(selectedMood.key) && (
              <span className="block text-[12px]" style={{ color: selectedMood.color }}>
                {t('profile.observatory.codeRank', { rank: codeKeys.indexOf(selectedMood.key) + 1 })}
              </span>
            )}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setSelected(null)}
          className={`grid place-items-center w-11 h-11 shrink-0 -mr-2 -mt-1 rounded-full transition hover:bg-white/[0.06] ${FOCUS_RING}`}
          aria-label={hasPersona ? t('profile.observatory.backToPersona') : t('common.close')}
          title={hasPersona ? t('profile.observatory.backToPersona') : t('common.close')}
        >
          <X className="w-[18px] h-[18px]" style={{ color: MIST }} aria-hidden />
        </button>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-2">
        {[
          { label: t('profile.observatory.moodShareLabel'), value: pct(selectedSlice?.share ?? 0), color: PAPER },
          { label: t('profile.observatory.moodFilmsLabel'), value: String(selectedSlice?.films ?? 0), color: PAPER },
          {
            label: isOwn ? t('profile.observatory.moodAvgLabel') : t('profile.observatory.moodAvgLabelOf'),
            value: avgText(selectedSlice?.avg),
            color: typeof selectedSlice?.avg === 'number' ? ratingTone(Math.round(selectedSlice.avg)).color : MIST,
          },
        ].map((cell) => (
          <div key={cell.label} className="rounded-xl px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.04)' }}>
            <dd style={{ ...PIXEL, color: cell.color }} className="text-2xl leading-none tabular-nums">
              {cell.value}
            </dd>
            <dt className="mt-1 text-[11px] leading-tight" style={{ color: MIST }}>
              {cell.label}
            </dt>
          </div>
        ))}
      </dl>

      <p className="mt-4 text-[14px] leading-relaxed" style={{ color: 'rgba(243,234,211,0.86)' }}>
        {t(selectedMood.readingKey)}
      </p>

      {selectedSlice && selectedSlice.top.length > 0 && (
        <div className="mt-4">
          {sectionLabel(isOwn ? t('profile.observatory.moodTop') : t('profile.observatory.moodTopOf', { name: ownerName }))}
          <ul className="mt-2 grid grid-cols-4 gap-2 max-w-[320px]">
            {selectedSlice.top.map((item) => {
              const tone = ratingTone(item.userRating);
              return (
                <li key={`${item.media_type}:${item.id}`} className="min-w-0">
                  <button
                    type="button"
                    onClick={() => openMovie(item)}
                    className={`group relative block w-full aspect-[2/3] rounded-lg overflow-hidden ring-1 ring-white/10 hover:ring-white/30 transition ${FOCUS_RING}`}
                    style={{ background: VELVET }}
                    aria-label={`${item.title}${typeof item.userRating === 'number' ? ` · ${item.userRating}` : ''}`}
                    title={item.title}
                  >
                    {item.poster_path ? (
                      <img src={`https://image.tmdb.org/t/p/w185${item.poster_path}`} alt="" loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-300" />
                    ) : (
                      <span className="absolute inset-0 grid place-items-center" style={{ color: MIST }}>
                        <Film className="w-5 h-5" aria-hidden />
                      </span>
                    )}
                    {typeof item.userRating === 'number' && (
                      <span
                        className="absolute bottom-1 right-1 h-5 min-w-[20px] px-1 grid place-items-center rounded-md text-[12px] leading-none"
                        style={{ ...PIXEL, background: 'rgba(18,13,34,0.86)', color: tone.color, boxShadow: `inset 0 0 0 1px ${tone.ring}` }}
                      >
                        {item.userRating}
                      </span>
                    )}
                    {opening === item.id && <span className="absolute inset-0 bg-black/50 animate-pulse" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="mt-4">
        {sectionLabel(t('profile.observatory.keywordsInMood', { mood: t(selectedMood.labelKey) }))}
        <div className="mt-2">
          <KeywordCloud words={selectedSlice?.keywords ?? []} perGroup={compact ? 4 : 5} accent={selectedMood.color} emptyText={t('profile.observatory.keywordsEmptyMood')} compact={compact} />
        </div>
      </div>

      {/* 09/11/2026: o humor escolhido abre a prateleira dele no Acervo (a
          página única da Mesa dos Oráculos; a Mesa de cartas saiu). */}
      <Link
        to={`/oracle/acervo?mood=${selectedMood.key}`}
        className={`mt-3 inline-flex items-center justify-start gap-1.5 text-sm font-medium rounded ${FOCUS_RING}`}
        style={{ color: selectedMood.color }}
      >
        {t('profile.observatory.openShelf')}
        <ArrowUpRight className="w-4 h-4" aria-hidden />
      </Link>
    </div>
  ) : null;

  // ---------- as nove prateleiras, numa fileira de plaquinhas ----------
  // O que os frascos mostravam (a letra, a parte dos títulos, o nível e a
  // posição no código), agora embaixo do estúdio. Tocar escolhe o humor.
  const maxShare = Math.max(0.0001, ...slices.map((slice) => slice.share));
  const moodStrip = (
    <ul className="mt-3 grid grid-cols-9 gap-1 sm:gap-1.5" aria-label={t('profile.observatory.gridLabel')}>
      {MOODS.map((mood) => {
        const slice = bySlice.get(mood.key);
        const share = slice?.share ?? 0;
        const rank = codeKeys.indexOf(mood.key);
        const isSel = selected === mood.key;
        const label = t('profile.observatory.arcLabel', { mood: t(mood.labelKey), pct: pct(share), count: slice?.films ?? 0, avg: avgText(slice?.avg) });
        return (
          <li key={mood.key} className="min-w-0">
            <button
              type="button"
              onClick={() => toggle(mood.key)}
              aria-pressed={isSel}
              aria-label={label}
              title={label}
              className={`relative block w-full min-w-0 h-[54px] overflow-hidden rounded-[10px] transition ${FOCUS_RING}`}
              style={{
                background: 'rgba(13,9,25,0.72)',
                boxShadow: isSel ? `0 0 0 2px ${mood.color}, 0 10px 22px -12px ${mood.color}` : rank >= 0 ? `inset 0 0 0 1.5px ${withMoodAlpha(mood, 0.75)}` : 'inset 0 0 0 1px rgba(255,255,255,0.1)',
                opacity: selected !== null && !isSel ? 0.55 : 1,
              }}
            >
              {/* o nível: a prateleira mais cheia vai até perto do alto */}
              <span aria-hidden className="absolute inset-x-0 bottom-0" style={{ height: `${share > 0 ? 10 + (share / maxShare) * 62 : 0}%`, background: withMoodAlpha(mood, isSel ? 0.5 : 0.3) }} />
              <span className="relative flex h-full flex-col items-center justify-center gap-[3px]">
                <span style={{ ...PIXEL, color: mood.color, textShadow: '0 1px 6px rgba(13,9,25,0.9)' }} className="text-[18px] leading-none">
                  {mood.letter}
                </span>
                <span style={{ ...PIXEL, color: PAPER, textShadow: '0 1px 6px rgba(13,9,25,0.9)' }} className="text-[11px] leading-none tabular-nums">
                  {pct(share)}
                </span>
              </span>
              {rank >= 0 && (
                <span aria-hidden className="absolute right-[3px] top-[3px] grid h-[13px] w-[13px] place-items-center rounded-full text-[9px] leading-none" style={{ ...PIXEL, background: mood.color, color: NIGHT }}>
                  {rank + 1}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );

  // ---------- bloco ----------
  return (
    <section className="relative h-full rounded-3xl p-5 sm:p-7 overflow-hidden" style={glassPanel(accent)}>
      <ModuleTitle
        title={isOwn ? t('oracle.cinematicEssenceLabel') : t('profile.essenceOf', { username })}
        hint={counted > 0 ? t('profile.observatory.moodsHint', { count: counted }) : undefined}
        action={
          <button
            type="button"
            onClick={() => setShowHowItWorks(true)}
            className={`grid place-items-center w-11 h-11 shrink-0 -mr-2 -mt-2 rounded-full transition hover:bg-white/[0.06] ${FOCUS_RING}`}
            aria-label={t('profile.howItWorks')}
            title={t('profile.howItWorks')}
          >
            <Info className="w-5 h-5 text-sky-300" aria-hidden />
          </button>
        }
      />

      <div className="mt-5 grid md:grid-cols-[360px_minmax(0,1fr)] lg:grid-cols-[540px_minmax(0,1fr)] gap-6 md:gap-8 items-start">
        <div className="min-w-0">
          {/* O estúdio. No celular ele vai de borda a borda do bloco, para a cena de 2× caber. */}
          {world && worldSt ? (
            <div className="-mx-5 sm:mx-0 overflow-hidden sm:rounded-2xl" style={{ background: '#0D0919', boxShadow: 'inset 0 0 0 1px rgba(243,234,211,0.08)' }}>
              <PersonaScene
                world={world}
                state={worldSt}
                maxScale={3}
                onPick={pickScene}
                extras={doors.extras}
                hotspots={doors.hotspots}
                label={worldSt.hasTrio ? t('personaWorld.sceneLabel', { code: worldSt.code }) : t('personaWorld.sceneLabelEmpty')}
              />
            </div>
          ) : (
            ownerId && <div className="-mx-5 sm:mx-0 h-[316px] lg:h-[474px] sm:rounded-2xl animate-pulse" style={{ background: 'rgba(13,9,25,0.7)' }} aria-hidden />
          )}
          {moodStrip}
        </div>

        <div ref={panelRef} className="min-w-0 scroll-mt-24">
          <AnimatePresence mode="wait">
            <motion.div
              key={selected ?? 'persona'}
              initial={reduceMotion ? false : { opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.22 }}
            >
              {moodPanel ?? personaPanel}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {hasPersona && persona && <PersonaRevelationSheet open={showRevelation} onClose={() => setShowRevelation(false)} persona={persona} isOwn={isOwn} />}
      <PersonaHowItWorksSheet open={showHowItWorks} onClose={() => setShowHowItWorks(false)} persona={persona} isOwn={isOwn} />
      {movie && <MovieDetailsModal movie={movie} isOpen={true} onClose={() => setMovie(null)} />}
      {bookOpen && world && (
        <Suspense fallback={null}>
          <EvolutionBook world={world} isOwn={isOwn} ownerName={ownerName ?? null} extras={doors.extras} onClose={() => setBookOpen(false)} />
        </Suspense>
      )}
      {worldMounted && ownerId && (
        <Suspense fallback={null}>
          <PersonaWorldSheet
            open={showWorld}
            onClose={() => setShowWorld(false)}
            ownerId={ownerId}
            isOwn={isOwn}
            ownerName={ownerName}
            persona={persona}
            initialWorld={world}
            viewerId={isOwn ? ownerId : undefined}
            username={shareName}
            onUserClick={isOwn ? (name) => navigate(`/profile/${name}`) : undefined}
          />
        </Suspense>
      )}
    </section>
  );
};

export default EssenceRing;
