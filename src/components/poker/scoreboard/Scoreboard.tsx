import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { ArrowLeft, ChevronRight, Loader2, ShieldCheck, Users } from 'lucide-react';
import { useAuth } from '../../../lib/auth';
import { FOCUS_RING, MIST, PAPER } from '../../../lib/oracleTheme';
import { loadJackpotFont } from '../../../lib/posterJackpot';
import { OracleTrio } from '../jackpot/CarrierFace';
import PrizeArt from '../jackpot/PrizeArt';
import { equipPokerMark, fetchPokerScoreboard, fetchProfileBits } from '../jackpot/entryApi';
import { BLEFE_ROUTES, prizeNameOf, titleProgress } from '../jackpot/pokerMeta';
import { currentStreak, fmt, mergeStats, parseScoreboard, placements, playerNumbers, type ScoreboardData } from './model';
import { HandCards, LuckBullet, MarkRow, ModeSplit, NumberRow, PlacementBar, RecentRow, RivalRows, TitleReel } from './parts';
import '../../../styles/posterJackpot.css';
import '../../../styles/pokerEntry.css';

// O placar do Grande Blefe (/blefe/placar; SPEC §7.7). De cima para baixo:
// o título da pessoa numa película (a carreira de Figurante a Lenda da
// Sessão), o filtro Geral × Valendo, as vitórias e derrotas, as
// colocações, livre × prêmio, os prêmios da mesa, a rivalidade com cada
// oráculo, os momentos, a sorte nos all-ins, os marcos (com [Equipar]), os
// números de jogador (recolhidos) e as últimas partidas. Só as partidas
// valendo prêmio são verificadas pelo servidor; o Geral avisa.

type Scope = 'all' | 'bounty';
type Load = { state: 'loading' } | { state: 'closed' } | { state: 'error' } | { state: 'ready'; data: ScoreboardData };

const Section: React.FC<{ id: string; title: string; hint?: React.ReactNode; children: React.ReactNode }> = ({ id, title, hint, children }) => (
  <section aria-labelledby={id} className="pt-7">
    <h2 id={id} className="text-[17px] font-semibold leading-tight" style={{ color: PAPER }}>
      {title}
    </h2>
    {hint ? (
      <p className="mt-1 text-[12.5px] leading-snug" style={{ color: MIST }}>
        {hint}
      </p>
    ) : null}
    <div className="mt-3">{children}</div>
  </section>
);

const Tile: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="pe-panel px-3.5 py-3">
    <p className="text-[12px]" style={{ color: MIST }}>
      {label}
    </p>
    <p className="mt-1 text-[21px] font-bold leading-none" style={{ color: PAPER }}>
      {value}
    </p>
  </div>
);

const Scoreboard: React.FC = () => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const isPt = lang.startsWith('pt');
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [scope, setScope] = useState<Scope>('all');
  const [cardStyle, setCardStyle] = useState('default');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [equipping, setEquipping] = useState<string | null>(null);

  const fetchAll = useCallback(() => {
    setLoad({ state: 'loading' });
    fetchPokerScoreboard()
      .then((raw) => {
        const data = parseScoreboard(raw);
        setLoad(data ? { state: 'ready', data } : { state: 'closed' });
      })
      .catch((error) => {
        console.error('Poker scoreboard:', error);
        setLoad({ state: 'error' });
      });
  }, []);

  useEffect(() => {
    loadJackpotFont();
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    fetchProfileBits(userId)
      .then((bits) => {
        if (!alive) return;
        setCardStyle(bits.cardStyle);
        setActiveTag(bits.activeTagName);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [userId]);

  const data = load.state === 'ready' ? load.data : null;
  const stats = useMemo(() => (data ? (scope === 'bounty' ? data.bounty : mergeStats(data.free, data.bounty)) : null), [data, scope]);
  const recent = useMemo(() => (data ? data.recent.filter((m) => scope === 'all' || m.mode === 'bounty') : []), [data, scope]);

  const equipMark = async (name: string, emoji: string, tagId: string) => {
    if (!userId || equipping) return;
    setEquipping(tagId);
    try {
      await equipPokerMark(userId, { name, emoji });
      setActiveTag(name);
      toast.success(t('pokerEntry.score.equipped', { name }));
    } catch (error) {
      console.error('Poker mark equip:', error);
      toast.error(t('pokerEntry.score.equipError'));
    } finally {
      setEquipping(null);
    }
  };

  const top = (
    <header className="flex items-center gap-3 pt-4">
      <Link
        to={BLEFE_ROUTES.lobby}
        aria-label={t('pokerEntry.score.back')}
        className={`grid place-items-center w-11 h-11 shrink-0 rounded-full transition hover:bg-white/10 ${FOCUS_RING}`}
        style={{ color: '#FFE8A3', boxShadow: 'inset 0 0 0 1px rgba(244,196,84,0.45)' }}
      >
        <ArrowLeft className="w-5 h-5" aria-hidden />
      </Link>
      <div className="min-w-0">
        <h1 className="pe-cinzel pj-gold-text text-[28px] sm:text-[34px] font-black leading-none">{t('pokerEntry.score.title')}</h1>
        <p className="mt-1 text-[12.5px]" style={{ color: MIST }}>
          {t('pokerEntry.name')}
        </p>
      </div>
    </header>
  );

  let body: React.ReactNode;
  if (load.state === 'loading') {
    body = (
      <div className="grid place-items-center py-24" role="status" aria-label={t('pokerEntry.score.loading')}>
        <Loader2 className="w-7 h-7 animate-spin text-amber-200" aria-hidden />
      </div>
    );
  } else if (load.state === 'closed' || load.state === 'error') {
    body = (
      <div className="pe-panel mt-8 px-5 py-8 text-center">
        <OracleTrio size={36} />
        <p className="mt-4 text-[15px]" style={{ color: PAPER }}>
          {load.state === 'closed' ? t('pokerEntry.score.closed') : t('pokerEntry.score.error')}
        </p>
        {load.state === 'error' ? (
          <button type="button" onClick={fetchAll} className={`pe-paper mt-4 h-11 px-5 rounded-full text-[14px] font-bold ${FOCUS_RING}`}>
            {t('pokerEntry.score.retry')}
          </button>
        ) : (
          <Link to="/" className={`pe-ghost mt-4 inline-flex items-center h-11 px-5 rounded-full text-[14px] font-semibold ${FOCUS_RING}`}>
            {t('pokerEntry.score.home')}
          </Link>
        )}
      </div>
    );
  } else if (data && stats) {
    const progress = titleProgress(data.titleWins, data.titleId);
    const losses = Math.max(0, stats.matches - stats.wins);
    const rate = stats.matches ? Math.round((stats.wins / stats.matches) * 100) : 0;
    const streakNow = scope === 'bounty' ? data.bounty.streak : currentStreak(recent);
    const streakBest = Math.max(scope === 'bounty' ? data.bounty.bestStreak : stats.bestStreak, streakNow);
    const empty = stats.matches === 0;
    const luckDelta = stats.allinWon - stats.allinExpectedMilli / 1000;

    body = (
      <>
        {/* O título: o letreiro com a carreira em película. */}
        <section className="pe-marquee mt-5" aria-labelledby="pe-score-title">
          <div className="pe-marquee-inner px-5 pt-5 pb-5">
            <span className="pj-stars" aria-hidden />
            <div className="relative">
              <p className="text-[12.5px]" style={{ color: MIST }}>
                {t('pokerEntry.score.yourTitle')}
              </p>
              <p id="pe-score-title" className="pe-cinzel pj-gold-text mt-1.5 text-[30px] sm:text-[38px] font-black leading-none">
                {t(`pokerEntry.titles.${progress.current.id}`)}
              </p>
              <div className="mt-4">
                <TitleReel wins={data.titleWins} titleId={data.titleId} />
              </div>
            </div>
          </div>
        </section>

        {/* O filtro vale para tudo o que vem abaixo. */}
        <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="pe-seg" role="group" aria-label={t('pokerEntry.score.filterAria')}>
            <button type="button" aria-pressed={scope === 'all'} onClick={() => setScope('all')} className={FOCUS_RING}>
              {t('pokerEntry.score.general')}
            </button>
            <button type="button" aria-pressed={scope === 'bounty'} onClick={() => setScope('bounty')} className={`inline-flex items-center gap-1.5 ${FOCUS_RING}`}>
              {t('pokerEntry.score.verified')}
              <ShieldCheck className="w-4 h-4" aria-hidden />
            </button>
          </div>
          <p className="text-[12.5px]" style={{ color: MIST }}>
            {scope === 'all' ? t('pokerEntry.score.unverified') : t('pokerEntry.score.verifiedNote')}
          </p>
        </div>

        {empty ? (
          <div className="pe-felt mt-5 rounded-[20px] px-5 py-7 text-center">
            <OracleTrio size={38} />
            <p className="mt-4 text-[16px] font-semibold" style={{ color: PAPER }}>
              {scope === 'bounty' ? t('pokerEntry.score.emptyBounty') : t('pokerEntry.score.emptyTitle')}
            </p>
            <p className="mx-auto mt-1 max-w-[34ch] text-[13px] leading-relaxed" style={{ color: '#D9F2E4' }}>
              {t('pokerEntry.score.emptyBody')}
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2.5">
              <Link to={BLEFE_ROUTES.free} className={`pe-paper inline-flex items-center h-11 px-5 rounded-full text-[14px] font-bold ${FOCUS_RING}`}>
                {t('pokerEntry.panel.playFree')}
              </Link>
              <Link to={BLEFE_ROUTES.lobby} className={`pe-ghost inline-flex items-center h-11 px-5 rounded-full text-[14px] font-semibold ${FOCUS_RING}`}>
                {t('pokerEntry.score.seePrize')}
              </Link>
            </div>
          </div>
        ) : (
          <>
            {/* Vitórias e derrotas: o número que manda na tela. */}
            <section className="pt-6" aria-labelledby="pe-score-head">
              <h2 id="pe-score-head" className="flex flex-wrap items-baseline gap-x-2.5" style={{ color: PAPER }}>
                <span className="text-[52px] font-bold leading-none">{fmt(stats.wins, lang)}</span>
                <span className="text-[16px]">{t('pokerEntry.score.header', { count: stats.wins, matches: fmt(stats.matches, lang) })}</span>
              </h2>
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Tile label={t('pokerEntry.score.losses')} value={fmt(losses, lang)} />
                <Tile label={t('pokerEntry.score.winRate')} value={`${rate}%`} />
                <Tile label={t('pokerEntry.score.streak')} value={fmt(streakNow, lang)} />
                <Tile label={t('pokerEntry.score.bestStreak')} value={fmt(streakBest, lang)} />
              </div>
            </section>

            <Section id="pe-places" title={t('pokerEntry.score.places')} hint={t('pokerEntry.score.placesHint', { count: stats.podiums })}>
              <PlacementBar counts={placements(stats)} />
            </Section>

            {scope === 'all' && data.free.matches > 0 && data.bounty.matches > 0 && (
              <Section id="pe-modes" title={t('pokerEntry.score.modes')}>
                <ModeSplit free={data.free} bounty={data.bounty} />
              </Section>
            )}
          </>
        )}

        <Section id="pe-prizes" title={t('pokerEntry.score.prizes')} hint={data.prizes.length ? undefined : t('pokerEntry.score.noPrizes')}>
          {data.prizes.length > 0 && (
            <ul className="grid grid-cols-4 sm:grid-cols-6 gap-2.5">
              {data.prizes.map((won) => (
                <li key={won.key} className="min-w-0">
                  <PrizeArt prize={won.prize} plain animated={false} />
                  <p className="mt-1.5 text-[11.5px] leading-tight line-clamp-2" style={{ color: PAPER }}>
                    {prizeNameOf(won.prize, isPt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {!empty && (
          <>
            <Section id="pe-rivals" title={t('pokerEntry.score.rivals')}>
              <RivalRows vs={stats.vs} cardStyle={cardStyle} />
            </Section>

            <Section id="pe-moments" title={t('pokerEntry.score.moments')}>
              <div className="pe-panel p-4">
                {stats.bestHand ? (
                  <div>
                    <p className="text-[12.5px]" style={{ color: MIST }}>
                      {t('pokerEntry.score.bestHand')}
                    </p>
                    <p className="mt-0.5 text-[16px] font-semibold" style={{ color: PAPER }}>
                      {t(`pokerEntry.hands.${stats.bestHand.kind}`, { defaultValue: stats.bestHand.kind })}
                    </p>
                    <div className="mt-2.5">
                      <HandCards hand={stats.bestHand} />
                    </div>
                  </div>
                ) : (
                  <p className="text-[13px]" style={{ color: MIST }}>
                    {t('pokerEntry.score.noBestHand')}
                  </p>
                )}
                <dl className="mt-4 grid grid-cols-2 gap-3 border-t pt-3.5" style={{ borderColor: 'var(--pe-hair)' }}>
                  <div>
                    <dt className="text-[12px]" style={{ color: MIST }}>
                      {t('pokerEntry.score.biggestPot')}
                    </dt>
                    <dd className="mt-1 text-[20px] font-bold leading-none" style={{ color: PAPER }}>
                      {fmt(stats.biggestPot, lang)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[12px]" style={{ color: MIST }}>
                      {t('pokerEntry.score.comebacks')}
                    </dt>
                    <dd className="mt-1 text-[20px] font-bold leading-none" style={{ color: PAPER }}>
                      {fmt(stats.comebackWins, lang)}
                    </dd>
                    <dd className="mt-1 text-[11.5px] leading-snug" style={{ color: MIST }}>
                      {t('pokerEntry.score.comebacksHelp')}
                    </dd>
                  </div>
                </dl>
              </div>
            </Section>

            <Section id="pe-luck" title={t('pokerEntry.score.luck')}>
              <div className="pe-panel p-4">
                {stats.allinCount > 0 ? (
                  <>
                    <p className="text-[14px] leading-relaxed" style={{ color: PAPER }}>
                      {t('pokerEntry.score.luckLine', {
                        won: fmt(stats.allinWon, lang),
                        total: fmt(stats.allinCount, lang),
                        expected: fmt(stats.allinExpectedMilli / 1000, lang, 1),
                      })}{' '}
                      <strong className="whitespace-nowrap">
                        {t('pokerEntry.score.luckIndex', { delta: `${luckDelta > 0 ? '+' : luckDelta < 0 ? '−' : ''}${fmt(Math.abs(luckDelta), lang, 1)}` })}
                      </strong>
                    </p>
                    <p className="mt-0.5 text-[12.5px]" style={{ color: MIST }}>
                      {/* Menos de 1 all-in de diferença é ruído: "no meio do esperado". */}
                      {luckDelta >= 1 ? t('pokerEntry.score.luckUp') : luckDelta <= -1 ? t('pokerEntry.score.luckDown') : t('pokerEntry.score.luckEven')}
                    </p>
                    <div className="mt-3">
                      <LuckBullet won={stats.allinWon} total={stats.allinCount} expected={stats.allinExpectedMilli / 1000} />
                    </div>
                  </>
                ) : (
                  <p className="text-[13px]" style={{ color: MIST }}>
                    {t('pokerEntry.score.noAllins')}
                  </p>
                )}
                <dl className="mt-4 grid grid-cols-3 gap-3 border-t pt-3.5" style={{ borderColor: 'var(--pe-hair)' }}>
                  {[
                    { label: t('pokerEntry.score.badBeatsSuffered'), value: stats.badBeatsSuffered },
                    { label: t('pokerEntry.score.badBeatsDealt'), value: stats.badBeatsDealt },
                    { label: t('pokerEntry.score.bluffs'), value: stats.bluffsWorked },
                  ].map((item) => (
                    <div key={item.label}>
                      <dt className="text-[12px] leading-tight" style={{ color: MIST }}>
                        {item.label}
                      </dt>
                      <dd className="mt-1 text-[20px] font-bold leading-none" style={{ color: PAPER }}>
                        {fmt(item.value, lang)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            </Section>
          </>
        )}

        <Section id="pe-marks" title={t('pokerEntry.score.marks')} hint={t('pokerEntry.score.marksHint')}>
          <ul className="grid gap-2.5 sm:grid-cols-2">
            {data.marks.map((mark) => (
              <MarkRow
                key={mark.tagId}
                mark={mark}
                equipped={activeTag === mark.name}
                busy={equipping === mark.tagId}
                onEquip={() => equipMark(mark.name, mark.emoji, mark.tagId)}
              />
            ))}
          </ul>
        </Section>

        {!empty && (
          <>
            <section className="pt-7" aria-labelledby="pe-numbers">
              <details className="pe-details pe-panel">
                <summary className={`flex items-center gap-3 px-4 h-14 rounded-[18px] ${FOCUS_RING}`}>
                  <span id="pe-numbers" className="flex-1 text-[16px] font-semibold" style={{ color: PAPER }}>
                    {t('pokerEntry.score.numbersTitle')}
                  </span>
                  <ChevronRight className="pe-chev w-5 h-5" style={{ color: '#FFE8A3' }} aria-hidden />
                </summary>
                <div className="px-4 pb-2">
                  <p className="text-[12.5px] leading-snug" style={{ color: MIST }}>
                    {t('pokerEntry.score.numbersHint')}
                  </p>
                  <ul className="mt-1">
                    {playerNumbers(stats).map((item) => (
                      <NumberRow key={item.key} item={item} />
                    ))}
                  </ul>
                </div>
              </details>
            </section>

            {recent.length > 0 && (
              <Section id="pe-recent" title={t('pokerEntry.score.recent')}>
                <ul className="pe-panel px-3.5">
                  {recent.slice(0, 10).map((match) => (
                    <RecentRow key={match.key} match={match} />
                  ))}
                </ul>
              </Section>
            )}
          </>
        )}

        {data.friendsWonToday > 0 && (
          <p className="mt-7 flex items-center gap-2 text-[13.5px]" style={{ color: PAPER }}>
            <Users className="w-4 h-4 shrink-0" style={{ color: '#FFE8A3' }} aria-hidden />
            {t('pokerEntry.score.friendsToday', { count: data.friendsWonToday })}
          </p>
        )}
      </>
    );
  }

  return (
    <main className="pe-score">
      <span className="pj-stars" aria-hidden />
      <div className="relative mx-auto max-w-2xl px-4 sm:px-6 pb-[calc(2.5rem+env(safe-area-inset-bottom))]">
        {top}
        {body}
        <p className="mt-10 text-center text-[12px] leading-relaxed" style={{ color: MIST }}>
          {t('pokerEntry.noRealMoney')}
        </p>
      </div>
    </main>
  );
};

export default Scoreboard;
