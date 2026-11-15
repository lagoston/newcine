import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LibraryBig, Plus, RotateCw } from 'lucide-react';
import OracleSheet from '../OracleSheet';
import PersonaWorks from '../PersonaWorks';
import MovieDetailsModal from '../MovieDetailsModal';
import { PERSONA_THRESHOLD, type PersonaEntry, type UserPersona } from '../../lib/persona';
import { fetchPersonaWorld, type PersonaWorld, type WorldTitle } from '../../lib/personaWorld';
import { getFullTitle } from '../../lib/titleCards';
import type { Movie } from '../../lib/tmdb';
import { FOCUS_RING, MIST, PAPER } from '../../lib/oracleTheme';
import { fetchPersonaEntries, fetchPersonaHistory, worldAt, type PersonaHistory } from '../../lib/personaHistory';
import { rememberPatronus } from '../patronus/patronus';
import PersonaWorldView from './PersonaWorld';
import { useStudioDoors, type StudioJackpot } from './useStudioDoors';

// O guia do estúdio e a gaveta de compartilhar só são baixados quando alguém abre.
const StudioGuide = lazy(() => import('./StudioGuide'));
const PersonaShareModal = lazy(() => import('../PersonaShareModal'));

// A gaveta "Sua Persona" (13/11/2026): a Persona viva, o estúdio e a mariposa.
//
// É a mesma gaveta na home (o estúdio) e no perfil (o bloco da personalidade),
// no seu e no dos outros — no dos outros só para olhar: sem compartilhar, sem
// a barra da Evolução e sem os convites.
//
// A cena vem de get_persona_world, pedida a cada abertura (a nota que a pessoa
// acabou de dar já aparece).
//
// 14/11/2026 (noite), correções do Bruno:
//   • a gaveta é uma página só, sem as abas "Sempre, Agora, Por vir"
//     (PersonaWorldView);
//   • saíram os botões Revelação e Como funciona, e o das Personalidades foi
//     para dentro do guia do estúdio (o livro da estante), junto com as nove
//     prateleiras, a legenda das latas e a forma vizinha;
//   • compartilhar virou um botão pequeno ao lado do código, e a imagem que
//     sai é a do estúdio com a mariposa (lib/studioCard);
//   • a barra da Evolução (EvolutionBar) não tem botão nem passa sozinha: é a
//     terceira barra, abaixo de "Sempre" e "Agora", e quem move é a pessoa. A
//     história (get_persona_history) é buscada quando a gaveta abre, só para o
//     dono. Enquanto a barra está fora da ponta direita, a gaveta inteira
//     mostra o estúdio como ele era naquela nota.

const GHOST_BUTTON = `inline-flex items-center gap-2 h-11 px-4 rounded-xl border border-white/15 hover:border-white/35 hover:bg-white/5 text-sm font-medium transition ${FOCUS_RING}`;
const PRIMARY_BUTTON = `inline-flex items-center justify-center gap-2 min-h-[48px] px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white font-semibold text-center leading-snug shadow-lg shadow-fuchsia-900/30 transition ${FOCUS_RING}`;

interface PersonaWorldSheetProps {
  open: boolean;
  onClose: () => void;
  // de quem é o estúdio
  ownerId: string;
  isOwn: boolean;
  // "@fulano", no estúdio de outra pessoa
  ownerName?: string | null;
  // a Persona que quem abriu já tinha em mãos (aparece enquanto a cena chega)
  persona: UserPersona | null;
  // a cena que quem abriu já tinha (a gaveta abre com ela e busca a de agora)
  initialWorld?: PersonaWorld | null;
  // o seu nome de usuário (vai na imagem de compartilhar)
  username?: string | null;
  // na home: a máquina do Jackpot com tudo o que a porta fazia
  jackpot?: StudioJackpot;
}

const PersonaWorldSheet: React.FC<PersonaWorldSheetProps> = ({ open, onClose, ownerId, isOwn, ownerName, persona: seed, initialWorld = null, username = null, jackpot }) => {
  const { t } = useTranslation();
  const [world, setWorld] = useState<PersonaWorld | null>(initialWorld);
  const [failed, setFailed] = useState(false);
  const [movie, setMovie] = useState<Movie | null>(null);
  const [openingKey, setOpeningKey] = useState<string | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  // a gaveta de compartilhar fica montada depois da primeira abertura (para a saída animar)
  const [shareMounted, setShareMounted] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    fetchPersonaWorld(ownerId)
      .then((value) => {
        if (value) {
          setWorld(value);
          // a mariposa de luz do menu dos títulos (o Patrono) é a desta cena
          if (isOwn) rememberPatronus(ownerId, value);
        } else setFailed(true);
      })
      .catch((error) => {
        console.error('Persona world:', error);
        setFailed(true);
      });
  }, [ownerId, isOwn]);
  useEffect(() => {
    if (open) load();
  }, [open, load]);
  // mudou de dono (outro perfil): a cena antiga sai
  const shownOwner = useRef(ownerId);
  useEffect(() => {
    if (shownOwner.current === ownerId) return;
    shownOwner.current = ownerId;
    setWorld(null);
  }, [ownerId]);

  // ---- a evolução desde o início (só no seu estúdio) ----
  const [story, setStory] = useState<{ history: PersonaHistory; entries: Record<string, PersonaEntry> } | null>(null);
  const [storyFailed, setStoryFailed] = useState(false);
  // null = na ponta direita (hoje)
  const [position, setPosition] = useState<number | null>(null);
  const rated = world?.rated ?? 0;
  const wantsStory = open && isOwn && rated > 0;
  useEffect(() => {
    if (!wantsStory) return;
    let alive = true;
    setStoryFailed(false);
    fetchPersonaHistory(ownerId)
      .then(async (history) => {
        if (!history || history.rows.length === 0) throw new Error('empty history');
        const entries = await fetchPersonaEntries(history.molts.map((molt) => molt.to));
        if (alive) setStory({ history, entries });
      })
      .catch((error) => {
        console.error('Persona history:', error);
        if (alive) setStoryFailed(true);
      });
    return () => {
      alive = false;
    };
    // `rated` entra para a história acompanhar uma nota dada com a gaveta aberta
  }, [wantsStory, ownerId, rated]);
  // fechou a gaveta: a barra volta para hoje
  useEffect(() => {
    if (open) return;
    setPosition(null);
    setStory(null);
  }, [open, ownerId]);

  const total = story?.history.rows.length ?? 0;
  const at = position === null ? total : Math.min(position, total);
  const travelling = Boolean(story) && at < total;
  const shownWorld = useMemo(() => (travelling && story && world ? worldAt(story.history, at, world, story.entries) : world), [travelling, story, world, at]);

  const openGuide = useCallback(() => setGuideOpen(true), []);
  const doors = useStudioDoors({ world, isOwn, ownerUsername: ownerName ? ownerName.replace(/^@/, '') : null, onOpenBook: openGuide, jackpot, onLeave: onClose });

  const persona = shownWorld?.persona ?? seed;
  const hasPersona = Boolean(persona?.code && persona.persona);
  // compartilha-se a Persona de hoje, não a de um ponto da barra
  const today = world?.persona ?? seed;
  const canShare = isOwn && Boolean(today?.code && today.persona) && Boolean(world);

  // Um título da cena: busca os detalhes e abre o modal dele por cima da gaveta.
  const openTitle = async (title: WorldTitle) => {
    const key = `${title.type}:${title.id}`;
    setOpeningKey(key);
    try {
      setMovie(await getFullTitle({ id: title.id, media_type: title.type }));
    } catch (error) {
      console.error('Persona world title:', error);
    } finally {
      setOpeningKey((current) => (current === key ? null : current));
    }
  };

  const threshold = persona?.threshold || PERSONA_THRESHOLD;
  const counted = world?.counted ?? persona?.counted ?? 0;

  return (
    <>
      <OracleSheet
        open={open}
        onClose={onClose}
        title={isOwn ? t('home.persona.title') : t('personaWorld.titleOf', { name: ownerName ?? '' })}
        subtitle={t('personaWorld.subtitle')}
        size="lg"
        escapeEnabled={!shareOpen && !movie && !guideOpen}
      >
        <div className="space-y-6">
          {shownWorld ? (
            <PersonaWorldView
              world={shownWorld}
              onOpenTitle={openTitle}
              openingKey={openingKey}
              doors={doors}
              onShare={
                canShare
                  ? () => {
                      setShareMounted(true);
                      setShareOpen(true);
                    }
                  : undefined
              }
              evolution={
                isOwn && rated > 0
                  ? {
                      total,
                      position: at,
                      loading: !story && !storyFailed,
                      failed: storyFailed,
                      marks: story ? story.history.molts.map((molt) => molt.index + 1) : [],
                      row: story && at > 0 ? (story.history.rows[at - 1] ?? null) : null,
                      molt: story ? (story.history.molts.find((molt) => molt.index === at - 1) ?? null) : null,
                      onSeek: (value) => setPosition(value >= total ? null : value),
                    }
                  : null
              }
            />
          ) : failed ? (
            <div className="rounded-2xl p-5 text-center ring-1 ring-white/10" style={{ background: 'rgba(28,20,51,0.55)' }}>
              <p className="text-[15px]" style={{ color: MIST }}>
                {t('personaWorld.loadError')}
              </p>
              <button type="button" onClick={load} className={`${GHOST_BUTTON} mt-3`} style={{ color: PAPER }}>
                <RotateCw className="w-[18px] h-[18px] text-violet-300" aria-hidden />
                {t('personaWorld.retry')}
              </button>
            </div>
          ) : (
            <div className="space-y-4" aria-busy="true" aria-label={t('personaWorld.loading')}>
              <div className="-mx-5 sm:mx-0 h-[328px] sm:h-[486px] sm:rounded-2xl animate-pulse" style={{ background: '#0D0919' }} />
              <div className="h-16 rounded-xl bg-white/[0.06] animate-pulse" />
              <div className="h-40 rounded-xl bg-white/[0.06] animate-pulse" />
            </div>
          )}

          {/* quem ainda não tem Persona: o caminho até ela */}
          {isOwn && !hasPersona && !travelling && (world || failed) && (
            <section className="space-y-3">
              {counted >= threshold && (
                <p className="text-[15px] leading-relaxed" style={{ color: MIST }}>
                  {t('oracle.intro.needMoreShelves')}
                </p>
              )}
              <div className="flex flex-col sm:flex-row flex-wrap gap-2">
                <Link to="/oracle/acervo" onClick={onClose} className={PRIMARY_BUTTON}>
                  <LibraryBig className="w-5 h-5 shrink-0" aria-hidden />
                  {t('oracle.intro.exploreLibrary')}
                </Link>
                <Link to="/add-movies" onClick={onClose} className={`${GHOST_BUTTON} h-12 justify-center`} style={{ color: PAPER }}>
                  <Plus className="w-[18px] h-[18px] text-violet-300" aria-hidden />
                  {t('library.addMovies')}
                </Link>
              </div>
            </section>
          )}

          {/* as obras do personagem (as de hoje; somem enquanto a barra da Evolução está no passado) */}
          {hasPersona && !travelling && persona?.persona && <PersonaWorks persona={persona.persona} seen={persona.worksSeen} />}
        </div>
      </OracleSheet>

      {/* O que abre por cima desta gaveta (monta depois dela). */}
      {shareMounted && canShare && today && world && (
        <Suspense fallback={null}>
          <PersonaShareModal isOpen={shareOpen} onClose={() => setShareOpen(false)} persona={today} world={world} extras={doors.extras} username={username} />
        </Suspense>
      )}
      {guideOpen && world && (
        <Suspense fallback={null}>
          <StudioGuide world={world} isOwn={isOwn} ownerName={ownerName ?? null} extras={doors.extras} onClose={() => setGuideOpen(false)} />
        </Suspense>
      )}
      {movie && (
        <MovieDetailsModal
          movie={movie}
          isOpen={true}
          onClose={() => {
            setMovie(null);
            // a nota pode ter mudado lá dentro: a cena acompanha
            if (isOwn) load();
          }}
        />
      )}
    </>
  );
};

export default PersonaWorldSheet;
