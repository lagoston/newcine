import React, { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, useReducedMotion } from 'framer-motion';
import { Clapperboard, Ghost, Loader2, LogOut, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useDirector } from '../contexts/DirectorContext';
import { directorSelfRevoke } from '../lib/director';
import { SEASONAL_THEMES, type SeasonalEventId } from '../lib/seasonalEvents';
import { NIGHT, VELVET, PAPER, MIST, FOCUS_RING, NIGHT_BACKGROUND } from '../lib/oracleTheme';
import DirectorMfaCard from '../components/director/DirectorMfaCard';

// Sala do Diretor (/diretor, 16/11/2026).
//
// Pedido do Bruno: uma "Conta Diretor" escondida da comunidade, com todos os
// desbloqueáveis, os menus de teste e a prévia dos eventos só para ela. Esta é
// a sala dela: a claquete no alto diz o estado da conta (escondida, nível do
// papel, prévia ligada); abaixo, o que ela pode ver de outro jeito, os menus de
// teste e o botão de pânico.
//
// A página é só a tela. Quem decide é o banco: get_director_state para mostrar
// a sala, e cada função de diretor confere o papel de novo. Para quem não é
// diretor, /diretor volta para o Início. Texto em pt e en aqui mesmo: a sala
// é interna e não pesa nos arquivos de tradução do site.

type Lang = 'pt' | 'en';

const COPY = {
  pt: {
    title: 'Sala do Diretor',
    production: 'Produção',
    account: 'Conta',
    community: 'Na comunidade',
    invisible: 'invisível',
    level: 'Nível',
    levelOf: (n: number) => `${n} de 3`,
    preview: 'Prévia',
    none: 'nenhuma',
    lead: 'Esta conta vê o site inteiro como ele é, com tudo liberado, e ninguém a vê. O banco confere cada ação.',
    seeTitle: 'Ver o site de outro jeito',
    eventLabel: 'Evento fora da época',
    eventHint: 'Só você vê. O painel, a decoração e as missões do evento aparecem como se fosse a época; nada é concedido.',
    off: 'Sem prévia',
    studioLabel: 'Estúdio completo',
    studioHint: 'Os três bichinhos e a caixa do Clube do Terror na sua cena da Persona, só neste aparelho.',
    menusTitle: 'Menus de teste',
    menus: [
      { to: '/curadoria/posteres', label: 'Curadoria de pôsteres', hint: 'Todos os pôsteres da roleta, por raridade e lote' },
      { to: '/', state: { openJackpot: 'machine' }, label: 'Poster Jackpot', hint: 'A roleta, o Contrato e a coleção' },
      { to: '/poster-poker', label: 'Pôster Poker', hint: 'O pôquer, ainda fechado para o público' },
      { to: '/sala/clube-do-terror', label: 'Clube do Terror', hint: 'A sala secreta, sem precisar da tag' },
      { to: '/profile', label: 'Personalizar o perfil', hint: 'Molduras, banners, cartas, efeitos e tags: tudo liberado' },
      { to: '/library', label: 'Biblioteca', hint: 'Melhores da Década liberado' },
    ],
    unlockedTitle: 'O que está liberado',
    unlocked:
      'Premium vitalício, todas as molduras e banners (kits da Cobra inclusive), as cartas dos oráculos, os efeitos de nome, Melhores da Década, todas as tags para vestir (as de Jogos também) e as salas secretas. Nada disso é gravado como conquista: sem sussurro, story ou aviso, e tudo volta ao normal se a conta largar o papel.',
    ghostTitle: 'O fantasma',
    ghost:
      'Para os outros esta conta não existe: some da Comunidade, da busca, do /perfil, das contagens das Personas, das salas, dos convites e de "quantas pessoas têm" um pôster. As notas dela não mexem na previsão de ninguém nem no placar. Amizade, sussurro, troca e convite com ela não nascem.',
    toolsTitle: 'Ferramentas',
    toolsLead: 'Mudam o site para todo mundo, na hora (inclusive no app). Pedem o código do app autenticador, e cada mudança fica no diário, com desfazer.',
    tools: [
      { to: '/diretor/prateleiras', label: 'Prateleiras dos oráculos', hint: 'Pôr, mudar de prateleira e tirar títulos' },
      { to: '/diretor/posteres', label: 'Pôsteres da roleta', hint: 'Escolher a arte, a raridade e pôr no sorteio' },
      { to: '/diretor/diario', label: 'Diário', hint: 'Tudo o que esta conta mudou, com desfazer' },
    ],
    panicTitle: 'Largar o papel',
    panic: 'Tira o papel de diretor desta conta e sai de todos os aparelhos. A conta continua escondida. O papel só volta pelo banco.',
    panicButton: 'Largar o papel de diretor',
    panicConfirm: 'Tem certeza? Toque de novo para confirmar.',
    panicDone: 'Papel largado. Você saiu de todos os aparelhos.',
    panicError: 'Não deu para largar o papel agora. Tente de novo.',
  },
  en: {
    title: "Director's Room",
    production: 'Production',
    account: 'Account',
    community: 'In the community',
    invisible: 'invisible',
    level: 'Level',
    levelOf: (n: number) => `${n} of 3`,
    preview: 'Preview',
    none: 'none',
    lead: 'This account sees the whole site as it is, with everything unlocked, and nobody sees it. The database checks every action.',
    seeTitle: 'See the site another way',
    eventLabel: 'Event out of season',
    eventHint: 'Only you see it. The event panel, decorations and missions show up as if it were the season; nothing is granted.',
    off: 'No preview',
    studioLabel: 'Full studio',
    studioHint: 'The three pets and the Terror Club box in your Persona scene, on this device only.',
    menusTitle: 'Test menus',
    menus: [
      { to: '/curadoria/posteres', label: 'Poster curation', hint: 'Every poster in the wheel, by rarity and batch' },
      { to: '/', state: { openJackpot: 'machine' }, label: 'Poster Jackpot', hint: 'The wheel, the Contract and the collection' },
      { to: '/poster-poker', label: 'Poster Poker', hint: 'Poker, still closed to the public' },
      { to: '/sala/clube-do-terror', label: 'Terror Club', hint: 'The secret room, no tag needed' },
      { to: '/profile', label: 'Customize the profile', hint: 'Frames, banners, cards, effects and tags: all unlocked' },
      { to: '/library', label: 'Library', hint: 'Best of the Decade unlocked' },
    ],
    unlockedTitle: "What's unlocked",
    unlocked:
      'Lifetime Premium, every frame and banner (Snake kits included), the oracle cards, name effects, Best of the Decade, every tag to wear (Games ones too) and the secret rooms. None of it is saved as an achievement: no whisper, story or notice, and it all goes back to normal if the account gives up the role.',
    ghostTitle: 'The ghost',
    ghost:
      'To everyone else this account does not exist: it is gone from the Community, search, /profile, Persona counts, rooms, invites and "how many people own" a poster. Its ratings do not move anyone else\'s prediction or the scoreboard. Friendships, whispers, trades and invites with it are never created.',
    toolsTitle: 'Tools',
    toolsLead: 'They change the site for everyone, right away (the app too). They ask for the authenticator code, and every change goes to the diary, with undo.',
    tools: [
      { to: '/diretor/prateleiras', label: 'Oracle shelves', hint: 'Add, move and remove titles' },
      { to: '/diretor/posteres', label: 'Wheel posters', hint: 'Pick the artwork, the rarity and put it in the draw' },
      { to: '/diretor/diario', label: 'Diary', hint: 'Everything this account changed, with undo' },
    ],
    panicTitle: 'Give up the role',
    panic: 'Removes the director role from this account and signs out on every device. The account stays hidden. The role only comes back through the database.',
    panicButton: 'Give up the director role',
    panicConfirm: 'Are you sure? Tap again to confirm.',
    panicDone: 'Role given up. You were signed out everywhere.',
    panicError: "Couldn't give up the role right now. Try again.",
  },
} as const;

const EVENTS: SeasonalEventId[] = ['halloween', 'christmas'];
const EVENT_NAME: Record<Lang, Record<SeasonalEventId, string>> = {
  pt: { halloween: 'Halloween', christmas: 'Natal' },
  en: { halloween: 'Halloween', christmas: 'Christmas' },
};
const EVENT_EMOJI: Record<SeasonalEventId, string> = { halloween: '🎃', christmas: '🎄' };

const CHALK = PAPER;
const SLATE = '#17131F';
const BRASS = '#F5C451';

// As listras da claquete: preto e papel em diagonal.
const STRIPES = `repeating-linear-gradient(135deg, ${CHALK} 0 18px, #0B0910 18px 36px)`;

export default function DirectorPanel() {
  const { i18n } = useTranslation();
  const lang: Lang = i18n.language?.startsWith('pt') ? 'pt' : 'en';
  const c = COPY[lang];
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const { session } = useAuth();
  const director = useDirector();
  const userId = session?.user?.id ?? null;
  const [username, setUsername] = useState<string | null>(null);
  const [panicArmed, setPanicArmed] = useState(false);
  const [panicBusy, setPanicBusy] = useState(false);

  useEffect(() => {
    if (!userId || !director.isDirector) return;
    let alive = true;
    supabase
      .from('profiles')
      .select('username')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        if (alive) setUsername((data?.username as string | undefined) ?? null);
      });
    return () => {
      alive = false;
    };
  }, [userId, director.isDirector]);

  // O segundo toque no pânico tem 6 segundos para acontecer.
  useEffect(() => {
    if (!panicArmed) return;
    const timer = window.setTimeout(() => setPanicArmed(false), 6000);
    return () => window.clearTimeout(timer);
  }, [panicArmed]);

  if (director.loading) {
    return (
      <div className="min-h-[60vh] grid place-items-center" style={{ background: NIGHT_BACKGROUND }}>
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: MIST }} aria-label="…" />
      </div>
    );
  }
  if (!director.isDirector) return <Navigate to="/" replace />;

  const level = director.recent ? 3 : director.mfa ? 2 : 1;
  const preview = director.prefs.eventPreview;

  const onPanic = async () => {
    if (!panicArmed) {
      setPanicArmed(true);
      return;
    }
    setPanicBusy(true);
    try {
      await directorSelfRevoke();
      toast.success(c.panicDone);
      navigate('/auth', { replace: true });
    } catch (error) {
      console.error('Director self revoke:', error);
      toast.error(c.panicError);
      setPanicBusy(false);
      setPanicArmed(false);
    }
  };

  const slateRows: { label: string; value: string }[] = [
    { label: c.production, value: 'CineOracle' },
    { label: c.account, value: username ? `@${username}` : '…' },
    { label: c.community, value: c.invisible },
    { label: c.level, value: c.levelOf(level) },
    { label: c.preview, value: preview ? `${EVENT_EMOJI[preview]} ${EVENT_NAME[lang][preview]}` : c.none },
  ];

  const panel: React.CSSProperties = {
    background: 'rgba(28,20,51,0.62)',
    border: '1px solid rgba(243,234,211,0.08)',
  };

  return (
    <div className="min-h-screen pb-28" style={{ background: NIGHT_BACKGROUND }}>
      <div className="mx-auto max-w-3xl px-4 sm:px-6 pt-6 sm:pt-10">
        {/* ---------- A claquete ---------- */}
        <section aria-labelledby="director-title" className="relative">
          <div className="relative h-10 sm:h-12" aria-hidden>
            <motion.div
              className="absolute inset-x-0 bottom-0 h-8 sm:h-10 rounded-t-md origin-bottom-left"
              style={{ background: STRIPES, boxShadow: '0 -1px 0 rgba(0,0,0,0.4) inset' }}
              initial={reduceMotion ? false : { rotate: -12 }}
              animate={{ rotate: 0 }}
              transition={{ delay: 0.25, duration: 0.18, ease: [0.6, 0, 0.9, 0.4] }}
            />
          </div>
          <div className="rounded-b-xl px-5 sm:px-7 pt-5 pb-6" style={{ background: SLATE, border: `1px solid rgba(243,234,211,0.12)`, borderTop: 'none' }}>
            <div className="flex items-center gap-3">
              <Clapperboard className="w-6 h-6 shrink-0" style={{ color: BRASS }} aria-hidden />
              <h1 id="director-title" className="text-2xl sm:text-3xl font-semibold tracking-tight" style={{ color: CHALK }}>
                {c.title}
              </h1>
            </div>
            <dl className="mt-5 grid grid-cols-2 sm:grid-cols-5 gap-x-4 gap-y-4 border-t pt-4" style={{ borderColor: 'rgba(243,234,211,0.14)' }}>
              {slateRows.map((row) => (
                <div key={row.label} className="min-w-0">
                  <dt className="text-[11px] tracking-[0.12em]" style={{ color: 'rgba(243,234,211,0.55)' }}>
                    {row.label}
                  </dt>
                  <dd className="mt-1 text-sm font-medium truncate" style={{ color: CHALK }}>
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-5 text-sm leading-relaxed max-w-prose" style={{ color: MIST }}>
              {c.lead}
            </p>
          </div>
        </section>

        {/* ---------- Ferramentas ---------- */}
        <section aria-labelledby="director-tools" className="mt-8 rounded-2xl p-5 sm:p-6" style={{ ...panel, borderColor: 'rgba(245,196,81,0.28)' }}>
          <h2 id="director-tools" className="text-lg font-semibold" style={{ color: PAPER }}>
            {c.toolsTitle}
          </h2>
          <p className="mt-1 text-xs leading-relaxed max-w-prose" style={{ color: MIST }}>
            {c.toolsLead}
          </p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-3">
            {c.tools.map((tool) => (
              <li key={tool.to}>
                <Link
                  to={tool.to}
                  className={`flex h-full flex-col items-start justify-start gap-1 rounded-xl p-4 transition-colors hover:bg-white/[0.04] ${FOCUS_RING}`}
                  style={{ background: VELVET, border: '1px solid rgba(243,234,211,0.1)' }}
                >
                  <span className="text-sm font-semibold" style={{ color: BRASS }}>
                    {tool.label}
                  </span>
                  <span className="text-xs leading-relaxed" style={{ color: MIST }}>
                    {tool.hint}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* ---------- Ver o site de outro jeito ---------- */}
        <section aria-labelledby="director-see" className="mt-6 rounded-2xl p-5 sm:p-6" style={panel}>
          <h2 id="director-see" className="text-lg font-semibold" style={{ color: PAPER }}>
            {c.seeTitle}
          </h2>

          <div className="mt-4">
            <p id="director-event" className="text-sm font-medium" style={{ color: PAPER }}>
              {c.eventLabel}
            </p>
            <div role="radiogroup" aria-labelledby="director-event" className="mt-2 flex flex-wrap gap-2">
              {([null, ...EVENTS] as (SeasonalEventId | null)[]).map((id) => {
                const selected = preview === id;
                const theme = id ? SEASONAL_THEMES[id] : null;
                return (
                  <button
                    key={id ?? 'off'}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => director.setPref('eventPreview', id)}
                    className={`min-h-[44px] px-4 rounded-full text-sm font-medium transition-colors ${FOCUS_RING}`}
                    style={
                      selected
                        ? { background: theme ? theme.accent : PAPER, color: theme ? theme.ink : NIGHT, border: '1px solid transparent' }
                        : { background: VELVET, color: MIST, border: '1px solid rgba(243,234,211,0.12)' }
                    }
                  >
                    {id ? `${EVENT_EMOJI[id]} ${EVENT_NAME[lang][id]}` : c.off}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs leading-relaxed max-w-prose" style={{ color: MIST }}>
              {c.eventHint}
            </p>
          </div>

          <div className="mt-6 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p id="director-studio" className="text-sm font-medium" style={{ color: PAPER }}>
                {c.studioLabel}
              </p>
              <p className="mt-1 text-xs leading-relaxed max-w-prose" style={{ color: MIST }}>
                {c.studioHint}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={director.prefs.studioAll}
              aria-labelledby="director-studio"
              onClick={() => director.setPref('studioAll', !director.prefs.studioAll)}
              className={`relative shrink-0 w-14 h-8 min-h-0 rounded-full transition-colors ${FOCUS_RING}`}
              style={{ background: director.prefs.studioAll ? BRASS : 'rgba(243,234,211,0.14)' }}
            >
              <span
                aria-hidden
                className="absolute top-1 left-1 w-6 h-6 rounded-full transition-transform"
                style={{ background: director.prefs.studioAll ? NIGHT : PAPER, transform: director.prefs.studioAll ? 'translateX(24px)' : 'none' }}
              />
            </button>
          </div>
        </section>

        {/* ---------- Menus de teste ---------- */}
        <section aria-labelledby="director-menus" className="mt-6 rounded-2xl p-5 sm:p-6" style={panel}>
          <h2 id="director-menus" className="text-lg font-semibold" style={{ color: PAPER }}>
            {c.menusTitle}
          </h2>
          <ul className="mt-3 divide-y" style={{ borderColor: 'rgba(243,234,211,0.08)' }}>
            {c.menus.map((menu) => (
              <li key={menu.label} style={{ borderColor: 'rgba(243,234,211,0.08)' }}>
                <Link
                  to={menu.to}
                  state={'state' in menu ? menu.state : undefined}
                  className={`flex flex-col items-start justify-center gap-0.5 py-3 rounded-lg ${FOCUS_RING} group`}
                >
                  <span className="text-sm font-medium group-hover:underline underline-offset-4" style={{ color: PAPER }}>
                    {menu.label}
                  </span>
                  <span className="text-xs" style={{ color: MIST }}>
                    {menu.hint}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* ---------- O que está liberado / o fantasma / app autenticador ---------- */}
        <section className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl p-5" style={panel}>
            <h2 className="flex items-center gap-2 text-base font-semibold" style={{ color: PAPER }}>
              <Sparkles className="w-4 h-4" style={{ color: BRASS }} aria-hidden />
              {c.unlockedTitle}
            </h2>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: MIST }}>
              {c.unlocked}
            </p>
          </div>
          <div className="rounded-2xl p-5" style={panel}>
            <h2 className="flex items-center gap-2 text-base font-semibold" style={{ color: PAPER }}>
              <Ghost className="w-4 h-4" style={{ color: BRASS }} aria-hidden />
              {c.ghostTitle}
            </h2>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: MIST }}>
              {c.ghost}
            </p>
          </div>
          <DirectorMfaCard lang={lang} className="sm:col-span-2" style={{ ...panel }} />
        </section>

        {/* ---------- Pânico ---------- */}
        <section aria-labelledby="director-panic" className="mt-6 rounded-2xl p-5 sm:p-6" style={{ ...panel, borderColor: 'rgba(248,113,113,0.25)' }}>
          <h2 id="director-panic" className="text-base font-semibold" style={{ color: '#FCA5A5' }}>
            {c.panicTitle}
          </h2>
          <p className="mt-2 text-sm leading-relaxed max-w-prose" style={{ color: MIST }}>
            {c.panic}
          </p>
          <button
            type="button"
            onClick={onPanic}
            disabled={panicBusy}
            aria-live="polite"
            className={`mt-4 inline-flex items-center gap-2 min-h-[44px] px-4 rounded-full text-sm font-semibold transition-colors disabled:opacity-60 ${FOCUS_RING}`}
            style={
              panicArmed
                ? { background: '#DC2626', color: '#fff' }
                : { background: 'transparent', color: '#FCA5A5', border: '1px solid rgba(248,113,113,0.45)' }
            }
          >
            {panicBusy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <LogOut className="w-4 h-4" aria-hidden />}
            {panicArmed ? c.panicConfirm : c.panicButton}
          </button>
        </section>
      </div>
    </div>
  );
}
