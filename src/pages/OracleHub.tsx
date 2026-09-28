import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Scroll, Info, LayoutGrid, Share2, LibraryBig, Swords, Crown, ArrowRight, Plus, RefreshCw } from 'lucide-react';
import GlassLoader from '../components/GlassLoader';
import MoodBars from '../components/MoodBars';
import PersonasModal from '../components/PersonasModal';
import PersonaShareModal from '../components/PersonaShareModal';
import PersonalityCompletionModal from '../components/PersonalityCompletionModal';
import { PersonaRevelationSheet, PersonaHowItWorksSheet } from '../components/ProfileEssence';
import { PersonaCode, PersonaPoster, MoodChip } from '../components/PersonaBits';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { MOOD_BY_LETTER, withMoodAlpha } from '../lib/moods';
import { fetchUserPersona, personaText, topMoodKeys, PERSONA_THRESHOLD, type UserPersona } from '../lib/persona';
import { VELVET, PAPER, MIST, PIXEL, FOCUS_RING, ORACLES, oracleCardImage, withAlpha } from '../lib/oracleTheme';

// Central dos Oráculos — "a mesa do oráculo".
//   1. Consultar os oráculos: as três cartas (cada uma abre direto as nove
//      prateleiras daquele oráculo), o Duelo e o Duelo de Watchlist.
//   2. Sua personalidade cinematográfica:
//      - sem personalidade ainda: o convite do Oráculo (cinco falas), o
//        progresso até 10 filmes das prateleiras e as prateleiras até agora;
//      - com personalidade: o pôster do personagem, o código de 3 letras, o
//        título, as três prateleiras e as nove barras; atalhos pra
//        Revelação, Como funciona, as 84 personalidades e Compartilhar.
// A revelação (modal) aparece uma vez por personalidade: na primeira vez
// que ela surge e sempre que mudar.

type HubSheet = 'revelation' | 'howItWorks' | null;

const GHOST_BUTTON = `gap-2 h-11 px-4 rounded-xl border border-white/15 hover:border-white/35 hover:bg-white/5 text-sm font-medium transition ${FOCUS_RING}`;
const PRIMARY_BUTTON = `gap-2 h-12 px-6 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white font-semibold shadow-lg shadow-fuchsia-900/30 transition ${FOCUS_RING}`;

const seenKey = (userId: string) => `cineoracle:persona-seen:${userId}`;
// Em 28/09 duas letras mudaram: Sombrio e Assustador D → X e Adrenalina
// X → Z. Códigos guardados antes disso (texto puro, sem o prefixo "v2:")
// são traduzidos, pra ninguém ver uma "Nova revelação" só por causa da
// troca de letra.
const readSeen = (userId: string): string | null => {
  try {
    const raw = window.localStorage.getItem(seenKey(userId));
    if (!raw) return null;
    if (raw.startsWith('v2:')) return raw.slice(3);
    return raw.replace(/[DX]/g, (letter) => (letter === 'D' ? 'X' : 'Z'));
  } catch {
    return null;
  }
};
const writeSeen = (userId: string, code: string) => {
  try {
    window.localStorage.setItem(seenKey(userId), `v2:${code}`);
  } catch {
    /* sem armazenamento local: a revelação só volta a aparecer */
  }
};

export default function OracleHub() {
  const { t, i18n } = useTranslation();
  const { session } = useAuth();
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const userId = session?.user?.id;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [persona, setPersona] = useState<UserPersona | null>(null);
  const [isPremium, setIsPremium] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  // Estilo das cartas escolhido no Personalizar perfil (padrão, Yu-Gi-Oh…).
  const [cardStyle, setCardStyle] = useState<string>('default');

  const [sheet, setSheet] = useState<HubSheet>(null);
  const [showPersonas, setShowPersonas] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [reveal, setReveal] = useState<{ changed: boolean } | null>(null);

  const loadUserData = useCallback(async () => {
    if (!userId) return;
    try {
      setLoadError(false);
      const [personaData, profileResult, premiumResult] = await Promise.all([
        fetchUserPersona(userId),
        supabase.from('profiles').select('username, card_style').eq('id', userId).single(),
        supabase.rpc('get_user_premium_status', { user_id_input: userId }),
      ]);
      setPersona(personaData);
      setUsername((profileResult.data?.username as string | undefined) ?? null);
      setCardStyle((profileResult.data?.card_style as string | undefined) || 'default');
      setIsPremium(Boolean(premiumResult.data));

      if (personaData?.code && personaData.persona) {
        const seen = readSeen(userId);
        if (seen !== personaData.code) setReveal({ changed: Boolean(seen) });
      }
    } catch (error) {
      console.error('Error loading oracle hub:', error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadUserData();
  }, [loadUserData]);

  const closeReveal = () => {
    if (userId && persona?.code) writeSeen(userId, persona.code);
    setReveal(null);
  };

  // Entrada da página: as seções sobem em sequência (a única animação
  // orquestrada daqui; o resto só reage a hover/toque).
  const stagger = { hidden: {}, shown: { transition: { staggerChildren: reduceMotion ? 0 : 0.08 } } };
  const rise = {
    hidden: reduceMotion ? { opacity: 1 } : { opacity: 0, y: 16 },
    shown: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 260, damping: 28 } },
  };

  if (loading) {
    return <GlassLoader fullPage size="lg" label={t('oracle.loadingOracle')} />;
  }

  if (loadError && !persona) {
    return (
      <div className="min-h-[calc(100vh-4rem)] grid place-items-center px-5">
        <div className="max-w-sm text-center">
          <p className="font-semibold" style={{ color: PAPER }}>
            {t('oracle.hub.loadError')}
          </p>
          <button onClick={() => loadUserData()} className={`mx-auto mt-5 ${GHOST_BUTTON}`} style={{ color: PAPER }}>
            <RefreshCw className="w-[18px] h-[18px] text-violet-300" aria-hidden />
            {t('common.retry')}
          </button>
        </div>
      </div>
    );
  }

  const oracleTrio = (size: 'sm' | 'lg') => (
    <span className="flex items-center -space-x-2.5" aria-hidden>
      {ORACLES.map((oracle) => (
        <img
          key={oracle.id}
          src={oracle.avatar}
          alt=""
          width={size === 'lg' ? 64 : 44}
          height={size === 'lg' ? 64 : 44}
          decoding="async"
          className={`${size === 'lg' ? 'w-16 h-16' : 'w-11 h-11'} rounded-full object-cover`}
          style={{ boxShadow: `0 0 0 2px ${oracle.color}, 0 0 0 5px #120D22` }}
        />
      ))}
    </span>
  );

  const hasPersona = Boolean(persona?.code && persona.persona);
  const threshold = persona?.threshold || PERSONA_THRESHOLD;
  const counted = persona?.counted ?? 0;

  // ---------- Sem personalidade ainda: o convite ----------
  const intro = (() => {
    const remaining = Math.max(0, threshold - counted);
    const progress = Math.min(100, (counted / threshold) * 100);
    const needsMoreShelves = counted >= threshold;
    const lineDelay = reduceMotion ? 0 : 0.4;
    const lines = [
      { key: 'line1', className: 'text-lg leading-relaxed italic', color: MIST },
      { key: 'line2', className: 'text-xl font-semibold', color: PAPER },
      { key: 'line3', className: 'text-lg leading-relaxed italic', color: MIST },
      { key: 'line4', className: 'text-[1.7rem] sm:text-3xl leading-tight', color: '#F0ABFC', pixel: true },
      { key: 'line5', className: 'text-lg leading-relaxed italic', color: MIST },
    ];

    return (
      <div className="mt-10 border-t border-white/[0.07]">
        <section className="mx-auto max-w-2xl px-5 sm:px-8 pt-10 sm:pt-12 text-center">
          <motion.div className="flex justify-center" initial={reduceMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            {oracleTrio('lg')}
          </motion.div>
          <div className="mt-9 space-y-5">
            {lines.map((line, i) => (
              <motion.p
                key={line.key}
                className={line.className}
                style={line.pixel ? { ...PIXEL, color: line.color } : { color: line.color }}
                initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.3 + i * lineDelay }}
              >
                {t(`oracle.intro.${line.key}`)}
              </motion.p>
            ))}
          </div>
        </section>

        <motion.section
          className="mx-auto max-w-6xl px-5 sm:px-8 mt-10"
          initial={reduceMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 + lines.length * lineDelay }}
        >
          <div className="grid lg:grid-cols-[minmax(0,1fr)_380px] gap-4">
            <div className="rounded-2xl p-5 sm:p-7 ring-1 ring-white/10" style={{ background: VELVET }}>
              <h2 style={{ ...PIXEL, color: PAPER }} className="text-2xl sm:text-3xl leading-tight">
                {t('oracle.intro.progressTitle')}
              </h2>
              <p className="mt-2 text-[15px] leading-relaxed" style={{ color: MIST }}>
                {needsMoreShelves ? t('oracle.intro.needMoreShelves') : t('oracle.intro.requirement', { count: threshold })}
              </p>
              <div className="mt-5 flex items-baseline justify-between gap-3">
                <span style={{ color: PAPER }}>
                  <span style={PIXEL} className="text-3xl">
                    {counted}
                  </span>
                  <span className="text-sm" style={{ color: MIST }}>
                    {' '}
                    / {threshold}
                  </span>
                </span>
                {!needsMoreShelves && (
                  <span className="text-sm" style={{ color: MIST }}>
                    {t('oracle.intro.remaining', { count: remaining })}
                  </span>
                )}
              </div>
              <div
                className="mt-2 h-2 rounded-full bg-white/10 overflow-hidden"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={threshold}
                aria-valuenow={Math.min(counted, threshold)}
                aria-label={t('oracle.intro.progressLabel')}
              >
                <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500" style={{ width: `${progress}%` }} />
              </div>
              <p className="mt-3 text-sm leading-relaxed" style={{ color: MIST }}>
                {t('oracle.intro.countedHint')}
              </p>
              <div className="mt-6 flex flex-col sm:flex-row flex-wrap gap-2">
                <Link to="/oracle/libraries?oracle=bogart" className={`${PRIMARY_BUTTON} h-auto min-h-[48px] py-2.5 text-center leading-snug`}>
                  <LibraryBig className="w-5 h-5 shrink-0" aria-hidden />
                  {t('oracle.intro.exploreLibrary')}
                </Link>
                <Link to="/add-movies" className={`${GHOST_BUTTON} h-12`} style={{ color: PAPER }}>
                  <Plus className="w-[18px] h-[18px] text-violet-300" aria-hidden />
                  {t('library.addMovies')}
                </Link>
                <button onClick={() => setSheet('howItWorks')} className={`${GHOST_BUTTON} h-12`} style={{ color: PAPER }}>
                  <Info className="w-[18px] h-[18px] text-sky-300" aria-hidden />
                  {t('profile.howItWorks')}
                </button>
              </div>
            </div>

            <div className="rounded-2xl p-5 sm:p-6 ring-1 ring-white/10" style={{ background: VELVET }}>
              <p className="text-sm font-medium" style={{ color: MIST }}>
                {t('oracle.hub.shelvesSoFar')}
              </p>
              <div className="mt-4">
                <MoodBars scores={persona?.scores ?? []} highlight={0} compact />
              </div>
            </div>
          </div>
        </motion.section>
      </div>
    );
  })();

  // ---------- Com personalidade ----------
  const hero = (() => {
    if (!hasPersona || !persona?.persona || !persona.code) return null;
    const text = personaText(persona.persona, i18n.language);
    const glowMood = MOOD_BY_LETTER[persona.code.charAt(0)];
    const actions = [
      { key: 'revelation', icon: Scroll, tint: 'text-pink-300', label: t('oracle.revelation'), onClick: () => setSheet('revelation') },
      { key: 'howItWorks', icon: Info, tint: 'text-sky-300', label: t('profile.howItWorks'), onClick: () => setSheet('howItWorks') },
      { key: 'personas', icon: LayoutGrid, tint: 'text-emerald-300', label: t('oracle.hub.archetypes'), onClick: () => setShowPersonas(true) },
      { key: 'share', icon: Share2, tint: 'text-amber-300', label: t('oracle.hub.share'), onClick: () => setShowShare(true) },
    ];
    return (
      <motion.section variants={rise} className="mt-10 border-t border-white/[0.07] pt-10">
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div
          className="relative overflow-hidden rounded-2xl ring-1 ring-white/10 p-5 sm:p-7"
          style={{ background: `radial-gradient(ellipse 60% 70% at 0% 0%, ${glowMood ? withMoodAlpha(glowMood, 0.14) : 'rgba(139,92,246,0.14)'}, transparent 70%), ${VELVET}` }}
        >
          <div className="lg:flex lg:gap-8">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium" style={{ color: MIST }}>
                {t('oracle.cinematicEssence')}
              </p>
              <div className="mt-4 flex gap-4 sm:gap-6">
                <PersonaPoster
                  path={persona.persona.posterPath}
                  alt={text.film}
                  size="w500"
                  eager
                  className="w-[112px] sm:w-[164px] shrink-0 rounded-xl shadow-2xl self-start"
                />
                <div className="min-w-0">
                  <PersonaCode code={persona.code} className="text-[3.4rem] sm:text-7xl leading-none" />
                  <p className="mt-2 text-xl sm:text-2xl font-semibold leading-snug" style={{ color: PAPER }}>
                    {text.title}
                  </p>
                  <p className="mt-1 text-sm" style={{ color: MIST }}>
                    {text.sameAsFilm ? text.filmWithYear : t('oracle.persona.characterIn', { character: text.character, film: text.filmWithYear })}
                  </p>
                  <p className="hidden sm:block mt-3 max-w-2xl text-[15px] leading-relaxed" style={{ color: 'rgba(243,234,211,0.86)' }}>
                    {text.blurb}
                  </p>
                </div>
              </div>
              <p className="sm:hidden mt-4 text-[15px] leading-relaxed" style={{ color: 'rgba(243,234,211,0.86)' }}>
                {text.blurb}
              </p>

              <ul className="mt-5 flex flex-wrap gap-2">
                {topMoodKeys(persona).map((key, i) => (
                  <li key={key}>
                    <MoodChip moodKey={key} rank={i + 1} />
                  </li>
                ))}
              </ul>

              <div className="mt-6 grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
                {actions.map(({ key, icon: Icon, tint, label, onClick }) => (
                  <button key={key} onClick={onClick} className={`${GHOST_BUTTON} px-3 sm:px-4 whitespace-nowrap justify-center sm:justify-start`} style={{ color: PAPER }}>
                    <Icon className={`w-[18px] h-[18px] shrink-0 ${tint}`} aria-hidden />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* As nove prateleiras — só no desktop, onde sobra espaço */}
            <div className="hidden lg:block w-[340px] shrink-0 rounded-xl bg-black/20 ring-1 ring-white/[0.07] p-5">
              <p className="text-sm font-medium" style={{ color: MIST }}>
                {t('oracle.hub.scales')}
              </p>
              <div className="mt-4">
                <MoodBars scores={persona.scores} compact />
              </div>
            </div>
          </div>
        </div>
        </div>
      </motion.section>
    );
  })();

  const premiumChip = (
    <span className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-200 ring-1 ring-amber-400/30">
      <Crown className="w-3.5 h-3.5" aria-hidden />
      {t('oracle.hub.premiumChip')}
    </span>
  );

  const duelCards = [
    { key: 'duel', to: '/oracle/duel', state: undefined, title: t('duel.title'), description: t('duel.description'), tint: '#F472B6' },
    { key: 'watchlist', to: '/library', state: { openWatchlistDuel: true }, title: t('watchlistDuel.title'), description: t('watchlistDuel.description'), tint: '#38BDF8' },
  ];

  // As três cartas dos oráculos: cada uma leva direto às nove prateleiras
  // daquele oráculo. No celular ficam lado a lado, como cartas na mesa (só
  // a carta e o nome); do sm pra cima ganham o critério de cada um.
  const explore = (
    <motion.section variants={rise} className="mx-auto max-w-6xl px-5 sm:px-8 mt-8 sm:mt-10">
      <h2 style={{ ...PIXEL, color: PAPER }} className="text-3xl sm:text-4xl leading-none">
        {t('oracle.hub.exploreTitle')}
      </h2>
      <p className="mt-2 text-[15px] max-w-xl" style={{ color: MIST }}>
        {t('oracle.hub.exploreHint')}
      </p>

      <ul className="mt-6 grid grid-cols-3 gap-3 sm:gap-4">
        {ORACLES.map((oracle) => (
          <li key={oracle.id}>
            <Link
              to={`/oracle/libraries?oracle=${oracle.id}`}
              aria-label={`${oracle.name} — ${t('oracle.libraries.exploreShelves')}`}
              className={`group h-full flex flex-col items-stretch justify-start text-left rounded-2xl ring-1 ring-white/10 hover:ring-white/25 p-2 sm:p-4 transition ${FOCUS_RING}`}
              style={{ background: `radial-gradient(ellipse 80% 50% at 50% 0%, ${withAlpha(oracle.color, 0.14)}, transparent 70%), ${VELVET}` }}
            >
              <span className="block overflow-hidden rounded-lg sm:rounded-xl" style={{ boxShadow: `0 18px 36px -18px ${withAlpha(oracle.color, 0.75)}` }}>
                <img
                  src={oracleCardImage(oracle.id, cardStyle)}
                  alt=""
                  decoding="async"
                  className="block w-full h-auto transition-transform duration-500 group-hover:scale-[1.03]"
                />
              </span>
              <span className="mt-2.5 sm:mt-4 flex-1 flex flex-col min-w-0 px-0.5 sm:px-0">
                <span style={{ ...PIXEL, color: oracle.color }} className="text-lg sm:text-3xl leading-none">
                  {oracle.name}
                </span>
                <span className="mt-1 sm:mt-1.5 text-xs sm:text-sm leading-snug" style={{ color: MIST }}>
                  {t(`oracle.cards.${oracle.id}`)}
                  <span className="hidden sm:inline"> · {t(`oracle.cards.${oracle.id}Subtitle`)}</span>
                </span>
                <span className="hidden sm:block mt-2.5 text-[15px] leading-snug" style={{ color: PAPER }}>
                  {t(`oracle.libraries.${oracle.id}FunctionDesc`)}
                </span>
                <span className="hidden sm:inline-flex mt-auto pt-3 items-center gap-1.5 text-sm font-semibold" style={{ color: oracle.color }}>
                  {t('oracle.libraries.exploreShelves')}
                  <ArrowRight className="w-4 h-4 transition group-hover:translate-x-0.5" aria-hidden />
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {/* Os dois duelos */}
      <div className="mt-4 grid md:grid-cols-2 gap-3 sm:gap-4">
        {duelCards.map((card) => (
          <Link
            key={card.key}
            to={card.to}
            state={card.state}
            className={`group flex items-start justify-start gap-4 text-left rounded-2xl ring-1 ring-white/10 hover:ring-white/25 p-4 sm:p-6 transition ${FOCUS_RING}`}
            style={{ background: VELVET }}
          >
            <span className="grid place-items-center w-11 h-11 shrink-0 rounded-xl" style={{ background: withAlpha(card.tint, 0.14), boxShadow: `inset 0 0 0 1px ${withAlpha(card.tint, 0.3)}` }}>
              <Swords className="w-5 h-5" style={{ color: card.tint }} aria-hidden />
            </span>
            <span className="min-w-0 flex-1 flex flex-col">
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <span style={{ ...PIXEL, color: PAPER }} className="text-xl sm:text-2xl leading-tight">
                  {card.title}
                </span>
                {!isPremium && premiumChip}
              </span>
              <span className="mt-1.5 text-sm sm:text-[15px] leading-relaxed" style={{ color: MIST }}>
                {card.description}
              </span>
              <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color: card.tint }}>
                {t('oracle.hub.play')}
                <ArrowRight className="w-4 h-4 transition group-hover:translate-x-0.5" aria-hidden />
              </span>
            </span>
          </Link>
        ))}
      </div>
    </motion.section>
  );

  return (
    <>
      <motion.div className="min-h-screen pb-16" variants={stagger} initial="hidden" animate="shown">
        {/* ---------- Cabeçalho ---------- */}
        <motion.section variants={rise} className="mx-auto max-w-6xl px-5 sm:px-8 pt-6 sm:pt-10">
          <div className="flex items-end justify-between gap-6">
            <div className="min-w-0">
              <h1 style={{ ...PIXEL, color: PAPER }} className="text-[2.2rem] sm:text-5xl leading-none">
                {t('oracle.title')}
              </h1>
              <p className="mt-3 text-[15px] sm:text-base max-w-xl" style={{ color: MIST }}>
                {t('oracle.hub.subtitle')}
              </p>
            </div>
            {hasPersona && <span className="hidden sm:flex shrink-0">{oracleTrio('sm')}</span>}
          </div>
        </motion.section>

        {explore}
        {hasPersona ? hero : intro}
      </motion.div>

      {/* ---------- Gavetas ---------- */}
      {hasPersona && persona && <PersonaRevelationSheet open={sheet === 'revelation'} onClose={() => setSheet(null)} persona={persona} isOwn />}
      <PersonaHowItWorksSheet open={sheet === 'howItWorks'} onClose={() => setSheet(null)} persona={persona} isOwn />

      {reveal && persona && <PersonalityCompletionModal isOpen onClose={closeReveal} persona={persona} changed={reveal.changed} />}

      {userId && (
        <PersonasModal
          isOpen={showPersonas}
          onClose={() => setShowPersonas(false)}
          viewerId={userId}
          viewerPersonaCode={persona?.code ?? null}
          onUserClick={(uname) => navigate(`/profile/${uname}`)}
        />
      )}

      {hasPersona && persona && <PersonaShareModal isOpen={showShare} onClose={() => setShowShare(false)} persona={persona} username={username} />}
    </>
  );
}
