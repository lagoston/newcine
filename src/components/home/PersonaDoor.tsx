import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import PersonalityCompletionModal from '../PersonalityCompletionModal';
import { PersonaCard, PersonaCode } from '../PersonaBits';
import PersonaSheet from './PersonaSheet';
import { DOOR_ART, DOOR_BODY, DOOR_CHIPS, DOOR_CLASS, DOOR_CTA, DOOR_CTA_LABEL, DOOR_FAN, DOOR_HINT } from './doorLayout';
import DoorArrow from './DoorArrow';
import { MOOD_BY_KEY, MOOD_BY_LETTER, type Mood } from '../../lib/moods';
import { fetchUserPersona, personaText, PERSONA_THRESHOLD, type UserPersona } from '../../lib/persona';
import { markRevealSeen, revealModeFor, type RevealMode } from '../../lib/personaReveal';
import { FOCUS_RING, ORACLES, PAPER, PIXEL, withAlpha } from '../../lib/oracleTheme';

// A porta da Persona, na home (02/11/2026): a terceira porta, no mesmo porte
// da Biblioteca dos Oráculos e do Poster Jackpot, no lugar da seção de
// personalidade da Central dos Oráculos (extinta). O mundo dela são as cores
// das três prateleiras do código da pessoa — cada um vê a sua porta pintada
// com a própria personalidade:
//   • com personalidade — a carta do personagem na frente, duas cartas nas
//     cores das prateleiras atrás, "Sua Persona" em degradê dessas cores, o
//     código e o título, e as três prateleiras empilhadas, cada uma com a
//     sua barra de força (as mesmas linhas de "Suas nove prateleiras" e do
//     "Como funciona": a soma das notas, relativa à mais forte) — desde
//     02/11/2026 (noite); antes eram etiquetas;
//   • sem personalidade — três cartas viradas (a da frente com "?") e o
//     progresso até a revelação.
// A revelação (o modal grande) aparece aqui, uma vez por personalidade
// (lib/personaReveal). Aberta de fora com
// navigate('/', { state: { openPersona: true } }).

const DEFAULT_TINTS = ['#A78BFA', '#F0ABFC', '#38BDF8'];

const PersonaDoor: React.FC<{ userId: string; username: string | null }> = ({ userId, username }) => {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [persona, setPersona] = useState<UserPersona | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [reveal, setReveal] = useState<RevealMode | null>(null);

  const load = useCallback(() => {
    fetchUserPersona(userId)
      .then((value) => {
        setPersona(value);
        if (value?.code && value.persona) {
          const mode = revealModeFor(userId, value.code, value.persona.tmdbId);
          if (mode) setReveal(mode);
        }
      })
      .catch((error) => console.error('Persona door:', error))
      .finally(() => setLoaded(true));
  }, [userId]);
  useEffect(() => {
    load();
  }, [load]);

  // Aberta de fora (perfil, links antigos da Central).
  const requested = (location.state as { openPersona?: boolean } | null)?.openPersona;
  useEffect(() => {
    if (!requested) return;
    setOpen(true);
    navigate(location.pathname + location.search, { replace: true, state: null });
  }, [requested, navigate, location.pathname, location.search]);

  const closeReveal = () => {
    if (persona?.code) markRevealSeen(userId, persona.code, persona.persona?.tmdbId ?? null);
    setReveal(null);
  };

  const hasPersona = Boolean(persona?.code && persona.persona);
  const moods: Mood[] = useMemo(() => {
    if (!persona?.code) return [];
    return persona.code
      .split('')
      .map((letter) => MOOD_BY_LETTER[letter])
      .filter(Boolean);
  }, [persona?.code]);
  const tints = moods.length === 3 ? moods.map((m) => m.color) : DEFAULT_TINTS;
  const text = hasPersona && persona?.persona ? personaText(persona.persona, i18n.language) : null;
  const threshold = persona?.threshold || PERSONA_THRESHOLD;
  const counted = Math.min(persona?.counted ?? 0, threshold);
  // As três prateleiras do código, com a força de cada uma (a mais forte =
  // barra cheia), como em MoodBars.
  const topScores = hasPersona && persona ? persona.scores.filter((s) => s.films > 0).slice(0, 3) : [];
  const topMax = Math.max(1, ...topScores.map((s) => s.score));

  if (!loaded) {
    return <span className={`${DOOR_CLASS} pointer-events-none animate-pulse`} style={{ background: 'rgba(28,20,51,0.55)', minHeight: 120 }} aria-hidden />;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${DOOR_CLASS} ${FOCUS_RING}`}
        style={{
          background: [
            ...tints.map((color, i) => `radial-gradient(42% 90% at ${10 + i * 12}% 100%, ${withAlpha(color, 0.22)}, transparent 70%)`),
            `radial-gradient(70% 120% at 100% 0%, ${withAlpha(tints[0], 0.16)}, transparent 60%)`,
            'linear-gradient(135deg, #1a1030, #0f0a1c 55%, #170c26)',
          ].join(', '),
          boxShadow: `inset 0 0 0 1px ${withAlpha(tints[0], 0.3)}, 0 18px 40px -26px ${withAlpha(tints[1], 0.6)}`,
        }}
        aria-label={hasPersona && persona?.code && text ? t('home.persona.doorAria', { code: persona.code, title: text.title }) : t('home.persona.doorAriaEmpty')}
      >
        {/* O fio com as três cores, no alto (o mesmo fio do pé da carta). */}
        <span aria-hidden className="absolute left-5 right-5 top-0 flex h-[2px] rounded-full overflow-hidden opacity-80 transition-opacity duration-300 group-hover:opacity-100">
          {tints.map((color, i) => (
            <span key={i} className="flex-1" style={{ background: color, boxShadow: `0 0 10px 1px ${withAlpha(color, 0.6)}` }} />
          ))}
        </span>

        {/* As cartas em leque */}
        <span className={DOOR_ART} aria-hidden>
          <span className={DOOR_FAN}>
            {[0, 1].map((side) => {
              const color = hasPersona ? tints[side === 0 ? 1 : 2] : ORACLES[side === 0 ? 0 : 2].color;
              const letter = hasPersona ? moods[side === 0 ? 1 : 2]?.letter : '';
              return (
                <span
                  key={side}
                  className={`absolute left-1/2 top-1/2 grid place-items-center w-[48px] sm:w-[58px] aspect-[4/5] rounded-lg transition-transform duration-300 ease-out ${
                    side === 0
                      ? '[transform:translate(calc(-50%_-_30px),-44%)_rotate(-13deg)] group-hover:[transform:translate(calc(-50%_-_38px),-46%)_rotate(-17deg)]'
                      : '[transform:translate(calc(-50%_+_30px),-44%)_rotate(13deg)] group-hover:[transform:translate(calc(-50%_+_38px),-46%)_rotate(17deg)]'
                  }`}
                  style={{
                    background: `radial-gradient(80% 70% at 50% 30%, ${withAlpha(color, 0.55)}, ${withAlpha(color, 0.18)} 70%), #120c22`,
                    boxShadow: `inset 0 0 0 1.5px ${withAlpha(color, 0.75)}, 0 10px 20px -8px rgba(0,0,0,0.9), 0 0 16px -4px ${withAlpha(color, 0.7)}`,
                  }}
                >
                  <span style={{ ...PIXEL, color: hasPersona ? '#fff' : withAlpha(color, 0.9), textShadow: `0 0 10px ${color}` }} className="text-[22px] sm:text-[26px] leading-none opacity-90">
                    {hasPersona ? letter : '✦'}
                  </span>
                </span>
              );
            })}
            {hasPersona && persona?.persona ? (
              <span className="absolute left-1/2 top-1/2 z-[2] w-[56px] sm:w-[66px] transition-transform duration-300 ease-out [transform:translate(-50%,-52%)] group-hover:[transform:translate(-50%,-56%)]">
                <PersonaCard persona={persona.persona} code={persona.code} eager className="w-full" />
              </span>
            ) : (
              <span
                className="absolute left-1/2 top-1/2 z-[2] grid place-items-center w-[56px] sm:w-[66px] aspect-[4/5] rounded-[12px] transition-transform duration-300 ease-out [transform:translate(-50%,-52%)] group-hover:[transform:translate(-50%,-56%)]"
                style={{ background: 'linear-gradient(160deg, #2a1d4d, #120c22)', boxShadow: `inset 0 0 0 2px ${PAPER}, 0 12px 24px -10px rgba(0,0,0,0.95), 0 0 22px -6px rgba(240,171,252,0.8)` }}
              >
                <span style={{ ...PIXEL, color: '#F0ABFC', textShadow: '0 0 14px rgba(240,171,252,0.9)' }} className="text-[34px] sm:text-[40px] leading-none">
                  ?
                </span>
              </span>
            )}
          </span>
        </span>

        <span className={DOOR_BODY}>
          <span
            style={{
              ...PIXEL,
              backgroundImage: `linear-gradient(95deg, ${tints[0]}, ${PAPER} 45%, ${tints[2]})`,
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
              filter: `drop-shadow(0 0 12px ${withAlpha(tints[1], 0.45)})`,
            }}
            className="block text-[22px] sm:text-[30px] leading-none"
          >
            {t('home.persona.title')}
          </span>

          {hasPersona && persona?.code && text ? (
            <span className={DOOR_HINT} style={{ color: '#CFC6EC' }}>
              <PersonaCode code={persona.code} className="mr-1.5 text-[15px] sm:text-base leading-none tracking-[0.08em]" />
              {text.title}
            </span>
          ) : (
            <span className={DOOR_HINT} style={{ color: '#CFC6EC' }}>
              {t('home.persona.hintEmpty', { count: threshold })}
            </span>
          )}

          {hasPersona ? (
            <span className="mt-2.5 flex flex-col gap-[7px] w-full max-w-[230px] lg:mt-3.5 lg:mx-auto text-left">
              {topScores.map((row) => {
                const mood = MOOD_BY_KEY[row.moodKey];
                if (!mood) return null;
                const width = Math.max(4, (row.score / topMax) * 100);
                return (
                  <span key={row.moodKey} className="flex items-center gap-2">
                    <span
                      className="grid place-items-center w-[18px] h-[18px] shrink-0 rounded-md text-[11px] leading-none"
                      style={{ ...PIXEL, color: mood.color, background: withAlpha(mood.color, 0.18), boxShadow: `inset 0 0 0 1px ${withAlpha(mood.color, 0.45)}` }}
                    >
                      {mood.letter}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11px] font-semibold leading-none" style={{ color: mood.color }}>
                        {t(mood.labelKey)}
                      </span>
                      <span className="mt-[4px] block h-[3px] rounded-full bg-white/[0.08] overflow-hidden">
                        <span className="block h-full rounded-full" style={{ width: `${width}%`, background: mood.color, boxShadow: `0 0 6px ${withAlpha(mood.color, 0.6)}` }} />
                      </span>
                    </span>
                  </span>
                );
              })}
            </span>
          ) : (
            <span className={`${DOOR_CHIPS} w-full max-w-[220px]`}>
              <span className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden" aria-hidden>
                <span className="block h-full rounded-full bg-gradient-to-r from-violet-400 to-fuchsia-400" style={{ width: `${(counted / threshold) * 100}%` }} />
              </span>
              <span style={{ ...PIXEL, color: PAPER }} className="text-sm leading-none tabular-nums">
                {counted}/{threshold}
              </span>
            </span>
          )}
        </span>

        <span className={DOOR_CTA} style={{ color: tints[1] === DEFAULT_TINTS[1] ? '#F0ABFC' : PAPER }}>
          <span className={DOOR_CTA_LABEL}>{hasPersona ? t('home.persona.open') : t('home.persona.discover')}</span>
          <DoorArrow colors={tints} />
        </span>
      </button>

      <PersonaSheet
        open={open}
        onClose={() => {
          setOpen(false);
          load();
        }}
        persona={persona}
        userId={userId}
        username={username}
        onUserClick={(name) => navigate(`/profile/${name}`)}
      />

      {reveal && persona && <PersonalityCompletionModal isOpen onClose={closeReveal} persona={persona} changed={reveal === 'changed'} recast={reveal === 'recast'} />}
    </>
  );
};

export default PersonaDoor;
