import React, { forwardRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, FastForward, Menu, MessageCircle, Eye } from 'lucide-react';
import type { PlayerAction } from '../../../lib/poker/engine';
import type { MatchMode, PlayerId, Rarity } from '../../../lib/poker/types';
import type { TableShow } from '../../../lib/poker/client/display';
import { seatOf } from '../../../lib/poker/client/display';
import type { Banner, TablePhase } from '../../../lib/poker/client/useTable';
import type { SpeechItem } from '../../../lib/poker/client/useDirector';
import type { PokerSettingsLocal } from '../../../lib/poker/client/settings';
import { describeHand, fmt, whatYouHave, type Lang } from '../../../lib/poker/client/format';
import { blindsText } from '../../../lib/poker/client/narrate';
import { pokerCosmetics } from '../cosmetics/looks';
import OracleSeat from '../acting/OracleSeat';
import WantedPoster from '../acting/WantedPoster';
import PlayingCard from '../cards/PlayingCard';
import TableChip from '../cards/TableChip';
import ActionBar, { type ActionBarHandle, type PreAction, type TutorialGate } from './ActionBar';
import SpeechBand from './SpeechBand';
import '../../../styles/posterJackpot.css';
import '../../../styles/poker.css';

// A mesa desenhada (03/11/2026), sem estado próprio de partida: recebe a mesa
// projetada (`TableShow`) e devolve os toques. É o mesmo componente na partida
// livre, no prêmio, no treino e na prévia de screenshots.

export type Thermo = 'weak' | 'good' | 'strong' | null;

export interface TableStageProps {
  table: TableShow;
  phase: TablePhase;
  mode: MatchMode;
  lang: Lang;
  cardStyle: string;
  deckId?: string | null;
  tableId?: string | null;
  settings: PokerSettingsLocal;
  reduced: boolean;
  speech: SpeechItem | null;
  banner: Banner | null;
  prize: { rarity: Rarity; name: string } | null;
  thermo: Thermo;
  pre: PreAction | null;
  setPre: (p: PreAction | null) => void;
  onAct: (a: PlayerAction) => void;
  onSkipAnim: () => void;
  onSkipSpeech: () => void;
  onBack: () => void;
  onMenu: () => void;
  onSpeed: () => void;
  onPortrait: (id: PlayerId) => void;
  onConfirmDialog: (text: string, run: () => void) => void;
  showButton: boolean;
  onShow: () => void;
  quipReady: boolean;
  onQuip: (() => void) | null;
  statusText: React.ReactNode;
  live: string;
  alert: string;
  log: { id: number; text: string; speaker?: string }[];
  title?: string;
  tutorial?: TutorialGate | null;
  onContinue?: (() => void) | null;
  highlight?: string | null;
  hint?: React.ReactNode;
  /** Vinheta do all-in do Raposo: escurece só a sala. */
  vignette?: boolean;
  children?: React.ReactNode;
}

const POS: Record<string, 'left' | 'center' | 'right'> = { bogart: 'left', fincher: 'center', cypher: 'right' };

const TableStage = forwardRef<ActionBarHandle, TableStageProps>(function TableStage(p, ref) {
  const { t } = useTranslation();
  const { table, lang, settings, reduced } = p;
  const n = (x: number) => fmt(x, lang);
  const me = seatOf(table, 'human');
  const looks = pokerCosmetics({ deckId: p.deckId, tableId: p.tableId, mode: p.mode });
  const velvet = looks.table.kind === 'velvet';
  const hl = (k: string) => (p.highlight === k ? { outline: '3px solid #FFE8A3', outlineOffset: 4, borderRadius: 12 } : undefined);
  const best = table.winningHand?.best5 ?? null;
  const showdownDim = table.showdown && !!best;
  const have = me && me.cards.length === 2 ? whatYouHave(me.cards, table.board, lang) : null;
  const rivals = table.seats.filter((s) => s.id !== 'human');
  const holder = table.prize?.holderId ?? null;
  const pots = table.pots.length > 1 ? table.pots : null;
  const level = table.level;
  const modeLabel = p.mode === 'bounty' ? t('poker.table.bounty') : p.mode === 'tutorial' ? t('poker.table.training') : t('poker.table.free');

  const thermoTone = p.thermo === 'strong' ? '#7BE0A0' : p.thermo === 'good' ? '#FFE8A3' : '#FF9AA0';
  const thermoBars = p.thermo === 'strong' ? 3 : p.thermo === 'good' ? 2 : 1;
  const haveNode = have ? (
    <>
      <span className="truncate">
        {t('poker.table.youHavePrefix')} <b>{have.text}</b>
      </span>
      {p.thermo && (
        <span className="pk-thermo" style={{ color: thermoTone }} aria-label={t('poker.table.thermoAria', { value: t(`poker.table.thermo.${p.thermo}`) })}>
          {[0, 1, 2].map((i) => (
            <i key={i} style={{ background: i < thermoBars ? thermoTone : 'rgba(255,255,255,0.18)' }} />
          ))}
          {t(`poker.table.thermo.${p.thermo}`)}
        </span>
      )}
    </>
  ) : null;

  return (
    <div
      className={`pk-room ${reduced ? 'pk-reduced' : ''} ${settings.bigCards ? 'pk-big-cards' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={t('poker.table.aria')}
    >
      <div className="pj-stars" aria-hidden />
      <div className="pk-beam" aria-hidden />
      <div className={`pk-vignette ${p.vignette ? 'is-on' : ''}`} aria-hidden />
      <p className="pk-landscape-note">{t('poker.table.landscape')}</p>
      <div className="sr-only-pk" aria-live="polite">{p.live}</div>
      <div className="sr-only-pk" aria-live="assertive">{p.alert}</div>

      <div className={`pk-col ${velvet ? 'pk-velvet' : ''}`}>
        {/* Barra: modo, mão e blinds; velocidade e menu. */}
        <header className="pk-bar">
          <button type="button" className="pk-icon-btn" onClick={p.onBack} aria-label={t('poker.table.leave')}>
            <ChevronLeft className="w-6 h-6" />
          </button>
          <div className="pk-bar-title" style={hl('blinds')}>
            <b>
              {p.mode === 'tutorial' && p.title ? p.title : modeLabel}
              {table.handNumber > 0 && p.mode !== 'tutorial' ? ` · ${t('poker.table.hand', { n: table.handNumber })}` : ''}
            </b>
            <span className="pk-num" style={{ fontWeight: 600 }}>
              {blindsText(t, lang, level.sb, level.bb, level.ante)}
              {level.next && level.handsLeft > 0 && p.mode !== 'tutorial' ? ` · ${t('poker.table.nextLevel', { count: level.handsLeft })}` : ''}
            </span>
          </div>
          <button type="button" className="pk-icon-btn" onClick={p.onSpeed} aria-label={t('poker.settings.speed') + ': ' + t(`poker.settings.${settings.speed}`)}>
            <span className="flex flex-col items-center leading-none">
              <FastForward className="w-5 h-5" />
              <span className="pk-speed">{settings.speed === 'normal' ? '1×' : settings.speed === 'fast' ? '2×' : '5×'}</span>
            </span>
          </button>
          <button type="button" className="pk-icon-btn" onClick={p.onMenu} aria-label={t('poker.table.menu')}>
            <Menu className="w-6 h-6" />
          </button>
        </header>

        {/* A mesa: couro, friso e o pano (feltro, veludo ou o equipado). */}
        <div className="pk-rail" aria-hidden onClick={p.onSkipAnim}>
          <div className="pk-felt" style={looks.table.felt}>
            <div className={`pk-lamp ${table.seats.some((s) => s.status === 'allIn') ? 'is-hot' : ''}`} />
          </div>
        </div>

        {/* O arco: Sapo à esquerda, Raposo no alto, Cobra à direita. */}
        <section className="pk-seats" aria-label={t('poker.table.rivals')}>
          {rivals.map((s) => (
            <OracleSeat
              key={s.id}
              seat={s}
              pos={POS[s.id] ?? 'center'}
              cardStyle={p.cardStyle}
              deckId={looks.deck.id}
              fourColor={settings.fourColor}
              thinking={table.thinkingId === s.id}
              speaking={p.speech?.speaker === s.id}
              dim={!!table.thinkingId && table.thinkingId !== s.id}
              winner={table.winners.includes(s.id) && (table.showdown || !!s.won)}
              prize={holder === s.id && p.prize ? { rarity: p.prize.rarity, captured: false } : null}
              emote={p.speech?.speaker === s.id ? p.speech.emote ?? null : null}
              reduced={reduced}
              lang={lang}
              onPortrait={() => p.onPortrait(s.id)}
            />
          ))}
        </section>

        <SpeechBand speech={p.speech} onSkip={p.onSkipSpeech} reduced={reduced} hint={p.hint} />

        {/* Pote e mesa. */}
        <section className="pk-board" aria-label={t('poker.table.boardAria')} onClick={p.onSkipAnim}>
          <div className="pk-potrow" style={hl('pot')}>
            {table.potTotal > 0 && (
              <span className="pk-pot pk-sans">
                <TableChip amount={table.potTotal} size={20} />
                {pots ? (
                  <span className="pk-num" style={{ fontSize: 13.5 }}>
                    {t('poker.table.pots', { main: n(pots[0].amount), side: n(pots.slice(1).reduce((a, x) => a + x.amount, 0)) })}
                  </span>
                ) : (
                  <>
                    {t('poker.table.potLabel')} <b className="pk-num">{n(table.potTotal)}</b>
                  </>
                )}
              </span>
            )}
          </div>
          <div className="pk-cards5" style={hl('board')}>
            {Array.from({ length: 5 }, (_, i) => {
              const c = table.board[i];
              return c ? (
                <PlayingCard
                  key={`${table.handNumber}-${c}`}
                  card={c}
                  size="board"
                  fourColor={settings.fourColor}
                  deal={!reduced}
                  delay={i < 3 ? i * 0.12 : 0}
                  best={showdownDim && best!.includes(c)}
                  dimmed={showdownDim && !best!.includes(c)}
                />
              ) : (
                <span key={`slot-${i}`} className="pk-slot" aria-hidden />
              );
            })}
          </div>
          <AnimatePresence>
            {p.banner?.kind === 'showdown' && table.winningHand && (
              <motion.span
                key={p.banner.id}
                initial={{ opacity: 0, scale: reduced ? 1 : 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="pk-hand-banner pk-display"
              >
                {describeHand(table.winningHand.kind, table.winningHand.best5, lang, table.winningHand.royal)}
              </motion.span>
            )}
          </AnimatePresence>
        </section>

        <div className="pk-have" style={hl('handName')} aria-live="off">
          {haveNode}
        </div>

        {/* Você: as duas cartas na borda de perto da mesa. */}
        <section className="pk-hero" aria-label={t('poker.table.you')}>
          <div className="pk-hero-me">
            <span className="flex items-center gap-1.5">
              {me?.isButton && (
                <motion.span layoutId="pk-dealer" className="pk-dealer pk-sans" transition={{ duration: reduced ? 0 : 0.4 }} aria-label={t('poker.table.dealer')}>
                  D
                </motion.span>
              )}
              <span className="text-[12.5px] font-bold" style={{ color: '#F3EAD3' }}>{t('poker.table.you')}</span>
              {holder === 'human' && p.prize && (
                <motion.span layoutId="pk-wanted" className="relative inline-block" transition={{ duration: reduced ? 0 : 0.7 }}>
                  <WantedPoster rarity={p.prize.rarity} size={20} />
                </motion.span>
              )}
            </span>
            <span className="pk-num text-[15px]" style={{ color: '#FFE8A3' }}>{n(me?.stack ?? 0)}</span>
            {table.loan > 0 && <span className="pk-loan">{t('poker.table.loan')}</span>}
          </div>
          <div className={`pk-hero-cards ${me?.status === 'folded' ? 'is-folded' : ''}`} style={hl('holeCards')}>
            {me && me.cards.length === 2
              ? me.cards.map((c, i) => (
                  <PlayingCard
                    key={`${table.handNumber}-${c}`}
                    card={c}
                    size="hand"
                    fourColor={settings.fourColor}
                    deal={!reduced}
                    delay={i * 0.09}
                    best={showdownDim && best!.includes(c)}
                    dimmed={showdownDim && !best!.includes(c)}
                  />
                ))
              : me?.status === 'eliminated'
                ? null
                : [0, 1].map((i) => <span key={i} className="pk-slot" style={{ width: 'var(--hand-w)', height: 'calc(var(--hand-w) * 1.393)', borderRadius: 7 }} aria-hidden />)}
          </div>
          <div className="pk-hero-side">
            {me && me.bet > 0 ? (
              <span className={`pk-pill pk-num ${me.status === 'allIn' ? 'is-allin' : ''}`}>
                {me.odds != null ? <span className="pk-odds">{Math.round(me.odds * 100)}%</span> : <TableChip amount={me.bet} size={16} />}
                {me.isSB && me.last?.kind === 'post' && <small>SB</small>}
                {me.isBB && me.last?.kind === 'post' && <small>BB</small>}
                {n(me.bet)}
              </span>
            ) : me?.odds != null ? (
              <span className="pk-pill pk-num"><span className="pk-odds">{Math.round(me.odds * 100)}%</span></span>
            ) : (
              <span style={{ height: 22 }} />
            )}
            <span className="flex gap-1.5">
              {p.showButton && (
                <button type="button" className="pk-mini-btn is-gold" onClick={p.onShow}>
                  <Eye className="w-4 h-4" aria-hidden />
                  {t('poker.table.show')}
                </button>
              )}
              {p.onQuip && (
                <button type="button" className="pk-mini-btn" onClick={p.onQuip} disabled={!p.quipReady} aria-label={t('poker.quips.button')}>
                  <MessageCircle className="w-5 h-5" aria-hidden />
                </button>
              )}
            </span>
          </div>
          <div className="pk-have-inline">{haveNode}</div>
        </section>

        <aside className="pk-log" aria-label={t('poker.settings.script')}>
          {p.log.slice(-14).map((l) => (
            <p key={l.id}>{l.speaker ? <b style={{ color: '#FFE8A3' }}>{l.speaker}: </b> : null}{l.text}</p>
          ))}
        </aside>

        <ActionBar
          ref={ref}
          table={table}
          phase={p.phase}
          mode={p.mode}
          lang={lang}
          leftHanded={settings.leftHanded}
          onAct={p.onAct}
          pre={p.pre}
          setPre={p.setPre}
          statusText={p.statusText}
          tutorial={p.tutorial}
          onContinue={p.onContinue}
          onConfirmDialog={p.onConfirmDialog}
        />

        {/* Letreiros: Corte Final, prêmio capturado, blinds subindo. */}
        <AnimatePresence>
          {p.banner && p.banner.kind !== 'showdown' && (
            <motion.div
              key={p.banner.id}
              className="pk-banner"
              initial={{ opacity: 0, scale: reduced ? 1 : 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              role="status"
            >
              <div className="pk-bulbrow" aria-hidden>
                {Array.from({ length: 9 }, (_, i) => <i key={i} />)}
              </div>
              {p.banner.kind === 'cutFinal' && <div className="pk-banner-title pk-display">{t('poker.table.cutFinal')}</div>}
              {p.banner.kind === 'level' && (
                <>
                  <div className="pk-banner-title pk-num" style={{ fontSize: 20 }}>{blindsText(t, lang, level.sb, level.bb, level.ante)}</div>
                  <div className="pk-banner-sub">{t('poker.table.blindsUp')}</div>
                </>
              )}
              {p.banner.kind === 'prize' && (
                <>
                  <div className="pk-banner-title pk-display" style={{ fontSize: 19 }}>{t('poker.credits.prizeYours', { prize: p.prize?.name ?? '' })}</div>
                  <div className="pk-banner-sub">{t('poker.table.prizeKept')}</div>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {p.children}
      </div>
    </div>
  );
});

export default TableStage;
