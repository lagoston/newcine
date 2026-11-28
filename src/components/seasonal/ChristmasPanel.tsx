import React, { Suspense, lazy, useCallback, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowRight, Check, Loader2, Lock } from 'lucide-react';
import PixelStage from '../pixel/PixelStage';
import UserAvatar from '../UserAvatar';
import { ChipFace } from '../posterJackpot/Chips';
import { usePatronus } from '../patronus/patronus';
import { PATRONUS_SKY, wispSprite } from '../patronus/sprite';
import { drawMoth, mothScale } from '../personaWorld/draw';
import { requestSeasonalRefresh } from '../../contexts/SeasonalEventContext';
import { FOCUS_RING, INK, MIST, PAPER, PIXEL, withAlpha } from '../../lib/oracleTheme';
import { MOOD_BY_KEY } from '../../lib/moods';
import {
  CHRISTMAS_LIST_ANCHOR,
  currentStep,
  daysLeft,
  formatDayMonth,
  lastDayOf,
  stepTextKey,
  type SeasonalEventState,
  type SeasonalStep,
  type SeasonalTheme,
} from '../../lib/seasonalEvents';
import { prizeText, secretFriendPreview, useSecretFriend } from '../../lib/secretFriend';
import { ROOM_H, STOCKING_COLORS, drawChristmasRoom, roomLayout } from './christmasArt';
import { GiftIcon, ScratchTicketIcon } from './PixelChristmas';
import { TrialBadge, TrialMarkButton, TrialNote } from './DirectorTrialBar';

// O painel de Natal da home, em pixel (28/11/2026). Pedido do Bruno em 25/11:
// "adaptar habooisticamente do design do modal Natal [...] que por sinal deve
// 'perder' sua lista de filmes que vai ser transportada como uma lista extra e
// por primeiro, acima de popular agora. O modal de Natal deve dar aquela
// arvorezinha de Natal de energético na tag 2, a tag 3 deve ser a de contagem
// de Natal normalmente [...] o primeiro desafio ao invés de um sussurrar deve
// ser um presentinho de verdade".
//
// Em cima, a sala de Natal (christmasArt.ts): a lareira com as três meias (uma
// por missão: apagada, em andamento, conquistada), a árvore de latinha, a neve
// na janela e a mariposa da pessoa. Embaixo, as três missões, só com a que está
// em andamento aberta e o botão do que fazer agora:
//   1. 🎁 Secret Friend: dar a raspadinha de Natal a um amigo (SecretFriendSheet);
//   2. 🎄 Spark of Grace: avaliar um filme da Lista de Natal (dá a árvore de
//      latinha do estúdio);
//   3. 🎅 Ho Ho Ho: escrever uma resenha (veste o perfil de Natal).
// Quem ganhou uma raspadinha vê a faixa dourada com o "Raspar" (ScratchCardSheet).
// A lista de filmes saiu daqui: é a prateleira "Lista de Natal" da home
// (pages/Home.tsx, âncora #lista-de-natal), logo abaixo.
//
// O Halloween continua no painel antigo (SeasonalEventPanel).

const SecretFriendSheet = lazy(() => import('./SecretFriendSheet'));
const ScratchCardSheet = lazy(() => import('./ScratchCardSheet'));

const PINE = '#0D1A16';
const RAIL = '#27402F';
const GOLD = '#F5C451';
const MOTH_SPAN = 6;

// a sala é a cara do painel: 3× no celular e no tablet, 4× no computador
const roomScale = (width: number) => (width >= 900 ? 4 : 3);

const scrollToList = () => {
  document.getElementById(CHRISTMAS_LIST_ANCHOR)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

interface Props {
  event: SeasonalEventState;
  theme: SeasonalTheme;
  userId: string;
}

const ChristmasPanel: React.FC<Props> = ({ event, theme, userId }) => {
  const { t, i18n } = useTranslation();
  const patronus = usePatronus(userId);
  const secret = useSecretFriend(event);
  const preview = secretFriendPreview(event);
  // as gavetas só baixam (e montam) quando são abertas pela primeira vez
  const [gift, setGift] = useState<'closed' | 'open' | 'shut'>('closed');
  const [scratch, setScratch] = useState<'closed' | 'open' | 'shut'>('closed');

  const steps = event.steps;
  const step = currentStep(event);
  const unlockedCount = steps.filter((s) => s.unlocked).length;
  const giftedCount = steps.filter((s) => s.credited).length;
  const last = steps[steps.length - 1];
  const bonusMoods = (event.bonus_moods ?? []).map((key) => MOOD_BY_KEY[key]).filter(Boolean);

  const startLabel = formatDayMonth(new Date(event.starts_at), i18n.language);
  const endLabel = formatDayMonth(lastDayOf(event), i18n.language);
  const remaining = daysLeft(event);
  const timeLabel = event.is_preview
    ? t('events.previewWindow', { start: startLabel, end: endLabel })
    : remaining <= 1
      ? t('events.endsToday')
      : t('events.endsIn', { count: remaining });

  const received = secret?.received ?? null;
  const waiting = Boolean(received && !received.scratched);

  // ---------------------------------------------------------------------
  // A sala
  // ---------------------------------------------------------------------
  const scene = useRef({ done: [false, false, false] as [boolean, boolean, boolean], current: -1, ticket: false, spec: patronus.spec, settled: patronus.settled });
  scene.current = {
    done: [Boolean(steps[0]?.unlocked), Boolean(steps[1]?.unlocked), Boolean(steps[2]?.unlocked)],
    current: step ? steps.indexOf(step) : -1,
    ticket: waiting,
    spec: patronus.spec,
    settled: patronus.settled,
  };
  const wisps = useRef<Partial<Record<'on' | 'off', ReturnType<typeof wispSprite>>>>({});
  const paint = useCallback((ctx: CanvasRenderingContext2D, width: number, tick: number, still: boolean) => {
    const now = scene.current;
    drawChristmasRoom(ctx, width, { done: now.done, current: now.current, ticket: now.ticket, tick });
    if (!now.settled) return;
    // a mariposa da pessoa paira acima da lareira
    const at = roomLayout(width);
    const y = at.mothY + (still ? 0 : Math.round(Math.sin(tick / 3) * 1.2));
    if (now.spec) {
      const flap = still ? 1 : [1, 0.75, 0.5, 0.75][Math.floor(tick / 2) % 4];
      drawMoth(ctx, at.mothX, y, MOTH_SPAN / mothScale(now.spec.stage), now.spec, flap, true);
    } else {
      // sem Persona ainda: a fagulha
      const slot = !still && Math.floor(tick / 3) % 2 === 1 ? 'on' : 'off';
      const sprite = wisps.current[slot] ?? (wisps.current[slot] = wispSprite(slot === 'on', PATRONUS_SKY));
      ctx.drawImage(sprite.canvas, at.mothX - sprite.ax, y - sprite.ay);
    }
  }, []);
  const sceneKey = `${scene.current.done.join()}|${scene.current.current}|${waiting}|${patronus.settled}|${patronus.spec ? JSON.stringify(patronus.spec) : ''}`;

  // ---------------------------------------------------------------------
  // As missões
  // ---------------------------------------------------------------------
  const primary = `inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-lg text-sm font-semibold transition hover:brightness-110 active:translate-y-px disabled:opacity-60 ${FOCUS_RING}`;
  const quiet = `inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3 rounded-lg text-sm font-semibold transition hover:bg-white/10 ${FOCUS_RING}`;

  const giftButton = (compact: boolean) => {
    if (secret === undefined) {
      return (
        <span className="inline-flex items-center gap-2 min-h-[44px] text-sm" style={{ color: MIST }}>
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
          <span className="sr-only">{t('common.loading')}</span>
        </span>
      );
    }
    if (secret === null) {
      return (
        <button type="button" onClick={requestSeasonalRefresh} className={quiet} style={{ color: theme.accentText }}>
          {t('common.retry')}
        </button>
      );
    }
    if (secret.sent || !secret.open) return null;
    return (
      <button
        type="button"
        onClick={() => setGift('open')}
        className={compact ? quiet : primary}
        style={compact ? { color: theme.accentText } : { background: theme.accent, color: '#fff', boxShadow: '0 3px 0 rgba(0,0,0,0.35)' }}
      >
        {!compact && <GiftIcon pixel={2} />}
        {t('events.christmas.panel.giftAction')}
      </button>
    );
  };

  // o que já aconteceu com o presente que eu dei
  const sentLine = (): string | null => {
    const sent = secret?.sent;
    if (!sent) return null;
    if (sent.via === 'trial') return t('events.christmas.panel.sentTrial');
    if (!sent.to) return t('events.christmas.panel.sentOracle');
    const name = `@${sent.to.username ?? ''}`;
    return t(sent.scratched ? 'events.christmas.panel.sentScratched' : 'events.christmas.panel.sentTo', { name });
  };

  const missionRow = (s: SeasonalStep, index: number) => {
    const state = s.unlocked ? 'done' : s.available ? 'current' : 'locked';
    const key = stepTextKey(s);
    const color = STOCKING_COLORS[index % STOCKING_COLORS.length];
    const isGift = s.kind === 'whisper';
    const doneLine = (isGift && sentLine()) || (s.credited ? t('events.gifted') : t(`events.christmas.steps.${key}.done`, { defaultValue: t('events.conquered') }));
    return (
      <li
        key={s.tag}
        className="rounded-xl px-3 py-2.5"
        style={
          state === 'current'
            ? { background: withAlpha(color, 0.12), boxShadow: `inset 0 0 0 2px ${withAlpha(color, 0.7)}` }
            : { background: 'rgba(0,0,0,0.28)', boxShadow: `inset 0 0 0 2px ${state === 'done' ? withAlpha(color, 0.35) : 'rgba(255,255,255,0.07)'}` }
        }
      >
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className={`grid place-items-center w-11 h-11 shrink-0 rounded-lg text-2xl leading-none ${state === 'locked' ? 'grayscale opacity-45' : ''}`}
            style={{ background: 'rgba(0,0,0,0.4)', boxShadow: `inset 0 0 0 2px ${state === 'locked' ? 'rgba(255,255,255,0.1)' : color}` }}
          >
            {s.emoji}
          </span>
          <div className="min-w-0 flex-1">
            <p style={{ ...PIXEL, color: state === 'locked' ? MIST : PAPER }} className="text-lg leading-none">
              {s.name}
            </p>
            <p className="mt-1 text-[13px] leading-snug" style={{ color: state === 'done' ? theme.accentText : MIST }}>
              {state === 'done' ? doneLine : t(`events.christmas.steps.${key}.task`)}
            </p>
          </div>
          {state === 'done' ? (
            <span className="grid place-items-center w-7 h-7 shrink-0 rounded-md" style={{ background: color, color: INK }}>
              <Check className="w-4 h-4" strokeWidth={3} aria-hidden />
              <span className="sr-only">{t('events.conquered')}</span>
            </span>
          ) : state === 'locked' ? (
            <span className="grid place-items-center w-7 h-7 shrink-0 rounded-md bg-white/10" style={{ color: MIST }}>
              <Lock className="w-3.5 h-3.5" aria-hidden />
              <span className="sr-only">{t('events.locked')}</span>
            </span>
          ) : (
            <span style={{ ...PIXEL, color: PAPER }} className="shrink-0 text-lg leading-none tabular-nums" aria-label={t('events.inProgress')}>
              {Math.min(s.progress, s.count)}/{s.count}
            </span>
          )}
        </div>

        {state === 'current' && (
          <div className="mt-2.5 pl-14">
            <p className="text-xs leading-snug" style={{ color: PAPER }}>
              {t(`events.christmas.steps.${key}.gives`)}
            </p>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              {isGift ? (
                giftButton(false)
              ) : (
                <button type="button" onClick={scrollToList} className={primary} style={{ background: theme.accent, color: '#fff', boxShadow: '0 3px 0 rgba(0,0,0,0.35)' }}>
                  {t('events.christmas.panel.listAction')}
                  <ArrowDown className="w-4 h-4" aria-hidden />
                </button>
              )}
            </div>
            {/* o ensaio do diretor: avaliar e resenhar podem ser marcados à mão
                (a entrega do presente já tem o seu próprio faz de conta) */}
            {event.is_trial && !isGift && <TrialMarkButton event={event} step={s} theme={theme} />}
          </div>
        )}

        {/* a missão veio pronta (de presente, ou pelo sussurro do app antigo):
            a raspadinha ainda pode ser dada */}
        {state === 'done' && isGift && secret && secret.open && !secret.sent && <div className="mt-1.5 pl-14">{giftButton(true)}</div>}
      </li>
    );
  };

  const titleId = 'christmas-panel-title';

  return (
    <>
      <section
        id="natal"
        aria-labelledby={titleId}
        className="relative overflow-hidden rounded-2xl scroll-mt-20"
        style={{ background: PINE, border: `2px solid ${RAIL}`, boxShadow: '0 6px 0 rgba(0,0,0,0.35)' }}
      >
        <PixelStage height={ROOM_H} paint={paint} repaintKey={sceneKey} scale={roomScale} />

        <div className="px-4 sm:px-6 pt-4 pb-4 sm:pb-5" style={{ borderTop: `2px solid ${RAIL}` }}>
          {/* ---------- Cabeçalho ---------- */}
          <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
            <div className="min-w-0">
              <h2 id={titleId} style={{ ...PIXEL, color: PAPER }} className="text-[1.75rem] sm:text-4xl leading-none">
                {t('events.christmas.trackTitle')}
              </h2>
              <p className="mt-1.5 text-sm tabular-nums" style={{ color: MIST }}>
                {t('events.christmas.summary', { done: unlockedCount, total: steps.length })}
              </p>
            </div>
            <p
              className="inline-flex items-center gap-1.5 min-h-[28px] px-2.5 rounded-md text-xs font-semibold"
              style={{ background: withAlpha(theme.accent, 0.18), color: theme.accentText, boxShadow: `inset 0 0 0 1px ${withAlpha(theme.accent, 0.45)}` }}
            >
              <span aria-hidden>{theme.emoji}</span>
              {timeLabel}
              {event.is_trial ? (
                <TrialBadge />
              ) : (
                event.is_preview && (
                  <span className="ml-1 px-1.5 rounded bg-white/15 text-[10px]" style={{ color: PAPER }}>
                    {t('events.preview')}
                  </span>
                )
              )}
            </p>
          </div>

          {/* ---------- A raspadinha que eu ganhei ---------- */}
          {received && (
            <div
              className="mt-4 flex flex-col sm:flex-row sm:items-center gap-x-3 gap-y-2.5 rounded-xl px-3 py-2.5"
              style={{ background: withAlpha(GOLD, waiting ? 0.16 : 0.08), boxShadow: `inset 0 0 0 2px ${withAlpha(GOLD, waiting ? 0.75 : 0.3)}` }}
            >
              <div className="min-w-0 flex-1 flex items-center gap-3">
                {waiting ? (
                  <ScratchTicketIcon pixel={4} />
                ) : (
                  <span className="inline-flex items-center shrink-0" aria-hidden>
                    <ChipFace kind="normal" className="w-7 h-7" />
                    {(received.special ?? 0) > 0 && <ChipFace kind="special" className="w-7 h-7 -ml-2.5" />}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold leading-snug" style={{ color: PAPER }}>
                    {waiting
                      ? t('events.christmas.received.title')
                      : t('events.christmas.received.done', { prize: prizeText(t, received.tickets ?? 0, received.special ?? 0) })}
                  </p>
                  {!waiting && received.from && (
                    <p className="mt-0.5 inline-flex items-center gap-1.5 text-xs" style={{ color: MIST }}>
                      <UserAvatar user={received.from} size={18} plain />
                      {t('events.christmas.received.from', { name: `@${received.from.username ?? ''}` })}
                    </p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setScratch('open')}
                className={`${waiting ? primary : quiet} ${waiting ? 'w-full sm:w-auto' : 'self-start sm:self-auto -my-1'}`}
                style={waiting ? { background: GOLD, color: INK, boxShadow: '0 3px 0 rgba(0,0,0,0.35)' } : { color: GOLD }}
              >
                {t(waiting ? 'events.christmas.received.action' : 'events.christmas.received.view')}
              </button>
            </div>
          )}

          {/* ---------- As três missões ---------- */}
          {/* no computador as três ficam lado a lado, e a lista de filmes sobe */}
          <ol className="mt-4 grid gap-2 lg:grid-cols-3 lg:gap-3 lg:items-start">{steps.map(missionRow)}</ol>

          {giftedCount > 0 && (
            <p className="mt-3 text-xs leading-snug" style={{ color: MIST }}>
              🎁 {t('events.giftedNote', { seen: event.pre_rated, size: event.list_size, count: giftedCount })}
            </p>
          )}

          {!step && (
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
              <p className="min-w-0 flex-1 basis-[220px] text-[13px] leading-relaxed" style={{ color: MIST }}>
                <strong className="font-semibold" style={{ color: PAPER }}>
                  {t('events.christmas.doneTitle')}.
                </strong>{' '}
                {t('events.christmas.doneText', { tag: last?.name ?? '' })}
              </p>
              <Link to="/profile" className={quiet} style={{ color: theme.accentText }}>
                {t('events.viewProfile')}
                <ArrowRight className="w-4 h-4" aria-hidden />
              </Link>
            </div>
          )}

          {/* prateleiras dos oráculos que também contam, além da lista */}
          {step && step.kind !== 'whisper' && bonusMoods.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {bonusMoods.map((mood) => {
                const MoodIcon = mood.icon;
                return (
                  <Link
                    key={mood.key}
                    to={`/oracle/acervo?mood=${mood.key}&type=movie`}
                    className={`inline-flex items-center gap-2 min-h-[40px] pl-2.5 pr-3 rounded-lg text-sm font-semibold hover:bg-white/10 transition ${FOCUS_RING}`}
                    style={{ background: 'rgba(0,0,0,0.28)', color: PAPER, boxShadow: `inset 0 0 0 1px ${withAlpha(mood.color, 0.4)}` }}
                  >
                    <MoodIcon className="w-4 h-4 shrink-0" style={{ color: mood.color }} aria-hidden />
                    {t('events.bonusMoodLink', { mood: t(mood.labelKey) })}
                    <ArrowRight className="w-4 h-4 shrink-0" style={{ color: theme.accentText }} aria-hidden />
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {event.is_trial && (
          <div className="pb-4 -mt-1">
            <TrialNote event={event} />
          </div>
        )}
      </section>

      {secret && gift !== 'closed' && (
        <Suspense fallback={null}>
          <SecretFriendSheet open={gift === 'open'} onClose={() => setGift('shut')} state={secret} preview={preview} />
        </Suspense>
      )}
      {scratch !== 'closed' && (
        <Suspense fallback={null}>
          <ScratchCardSheet
            open={scratch === 'open'}
            onClose={() => setScratch('shut')}
            preview={preview}
            known={received?.scratched ? received : null}
            onScratched={requestSeasonalRefresh}
          />
        </Suspense>
      )}
    </>
  );
};

export default ChristmasPanel;
