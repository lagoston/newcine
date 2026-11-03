import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2, WifiOff } from 'lucide-react';
import type { PlayerAction } from '../../../lib/poker/engine';
import type { Rarity, RivalId } from '../../../lib/poker/types';
import type { PokerHome, PokerPrize } from '../../../lib/poker/client/apiTypes';
import { inHandIds, seatOf } from '../../../lib/poker/client/display';
import { readTable, theName, whoName } from '../../../lib/poker/client/narrate';
import { prizeWithArticle } from '../../../lib/poker/client/format';
import { setPokerSettings, SPEEDS } from '../../../lib/poker/client/settings';
import { useRig, type Rig } from '../../../lib/poker/client/useRig';
import { useFreeMatch, type MatchCtl } from '../../../lib/poker/client/useFreeMatch';
import { useBountyMatch, type TourneyInfo } from '../../../lib/poker/client/useBountyMatch';
import { oddsFx } from '../../../lib/poker/client/useTable';
import { posterTitle, type TournamentStake } from '../../../lib/poker/client/tournament';
import type { StakeShow, TourneyPoster } from '../tournament/TableTourney';
import PosterInfoSheet from '../tournament/PosterInfoSheet';
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
  /** Pôster Poker: o torneio da semana (o pôster mágico e a entrada). */
  tourney?: TourneyInfo | null;
}

const FAREWELL_MS = 4000;

const TableScreen: React.FC<ScreenProps> = ({ rig, ctl, cardStyle, home, prize, training, tourney }) => {
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
  const [posterInfo, setPosterInfo] = useState(false);
  const me = seatOf(table, 'human');
  const prizeInfo = prize ? { rarity: prize.rarity as Rarity, name: lang === 'pt' ? prize.name_pt : prize.name_en, the: prizeWithArticle(prize, lang) } : null;
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
  // Cartão por cima da faixa de fala: a fila espera (a abertura sai depois do "Estrelando…").
  const covered = ctl.status === 'intro' || !!ctl.interval || (!!ctl.recap && stage === 'table' && !ctl.credits);
  useEffect(() => {
    dir.pause(covered);
  }, [covered, dir]);

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
    void client.call({ op: 'thermo', hole: me.cards, board: table.board, opponents: opp, dead: [], ...oddsFx(table) }).then((r) => {
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

  // Fim: despedida (quem eliminou fala, até 4 s, pulável) e créditos. Roda uma vez
  // por fim de partida: os créditos ainda mudam depois (quem levou a mesa, título),
  // e isso não pode reabrir a despedida.
  const ended = tb.phase === 'ended' && !!ctl.credits && mode !== 'tutorial';
  const creditsRef = useRef(ctl.credits);
  creditsRef.current = ctl.credits;
  useEffect(() => {
    const c = creditsRef.current;
    if (!ended || !c) return;
    let alive = true;
    if (c.instant) {
      setStage('credits');
      return;
    }
    if (c.reason === 'eliminated') {
      setStage('farewell');
      const min = new Promise((r) => setTimeout(r, reduced ? 1500 : FAREWELL_MS));
      void Promise.all([min, dir.waitQuiet(6000)]).then(() => alive && setStage((s) => (s === 'farewell' ? 'credits' : s)));
      return () => {
        alive = false;
      };
    }
    const id = window.setTimeout(() => setStage('credits'), c.place === 1 ? 1400 : 300);
    return () => window.clearTimeout(id);
    // Só quando a partida termina (ver acima).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ended]);
  useEffect(() => {
    if (!ctl.credits) setStage('table');
  }, [ctl.credits]);
  // Créditos na tela: as chaves de história tocadas na partida vão ao servidor.
  useEffect(() => {
    if (stage === 'credits') rig.flushStory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

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
    ) : training && dir.speech && !training.waitingTap && tb.phase !== 'human' ? (
      <span>{t('poker.table.tapBalloon')}</span>
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
    return rig.cardLine('recap', {
      handNumber: table.handNumber,
      bb: table.level.bb,
      stacks: Object.fromEntries(table.seats.filter((s) => s.status !== 'eliminated').map((s) => [s.id, s.stack])),
      holderId: table.prize && !table.prize.captured ? table.prize.holderId : null,
      someoneOut: table.seats.some((s) => s.status === 'eliminated'),
    });
    // Uma fala por cartão: só quando o cartão abre.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctl.recap]);

  const fincherAllIn = seatOf(table, 'fincher')?.status === 'allIn';
  // O pôster da semana e o pôster apostado, como a mesa desenha.
  const stageTourney = useMemo((): { poster: TourneyPoster; stake: StakeShow | null } | null => {
    if (!tourney) return null;
    const pz = tourney.prize;
    const st = tourney.stake;
    return {
      poster: { title: posterTitle(pz, lang), filePath: pz.file_path, rarity: pz.rarity, serial: pz.serial },
      stake: st && st.kind === 'poster' && st.filePath ? { title: st.title ?? '', filePath: st.filePath, effect: st.effect ?? 'none' } : null,
    };
  }, [tourney, lang]);
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
      tourney={stageTourney}
      cast={tb.cast}
      onPosterInfo={() => setPosterInfo(true)}
    >
      <p id="pk-read" className="sr-only-pk" aria-live="polite" />

      {/* Rede (prêmio). */}
      {ctl.status === 'offline' && (
        <div className="pk-overlay" role="alertdialog" aria-modal="true" aria-label={t('poker.net.offline')}>
          <div className="pk-farewell-card w-full">
            <WifiOff className="w-8 h-8" style={{ color: '#FFE8A3' }} />
            <p className="text-[15px]">{t('poker.net.offline')}</p>
            {ctl.retry && <button type="button" className="pk-cta-gold" onClick={ctl.retry}>{t('poker.net.retry')}</button>}
            <button type="button" className="pk-cta-ghost" onClick={() => navigate(BLEFE_ROUTES.lobby)}>{t('poker.leave.confirm')}</button>
          </div>
        </div>
      )}
      {(ctl.status === 'updateRequired' || ctl.status === 'error' || ctl.status === 'unavailable') && (
        <div className="pk-overlay" role="alertdialog" aria-modal="true">
          <div className="pk-farewell-card w-full">
            <p className="pk-display text-[18px]" style={{ color: '#FFE8A3' }}>{t('poker.name')}</p>
            <p className="text-[15px]">
              {ctl.status === 'updateRequired'
                ? t('poker.net.update')
                : ctl.status === 'unavailable'
                  ? mode === 'bounty'
                    ? t('poker.net.bountySoon')
                    : t('poker.net.soon')
                  : t('poker.net.error')}
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
        <IntervalCard
          pick={ctl.interval}
          line={ctl.intervalLine ?? null}
          cardStyle={cardStyle}
          reduced={reduced}
          onRated={() => ctl.continueAfterInterval(true)}
          onContinue={() => ctl.continueAfterInterval(false)}
        />
      )}
      {ctl.recap && stage === 'table' && !ctl.credits && (
        <RecapCard table={table} tail={ctl.recap} prizeName={prizeInfo?.the ?? null} line={recapLine} lang={lang} reduced={reduced} onClose={ctl.closeRecap} />
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
          <div className="pk-farewell-card">
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
          speech={dir.speech}
          onSkipSpeech={dir.skip}
          onRematch={ctl.rematch}
          onScoreboard={() => navigate(BLEFE_ROUTES.scoreboard)}
          // Tentar de novo: volta à tela do torneio, para escolher a entrada outra vez.
          onRetry={ctl.credits.retry && ctl.credits.tournament ? () => navigate(BLEFE_ROUTES.tournament) : null}
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

      {posterInfo && tourney && stageTourney && (
        <PosterInfoSheet prize={tourney.prize} table={table} lang={lang} reduced={reduced} onClose={() => setPosterInfo(false)} />
      )}
      {portrait && <CardViewer id={portrait} cardStyle={cardStyle} onClose={() => setPortrait(null)} />}
      {quipOpen && (
        <QuipPicker
          pack={home?.loadout?.quips}
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
  const rig = useRig('free', home);
  const ctl = useFreeMatch(rig, home);
  return <TableScreen rig={rig} ctl={ctl} cardStyle={cardStyle} home={home} prize={null} />;
};

export const BountyTable: React.FC<{
  home: PokerHome | null;
  cardStyle: string;
  start: boolean;
  week: string | null;
  prizeId: string | null;
  stake: TournamentStake | null;
}> = ({ home, cardStyle, start, week, prizeId, stake }) => {
  const rig = useRig('bounty', home);
  const ctl = useBountyMatch(rig, home, { start, week, prizeId, stake });
  return (
    <>
      <TableScreen rig={rig} ctl={ctl} cardStyle={cardStyle} home={home} prize={ctl.prize} tourney={ctl.tourney} />
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
  const rig = useRig('tutorial', home);
  const training = useTraining(rig);
  return <TableScreen rig={rig} ctl={NOOP_CTL} cardStyle={cardStyle} home={home} prize={null} training={training} />;
};

export default TableScreen;
