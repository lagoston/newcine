import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import { PIXEL } from '../../../lib/oracleTheme';
import { useAuth } from '../../../lib/auth';
import { playReveal } from '../../../lib/jackpotSound';
import type { RivalId } from '../../../lib/poker/types';
import type { CreditsData } from '../../../lib/poker/client/creditsData';
import { cardArt, ORACLE_COLOR } from '../../../lib/poker/client/cosmetics';
import { describeHand, displayFont, fmt, langOf } from '../../../lib/poker/client/format';
import { theName } from '../../../lib/poker/client/narrate';
import PlayingCard from '../cards/PlayingCard';
import PrizeArt from '../jackpot/PrizeArt';
import { GAMES_RED, GAMES_RED_TEXT, MARKS } from '../jackpot/pokerMeta';
import { equipPokerMark } from '../jackpot/entryApi';
import { prizeAction } from '../prizes/registry';
import type { SpeechItem } from '../../../lib/poker/client/useDirector';
import SpeechBand from '../table/SpeechBand';
import PosterArt from '../../posterJackpot/PosterArt';
import { SerialLine } from '../../posterJackpot/CollectorMark';
import { posterTitle } from '../../../lib/poker/client/tournament';
import { loadPosterPokerFont } from '../game/font';
import '../../../styles/posterPoker.css';

// Os créditos (SPEC §7.6). Derrota: corte de película queimada e o letreiro FIM.
// Vitória: as luzes acendem e os três aplaudem em preto e branco. As linhas sobem
// por 6 s e ficam paradas (com "reduzir movimento", já paradas). Botões presos
// embaixo. Com o prêmio capturado, a cerimônia: a arte, "{{prize}} é seu!" e
// [Usar agora], com o carrilhão do Jackpot. Os oráculos continuam falando por
// cima (quem levou a mesa, o título novo, a Revanche): a faixa de fala desce
// para baixo do letreiro.

export type { CreditsData };

const RIVALS: RivalId[] = ['bogart', 'fincher', 'cypher'];

const Credits: React.FC<{
  data: CreditsData;
  cardStyle: string;
  reduced: boolean;
  onRematch: () => void;
  onScoreboard: () => void;
  onRetry: (() => void) | null;
  onLobby: () => void;
  speech?: SpeechItem | null;
  onSkipSpeech?: () => void;
}> = ({ data, cardStyle, reduced, onRematch, onScoreboard, onRetry, onLobby, speech = null, onSkipSpeech }) => {
  const { t, i18n } = useTranslation();
  const lang = langOf(i18n.language);
  const navigate = useNavigate();
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  const win = data.place === 1;
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const isPt = lang === 'pt';
  const prizeName = data.prize ? (isPt ? data.prize.name_pt : data.prize.name_en) : '';
  const use = data.captured ? prizeAction(data.prize, { userId, navigate }) : null;

  // Pôster Poker: a vitória mostra o pôster dourado "É seu!"; a derrota com pôster
  // apostado mostra que ele ficou na mesa; e o item da Cobra, quando houver.
  const tour = data.tournament ?? null;
  const tourPoster = tour?.prize ?? null;
  const tourTitle = tourPoster ? posterTitle(tourPoster, lang) : '';
  const cobraGot = tour?.won ? tour.rewards?.cobraItem ?? null : null;
  const cobraSeen = !tour?.won ? tour?.rewards?.cobraRevealed ?? null : null;
  const rs = tour?.rewards?.stake;
  const stakeLost = !!tour && !tour.won && tour.stake?.kind === 'poster' && (rs ? rs.kind === 'poster' && rs.lost : true);
  const stakeArt =
    rs && rs.kind === 'poster'
      ? { title: (lang === 'en' && rs.titleEn) || rs.title || tour?.stake?.title || '', filePath: rs.filePath || tour?.stake?.filePath || '', effect: rs.effect }
      : tour?.stake;
  const itemName = (it: { name: string; nameEn?: string | null }) => (lang === 'en' && it.nameEn) || it.name;
  useEffect(() => {
    if (tour) loadPosterPokerFont();
    if (tour?.won && tourPoster) {
      const id = window.setTimeout(() => playReveal(tourPoster.rarity, false), 700);
      return () => window.clearTimeout(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (data.captured && data.prize) {
      const id = window.setTimeout(() => playReveal(data.prize!.rarity, false), 700);
      return () => window.clearTimeout(id);
    }
  }, [data.captured, data.prize]);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
      setDone((d) => ({ ...d, [key]: true }));
      toast.success(t('poker.credits.equipped'));
    } catch {
      toast.error(t('poker.credits.equipFailed'));
    } finally {
      setBusy(null);
    }
  };

  const lines: React.ReactNode[] = [];
  lines.push(
    // Cinzel nunca em números (o "1" vira "I"): a colocação vai em sans.
    <p key="place" className="pk-credit-place" style={{ color: win ? '#FFE8A3' : '#F3EAD3' }}>
      {t('poker.credits.place', { place: data.place, count: data.place, ordinal: true })}
    </p>,
  );
  if (data.reason === 'eliminated' && data.eliminatedBy)
    lines.push(
      <p key="by" className="pk-credit-line">
        {t('poker.credits.eliminatedBy', { by: theName(t, data.eliminatedBy, 'by'), hand: data.eliminatedHand ?? '' })}
      </p>,
    );
  if (data.reason === 'forfeit') lines.push(<p key="ff" className="pk-credit-line">{t('poker.credits.forfeit')}</p>);
  if (data.mode === 'free' && !win)
    lines.push(
      <p key="tw" className="pk-credit-line">
        {data.tableWinner === undefined ? '…' : data.tableWinner ? t('poker.credits.tableWinner', { oracle: theName(t, data.tableWinner, 'The') }) : ''}
      </p>,
    );
  if (data.loan) lines.push(<p key="loan" className="pk-credit-label">{t('poker.credits.withLoan')}</p>);
  lines.push(<div key="g1" className="pk-credit-gap" />);
  if (data.bestHand)
    lines.push(
      <div key="best" className="grid justify-items-center gap-1.5">
        <p className="pk-credit-label">{t('poker.credits.bestHandLabel')}</p>
        <span className="flex gap-1">
          {data.bestHand.cards.map((c) => (
            <PlayingCard key={c} card={c} size="credits" />
          ))}
        </span>
        <p className="pk-credit-line">{describeHand(data.bestHand.kind, data.bestHand.cards, lang, data.bestHand.royal)}</p>
      </div>,
    );
  if (data.biggestPot > 0)
    lines.push(
      <p key="pot" className="pk-credit-line">
        {t('poker.credits.biggestPot', { amount: fmt(data.biggestPot, lang) })}
      </p>,
    );
  // O título (Figurante… Lenda da Sessão) saiu da interface do jogo (03/11/2026, fase 3).
  // Tags novas (adendo de 03/11/2026): da categoria Jogos, em vermelho, com [Equipar].
  data.marks.forEach((tagId) => {
    const m = MARKS.find((x) => x.tagId === tagId);
    if (!m) return;
    lines.push(
      <div key={tagId} className="pp-newtag" style={{ '--games': GAMES_RED } as React.CSSProperties}>
        <span className="pp-newtag-label">{t('poker.credits.newTag')}</span>
        <span className="pp-newtag-chip" style={{ color: GAMES_RED_TEXT }}>
          <span aria-hidden>{m.emoji}</span> {m.name}
        </span>
        {userId && (
          <button
            type="button"
            className="pp-newtag-btn"
            disabled={busy === tagId || done[tagId]}
            onClick={() => run(tagId, () => equipPokerMark(userId, { name: m.name, emoji: m.emoji }))}
          >
            {busy === tagId ? <Loader2 className="w-4 h-4 animate-spin" /> : done[tagId] ? t('poker.credits.equippedShort') : t('poker.credits.equip')}
          </button>
        )}
      </div>,
    );
  });

  if (data.retry && !data.captured && data.tomorrow)
    lines.push(
      <p key="tm" className="pk-credit-label">
        {t('poker.lobby.tomorrow', { rarity: t(`poker.rarity.${data.tomorrow.rarity}`), carrier: t(`poker.oracles.${data.tomorrow.carrier}.with`) })}
      </p>,
    );

  return (
    <div className={`pk-credits ${win ? 'is-win' : ''}`} role="dialog" aria-modal="true" aria-label={t('poker.credits.aria')}>
      {!win && !reduced && <div className="pk-burn" aria-hidden />}
      <div className="pk-credits-roll">
        {/* O letreiro, ou as luzes e os três aplaudindo. */}
        {win ? (
          <div className="flex justify-center gap-2 pt-2 pb-3" aria-hidden>
            {RIVALS.map((id, i) => (
              <motion.img
                key={id}
                src={cardArt(id, cardStyle)}
                alt=""
                className="pk-clap rounded-[6px]"
                style={{ filter: 'grayscale(1) contrast(1.1)', boxShadow: '0 0 0 1px rgba(255,255,255,0.25)' }}
                animate={reduced ? undefined : { y: [0, -5, 0, -5, 0], rotate: [0, -2, 0, 2, 0] }}
                transition={{ duration: 1.2, delay: 0.4 + i * 0.15, repeat: 2 }}
              />
            ))}
          </div>
        ) : (
          <motion.p
            className="pk-fim pk-display pt-6 pb-2"
            initial={reduced ? false : { opacity: 0, scale: 1.3 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.9, delay: 0.6 }}
          >
            {t('poker.table.end')}
          </motion.p>
        )}

        {/* A faixa de fala dos créditos (reservada: o texto que sobe não pula). */}
        <div className="pk-credits-speech">
          <SpeechBand speech={speech} onSkip={onSkipSpeech ?? (() => {})} reduced={reduced} />
        </div>

        {/* Cerimônia do prêmio. */}
        {data.captured && data.prize && (
          <motion.div
            className="mx-auto my-3 max-w-[260px] grid justify-items-center gap-2.5"
            initial={reduced ? false : { opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.5 }}
          >
            <PrizeArt
              prize={{ kind: data.prize.kind, image: data.prize.image ?? null, payload: data.prize.payload ?? {}, rarity: data.prize.rarity }}
              className="pk-ceremony-art"
              animated={!reduced}
            />
            <p className={`${displayFont(prizeName)} text-[20px] font-bold`} style={{ color: '#FFE8A3' }}>{t('poker.credits.prizeYours', { prize: prizeName })}</p>
            <p className="text-[12.5px]" style={{ color: '#c9c2e0' }}>{t(`poker.rarity.${data.prize.rarity}`)}</p>
            {use && (
              <button type="button" className="pk-cta-gold" disabled={busy === 'use' || done.use} onClick={() => run('use', use)}>
                {busy === 'use' ? <Loader2 className="w-5 h-5 animate-spin" /> : done.use ? t('poker.credits.equippedShort') : t('poker.lobby.useNow')}
              </button>
            )}
          </motion.div>
        )}

        {/* Pôster Poker: o pôster dourado é seu (e o item da Cobra, se ela trouxe). */}
        {tour?.won && tourPoster && (
          <motion.div
            className="mx-auto my-3 max-w-[280px] grid justify-items-center gap-2"
            initial={reduced ? false : { opacity: 0, y: 24, scale: 0.92, rotate: -3 }}
            animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
            transition={{ duration: 0.7, delay: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <PosterArt
              filePath={tourPoster.file_path}
              effect="gold"
              size="w342"
              animated={!reduced}
              loading="eager"
              className="w-[min(150px,20vh)] aspect-[2/3] rounded-[10px] pp-credit-poster"
            />
            <p className="pp-font pp-gold-letters text-[30px] leading-none mt-2">{t('poker.tourney.yours')}</p>
            <p className="text-[14.5px] font-bold" style={{ color: '#F5EBD3' }}>{tourTitle}</p>
            <SerialLine rarity={tourPoster.rarity} serial={tourPoster.serial} />
            <p className="text-[12.5px]" style={{ color: '#c9c2e0' }}>{t('poker.tourney.yoursNote')}</p>
            {cobraGot && (
              <p className="pp-cobra-line mt-1">{t('poker.tourney.cobraGot', { item: itemName(cobraGot) })}</p>
            )}
          </motion.div>
        )}
        {/* Derrota com pôster apostado: ele ficou na mesa (com a Cobra). */}
        {stakeLost && stakeArt && (
          <motion.div
            className="mx-auto my-3 max-w-[280px] grid justify-items-center gap-2"
            initial={reduced ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.6 }}
          >
            {stakeArt.filePath ? (
              <PosterArt filePath={stakeArt.filePath} effect={(stakeArt.effect ?? 'none') as never} size="w185" animated={false} className="w-[84px] aspect-[2/3] rounded-[7px] pp-lost-poster" />
            ) : null}
            <p className="text-[14.5px] text-center" style={{ color: '#F3EAD3' }}>
              {t('poker.tourney.stakeLost', { title: stakeArt.title || t('poker.tourney.yourPoster') })}
            </p>
          </motion.div>
        )}
        {cobraSeen && <p className="pp-cobra-line text-center my-2">{t('poker.tourney.cobraHad', { item: itemName(cobraSeen) })}</p>}

        <motion.div
          className="grid gap-2 pt-2"
          initial={reduced ? false : { y: 160, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ y: { duration: reduced ? 0 : 6, ease: 'linear', delay: 0.3 }, opacity: { duration: reduced ? 0 : 0.8, delay: 0.3 } }}
        >
          {lines}
          <div className="pk-credit-gap" />
          <p className="pk-credit-label">{t('poker.credits.cast')}</p>
          {RIVALS.map((id) => (
            <p key={id} className="pk-credit-line" style={{ ...PIXEL, color: ORACLE_COLOR[id] }}>
              {t(`poker.oracles.${id}.credit`)}
            </p>
          ))}
        </motion.div>
      </div>
      <div className="pk-credits-foot">
        {onRetry && data.retry && !data.captured && (
          <button type="button" className="pk-cta-paper" onClick={onRetry}>
            {data.tournament ? t('poker.tourney.retry', { n: data.retry.n, max: data.retry.max }) : t('poker.lobby.retry', { n: data.retry.n, max: data.retry.max })}
          </button>
        )}
        <button type="button" className={data.captured && use ? 'pk-cta-paper' : 'pk-cta-gold'} onClick={onRematch} autoFocus>
          {data.mode === 'bounty' ? t('poker.credits.casualRematch') : t('poker.credits.rematch')}
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className="pk-cta-ghost" onClick={onScoreboard}>{t('poker.credits.scoreboard')}</button>
          <button type="button" className="pk-cta-ghost" onClick={onLobby}>{t('poker.credits.lobby')}</button>
        </div>
      </div>
    </div>
  );
};

export default Credits;
