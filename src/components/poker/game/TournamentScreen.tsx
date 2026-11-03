import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { ChevronLeft, Star } from 'lucide-react';
import { ChipFace } from '../../posterJackpot/Chips';
import PosterArt, { EffectTag, RarityTag } from '../../posterJackpot/PosterArt';
import type { PokerHome } from '../../../lib/poker/client/apiTypes';
import { langOf, timeLeft } from '../../../lib/poker/client/format';
import { invalidatePokerHome } from '../../../lib/poker/client/usePokerHome';
import { ENTRY_CHIPS, posterTitle, STARS, tournamentOf, type StakeOption } from '../../../lib/poker/client/tournament';
import AgeGate from '../age/AgeGate';
import { BLEFE_ROUTES, type StakeParam } from '../jackpot/pokerMeta';
import { ChipsPill, Stage } from './TitleScreen';
import { loadPosterPokerFont } from './font';

// O torneio da semana (03/11/2026): o pôster com o brilho dourado, o número, a
// raridade, a dificuldade, o efeito, a contagem até quinta e a entrada — N fichas
// (1/1/2/3 pela raridade) ou um pôster da coleção da mesma raridade, que fica na mesa
// se a pessoa perder. Os estados (já é seu, venceu, sem fichas, limite) vêm do servidor.

const TournamentScreen: React.FC<{ home: PokerHome }> = ({ home }) => {
  const { t, i18n } = useTranslation();
  const lang = langOf(i18n.language);
  const navigate = useNavigate();
  const location = useLocation();
  const reduce = !!useReducedMotion();
  const tour = tournamentOf(home);
  const [now, setNow] = useState(() => Date.now());
  const [mode, setMode] = useState<'chips' | 'poster'>('chips');
  const [pick, setPick] = useState<StakeOption | null>(null);
  const [age, setAge] = useState<string | null>(null);

  useEffect(() => {
    loadPosterPokerFont();
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  // Erro vindo da mesa (a semana virou, sem fichas, pôster recusado…).
  useEffect(() => {
    const code = (location.state as { pokerError?: string } | null)?.pokerError;
    if (code) toast(t(`poker.errors.${code}`, { defaultValue: t('poker.net.error') }));
  }, [location.state, t]);

  const need = tour ? tour.entry_chips ?? ENTRY_CHIPS[tour.prize.rarity] : 1;
  const enoughChips = !!tour && tour.chips >= need;
  const options = useMemo(() => tour?.stake_options ?? [], [tour]);
  // Sem fichas suficientes, o pôster vira a escolha (se houver).
  useEffect(() => {
    if (tour && !enoughChips && options.length) setMode('poster');
  }, [tour, enoughChips, options.length]);
  useEffect(() => {
    if (mode === 'poster' && !pick && options.length === 1) setPick(options[0]);
  }, [mode, pick, options]);

  if (!tour) {
    return (
      <Stage>
        <header className="pp-topbar">
          <button type="button" className="pp-icon-btn" onClick={() => navigate(BLEFE_ROUTES.title)} aria-label={t('poker.game.back')}>
            <ChevronLeft className="w-6 h-6" />
          </button>
        </header>
        <div className="pp-state">
          <h3 className="pp-font pp-gold-letters">{t('poker.game.tourney')}</h3>
          <p>{t('poker.game.tourneySoon')}</p>
        </div>
      </Stage>
    );
  }

  const prize = tour.prize;
  const title = posterTitle(prize, lang);
  const stars = tour.stars || STARS[prize.rarity];
  const rarityName = t(`poker.rarity.${prize.rarity}`).toLowerCase();

  const go = (stake: StakeParam) => {
    const to = BLEFE_ROUTES.tourneyStart(tour.week, prize.id, stake);
    // 18+ antes da primeira partida valendo (§7.8).
    if (!home.player?.age_confirmed) setAge(to);
    else navigate(to, { state: { ppStart: true } });
  };

  // O estado de hoje: só um aparece; sem nenhum, a escolha da entrada.
  let body: React.ReactNode;
  if (tour.active_match) {
    body = (
      <div className="pp-state">
        <h3 className="pp-font pp-gold-letters">{t('poker.game.tourneyActive')}</h3>
        <p>{t('poker.tourney.activeBody')}</p>
        <button type="button" className="pp-ticket is-gold pp-font mt-4" onClick={() => navigate(BLEFE_ROUTES.resume)}>
          {t('poker.tourney.continue')}
        </button>
      </div>
    );
  } else if (tour.owned) {
    body = (
      <div className="pp-state">
        <h3 className="pp-font pp-gold-letters">{t('poker.tourney.ownedTitle')}</h3>
        <p>{t('poker.tourney.ownedBody')}</p>
        {tour.next && <p className="!mt-1 text-[13px]" style={{ color: '#c9b3ae' }}>{t('poker.tourney.nextWeek', { rarity: t(`poker.rarity.${tour.next.rarity}`).toLowerCase() })}</p>}
        <button type="button" className="pp-ticket mt-4" onClick={() => navigate(BLEFE_ROUTES.free)}>{t('poker.tourney.playCasual')}</button>
      </div>
    );
  } else if (tour.won_this_week) {
    body = (
      <div className="pp-state">
        <h3 className="pp-font pp-gold-letters">{t('poker.tourney.wonTitle')}</h3>
        <p>{t('poker.tourney.wonBody')}</p>
        {tour.next && <p className="!mt-1 text-[13px]" style={{ color: '#c9b3ae' }}>{t('poker.tourney.nextWeek', { rarity: t(`poker.rarity.${tour.next.rarity}`).toLowerCase() })}</p>}
        <button type="button" className="pp-ticket mt-4" onClick={() => navigate(BLEFE_ROUTES.collection)}>{t('poker.tourney.seeCollection')}</button>
      </div>
    );
  } else if (tour.attempts_used >= tour.max_attempts) {
    body = (
      <div className="pp-state">
        <h3 className="pp-font pp-gold-letters">{t('poker.tourney.limitTitle')}</h3>
        <p>{t('poker.tourney.limitBody', { max: tour.max_attempts })}</p>
        <button type="button" className="pp-ticket mt-4" onClick={() => navigate(BLEFE_ROUTES.free)}>{t('poker.tourney.playCasual')}</button>
      </div>
    );
  } else if (!enoughChips && options.length === 0) {
    body = (
      <div className="pp-state">
        <h3 className="pp-font pp-gold-letters">{t('poker.tourney.noChipsTitle')}</h3>
        <p>{t('poker.tourney.noChipsBody', { count: need, have: tour.chips, rarity: rarityName })}</p>
        <button type="button" className="pp-ticket is-gold mt-4" style={{ fontSize: 16 }} onClick={() => navigate('/', { state: { openJackpot: 'missions' } })}>
          {t('poker.tourney.getChips')}
        </button>
      </div>
    );
  } else {
    const ready = mode === 'chips' ? enoughChips : !!pick;
    body = (
      <section aria-labelledby="pp-entry-h">
        <p id="pp-entry-h" className="mt-5 text-center text-[14px] font-bold" style={{ color: '#F5EBD3' }}>
          {t('poker.tourney.entryOf', { n: tour.attempts_used + 1, max: tour.max_attempts })}
        </p>
        <div className="pp-entry" role="radiogroup" aria-label={t('poker.tourney.entryAria')}>
          <button type="button" role="radio" aria-checked={mode === 'chips'} aria-pressed={mode === 'chips'} disabled={!enoughChips} onClick={() => setMode('chips')}>
            <span className="flex items-center gap-1.5">
              <ChipFace className="w-6 h-6" />
              <b className="pk-num">{need}</b>
            </span>
            <span>{t('poker.tourney.payChips', { count: need })}</span>
            {!enoughChips && <span className="text-[11.5px] font-normal" style={{ color: '#d9c3b0' }}>{t('poker.lobby.youHave', { count: tour.chips })}</span>}
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'poster'}
            aria-pressed={mode === 'poster'}
            disabled={options.length === 0}
            onClick={() => setMode('poster')}
          >
            <b>{t('poker.tourney.betPosterShort')}</b>
            <span>{t('poker.tourney.betPoster', { rarity: rarityName })}</span>
            {options.length === 0 && <span className="text-[11.5px] font-normal" style={{ color: '#d9c3b0' }}>{t('poker.tourney.noStake', { rarity: rarityName })}</span>}
          </button>
        </div>
        {mode === 'poster' && options.length > 0 && (
          <>
            <div className="pp-stakes" role="listbox" aria-label={t('poker.tourney.pickPoster')}>
              {options.map((o) => {
                const on = pick?.item_id === o.item_id && pick.effect === o.effect;
                return (
                  <button key={`${o.item_id}-${o.effect}`} type="button" role="option" aria-selected={on} aria-pressed={on} onClick={() => setPick(o)}>
                    <span className="pp-stake-art">
                      <PosterArt filePath={o.file_path} effect={o.effect as never} size="w185" animated={false} className="absolute inset-0" mark={{ rarity: o.rarity, serial: o.serial, size: 'xs' }} />
                    </span>
                    <span className="pp-stake-title">{posterTitle(o, lang)}</span>
                    {o.effect !== 'none' && <EffectTag effect={o.effect as never} className="mt-1" />}
                  </button>
                );
              })}
            </div>
            <p className="pp-warn" role="note">
              {pick ? t('poker.tourney.stakeWarn', { title: posterTitle(pick, lang) }) : t('poker.tourney.stakeWarnAny')}
            </p>
          </>
        )}
        <button
          type="button"
          className="pp-ticket is-gold pp-font mt-4"
          disabled={!ready}
          onClick={() => go(mode === 'poster' && pick ? { kind: 'poster', itemId: pick.item_id, effect: pick.effect } : { kind: 'chips' })}
        >
          {t('poker.tourney.enter')}
        </button>
        <p className="mt-2 text-center text-[12.5px]" style={{ color: '#c9b3ae' }}>
          {mode === 'chips' ? t('poker.tourney.chipsNote', { count: tour.chips }) : t('poker.tourney.posterNote')}
        </p>
      </section>
    );
  }

  return (
    <Stage>
      <header className="pp-topbar">
        <button type="button" className="pp-icon-btn" onClick={() => navigate(BLEFE_ROUTES.title)} aria-label={t('poker.game.back')}>
          <ChevronLeft className="w-6 h-6" />
        </button>
        <ChipsPill count={tour.chips} />
      </header>

      <h1 className="text-center pp-font pp-gold-letters text-[26px] leading-tight">{t('poker.tourney.heading')}</h1>
      <p className="mt-1 text-center text-[13px] pk-num" style={{ color: '#c9b3ae', fontWeight: 600 }}>
        {t('poker.tourney.changesIn', { time: timeLeft(tour.ends_at, now, lang) })}
      </p>

      <figure className="pp-hero-poster" style={{ width: 'min(52vw, 210px)' }}>
        <span className="pp-float">
          <PosterArt filePath={prize.file_path} effect="gold" size="w500" animated={!reduce} loading="eager" mark={{ rarity: prize.rarity, serial: prize.serial, size: 'md' }} />
        </span>
      </figure>

      <div className="mt-9 text-center">
        <p className="text-[18px] font-bold" style={{ color: '#F5EBD3' }}>
          {title} <span className="font-normal text-[14px]" style={{ color: '#c9b3ae' }}>{prize.year}</span>
        </p>
        <div className="pp-meta">
          <RarityTag rarity={prize.rarity} />
          <EffectTag effect="gold" />
        </div>
        <div className="pp-meta" aria-label={t('poker.tourney.starsAria', { count: stars })}>
          <span>{t('poker.tourney.difficulty')}</span>
          <span className="inline-flex gap-0.5" aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <Star key={i} className="w-4 h-4" fill={i < stars ? '#E8B54A' : 'none'} stroke={i < stars ? '#E8B54A' : '#8f7a72'} />
            ))}
          </span>
        </div>
      </div>

      {/* O efeito do pôster: o que ele faz na mesa. */}
      <section className="pp-playbill" aria-labelledby="pp-effect-h">
        <h2 id="pp-effect-h" className="pp-font pp-gold-letters text-[21px]">{t(`poker.effects.${prize.effect_id}.name`)}</h2>
        <p>{t(`poker.effects.${prize.effect_id}.rule`)}</p>
        <p className="!mt-2 text-[12.5px]" style={{ color: '#c9b3ae' }}>{t('poker.tourney.howWin')}</p>
      </section>

      {body}

      <p className="pp-foot">{t('poker.noRealMoney')}</p>

      <AgeGate
        open={!!age}
        onClose={() => setAge(null)}
        onConfirmed={() => {
          const to = age;
          setAge(null);
          invalidatePokerHome();
          if (to) navigate(to, { state: { ppStart: true } });
        }}
      />
    </Stage>
  );
};

export default TournamentScreen;
