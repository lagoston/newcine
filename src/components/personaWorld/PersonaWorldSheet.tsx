import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Info, LayoutGrid, LibraryBig, Plus, RotateCw, Scroll, Share2 } from 'lucide-react';
import OracleSheet from '../OracleSheet';
import PersonaWorks from '../PersonaWorks';
import PersonasModal from '../PersonasModal';
import PersonaShareModal from '../PersonaShareModal';
import MovieDetailsModal from '../MovieDetailsModal';
import { PersonaRevelationSheet, PersonaHowItWorksSheet } from '../PersonaSheets';
import { PERSONA_THRESHOLD, type UserPersona } from '../../lib/persona';
import { fetchPersonaWorld, type PersonaWorld, type WorldTitle } from '../../lib/personaWorld';
import { getFullTitle } from '../../lib/titleCards';
import type { Movie } from '../../lib/tmdb';
import { FOCUS_RING, MIST, PAPER } from '../../lib/oracleTheme';
import { rememberPatronus } from '../patronus/patronus';
import PersonaWorldView from './PersonaWorld';

// A gaveta "Sua Persona" (13/11/2026): a Persona viva, a cabine e a mariposa.
//
// É a mesma gaveta na home (a porta da Persona) e no perfil (o bloco da
// personalidade), no seu e no dos outros — no dos outros só para olhar: sem a
// galeria das Personalidades, sem compartilhar e sem os convites.
//
// Antes (02/11/2026) a gaveta da home era uma ficha: a carta, o código, o
// texto e as nove barras. Agora a ficha virou cena (PersonaWorldView); os
// atalhos de sempre (Revelação, Como funciona, Personalidades, Compartilhar) e
// as obras do personagem continuam embaixo dela. A fala de cinco linhas do
// Oráculo para quem ainda não tem Persona saiu: no lugar, o ovo ou a lagarta
// na cabine vazia e o caminho até o casulo.
//
// A cena vem de get_persona_world, pedida a cada abertura (a nota que a pessoa
// acabou de dar já aparece).

type Nested = 'revelation' | 'howItWorks' | 'personas' | 'share' | null;

const GHOST_BUTTON = `inline-flex items-center gap-2 h-11 px-4 rounded-xl border border-white/15 hover:border-white/35 hover:bg-white/5 text-sm font-medium transition ${FOCUS_RING}`;
const PRIMARY_BUTTON = `inline-flex items-center justify-center gap-2 min-h-[48px] px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white font-semibold text-center leading-snug shadow-lg shadow-fuchsia-900/30 transition ${FOCUS_RING}`;

interface PersonaWorldSheetProps {
  open: boolean;
  onClose: () => void;
  // de quem é a cabine
  ownerId: string;
  isOwn: boolean;
  // "@fulano", no perfil de outra pessoa
  ownerName?: string | null;
  // o que quem abre já sabe da Persona (vale enquanto a cena carrega)
  persona: UserPersona | null;
  // a cena que quem abre já tem (o perfil mostra a miniatura dela)
  initialWorld?: PersonaWorld | null;
  // só na sua: a galeria das Personalidades e o cartão de compartilhar
  viewerId?: string;
  username?: string | null;
  onUserClick?: (username: string) => void;
}

const PersonaWorldSheet: React.FC<PersonaWorldSheetProps> = ({ open, onClose, ownerId, isOwn, ownerName, persona: seed, initialWorld = null, viewerId, username = null, onUserClick }) => {
  const { t } = useTranslation();
  const [world, setWorld] = useState<PersonaWorld | null>(initialWorld);
  const [failed, setFailed] = useState(false);
  const [nested, setNested] = useState<Nested>(null);
  const [movie, setMovie] = useState<Movie | null>(null);
  const [openingKey, setOpeningKey] = useState<string | null>(null);
  const closeNested = () => setNested(null);

  const load = useCallback(() => {
    setFailed(false);
    fetchPersonaWorld(ownerId)
      .then((value) => {
        if (value) {
          setWorld(value);
          // a cena da própria pessoa atualiza o Patrono dela (a mariposa de
          // luz do menu do título): quem acabou de mudar de forma já vê a nova
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
  // outra pessoa: não mostra a cabine da anterior enquanto a nova carrega
  const shownOwner = useRef(ownerId);
  useEffect(() => {
    if (shownOwner.current === ownerId) return;
    shownOwner.current = ownerId;
    setWorld(null);
  }, [ownerId]);

  const persona = world?.persona ?? seed;
  const hasPersona = Boolean(persona?.code && persona.persona);

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

  const actions = [
    hasPersona ? { key: 'revelation' as const, icon: Scroll, tint: 'text-pink-300', label: t('oracle.revelation') } : null,
    { key: 'howItWorks' as const, icon: Info, tint: 'text-sky-300', label: t('profile.howItWorks') },
    isOwn && viewerId && onUserClick ? { key: 'personas' as const, icon: LayoutGrid, tint: 'text-emerald-300', label: t('oracle.hub.archetypes') } : null,
    isOwn && hasPersona ? { key: 'share' as const, icon: Share2, tint: 'text-amber-300', label: t('oracle.hub.share') } : null,
  ].filter((action): action is NonNullable<typeof action> => Boolean(action));

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
        escapeEnabled={nested === null && !movie}
      >
        <div className="space-y-6">
          {world ? (
            <PersonaWorldView world={world} isOwn={isOwn} onOpenTitle={openTitle} openingKey={openingKey} onOpenRevelation={() => hasPersona && setNested('revelation')} onNavigate={onClose} />
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
              <div className="-mx-5 sm:mx-0 h-[296px] sm:h-[438px] sm:rounded-2xl animate-pulse" style={{ background: '#0D0919' }} />
              <div className="h-16 rounded-xl bg-white/[0.06] animate-pulse" />
              <div className="h-11 rounded-xl bg-white/[0.06] animate-pulse" />
            </div>
          )}

          {/* quem ainda não tem Persona: o caminho até ela */}
          {isOwn && !hasPersona && (world || failed) && (
            <section className="space-y-3">
              {/* o caminho já está no "Por vir" (o casulo); aqui só o aviso de quem
                  tem títulos de sobra mas em menos de 3 prateleiras */}
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

          <div className={`grid gap-2 ${actions.length >= 4 ? 'grid-cols-2 sm:grid-cols-4' : actions.length === 1 ? 'grid-cols-1 sm:max-w-[220px]' : 'grid-cols-2 sm:max-w-md'}`}>
            {actions.map(({ key, icon: Icon, tint, label }) => (
              <button key={key} type="button" onClick={() => setNested(key)} className={`${GHOST_BUTTON} justify-center px-3 whitespace-nowrap`} style={{ color: PAPER }}>
                <Icon className={`w-[18px] h-[18px] shrink-0 ${tint}`} aria-hidden />
                {label}
              </button>
            ))}
          </div>

          {hasPersona && persona?.persona && <PersonaWorks persona={persona.persona} seen={persona.worksSeen} />}
        </div>
      </OracleSheet>

      {/* As gavetas de dentro abrem por cima desta (montam depois dela). */}
      {hasPersona && persona && <PersonaRevelationSheet open={nested === 'revelation'} onClose={closeNested} persona={persona} isOwn={isOwn} />}
      <PersonaHowItWorksSheet open={nested === 'howItWorks'} onClose={closeNested} persona={persona} isOwn={isOwn} />
      {isOwn && viewerId && onUserClick && <PersonasModal isOpen={nested === 'personas'} onClose={closeNested} viewerId={viewerId} viewerPersonaCode={persona?.code ?? null} onUserClick={onUserClick} />}
      {isOwn && hasPersona && persona && <PersonaShareModal isOpen={nested === 'share'} onClose={closeNested} persona={persona} username={username} />}
      {movie && (
        <MovieDetailsModal
          movie={movie}
          isOpen={true}
          onClose={() => {
            setMovie(null);
            // a pessoa pode ter dado ou trocado uma nota: a cabine já mostra
            if (isOwn) load();
          }}
        />
      )}
    </>
  );
};

export default PersonaWorldSheet;
