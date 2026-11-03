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
import { describeHand, fmt, langOf } from '../../../lib/poker/client/format';
import { theName } from '../../../lib/poker/client/narrate';
import PlayingCard from '../cards/PlayingCard';
import PrizeArt from '../jackpot/PrizeArt';
import { MARKS } from '../jackpot/pokerMeta';
import { equipPokerMark } from '../jackpot/entryApi';
import { prizeAction } from '../prizes/registry';

// Os créditos (SPEC §7.6). Derrota: corte de película queimada e o letreiro FIM.
// Vitória: as luzes acendem e os três aplaudem em preto e branco. As linhas sobem
// por 6 s e ficam paradas (com "reduzir movimento", já paradas). Botões presos
// embaixo. Com o prêmio capturado, a cerimônia: a arte, "{{prize}} é seu!" e
// [Usar agora], com o carrilhão do Jackpot.

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
}> = ({ data, cardStyle, reduced, onRematch, onScoreboard, onRetry, onLobby }) => {
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
    <p key="place" className="pk-display text-[26px] font-bold" style={{ color: win ? '#FFE8A3' : '#F3EAD3' }}>
      {t('poker.credits.place', { place: data.place })}
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
  if (data.title)
    lines.push(
      <p key="title" className="pk-credit-line" style={{ color: data.title.rankUp ? '#FFE8A3' : undefined }}>
        {data.title.rankUp
          ? t('poker.credits.newTitle', { title: t(`poker.titles.${data.title.id}`) })
          : t('poker.credits.titleNow', { title: t(`poker.titles.${data.title.id}`) })}
      </p>,
    );
  data.marks.forEach((tagId) => {
    const m = MARKS.find((x) => x.tagId === tagId);
    if (!m) return;
    lines.push(
      <div key={tagId} className="flex items-center justify-center gap-3">
        <span className="pk-credit-line">
          {m.emoji} {t('poker.credits.newMark', { name: t(`poker.marks.${m.key}`) })}
        </span>
        {userId && (
          <button
            type="button"
            className="pk-cta-ghost"
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
                className="w-[64px] rounded-[6px]"
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

        {/* Cerimônia do prêmio. */}
        {data.captured && data.prize && (
          <motion.div
            className="mx-auto my-4 max-w-[260px] grid justify-items-center gap-3"
            initial={reduced ? false : { opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.5 }}
          >
            <PrizeArt
              prize={{ kind: data.prize.kind, image: data.prize.image ?? null, payload: data.prize.payload ?? {}, rarity: data.prize.rarity }}
              className="w-[150px]"
              animated={!reduced}
            />
            <p className="pk-display text-[20px] font-bold" style={{ color: '#FFE8A3' }}>{t('poker.credits.prizeYours', { prize: prizeName })}</p>
            <p className="text-[12.5px]" style={{ color: '#c9c2e0' }}>{t(`poker.rarity.${data.prize.rarity}`)}</p>
            {use && (
              <button type="button" className="pk-cta-gold" disabled={busy === 'use' || done.use} onClick={() => run('use', use)}>
                {busy === 'use' ? <Loader2 className="w-5 h-5 animate-spin" /> : done.use ? t('poker.credits.equippedShort') : t('poker.lobby.useNow')}
              </button>
            )}
          </motion.div>
        )}

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
            {t('poker.lobby.retry', { n: data.retry.n, max: data.retry.max })}
          </button>
        )}
        <button type="button" className={data.captured && use ? 'pk-cta-paper' : 'pk-cta-gold'} onClick={onRematch} autoFocus>
          {data.mode === 'bounty' ? t('poker.credits.freeRematch') : t('poker.credits.rematch')}
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
