import React, { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { ChevronLeft, ChevronRight, HelpCircle, Loader2 } from 'lucide-react';
import { ChipFace } from '../../posterJackpot/Chips';
import { loadJackpotFont, type PokerTeaserPrize } from '../../../lib/posterJackpot';
import type { PokerHome, PokerPrize } from '../../../lib/poker/client/apiTypes';
import { pokerApi } from '../../../lib/poker/client/api';
import { cardArt } from '../../../lib/poker/client/cosmetics';
import { savedFreeHand } from '../../../lib/poker/client/freeStore';
import { fmt, langOf, timeLeft } from '../../../lib/poker/client/format';
import { invalidatePokerHome } from '../../../lib/poker/client/usePokerHome';
import AgeGate from '../age/AgeGate';
import PrizeCard from '../jackpot/PrizeCard';
import { BLEFE_ROUTES } from '../jackpot/pokerMeta';
import { CardBack, FeltSwatch } from '../cosmetics/CosmeticPreviews';
import { Sheet } from '../table/Overlays';
import HandRanking from '../cards/HandRanking';
import { prizeAction } from '../prizes/registry';
import { useAuth } from '../../../lib/auth';
import '../../../styles/posterJackpot.css';
import '../../../styles/poker.css';

// O salão (SPEC §7.2): o letreiro, os três oráculos em leque no estilo de carta
// equipado, o Prêmio de Hoje em veludo, a mesa livre em feltro, o placar numa
// linha e o aviso "Sem dinheiro real". O servidor é a fonte dos estados do prêmio.

const toTeaserPrize = (p: PokerPrize): PokerTeaserPrize => ({
  id: p.id,
  kind: String(p.kind),
  rarity: p.rarity,
  namePt: p.name_pt,
  nameEn: p.name_en,
  articlePt: p.article_pt ?? null,
  image: p.image ?? null,
  payload: p.payload ?? {},
});

const FAN = [
  { id: 'bogart', rotate: -12, x: '-62%', y: '6%' },
  { id: 'fincher', rotate: 0, x: '0%', y: '0%' },
  { id: 'cypher', rotate: 12, x: '62%', y: '6%' },
] as const;

const Lobby: React.FC<{ home: PokerHome; cardStyle: string; offline: boolean }> = ({ home, cardStyle, offline }) => {
  const { t, i18n } = useTranslation();
  const lang = langOf(i18n.language);
  const navigate = useNavigate();
  const location = useLocation();
  const reduce = useReducedMotion();
  const [now, setNow] = useState(() => Date.now());
  // A folha 18+ e para onde ela leva depois de confirmar.
  const [age, setAge] = useState<string | null>(null);
  const [sheet, setSheet] = useState<null | 'deck' | 'table' | 'how'>(null);
  const [loadout, setLoadout] = useState(home.loadout ?? { deck: 'deck-classico', table: 'table-feltro-verde', quips: 'quips-padrao' });
  const [equipping, setEquipping] = useState<string | null>(null);
  const { session } = useAuth();
  const [using, setUsing] = useState<'idle' | 'busy' | 'done'>('idle');
  const b = home.bounty ?? null;
  const freeHand = savedFreeHand();
  const firstVisit = !home.player?.tutorial_done && (home.player?.lifetime_matches ?? 0) === 0;
  const free = home.stats?.free;
  const bounty = home.stats?.bounty;
  const wins = (free?.wins ?? 0) + (bounty?.wins ?? 0);
  const matches = (free?.matches ?? 0) + (bounty?.matches ?? 0);
  const tickets = home.tickets ?? null;

  useEffect(() => {
    loadJackpotFont();
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  // Erro vindo da mesa do prêmio (dia virou, prêmio trocou, sem fichas…).
  useEffect(() => {
    const code = (location.state as { pokerError?: string } | null)?.pokerError;
    if (code) toast(t(`poker.errors.${code}`, { defaultValue: t('poker.net.error') }));
  }, [location.state, t]);

  const goBounty = () => {
    if (!b) return;
    if (b.active) {
      navigate(BLEFE_ROUTES.resume);
      return;
    }
    if (!home.player?.age_confirmed) {
      setAge(BLEFE_ROUTES.bounty(b.day, b.prize.id));
      return;
    }
    navigate(BLEFE_ROUTES.bounty(b.day, b.prize.id));
  };

  // Com casino_age_gate ligado no servidor, a folha vem antes de qualquer partida (§7.8).
  const goFree = () => {
    if (home.player?.age_gate_all && !home.player.age_confirmed) setAge(BLEFE_ROUTES.free);
    else navigate(BLEFE_ROUTES.free);
  };

  const equip = async (slot: 'deck' | 'table', id: string) => {
    setEquipping(id);
    try {
      await pokerApi.equip(slot, id);
      setLoadout((l) => ({ ...l, [slot]: id }));
      invalidatePokerHome();
    } catch {
      toast.error(t('poker.credits.equipFailed'));
    } finally {
      setEquipping(null);
    }
  };

  // ---------------------------------------------------------------- o cartão do prêmio
  const prizeBlock = (() => {
    if (!b || offline) return null;
    const carrierWith = t(`poker.oracles.${b.carrier}.with`, { defaultValue: '' });
    const tomorrow = b.tomorrow ? t('poker.lobby.tomorrow', { rarity: t(`poker.rarity.${b.tomorrow.rarity}`), carrier: t(`poker.oracles.${b.tomorrow.carrier}.with`) }) : null;
    const status = (
      <>
        {b.friends_won > 0 && <span className="block">{t('poker.lobby.friendsWon', { count: b.friends_won })}</span>}
        <span className="block">{t('poker.lobby.newIn', { time: timeLeft(b.ends_at, now, lang) })}</span>
      </>
    );
    let cta: React.ReactNode;
    let foot: React.ReactNode = null;
    if (b.won_today) {
      // "É seu!" + [Usar agora] (§7.2); sem ação para o tipo, o placar com os prêmios.
      const use = prizeAction(b.prize, { userId: session?.user?.id ?? null, navigate });
      cta = (
        <div className="grid gap-2">
          <p className="pk-display text-[20px] font-bold text-center" style={{ color: '#FFE8A3' }}>{t('poker.lobby.won')}</p>
          {use && (
            <button
              type="button"
              className="pk-cta-gold"
              disabled={using !== 'idle'}
              onClick={async () => {
                setUsing('busy');
                try {
                  await use();
                  setUsing('done');
                  toast.success(t('poker.credits.equipped'));
                  invalidatePokerHome();
                } catch {
                  setUsing('idle');
                  toast.error(t('poker.credits.equipFailed'));
                }
              }}
            >
              {using === 'busy' ? <Loader2 className="w-5 h-5 animate-spin" /> : using === 'done' ? t('poker.credits.equippedShort') : t('poker.lobby.useNow')}
            </button>
          )}
          <button type="button" className={use ? 'pk-cta-ghost' : 'pk-cta-gold'} onClick={() => navigate(BLEFE_ROUTES.scoreboard)}>{t('poker.lobby.seeTrophies')}</button>
        </div>
      );
      foot = tomorrow;
    } else if (b.active) {
      cta = (
        <button type="button" className="pk-cta-gold" onClick={goBounty}>
          {t('poker.lobby.continue', { hand: b.active.hand })}
        </button>
      );
    } else if (b.attempts_used >= b.max_attempts) {
      cta = <p className="text-center text-[15px] font-bold" style={{ color: '#F6DCE2' }}>{t('poker.lobby.limit')}</p>;
      foot = tomorrow;
    } else if (tickets !== null && tickets < 1) {
      cta = (
        <button type="button" className="pk-cta-paper" onClick={() => navigate('/', { state: { openJackpot: 'missions' } })}>
          {t('poker.lobby.noChips')}
        </button>
      );
    } else {
      cta = (
        <button type="button" className="pk-cta-gold" onClick={goBounty}>
          {b.attempts_used > 0 ? (
            t('poker.lobby.retry', { n: b.attempts_used + 1, max: b.max_attempts })
          ) : (
            <>
              {t('poker.lobby.playBounty')} · <ChipFace className="w-5 h-5" /> 1
            </>
          )}
        </button>
      );
      foot = (
        <>
          {tickets !== null && t('poker.lobby.youHave', { count: tickets })}
          {tickets !== null && ' · '}
          {t('poker.lobby.attempt', { n: b.attempts_used + 1, max: b.max_attempts })}
        </>
      );
    }
    return (
      <PrizeCard prize={toTeaserPrize(b.prize)} carrier={b.carrier} stars={b.stars} status={status} headingId="pk-prize-h">
        {(b.is_reserve || b.is_fallback) && !b.won_today && <p className="text-[12.5px] mb-2" style={{ color: '#F6DCE2' }}>{t('poker.lobby.reserve')}</p>}
        {b.loan_next && !b.won_today && <p className="text-[12.5px] mb-2" style={{ color: '#C8F0B0' }}>{t('poker.lobby.loanNext')}</p>}
        {cta}
        {foot && <p className="mt-2 text-center text-[12.5px]" style={{ color: '#F6DCE2' }}>{foot}</p>}
        <span className="sr-only">{carrierWith}</span>
      </PrizeCard>
    );
  })();

  return (
    <main className="pk-lobby">
      <div className="pj-stars" aria-hidden />
      <div className="pk-lobby-inner">
        <header className="flex items-center justify-between">
          <button type="button" className="pk-icon-btn" onClick={() => navigate('/')} aria-label={t('poker.lobby.back')}>
            <ChevronLeft className="w-6 h-6" />
          </button>
          <button type="button" className="pk-icon-btn" onClick={() => setSheet('how')} aria-label={t('poker.lobby.howTo')}>
            <HelpCircle className="w-6 h-6" />
          </button>
        </header>

        {/* O letreiro. */}
        <div className="pk-marquee">
          <div className="pk-bulbrow mx-auto max-w-[260px]" aria-hidden>
            {Array.from({ length: 13 }, (_, i) => <i key={i} />)}
          </div>
          <h1 className="pk-display pj-gold-text">{t('poker.name')}</h1>
          <p>{t('poker.subtitle')}</p>
        </div>

        {/* Os três oráculos em leque, no estilo equipado. */}
        <div className="relative mx-auto w-full max-w-[300px] aspect-[16/10] -mt-1" role="img" aria-label={t('poker.lobby.castAria')}>
          <div aria-hidden className="absolute left-1/2 top-[6%] -translate-x-1/2 w-[86%] aspect-[2/1] rounded-full blur-2xl opacity-70" style={{ background: 'radial-gradient(circle, rgba(255,214,140,0.30), transparent 70%)' }} />
          {FAN.map((f, i) => (
            <motion.img
              key={f.id}
              src={cardArt(f.id, cardStyle)}
              alt=""
              draggable={false}
              className="absolute bottom-0 left-1/2 w-[36%] -ml-[18%] rounded-[6px]"
              style={{ transformOrigin: '50% 100%', zIndex: i === 1 ? 3 : 1, boxShadow: '0 22px 40px -18px rgba(0,0,0,0.9), 0 0 0 1px rgba(244,196,84,0.35)' }}
              initial={reduce ? false : { x: '0%', y: '12%', rotate: 0, opacity: 0 }}
              animate={{ x: f.x, y: f.y, rotate: f.rotate, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 110, damping: 15, delay: reduce ? 0 : 0.15 + i * 0.1 }}
            />
          ))}
        </div>
        <p className="text-center mt-6 text-[13px]" style={{ color: '#D4CBE8' }}>
          {t('poker.lobby.yourTitle')} <b style={{ color: '#FFE8A3' }}>{t(`poker.titles.${home.title?.id ?? 'figurante'}`)}</b>
        </p>

        {firstVisit && (
          <div className="grid grid-cols-2 gap-2 mt-4">
            <button type="button" className="pk-cta-paper" onClick={() => navigate('/blefe/treino')}>{t('poker.lobby.teachMe')}</button>
            <button type="button" className="pk-cta-ghost" style={{ minHeight: 48 }} onClick={goFree}>{t('poker.lobby.iKnow')}</button>
          </div>
        )}

        <div className="grid gap-5 mt-5">
          {prizeBlock}

          {/* A mesa livre, em feltro de verdade com borda de couro. */}
          <section className="pk-felt-panel" aria-labelledby="pk-free-h">
            <h2 id="pk-free-h" className="text-[17px] font-bold" style={{ color: '#F3EAD3' }}>{t('poker.lobby.freeTitle')}</h2>
            <p className="text-[13.5px] mt-0.5 mb-3" style={{ color: '#D9F2E4' }}>{t('poker.lobby.freeBody')}</p>
            <button type="button" className="pk-cta-paper" onClick={goFree}>
              {freeHand ? t('poker.lobby.continue', { hand: freeHand }) : t('poker.lobby.playFree')}
            </button>
          </section>
        </div>

        <button
          type="button"
          className="mt-5 w-full flex items-center justify-between min-h-[48px] px-1 text-[14px]"
          style={{ color: '#E7E0F5' }}
          onClick={() => navigate(BLEFE_ROUTES.scoreboard)}
        >
          <span className="pk-num" style={{ fontWeight: 600 }}>
            {t('poker.lobby.score', { wins: fmt(wins, lang), losses: fmt(Math.max(0, matches - wins), lang), pct: matches ? Math.round((wins / matches) * 100) : 0 })}
          </span>
          <ChevronRight className="w-5 h-5" aria-hidden />
        </button>

        <div className="grid grid-cols-3 gap-2 mt-2">
          <button type="button" className="pk-cta-ghost px-2" onClick={() => setSheet('deck')}>
            {t('poker.lobby.deck')}
          </button>
          <button type="button" className="pk-cta-ghost px-2" onClick={() => setSheet('table')}>
            {t('poker.lobby.table')}
          </button>
          <button type="button" className="pk-cta-ghost px-2 whitespace-nowrap" onClick={() => setSheet('how')}>
            {t('poker.lobby.howToShort')}
          </button>
        </div>

        <p className="mt-6 text-center text-[12.5px] leading-snug" style={{ color: '#B9B1D3' }}>{t('poker.noRealMoney')}</p>
      </div>

      {sheet === 'how' && (
        <div className="fixed inset-0 z-[80]">
          <Sheet title={t('poker.lobby.howTo')} onClose={() => setSheet(null)} reduced={!!reduce}>
            <p className="text-[14px] mb-3" style={{ color: '#D9D2EA' }}>{t('poker.lobby.howToBody')}</p>
            <button type="button" className="pk-cta-paper mb-4" onClick={() => navigate('/blefe/treino')}>{t('poker.lobby.teachMe')}</button>
            <HandRanking />
          </Sheet>
        </div>
      )}
      {(sheet === 'deck' || sheet === 'table') && (
        <div className="fixed inset-0 z-[80]">
          <Sheet title={sheet === 'deck' ? t('poker.lobby.deck') : t('poker.lobby.table')} onClose={() => setSheet(null)} reduced={!!reduce}>
            <div className="grid grid-cols-2 gap-3">
              {(sheet === 'deck' ? ['deck-classico', 'deck-noir'] : ['table-feltro-verde', 'table-meia-noite']).map((id) => {
                const owned = id === 'deck-classico' || id === 'table-feltro-verde' || (home.owned_items ?? []).includes(id);
                const on = (sheet === 'deck' ? loadout.deck : loadout.table) === id;
                return (
                  <button
                    key={id}
                    type="button"
                    disabled={!owned || on || !!equipping}
                    onClick={() => equip(sheet, id)}
                    className="rounded-[14px] p-3 grid gap-2 justify-items-center text-[13.5px] font-bold"
                    style={{ background: 'rgba(255,255,255,0.05)', boxShadow: on ? 'inset 0 0 0 2px #F4C454' : 'inset 0 0 0 1px rgba(243,234,211,0.2)', opacity: owned ? 1 : 0.5 }}
                    aria-pressed={on}
                  >
                    {sheet === 'deck' ? <CardBack deckId={id} className="w-[56%]" /> : <FeltSwatch tableId={id} className="w-full aspect-[4/3] rounded-[10px]" />}
                    <span>{t(`poker.items.${id}`)}</span>
                    <span className="text-[12px] font-normal" style={{ color: '#c9c2e0' }}>
                      {equipping === id ? <Loader2 className="w-4 h-4 animate-spin" /> : on ? t('poker.lobby.inUse') : owned ? t('poker.credits.equip') : t('poker.lobby.locked')}
                    </span>
                  </button>
                );
              })}
            </div>
            {sheet === 'table' && <p className="mt-3 text-[12.5px]" style={{ color: '#B9B1D3' }}>{t('poker.lobby.tableNote')}</p>}
          </Sheet>
        </div>
      )}
      <AgeGate
        open={!!age}
        onClose={() => setAge(null)}
        onConfirmed={() => {
          const to = age;
          setAge(null);
          invalidatePokerHome();
          if (to) navigate(to);
        }}
      />
    </main>
  );
};

export default Lobby;
