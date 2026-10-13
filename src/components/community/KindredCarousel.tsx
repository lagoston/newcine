import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Clock, Loader2, UserPlus, UserCheck, X } from 'lucide-react';
import UserAvatar from '../UserAvatar';
import ConnectionChip from '../connection/ConnectionChip';
import { PersonaCode } from '../PersonaBits';
import { posterUrl } from '../../lib/persona';
import { connectionTone, type ConnectionPerson } from '../../lib/connection';
import { NIGHT, VELVET, PAPER, MIST, PIXEL, FOCUS_RING, withAlpha } from '../../lib/oracleTheme';
import { codeFromMoods, connectionHref } from './ConnectionsPodium';

// "Cinéfilos com o seu gosto" na Comunidade (13/10/2026): gente que ainda não
// é sua amiga, com conexão de confiança média ou alta, num carrossel de
// cartões. Em cima, três títulos que os dois amam abertos em leque sobre um
// brilho na cor da conexão; embaixo, quem é a pessoa e o botão de amizade.
// Tocar no cartão abre o perfil já com a gaveta da Conexão; o X ("Agora não")
// esconde a pessoa por 30 dias, só neste aparelho. Sem "deslizar para
// rejeitar": são poucas pessoas por vez e a ideia é conhecer, não descartar.

export type KindredFriendStatus = 'none' | 'pending_sent' | 'pending_received' | 'friends';

interface KindredCarouselProps {
  items: ConnectionPerson[];
  statuses: Record<string, KindredFriendStatus>;
  busyId: string | null;
  onAddFriend: (person: ConnectionPerson) => void;
  onDismiss: (person: ConnectionPerson) => void;
}

// ---------------------------------------------------------------------------
// "Agora não": id → quando foi dispensado (ms), no localStorage.
// ---------------------------------------------------------------------------

const DISMISS_KEY = 'co.kindred.dismissed';
const DISMISS_MS = 30 * 24 * 60 * 60 * 1000;

export function readKindredDismissed(): Record<string, number> {
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    const now = Date.now();
    // Só os que ainda valem (os vencidos voltam a aparecer).
    return Object.fromEntries(Object.entries(parsed).filter(([, at]) => typeof at === 'number' && now - at < DISMISS_MS));
  } catch {
    return {};
  }
}

export function writeKindredDismissed(map: Record<string, number>) {
  try {
    window.localStorage.setItem(DISMISS_KEY, JSON.stringify(map));
  } catch {
    /* sem armazenamento: vale só até recarregar */
  }
}

// ---------------------------------------------------------------------------
// Cartão
// ---------------------------------------------------------------------------

// Leque: o do meio em pé, os dos lados inclinados e um pouco atrás.
const FAN = [
  { x: 0, rotate: 0, w: 98, z: 3, y: 0 },
  { x: -64, rotate: -9, w: 84, z: 2, y: 10 },
  { x: 64, rotate: 9, w: 84, z: 1, y: 10 },
];

const PosterFan: React.FC<{ posters: string[]; color: string; pct: number; label: string }> = ({ posters, color, pct, label }) => {
  const reduceMotion = useReducedMotion();
  // Com 2 pôsteres, um de cada lado do meio.
  const slots = posters.length === 2 ? [{ ...FAN[1], x: -34, rotate: -6 }, { ...FAN[2], x: 34, rotate: 6, z: 3 }] : FAN.slice(0, posters.length);
  return (
    <div className="absolute inset-0" role="img" aria-label={label}>
      {posters.length === 0 ? (
        <span className="absolute inset-0 grid place-items-center text-[56px] leading-none" style={{ ...PIXEL, color }} aria-hidden>
          {Math.round(pct)}%
        </span>
      ) : (
        slots.map((slot, i) => (
          <motion.span
            key={`${posters[i]}-${i}`}
            className="absolute inset-x-0 mx-auto bottom-6 block rounded-lg overflow-hidden aspect-[2/3]"
            style={{
              width: slot.w,
              zIndex: slot.z,
              background: VELVET,
              boxShadow: `0 14px 30px -12px rgba(0,0,0,0.85), 0 0 0 1px ${withAlpha('#FFFFFF', 0.12)}`,
            }}
            // O único movimento da seção: o leque se abre quando o cartão aparece.
            initial={reduceMotion ? false : { x: 0, y: slot.y + 6, rotate: 0, opacity: 0 }}
            whileInView={{ x: slot.x, y: slot.y, rotate: slot.rotate, opacity: 1 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ type: 'spring', stiffness: 160, damping: 20, delay: i === 0 ? 0 : 0.08 }}
          >
            <img src={posterUrl(posters[i], 'w185') ?? undefined} alt="" loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover" />
          </motion.span>
        ))
      )}
    </div>
  );
};

const KindredCard: React.FC<{
  person: ConnectionPerson;
  status: KindredFriendStatus;
  busy: boolean;
  onAddFriend: () => void;
  onDismiss: () => void;
}> = ({ person, status, busy, onAddFriend, onDismiss }) => {
  const { t } = useTranslation();
  const tone = connectionTone(person.pct ?? 50);
  const code = codeFromMoods(person.top_moods);
  const posters = (person.posters || []).filter(Boolean).slice(0, 3);

  const action = (() => {
    const base = `w-full gap-2 h-11 rounded-xl text-sm font-semibold transition ${FOCUS_RING}`;
    if (status === 'friends') {
      return (
        <span className={`${base} flex items-center justify-center bg-emerald-600/90 text-white`}>
          <UserCheck className="w-4 h-4" aria-hidden />
          {t('profile.friendsButton')}
        </span>
      );
    }
    if (status === 'pending_sent') {
      return (
        <span className={`${base} flex items-center justify-center ring-1 ring-white/15`} style={{ color: PAPER, background: 'rgba(255,255,255,0.03)' }} role="status">
          <Clock className="w-4 h-4 text-amber-300" aria-hidden />
          {t('community.requestSent')}
        </span>
      );
    }
    return (
      <button
        type="button"
        onClick={onAddFriend}
        disabled={busy}
        aria-label={status === 'pending_received' ? t('community.acceptAria', { username: person.username }) : t('community.addAria', { username: person.username })}
        className={`${base} bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white shadow-lg shadow-fuchsia-900/30 disabled:cursor-wait`}
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <UserPlus className="w-4 h-4" aria-hidden />}
        {status === 'pending_received' ? t('community.accept') : t('profile.addFriendButton')}
      </button>
    );
  })();

  return (
    <article
      className="relative h-full flex flex-col rounded-3xl overflow-hidden transition hover:-translate-y-0.5 duration-300"
      style={{
        background: VELVET,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.08), inset 0 0 0 1px ${withAlpha(tone.color, 0.28)}, 0 18px 40px -26px rgba(0,0,0,0.7)`,
      }}
    >
      {/* Pôsteres em leque sobre o brilho da conexão */}
      <div
        className="relative h-[58%] shrink-0 overflow-hidden"
        style={{
          background: `radial-gradient(60% 62% at 50% 62%, ${withAlpha(tone.color, 0.34)}, transparent 72%), linear-gradient(180deg, ${NIGHT} 0%, ${withAlpha('#1C1433', 0.6)} 100%)`,
        }}
      >
        <PosterFan posters={posters} color={tone.color} pct={person.pct ?? 0} label={t('connection.kindred.lovedTogether')} />
        {/* Chão do leque, para os pôsteres não flutuarem */}
        <span
          className="absolute inset-x-6 bottom-4 h-3 rounded-full"
          style={{ background: `radial-gradient(50% 100% at 50% 50%, ${withAlpha(tone.color, 0.3)}, transparent 75%)` }}
          aria-hidden
        />
      </div>

      {/* "Agora não" */}
      <button
        type="button"
        onClick={onDismiss}
        aria-label={t('connection.kindred.notNowAria', { username: person.username })}
        title={t('connection.kindred.notNow')}
        className={`group absolute top-1 right-1 z-10 w-11 h-11 rounded-full ${FOCUS_RING}`}
      >
        <span
          className="grid place-items-center w-8 h-8 rounded-full ring-1 ring-white/15 transition group-hover:ring-white/40"
          style={{ background: 'rgba(18,13,34,0.72)', color: PAPER }}
        >
          <X className="w-4 h-4" aria-hidden />
        </span>
      </button>

      <div className="flex-1 min-h-0 flex flex-col px-4 pt-3 pb-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <UserAvatar user={person} size={40} />
          <div className="min-w-0 flex-1">
            {/* O link cobre o cartão inteiro (after:inset-0); os botões ficam por cima (z-10). */}
            <Link
              to={connectionHref(person.username)}
              aria-label={t('connection.kindred.openAria', { username: person.username })}
              className={`justify-start min-w-0 min-h-0 rounded-md text-[18px] leading-tight hover:underline underline-offset-4 after:absolute after:inset-0 after:z-[1] after:rounded-3xl ${FOCUS_RING}`}
              style={{ ...PIXEL, color: PAPER }}
            >
              <span className="truncate">@{person.username}</span>
            </Link>
            {code && <PersonaCode code={code} className="block mt-1 text-[13px] leading-none tracking-wide" />}
          </div>
          <ConnectionChip pct={person.pct} confidence={person.confidence} className="shrink-0" />
        </div>
        {person.shared_count ? (
          <p className="mt-2 text-[12.5px] truncate" style={{ color: MIST }}>
            {t('connection.kindred.shared', { count: person.shared_count })}
          </p>
        ) : null}
        <div className="relative z-10 mt-auto pt-3">{action}</div>
      </div>
    </article>
  );
};

// ---------------------------------------------------------------------------
// Seção
// ---------------------------------------------------------------------------

const KindredCarousel: React.FC<KindredCarouselProps> = ({ items, statuses, busyId, onAddFriend, onDismiss }) => {
  const { t } = useTranslation();
  const trackRef = useRef<HTMLOListElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });

  const measure = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setEdges({ start: el.scrollLeft <= 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
  }, []);

  useEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure, items.length]);

  const scrollBy = (dir: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    const card = el.querySelector('li');
    const step = card ? (card.getBoundingClientRect().width + 16) * 2 : el.clientWidth * 0.8;
    el.scrollBy({ left: dir * step, behavior: 'smooth' });
  };

  const arrow = (dir: 1 | -1) => {
    const disabled = dir === -1 ? edges.start : edges.end;
    const Icon = dir === -1 ? ChevronLeft : ChevronRight;
    return (
      <button
        type="button"
        onClick={() => scrollBy(dir)}
        disabled={disabled}
        aria-label={dir === -1 ? t('connection.kindred.previous') : t('connection.kindred.next')}
        className={`w-11 h-11 rounded-full border border-white/15 hover:border-white/35 hover:bg-white/5 transition disabled:opacity-30 disabled:cursor-default disabled:hover:bg-transparent ${FOCUS_RING}`}
        style={{ color: PAPER }}
      >
        <Icon className="w-5 h-5" aria-hidden />
      </button>
    );
  };

  return (
    <section aria-labelledby="community-kindred-title" className="mt-12 border-t border-white/[0.07] pt-10">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 id="community-kindred-title" style={{ ...PIXEL, color: PAPER }} className="text-2xl sm:text-3xl leading-tight">
              {t('connection.kindred.title')}
            </h2>
            <p className="mt-1 text-sm max-w-xl" style={{ color: MIST }}>
              {t('connection.kindred.hint')}
            </p>
          </div>
          {!(edges.start && edges.end) && (
            <div className="hidden sm:flex shrink-0 items-center gap-2">
              {arrow(-1)}
              {arrow(1)}
            </div>
          )}
        </div>

        {/* O trilho vai até a borda do bloco (-mx-5 / -mx-8): no celular, até a
            borda da tela, com o próximo cartão aparecendo pela metade; no
            desktop, cabem 4 cartões inteiros sem corte no meio de um. */}
        <ol
          ref={trackRef}
          onScroll={measure}
          className="mt-6 -mx-5 px-5 sm:-mx-8 sm:px-8 flex gap-4 overflow-x-auto snap-x snap-mandatory scroll-px-5 sm:scroll-px-8 no-scrollbar pb-2"
          aria-label={t('connection.kindred.title')}
        >
          {items.map((person) => (
            <li key={person.user_id} className="snap-start shrink-0 w-[78vw] max-w-[320px] sm:w-[264px] h-[372px]">
              <KindredCard
                person={person}
                status={statuses[person.user_id] || 'none'}
                busy={busyId === person.user_id}
                onAddFriend={() => onAddFriend(person)}
                onDismiss={() => onDismiss(person)}
              />
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
};

export default KindredCarousel;
