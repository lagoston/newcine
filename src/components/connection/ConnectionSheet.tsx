import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Info, UserPlus, UserCheck, Clock, Loader2, Share2, Film } from 'lucide-react';
import { toast } from 'sonner';
import OracleSheet from '../OracleSheet';
import MovieDetailsModal from '../MovieDetailsModal';
import ConnectionShareSheet from './ConnectionShareSheet';
import DuoAvatars from './DuoAvatars';
import SharedLoves from './SharedLoves';
import DebateTrack from './DebateTrack';
import PersonaFaceOff from './PersonaFaceOff';
import MoodMirror from './MoodMirror';
import { hasMoodShares } from './connectionFormat';
import WatchTogether from './WatchTogether';
import CalibrateRow from './CalibrateRow';
import { useConnectionMe, useMyPersona } from './useConnectionMe';
import type { ConnectionSection } from './ConnectionStrip';
import { ModuleTitle, useCountUp } from '../profile/observatoryKit';
import { PROFILE_GHOST_BUTTON, PROFILE_PRIMARY_BUTTON } from '../ProfileIdentityCard';
import { getFullTitle } from '../../lib/titleCards';
import { posterUrl, type UserPersona } from '../../lib/persona';
import { MOODS, moodsOfCode, type MoodKey } from '../../lib/moods';
import type { Movie } from '../../lib/tmdb';
import {
  connectionTone,
  connectionTitleName,
  confidenceKey,
  formatConnection,
  tierLabelKey,
  tierLineKey,
  CONNECTION_MIN_SHARED,
  type ConnectionDetail,
  type ConnectionSide,
} from '../../lib/connection';
import { NIGHT, PAPER, MIST, PIXEL, FOCUS_RING, withAlpha } from '../../lib/oracleTheme';

// A gaveta Conexão (13/10/2026), no lugar do modal de Compatibilidade.
// Mostra o que o banco já calculou (get_connection) — nada é recalculado
// aqui:
//   1. o número (sobe uma vez), a faixa e quantos títulos sustentam ele;
//   2. os filmes que unem vocês (e, se houver, o que nenhum dos dois salva);
//   3. onde o debate esquenta (as maiores diferenças);
//   4. as duas personalidades e os humores lado a lado;
//   5. assistam juntos (o Match Movie, sem configurar antes);
//   6. afine a conexão (quando a confiança ainda não é alta).
// Seções sem conteúdo não aparecem. "Quem os dois admiram" fica para
// quando o servidor mandar atores/diretores em comum.

export type FriendshipState = 'none' | 'pending_sent' | 'pending_received' | 'friends';

interface ConnectionSheetProps {
  open: boolean;
  onClose: () => void;
  other: ConnectionSide;
  otherPersona: UserPersona | null;
  detail: ConnectionDetail | null;
  // Pede a conexão de novo (depois de avaliar um título em "Afine").
  reload: () => void;
  // Abre já rolada até uma seção.
  initialSection?: ConnectionSection | null;
  friendship: FriendshipState;
  friendBusy?: boolean;
  onFriendAction: () => void;
}

const NEUTRAL_TONE = '#A78BFA';

const Section: React.FC<{ id: string; title: string; hint?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }> = ({
  id,
  title,
  hint,
  action,
  children,
}) => (
  <section id={`connection-${id}`} className="scroll-mt-4" aria-label={title}>
    <ModuleTitle title={title} hint={hint} action={action} />
    <div className="mt-4">{children}</div>
  </section>
);

// O número grande (0 → 87) e a faixa, que aparece depois da contagem.
const HeroNumber: React.FC<{ pct: number; color: string }> = ({ pct, color }) => {
  const { ref, value } = useCountUp(pct, 900);
  return (
    <span ref={ref as React.RefObject<HTMLSpanElement>} style={{ ...PIXEL, color }} className="block text-[64px] leading-none tabular-nums" aria-hidden>
      {Math.round(value)}%
    </span>
  );
};

const ConnectionSheet: React.FC<ConnectionSheetProps> = ({
  open,
  onClose,
  other,
  otherPersona,
  detail,
  reload,
  initialSection = null,
  friendship,
  friendBusy = false,
  onFriendAction,
}) => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const reduceMotion = useReducedMotion();
  const me = useConnectionMe();
  const { persona: mePersona, loading: mePersonaLoading } = useMyPersona(open);
  const [showHow, setShowHow] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [ratingOpen, setRatingOpen] = useState(false);
  const [movie, setMovie] = useState<Movie | null>(null);
  // Títulos avaliados em "Afine" nesta abertura (o "+1 em comum").
  const [added, setAdded] = useState(0);
  const opening = useRef(false);
  const scrolled = useRef(false);

  // Cada abertura começa do zero.
  useEffect(() => {
    if (open) return;
    setShowHow(false);
    setAdded(0);
    scrolled.current = false;
  }, [open]);

  // Abriu numa seção: rola até ela quando o conteúdo de cima já chegou
  // (a sua personalidade muda a altura de "Personalidades").
  const bodyReady = open && Boolean(detail) && !mePersonaLoading;
  useEffect(() => {
    if (!bodyReady || !initialSection || scrolled.current) return;
    const id = window.setTimeout(() => {
      scrolled.current = true;
      document.getElementById(`connection-${initialSection}`)?.scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' });
    }, 450);
    return () => window.clearTimeout(id);
  }, [bodyReady, initialSection, reduceMotion]);

  const meCode = mePersona?.code ?? null;
  const otherCode = otherPersona?.code ?? null;
  // Humores de "Assistam juntos": os 3 de cada um (sem personalidade, os 9).
  const defaultMoods = useMemo<MoodKey[]>(() => {
    const keys = new Set([...moodsOfCode(meCode), ...moodsOfCode(otherCode)].map((m) => m.key));
    const list = MOODS.filter((m) => keys.has(m.key)).map((m) => m.key);
    return list.length ? list : MOODS.map((m) => m.key);
  }, [meCode, otherCode]);

  const meSide: ConnectionSide | null = me ? { ...me, persona_code: meCode ?? me.persona_code ?? null } : null;
  const otherSide: ConnectionSide = { ...other, persona_code: otherCode ?? other.persona_code ?? null };
  const meName = t('connection.you');
  const otherName = `@${other.username}`;

  const openTitle = async (ref: { movie_id: number; media_type: 'movie' | 'tv' }) => {
    if (opening.current) return;
    opening.current = true;
    try {
      setMovie(await getFullTitle({ id: ref.movie_id, media_type: ref.media_type }));
    } catch (error) {
      console.error('Connection open title error:', error);
      toast.error(t('common.error'));
    } finally {
      opening.current = false;
    }
  };

  const hasNumber = Boolean(detail && detail.pct !== null && detail.confidence !== 'none');
  const pct = detail?.pct ?? 0;
  const confidence = detail && detail.confidence !== 'none' ? detail.confidence : null;
  const tone = hasNumber ? connectionTone(pct).color : NEUTRAL_TONE;
  const strongest = detail?.loves[0] ?? null;
  const backdrop = strongest?.backdrop_path ? posterUrl(strongest.backdrop_path, 'w780') : null;

  // ---------- Herói ----------
  const hero = detail && (
    <section className="relative -mx-5 sm:-mx-7 overflow-hidden" aria-label={t('connection.title')}>
      {backdrop && <img src={backdrop} alt="" decoding="async" className="absolute inset-0 w-full h-full object-cover opacity-35" />}
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(60% 55% at 50% 38%, ${withAlpha(tone, 0.16)}, transparent 70%), linear-gradient(180deg, ${withAlpha(NIGHT, 0.45)} 0%, ${withAlpha(NIGHT, 0.72)} 55%, ${NIGHT} 100%)`,
        }}
        aria-hidden
      />
      <div className="relative px-5 sm:px-7 pt-7 pb-6 flex flex-col items-center text-center">
        <button
          type="button"
          onClick={() => setShowHow((v) => !v)}
          aria-expanded={showHow}
          aria-label={t('connection.how.title')}
          title={t('connection.how.title')}
          className={`absolute top-2 right-2 sm:right-4 rounded-full hover:bg-white/10 transition ${FOCUS_RING}`}
          style={{ color: showHow ? PAPER : MIST }}
        >
          <Info className="w-5 h-5" aria-hidden />
        </button>
        <DuoAvatars me={meSide} other={otherSide} size={52} />
        {hasNumber ? (
          <>
            <p className="sr-only">
              {formatConnection(pct)} {t('connection.label')} · {t(tierLabelKey(pct))}
            </p>
            <div className="mt-4">
              <HeroNumber pct={pct} color={tone} />
            </div>
            <motion.div
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: reduceMotion ? 0 : 0.95 }}
              aria-hidden
            >
              <p style={{ ...PIXEL, color: PAPER }} className="mt-3 text-[22px] leading-tight">
                {t(tierLabelKey(pct))}
              </p>
              <p className="mt-1 text-[14px] leading-snug" style={{ color: MIST }}>
                {t(tierLineKey(pct))}
              </p>
            </motion.div>
          </>
        ) : (
          <>
            <p style={{ ...PIXEL, color: PAPER }} className="mt-4 text-[28px] leading-tight">
              {t('connection.strip.forming')}
            </p>
            <p className="mt-1.5 text-[14px] leading-snug" style={{ color: MIST }}>
              {t('connection.strip.formingHint', { count: Math.max(1, CONNECTION_MIN_SHARED - detail.shared_count) })}
            </p>
          </>
        )}
        <p className="mt-3 text-[12.5px] leading-snug" style={{ color: 'rgba(189,180,214,0.9)' }}>
          {detail.shared_count > 0 ? t('connection.hero.basis', { count: detail.shared_count }) : t('connection.hero.basisNone')}
          {confidence ? ` · ${t(confidenceKey(confidence))}` : ''}
        </p>
        {showHow && (
          <div
            className="mt-4 w-full max-w-md rounded-2xl p-4 text-left text-[13.5px] leading-relaxed"
            style={{ background: 'rgba(18,13,34,0.78)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), inset 0 0 0 1px rgba(243,234,211,0.1)', color: MIST }}
          >
            <p style={{ ...PIXEL, color: PAPER }} className="text-[16px] leading-tight">
              {t('connection.how.title')}
            </p>
            <p className="mt-2">{t('connection.how.body')}</p>
            <p className="mt-2">{t('connection.how.confidence')}</p>
          </div>
        )}
        {backdrop && strongest && (
          <p className="mt-4 inline-flex items-center gap-1.5 text-[11.5px]" style={{ color: 'rgba(189,180,214,0.75)' }}>
            <Film className="w-3.5 h-3.5" aria-hidden />
            {t('connection.hero.caption', { title: connectionTitleName(strongest, lang) })}
          </p>
        )}
      </div>
    </section>
  );

  // ---------- Seções ----------
  const showPersonas = Boolean(meCode && otherCode);
  const showMoods = hasMoodShares(mePersona?.scores) && hasMoodShares(otherPersona?.scores);
  const showCalibrate = Boolean(detail && ((detail.confidence !== 'high' && detail.calibrate.length > 0) || added > 0));

  // ---------- Rodapé ----------
  const shareButton = hasNumber && meSide && detail && (
    <button
      type="button"
      onClick={() => setShareOpen(true)}
      aria-label={t('connection.footer.share')}
      title={t('connection.footer.share')}
      className={`shrink-0 w-11 h-11 rounded-xl border border-white/15 hover:border-white/35 bg-black/25 hover:bg-white/10 transition ${FOCUS_RING}`}
      style={{ color: PAPER }}
    >
      <Share2 className="w-[18px] h-[18px]" aria-hidden />
    </button>
  );
  const friendButton = (() => {
    if (friendBusy) {
      return (
        <button type="button" disabled className={`${PROFILE_GHOST_BUTTON} flex-1`} style={{ color: PAPER }} aria-busy="true">
          <Loader2 className="w-[18px] h-[18px] animate-spin" aria-hidden />
          {t('common.loading')}
        </button>
      );
    }
    if (friendship === 'pending_received') {
      return (
        <button
          type="button"
          onClick={onFriendAction}
          className={`flex-1 inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition ${FOCUS_RING}`}
        >
          <UserCheck className="w-[18px] h-[18px]" aria-hidden />
          {t('profile.acceptRequestButton')}
        </button>
      );
    }
    if (friendship === 'pending_sent') {
      return (
        <button type="button" disabled className={`${PROFILE_GHOST_BUTTON} flex-1 disabled:opacity-80`} style={{ color: MIST }}>
          <Clock className="w-[18px] h-[18px] text-amber-300" aria-hidden />
          {t('profile.requestSentButton')}
        </button>
      );
    }
    return (
      <button type="button" onClick={onFriendAction} className={`${PROFILE_PRIMARY_BUTTON} flex-1`}>
        <UserPlus className="w-[18px] h-[18px]" aria-hidden />
        {t('profile.addFriendButton')}
      </button>
    );
  })();
  const footer =
    friendship === 'friends' ? (
      hasNumber && meSide && detail ? (
        <button type="button" onClick={() => setShareOpen(true)} className={`${PROFILE_PRIMARY_BUTTON} w-full`}>
          <Share2 className="w-[18px] h-[18px]" aria-hidden />
          {t('connection.footer.share')}
        </button>
      ) : undefined
    ) : (
      <div className="flex gap-2">
        {friendButton}
        {shareButton}
      </div>
    );

  return (
    <>
      <OracleSheet
        open={open}
        onClose={onClose}
        size="lg"
        title={t('connection.title')}
        subtitle={t('connection.subtitle', { username: other.username })}
        leading={<DuoAvatars me={meSide} other={otherSide} size={34} />}
        escapeEnabled={!shareOpen && !ratingOpen && !movie}
        footer={footer}
        bodyClassName="px-5 sm:px-7 pt-0 pb-8 space-y-9"
      >
        {detail ? (
          <>
            {hero}

            {detail.loves.length > 0 && (
              <Section id="loves" title={t('connection.loves.title')} hint={t('connection.loves.hint')}>
                <SharedLoves items={detail.loves} me={meSide} other={otherSide} onOpenTitle={openTitle} />
              </Section>
            )}

            {detail.hates.length > 0 && (
              <Section id="hates" title={t('connection.hates.title')} hint={t('connection.hates.hint')}>
                <SharedLoves items={detail.hates} me={meSide} other={otherSide} variant="hates" onOpenTitle={openTitle} />
              </Section>
            )}

            {detail.debates.length > 0 && (
              <Section id="debates" title={t('connection.debate.title')} hint={t('connection.debate.hint')}>
                <DebateTrack items={detail.debates} me={meSide} other={otherSide} onOpenTitle={openTitle} />
              </Section>
            )}

            {(showPersonas || showMoods) && (
              <Section id="personas" title={t('connection.persona.title')}>
                {showPersonas && meCode && otherCode && (
                  <PersonaFaceOff
                    me={{ user: meSide ?? {}, name: meName, code: meCode, entry: mePersona?.persona ?? null }}
                    other={{ user: otherSide, name: otherName, code: otherCode, entry: otherPersona?.persona ?? null }}
                  />
                )}
                {showMoods && mePersona && otherPersona && (
                  <div className={showPersonas ? 'mt-7' : ''}>
                    <p style={{ ...PIXEL, color: PAPER }} className="text-[16px] leading-tight">
                      {t('connection.moods.title')}
                    </p>
                    <p className="mt-1 mb-3 text-[13px] leading-snug" style={{ color: MIST }}>
                      {t('connection.moods.hint')}
                    </p>
                    <MoodMirror
                      me={meSide ?? {}}
                      other={otherSide}
                      meName={meName}
                      otherName={otherName}
                      meScores={mePersona.scores}
                      otherScores={otherPersona.scores}
                    />
                  </div>
                )}
              </Section>
            )}

            <Section id="watch" title={t('connection.watch.title')}>
              {mePersonaLoading ? (
                <div className="h-52 rounded-2xl bg-white/[0.03] motion-safe:animate-pulse" aria-hidden />
              ) : (
                <WatchTogether me={meSide} other={otherSide} defaultMoods={defaultMoods} onOpenTitle={openTitle} />
              )}
            </Section>

            {showCalibrate && (
              <Section
                id="calibrate"
                title={t('connection.calibrate.title')}
                hint={t('connection.calibrate.hint')}
                action={
                  added > 0 ? (
                    <span className="shrink-0 flex flex-col items-end gap-1 text-right">
                      <span
                        className="inline-flex items-center h-6 px-2 rounded-full text-[12.5px] font-medium"
                        style={{ color: '#86EFAC', background: 'rgba(134,239,172,0.12)', boxShadow: 'inset 0 0 0 1px rgba(134,239,172,0.35)' }}
                      >
                        {t('connection.calibrate.added', { count: added })}
                      </span>
                      {hasNumber && (
                        <span className="text-[12px]" style={{ color: MIST }}>
                          {t('connection.calibrate.now', { value: formatConnection(pct) })}
                        </span>
                      )}
                    </span>
                  ) : undefined
                }
              >
                <CalibrateRow
                  items={detail.calibrate}
                  other={otherSide}
                  onSheetChange={setRatingOpen}
                  onRated={() => {
                    setAdded((n) => n + 1);
                    reload();
                  }}
                />
              </Section>
            )}
          </>
        ) : (
          <div className="pt-6 space-y-4" aria-hidden>
            <div className="h-56 rounded-2xl bg-white/[0.04] motion-safe:animate-pulse" />
            <div className="h-40 rounded-2xl bg-white/[0.03] motion-safe:animate-pulse" />
          </div>
        )}
      </OracleSheet>

      {shareOpen && detail && meSide && (
        <ConnectionShareSheet open={shareOpen} onClose={() => setShareOpen(false)} detail={detail} me={meSide} other={otherSide} />
      )}

      {/* Avaliar pelos detalhes também muda a conexão. */}
      {movie && <MovieDetailsModal movie={movie} isOpen={true} onClose={() => setMovie(null)} onAddToLibrary={reload} />}
    </>
  );
};

export default ConnectionSheet;
