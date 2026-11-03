import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2, WifiOff } from 'lucide-react';
import type { PlayerAction } from '../../../lib/poker/engine';
import type { Rarity, RivalId } from '../../../lib/poker/types';
import type { PokerHome, PokerPrize } from '../../../lib/poker/client/apiTypes';
import { inHandIds, seatOf } from '../../../lib/poker/client/display';
import { readTable, theName, whoName } from '../../../lib/poker/client/narrate';
import { setPokerSettings, SPEEDS } from '../../../lib/poker/client/settings';
import { useRig, type Rig } from '../../../lib/poker/client/useRig';
import { useFreeMatch, type MatchCtl } from '../../../lib/poker/client/useFreeMatch';
import { useBountyMatch } from '../../../lib/poker/client/useBountyMatch';
import { useTraining, type TrainingCtl } from '../../../lib/poker/client/useTraining';
import { primePokerAudio } from '../../../lib/poker/client/sound';
import { loadJackpotFont } from '../../../lib/posterJackpot';
import AgeGate from '../age/AgeGate';
import Credits from '../credits/Credits';
import RecapCard from '../interval/RecapCard';
import IntervalCard from '../interval/IntervalCard';
import { BLEFE_ROUTES } from '../jackpot/pokerMeta';
import TableStage, { type Thermo } from './TableStage';
import type { ActionBarHandle, PreAction } from './ActionBar';
import { CardViewer, ConfirmDialog, QuipPicker, Sheet, Starring, TableMenu } from './Overlays';
import TrainingDone from '../tutorial/TrainingDone';

// O container da mesa (03/11/2026): liga o equipamento (`useRig`) e o controlador
// de cada modo ao desenho (`TableStage`), e cuida do que é comum aos três:
// pré-ações, teclado, termômetro, "Mostrar", Réplicas, menu, sair/desistir,
// despedida e créditos.

interface ScreenProps {
  rig: Rig;
  ctl: MatchCtl;
  cardStyle: string;
  home: PokerHome | null;
  prize: PokerPrize | null;
  training?: TrainingCtl | null;
}

const FAREWELL_MS = 4000;

const TableScreen: React.FC<ScreenProps> = ({ rig, ctl, cardStyle, home, prize, training }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { table: tb, dir, settings, reduced, lang, mode, client } = rig;
  const table = tb.table;
  const barRef = useRef<ActionBarHandle>(null);
  const [pre, setPre] = useState<PreAction | null>(null);
  const [menu, setMenu] = useState<null | 'menu' | 'script' | 'ranking'>(null);
  const [quipOpen, setQuipOpen] = useState(false);
  const [quipHand, setQuipHand] = useState(0);
  const [portrait, setPortrait] = useState<RivalId | null>(null);
  const [confirm, setConfirm] = useState<{ text: string; run: () => void } | null>(null);
  const [leaveAsk, setLeaveAsk] = useState(false);
  const [forfeitAsk, setForfeitAsk] = useState(false);
  const [thermo, setThermo] = useState<Thermo>(null);
  const [showUntil, setShowUntil] = useState(0);
  const [stage, setStage] = useState<'table' | 'farewell' | 'credits'>('table');
  const [notice, setNotice] = useState<string | null>(null);
  const me = seatOf(table, 'human');
  const prizeInfo = prize ? { rarity: prize.rarity as Rarity, name: lang === 'pt' ? prize.name_pt : prize.name_en } : null;
  const thermoOn = settings.thermo ?? !!home?.player?.tutorial_done;

  useEffect(() => {
    loadJackpotFont();
  }, []);

  // Diretor: a vez da pessoa, o tempo parado (25 s e 60 s ele decide) e gavetas.
  useEffect(() => {
    dir.director.onHumanTurn(tb.phase === 'human');
    if (tb.phase !== 'human') return;
    const start = Date.now();
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible' && !menu && !quipOpen) dir.director.onIdleTick(Date.now() - start);
    }, 1000);
    return () => window.clearInterval(id);
  }, [tb.phase, dir.director, menu, quipOpen]);
  useEffect(() => {
    dir.director.onDrawer(!!menu || quipOpen);
  }, [menu, quipOpen, dir.director]);

  // Pré-ações: valem quando a vez chega; "Pagar X" cai se o preço mudou.
  useEffect(() => {
    if (tb.phase !== 'human' || !pre || !table.legal) return;
    const legal = table.legal;
    const p = pre;
    setPre(null);
    if (p.kind === 'checkFold') ctl.act(legal.canCheck ? { type: 'check' } : { type: 'fold' });
    else if (p.kind === 'callAny') ctl.act(legal.canCheck ? { type: 'check' } : { type: 'call' });
    else if (p.kind === 'call') {
      if (p.amount === 0 && legal.canCheck) ctl.act({ type: 'check' });
      else if (legal.call && legal.toCall === p.amount && !legal.call.allIn) ctl.act({ type: 'call' });
      else setNotice(t('poker.actions.preDropped'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tb.phase]);
  useEffect(() => {
    setPre(null);
  }, [table.handNumber]);
  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(null), 2600);
    return () => window.clearTimeout(id);
  }, [notice]);

  // Termômetro (§7.3): fraca · boa · forte, contra mãos aleatórias de quem está na mão.
  const thermoKey = me && me.cards.length === 2 && me.hasCards ? `${me.cards.join('')}|${table.board.join('')}|${inHandIds(table).length}` : '';
  useEffect(() => {
    if (!thermoOn || !thermoKey || !me) {
      setThermo(null);
      return;
    }
    const opp = Math.max(1, inHandIds(table).length - 1);
    let alive = true;
    void client.call({ op: 'thermo', hole: me.cards, board: table.board, opponents: opp, dead: [] }).then((r) => {
      if (!alive || r.kind !== 'equity') return;
      const n = opp;
      setThermo(r.value < 0.8 / (n + 1) ? 'weak' : r.value > 1.5 / (n + 1) ? 'strong' : 'good');
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thermoKey, thermoOn]);

  // "Mostrar" por 3 s depois de levar um pote sem showdown (§2.3.3).
  useEffect(() => {
    if (mode === 'tutorial') return;
    if (!table.showdown && table.winners.length === 1 && table.winners[0] === 'human' && (me?.won ?? 0) > 0 && !me?.shownAfterFold) {
      setShowUntil(Date.now() + 3000);
      const id = window.setTimeout(() => setShowUntil(0), 3000);
      return () => window.clearTimeout(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table.winners, table.showdown]);

  // Fim: despedida (quem eliminou fala, até 4 s, pulável) e créditos.
  useEffect(() => {
    if (tb.phase !== 'ended' || !ctl.credits || stage !== 'table' || mode === 'tutorial') return;
    if (ctl.credits.reason === 'eliminated') {
      setStage('farewell');
      let alive = true;
      const min = new Promise((r) => setTimeout(r, reduced ? 1500 : FAREWELL_MS));
      void Promise.all([min, dir.waitQuiet(6000)]).then(() => alive && setStage((s) => (s === 'farewell' ? 'credits' : s)));
      return () => {
        alive = false;
      };
    }
    const id = window.setTimeout(() => setStage('credits'), ctl.credits.place === 1 ? 1400 : 300);
    return () => window.clearTimeout(id);
  }, [tb.phase, ctl.credits, stage, mode, reduced]);
  useEffect(() => {
    if (!ctl.credits) setStage('table');
  }, [ctl.credits]);

  const leave = useCallback(() => {
    dir.director.onMoment?.({ t: 'playerLeaves' });
    navigate(BLEFE_ROUTES.lobby);
  }, [dir.director, navigate]);

  const act = useCallback(
    (a: PlayerAction) => {
      primePokerAudio();
      setPre(null);
      if (training) training.act(a);
      else ctl.act(a);
    },
    [ctl, training],
  );

  // Teclado (§7.4). Atalhos de uma letra podem ser desligados (WCAG 2.1.4).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (confirm) setConfirm(null);
        else if (menu || quipOpen || portrait) {
          setMenu(null);
          setQuipOpen(false);
          setPortrait(null);
        } else if (stage === 'table') setLeaveAsk((x) => !x);
        e.preventDefault();
        return;
      }
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || menu || confirm || stage !== 'table') return;
      if (e.key === ' ') {
        tb.skipAnim();
        e.preventDefault();
        return;
      }
      if (!settings.shortcuts || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      const bar = barRef.current;
      if (k === 't') {
        tb.addLog(readTable(t, lang, table));
        const el = document.getElementById('pk-read');
        if (el) el.textContent = readTable(t, lang, table);
      } else if (k === 'h') setMenu('script');
      if (!bar || tb.phase !== 'human') return;
      if (k === 'f') bar.fold();
      else if (k === 'c') bar.checkCall();
      else if (k === 'r') {
        bar.raise();
        e.preventDefault();
      } else if (e.key === 'ArrowUp') {
        bar.step(1);
        e.preventDefault();
      } else if (e.key === 'ArrowDown') {
        bar.step(-1);
        e.preventDefault();
      } else if (/^[1-5]$/.test(e.key)) bar.preset(Number(e.key) - 1);
      else if (e.key === 'Enter' && (e.target as HTMLElement | null)?.tagName !== 'BUTTON') bar.confirm();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirm, menu, quipOpen, portrait, stage, settings.shortcuts, tb, t, lang, table]);

  const thinkingName = table.thinkingId ? whoName(t, table.thinkingId) : null;
  const statusText: React.ReactNode =
    ctl.status === 'reconnecting' ? (
      <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />{t('poker.net.reconnecting')}</span>
    ) : notice ? (
      <span>{notice}</span>
    ) : thinkingName ? (
      <span>{t('poker.table.isThinking', { who: thinkingName })}</span>
    ) : tb.phase === 'ended' ? (
      <span>{t('poker.table.handOver')}</span>
    ) : me?.status === 'folded' ? (
      <span>{t('poker.table.youFolded')}</span>
    ) : tb.log.length ? (
      <span className="truncate">{tb.log[tb.log.length - 1].text}</span>
    ) : (
      <span />
    );
  const prevIdx = tb.log.length - (thinkingName || notice || tb.phase === 'ended' || me?.status === 'folded' ? 1 : 2);
  const prevText = prevIdx >= 0 && tb.log[prevIdx] ? <span className="truncate">{tb.log[prevIdx].text}</span> : null;

  const alive = table.seats.filter((s) => s.id !== 'human' && s.status !== 'eliminated').map((s) => s.id);
  const quipReady = !training && !table.thinkingId && quipHand !== table.handNumber && me?.status !== 'eliminated' && tb.phase !== 'ended';
  const recapLine = useMemo(() => {
    if (!ctl.recap) return null;
    const view = tb.getView();
    if (!view || !dir.director.cardLine) return null;
    try {
      return dir.director.cardLine(
        'recap',
        {
          mode, lang, title: home?.title?.id ?? 'figurante', lifetimeMatches: home?.player?.lifetime_matches ?? 0, matchInSession: 1,
          returning: true, localHour: new Date().getHours(), story: home?.player?.story ?? {}, speed: settings.speed, talk: settings.talk,
          view, reducedMotion: reduced,
        },
        {
          handNumber: table.handNumber,
          bb: table.level.bb,
          stacks: Object.fromEntries(table.seats.filter((s) => s.status !== 'eliminated').map((s) => [s.id, s.stack])),
          holderId: table.prize?.holderId ?? null,
          someoneOut: table.seats.some((s) => s.status === 'eliminated'),
        },
      );
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctl.recap]);

  const fincherAllIn = seatOf(table, 'fincher')?.status === 'allIn';
  const eliminator = ctl.credits?.eliminatedBy ?? null;

  return (
    <TableStage
      ref={barRef}
      table={table}
      phase={stage === 'table' ? (ctl.status === 'offline' ? 'submitting' : tb.phase) : 'ended'}
      mode={mode}
      lang={lang}
      cardStyle={cardStyle}
      deckId={home?.loadout?.deck}
      tableId={home?.loadout?.table}
      settings={settings}
      reduced={reduced}
      speech={dir.speech}
      banner={tb.banner}
      prize={prizeInfo}
      thermo={thermo}
      pre={pre}
      setPre={setPre}
      onAct={act}
      onSkipAnim={tb.skipAnim}
      onSkipSpeech={dir.skip}
      onBack={() => (stage === 'credits' ? navigate(BLEFE_ROUTES.lobby) : setLeaveAsk(true))}
      onMenu={() => setMenu('menu')}
      onSpeed={() => setPokerSettings({ speed: SPEEDS[(SPEEDS.indexOf(settings.speed) + 1) % SPEEDS.length] })}
      onPortrait={(id) => setPortrait(id as RivalId)}
      onConfirmDialog={(text, run) => setConfirm({ text, run })}
      showButton={showUntil > Date.now()}
      onShow={() => {
        ctl.show();
        setShowUntil(0);
        tb.addLog(t('poker.table.youShowed'));
        setNotice(t('poker.table.youShowed'));
      }}
      quipReady={quipReady}
      onQuip={training ? null : () => setQuipOpen(true)}
      statusText={statusText}
      prevText={prevText}
      live={tb.live}
      alert={tb.alert}
      log={tb.log}
      title={training ? t('poker.table.trainingStep', { n: training.hand + 1 }) : undefined}
      tutorial={training?.gate ?? null}
      onContinue={training?.waitingTap ? training.onContinue : null}
      highlight={training?.highlight ?? null}
      vignette={fincherAllIn}
      onSkipTraining={training ? () => navigate(BLEFE_ROUTES.lobby) : null}
      onBlocked={training ? training.blocked : undefined}
    >
      <p id="pk-read" className="sr-only-pk" aria-live="polite" />

      {/* Rede (prêmio). */}
      {ctl.status === 'offline' && (
        <div className="pk-overlay" role="alertdialog" aria-modal="true" aria-label={t('poker.net.offline')}>
          <div className="text-center max-w-[300px] grid gap-3 justify-items-center">
            <WifiOff className="w-8 h-8" style={{ color: '#FFE8A3' }} />
            <p className="text-[15px]">{t('poker.net.offline')}</p>
            {ctl.retry && <button type="button" className="pk-cta-gold" onClick={ctl.retry}>{t('poker.net.retry')}</button>}
            <button type="button" className="pk-cta-ghost" onClick={() => navigate(BLEFE_ROUTES.lobby)}>{t('poker.leave.confirm')}</button>
          </div>
        </div>
      )}
      {(ctl.status === 'updateRequired' || ctl.status === 'error' || ctl.status === 'unavailable') && (
        <div className="pk-overlay" role="alertdialog" aria-modal="true">
          <div className="text-center max-w-[300px] grid gap-3 justify-items-center">
            <p className="pk-display text-[18px]" style={{ color: '#FFE8A3' }}>{t('poker.name')}</p>
            <p className="text-[15px]">
              {ctl.status === 'updateRequired' ? t('poker.net.update') : ctl.status === 'unavailable' ? t('poker.net.soon') : t('poker.net.error')}
            </p>
            <button type="button" className="pk-cta-gold" onClick={() => navigate(BLEFE_ROUTES.lobby)}>{t('poker.table.backToLobby')}</button>
          </div>
        </div>
      )}
      {ctl.status === 'loading' && !training && (
        <div className="pk-overlay" style={{ background: 'rgba(4,6,22,0.6)' }} aria-busy="true">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#FFE8A3' }} aria-label={t('common.loading')} />
        </div>
      )}

      {ctl.status === 'intro' && <Starring cardStyle={cardStyle} onDone={ctl.introDone} reduced={reduced} />}
      {ctl.interval && (
        <IntervalCard pick={ctl.interval} cardStyle={cardStyle} reduced={reduced} onRated={() => ctl.continueAfterInterval(true)} onContinue={() => ctl.continueAfterInterval(false)} />
      )}
      {ctl.recap && stage === 'table' && !ctl.credits && (
        <RecapCard table={table} tail={ctl.recap} prizeName={prizeInfo?.name ?? null} line={recapLine} lang={lang} reduced={reduced} onClose={ctl.closeRecap} />
      )}

      {/* Despedida: a sala escurece e quem eliminou fica sob a luz. */}
      {stage === 'farewell' && (
        <div
          className="pk-farewell"
          onClick={() => {
            dir.skip();
            setStage('credits');
          }}
        >
          <div className="text-center grid gap-3 justify-items-center">
            {eliminator && eliminator !== 'human' && (
              <p className="text-[15px]" style={{ color: '#F3EAD3' }}>{t('poker.credits.eliminatedBy', { by: theName(t, eliminator, 'by'), hand: ctl.credits?.eliminatedHand ?? '' })}</p>
            )}
            <button type="button" className="pk-cta-ghost">{t('poker.table.skip')}</button>
          </div>
        </div>
      )}
      {stage === 'credits' && ctl.credits && (
        <Credits
          data={ctl.credits}
          cardStyle={cardStyle}
          reduced={reduced}
          onRematch={() => {
            setStage('table');
            ctl.rematch();
          }}
          onScoreboard={() => navigate(BLEFE_ROUTES.scoreboard)}
          onRetry={
            ctl.credits.retry && home?.bounty?.prize
              ? () => navigate(BLEFE_ROUTES.bounty(home.bounty!.day, home.bounty!.prize.id))
              : null
          }
          onLobby={() => navigate(BLEFE_ROUTES.lobby)}
        />
      )}

      {training?.status === 'done' && <TrainingDone granted={training.granted} />}
      {training?.status === 'unavailable' && (
        <div className="pk-overlay">
          <div className="text-center max-w-[300px] grid gap-3 justify-items-center">
            <p className="text-[15px]">{t('poker.tutorial.soon')}</p>
            <button type="button" className="pk-cta-gold" onClick={() => navigate(BLEFE_ROUTES.lobby)}>{t('poker.table.backToLobby')}</button>
          </div>
        </div>
      )}

      {portrait && <CardViewer id={portrait} cardStyle={cardStyle} onClose={() => setPortrait(null)} />}
      {quipOpen && (
        <QuipPicker
          alive={alive}
          reduced={reduced}
          onClose={() => setQuipOpen(false)}
          onPick={(q, target) => {
            dir.director.onQuip(q, target);
            setQuipHand(table.handNumber);
            setQuipOpen(false);
          }}
        />
      )}
      {menu && (
        <TableMenu
          settings={settings}
          initial={menu}
          log={tb.log}
          reduced={reduced}
          onClose={() => setMenu(null)}
          onLeave={() => {
            setMenu(null);
            setLeaveAsk(true);
          }}
          onForfeit={
            mode === 'tutorial' || stage !== 'table' || me?.status === 'eliminated'
              ? null
              : () => {
                  setMenu(null);
                  setForfeitAsk(true);
                }
          }
        />
      )}
      {leaveAsk && (
        <Sheet title={training ? t('poker.leave.titleTraining') : t('poker.leave.title')} onClose={() => setLeaveAsk(false)} reduced={reduced}>
          <p className="text-[14.5px] mb-4" style={{ color: '#D9D2EA' }}>{training ? t('poker.leave.bodyTraining') : t('poker.leave.body')}</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="pk-cta-ghost" onClick={() => setLeaveAsk(false)} autoFocus>{t('poker.leave.stay')}</button>
            <button type="button" className="pk-cta-paper" onClick={leave}>{t('poker.leave.confirm')}</button>
          </div>
        </Sheet>
      )}
      {forfeitAsk && ctl.forfeit && (
        <Sheet title={t('poker.forfeit.title')} onClose={() => setForfeitAsk(false)} reduced={reduced}>
          <p className="text-[14.5px] mb-4" style={{ color: '#D9D2EA' }}>{t('poker.forfeit.body')}</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="pk-cta-ghost" onClick={() => setForfeitAsk(false)} autoFocus>{t('poker.leave.stay')}</button>
            <button
              type="button"
              className="pk-cta-ghost"
              style={{ color: '#FF8A8F', boxShadow: 'inset 0 0 0 1.5px #E2525C' }}
              onClick={() => {
                setForfeitAsk(false);
                ctl.forfeit?.();
              }}
            >
              {t('poker.forfeit.confirm')}
            </button>
          </div>
        </Sheet>
      )}
      {confirm && (
        <ConfirmDialog
          text={confirm.text}
          confirm={t('poker.actions.confirm')}
          cancel={t('poker.leave.stay')}
          onNo={() => setConfirm(null)}
          onYes={() => {
            const run = confirm.run;
            setConfirm(null);
            run();
          }}
        />
      )}
    </TableStage>
  );
};

// ---------------------------------------------------------------------------
// Os três modos
// ---------------------------------------------------------------------------

export const FreeTable: React.FC<{ home: PokerHome | null; cardStyle: string }> = ({ home, cardStyle }) => {
  const rig = useRig('free', { story: home?.player?.story, lifetimeMatches: home?.player?.lifetime_matches });
  rig.extras.current.title = home?.title?.id;
  rig.extras.current.story = home?.player?.story;
  const ctl = useFreeMatch(rig, home);
  return <TableScreen rig={rig} ctl={ctl} cardStyle={cardStyle} home={home} prize={null} />;
};

export const BountyTable: React.FC<{ home: PokerHome | null; cardStyle: string; start: boolean; day: string | null; prizeId: string | null }> = ({
  home,
  cardStyle,
  start,
  day,
  prizeId,
}) => {
  const rig = useRig('bounty', { story: home?.player?.story, lifetimeMatches: home?.player?.lifetime_matches });
  rig.extras.current.title = home?.title?.id;
  rig.extras.current.story = home?.player?.story;
  const ctl = useBountyMatch(rig, home, { start, day, prizeId });
  return (
    <>
      <TableScreen rig={rig} ctl={ctl} cardStyle={cardStyle} home={home} prize={ctl.prize} />
      <AgeGate open={ctl.needAge} onConfirmed={ctl.ageConfirmed} onClose={ctl.ageDeclined} zIndexClass="z-[10050]" />
    </>
  );
};

const NOOP_CTL: MatchCtl = {
  status: 'playing',
  errorCode: null,
  interval: null,
  recap: null,
  credits: null,
  act: () => {},
  forfeit: null,
  rematch: () => {},
  retry: null,
  closeRecap: () => {},
  continueAfterInterval: () => {},
  introDone: () => {},
  show: () => {},
};

export const TrainingTable: React.FC<{ home: PokerHome | null; cardStyle: string }> = ({ home, cardStyle }) => {
  const rig = useRig('tutorial', { story: home?.player?.story, lifetimeMatches: home?.player?.lifetime_matches });
  const training = useTraining(rig);
  return <TableScreen rig={rig} ctl={NOOP_CTL} cardStyle={cardStyle} home={home} prize={null} training={training} />;
};

export default TableScreen;
