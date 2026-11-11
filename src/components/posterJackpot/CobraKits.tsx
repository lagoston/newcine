import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Check, Loader2, Lock, Sparkles, User } from 'lucide-react';
import { FlipFrame } from '../kitFrames/FlipFrame';
import { banners, type BannerId } from '../../lib/banners';
import { frames, type FrameId } from '../../lib/frames';
import { fetchCobraKits, fetchMyLook, kitName, type CobraKit, type CobraKitsState, type MyLook } from '../../lib/cobraKits';
import { useAuth } from '../../lib/auth';
import { PAPER, MIST, NIGHT, FOCUS_RING } from '../../lib/oracleTheme';
import '../../styles/posterJackpot.css';

// Os kits da Cobra na gaveta do Poster Jackpot (11/11/2026): a prévia do kit
// com a cara da pessoa (o banner com a foto dela dentro da moldura do kit), a
// revelação quando um giro com ficha especial traz um kit e a prateleira dos
// cinco kits na Coleção (os que faltam ficam em silhueta, como no pôquer).

const COBRA_AVATAR = '/avatar-cobra.webp';

// Os kits (com "tenho"), a chance, as revelações pendentes e a cara da
// pessoa (foto, nome, moldura e banner em uso).
export function useCobraKits() {
  const { session } = useAuth();
  const uid = session?.user?.id;
  const [state, setState] = useState<CobraKitsState | null>(null);
  const [look, setLook] = useState<MyLook | null>(null);
  const reload = useCallback(async (): Promise<CobraKitsState | null> => {
    try {
      const next = await fetchCobraKits();
      setState(next);
      return next;
    } catch (error) {
      console.error('Kits da Cobra:', error);
      return null;
    }
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);
  useEffect(() => {
    if (!uid) return;
    fetchMyLook(uid)
      .then(setLook)
      .catch((error) => console.error('Kits da Cobra (perfil):', error));
  }, [uid]);
  return { state, look, setLook, reload };
}

// O banner do kit com a foto da pessoa na moldura do kit.
export const KitPreview: React.FC<{
  kit: CobraKit;
  avatarUrl: string | null;
  username?: string;
  size?: 'lg' | 'sm';
  locked?: boolean;
}> = ({ kit, avatarUrl, username = '', size = 'sm', locked = false }) => {
  const banner = banners[kit.banner_id as BannerId];
  const frame = frames[kit.frame_id as FrameId];
  const avatarSize = size === 'lg' ? 84 : 56;
  // Trancado: a moldura não gira (só a frente, sem foto) e o banner fica em
  // silhueta preto e branco.
  const avatar =
    !locked && avatarUrl ? (
      <FlipFrame frameId={kit.frame_id} src={avatarUrl} alt="" size={avatarSize} />
    ) : (
      <span
        className={`block shrink-0 rounded-full overflow-hidden ${frame?.className ?? ''}`}
        style={{ width: avatarSize, height: avatarSize, background: NIGHT, animation: 'none' }}
      >
        <span className="w-full h-full grid place-items-center" style={{ color: MIST }}>
          {locked ? <Lock style={{ width: avatarSize * 0.32, height: avatarSize * 0.32 }} aria-hidden /> : <User style={{ width: avatarSize * 0.42, height: avatarSize * 0.42 }} aria-hidden />}
        </span>
      </span>
    );
  return (
    <span
      className={`relative block w-full overflow-hidden rounded-2xl ${banner?.className ?? ''} ${size === 'lg' ? 'h-36' : 'h-24'}`}
      style={locked ? { filter: 'grayscale(1) brightness(0.42) contrast(1.1)' } : undefined}
      aria-hidden
    >
      <span className={`relative z-10 flex items-center h-full ${size === 'lg' ? 'gap-3.5 px-5' : 'gap-3 px-4'}`}>
        {avatar}
        {size === 'lg' && username && (
          <span className="min-w-0 text-left text-[15px] font-bold truncate drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]" style={{ color: PAPER }}>
            @{username}
          </span>
        )}
      </span>
    </span>
  );
};

// A revelação: a faixa "Item da Cobra", o kit com a cara da pessoa, o nome,
// Usar o kit e Voltar à roleta. Cobre a máquina, como a do pôster.
export const KitReveal: React.FC<{
  kit: CobraKit;
  avatarUrl: string | null;
  username: string;
  reduceMotion: boolean;
  equipping: boolean;
  equipped: boolean;
  onEquip: () => void;
  onClose: () => void;
}> = ({ kit, avatarUrl, username, reduceMotion, equipping, equipped, onEquip, onClose }) => {
  const { t, i18n } = useTranslation();
  const isPt = i18n.language.startsWith('pt');
  const name = kitName(kit, isPt);
  return (
    <motion.div
      key="kit-reveal"
      role="dialog"
      aria-modal="false"
      aria-label={t('jackpot.kits.revealAria', { name })}
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="absolute inset-0 z-20 overflow-hidden rounded-[30px]"
      style={{ background: 'radial-gradient(70% 55% at 50% 42%, rgba(61,220,151,0.2), transparent 70%), linear-gradient(180deg, #0b2a22, #08181a 60%, #120a2a)' }}
    >
      <span className="pj-stars" aria-hidden />
      <div className="relative h-full overflow-y-auto py-6 sm:py-7 px-5 flex flex-col items-center justify-center text-center">
        <motion.span
          initial={reduceMotion ? false : { opacity: 0, y: -8, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="pj-contract-ribbon mb-2.5 shrink-0"
        >
          <img src={COBRA_AVATAR} alt="" className="w-[18px] h-[18px] -ml-1 rounded-full" />
          {t('jackpot.kits.ribbon')}
        </motion.span>
        <p className="text-[13px] leading-snug" style={{ color: '#CFE9DA' }}>
          {t('jackpot.kits.revealLead')}
        </p>
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 16, scale: 0.92 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 170, damping: 16, delay: 0.15 }}
          className="mt-4 w-full max-w-[380px] shrink-0 rounded-2xl shadow-[0_24px_50px_-18px_rgba(0,0,0,0.95)]"
        >
          <KitPreview kit={kit} avatarUrl={avatarUrl} username={username} size="lg" />
        </motion.div>
        <motion.div initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45 }}>
          <p className="pj-display pj-gold-text mt-4 text-[24px] sm:text-[30px] font-black leading-none">{name}</p>
          <p className="mt-2 text-[13px]" style={{ color: MIST }}>
            {t('jackpot.kits.contents')}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={onEquip}
              disabled={equipping || equipped}
              className={`pj-spin inline-flex items-center gap-1.5 h-11 px-5 rounded-full text-sm font-bold transition disabled:opacity-80 ${FOCUS_RING}`}
            >
              {equipping ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : equipped ? <Check className="w-4 h-4" aria-hidden /> : <Sparkles className="w-4 h-4" aria-hidden />}
              {equipped ? t('jackpot.kits.inUse') : t('jackpot.kits.use')}
            </button>
            <button
              type="button"
              onClick={onClose}
              className={`inline-flex items-center gap-1.5 h-11 px-5 rounded-full text-sm font-semibold transition hover:bg-white/10 ${FOCUS_RING}`}
              style={{ color: '#FFE8A3', boxShadow: 'inset 0 0 0 1.5px rgba(244,196,84,0.7)' }}
            >
              {t('jackpot.machine.back')}
            </button>
          </div>
          <p className="mt-3 text-xs" style={{ color: MIST }}>
            {equipped ? t('jackpot.kits.usedHint') : t('jackpot.kits.savedHint')}
          </p>
        </motion.div>
      </div>
    </motion.div>
  );
};

// A prateleira dos kits na Coleção.
export const CobraKitShelf: React.FC<{
  kits: CobraKit[];
  chance: number;
  avatarUrl: string | null;
  inUse: (kit: CobraKit) => boolean;
  busyId: string | null;
  onUse: (kit: CobraKit) => void;
}> = ({ kits, chance, avatarUrl, inUse, busyId, onUse }) => {
  const { t, i18n } = useTranslation();
  const isPt = i18n.language.startsWith('pt');
  const owned = kits.filter((k) => k.owned).length;
  return (
    <section className="mt-8" aria-labelledby="cobra-kits-title">
      <div className="flex items-end justify-between gap-3">
        <h3 id="cobra-kits-title" className="pj-display pj-gold-text text-[19px] sm:text-[21px] font-black leading-none inline-flex items-center gap-2">
          <img src={COBRA_AVATAR} alt="" className="w-6 h-6 rounded-full" />
          {t('jackpot.kits.shelfTitle')}
        </h3>
        <span className="text-[12.5px] tabular-nums" style={{ color: MIST }}>
          {t('jackpot.kits.count', { owned, total: kits.length })}
        </span>
      </div>
      <p className="mt-1.5 text-[12.5px] leading-snug" style={{ color: MIST }}>
        {t('jackpot.kits.shelfHint', { pct: Math.round(chance * 100) })}
      </p>
      <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {kits.map((kit) => {
          const using = kit.owned && inUse(kit);
          return (
            <li key={kit.id} className="rounded-2xl p-2 pb-2.5" style={{ background: 'rgba(255,255,255,0.03)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)' }}>
              <KitPreview kit={kit} avatarUrl={avatarUrl} locked={!kit.owned} />
              <div className="mt-2 px-1.5 flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-[13.5px] font-semibold" style={{ color: kit.owned ? PAPER : MIST }}>
                  {kitName(kit, isPt)}
                </span>
                {kit.owned ? (
                  using ? (
                    <span className="shrink-0 inline-flex items-center gap-1 text-[12px] font-semibold" style={{ color: '#A7F3D0' }}>
                      <Check className="w-3.5 h-3.5" aria-hidden />
                      {t('jackpot.kits.inUse')}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onUse(kit)}
                      disabled={busyId !== null}
                      className={`shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[12.5px] font-bold transition hover:bg-white/10 disabled:opacity-60 ${FOCUS_RING}`}
                      style={{ color: '#FFE8A3', boxShadow: 'inset 0 0 0 1.5px rgba(244,196,84,0.7)' }}
                    >
                      {busyId === kit.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <Sparkles className="w-3.5 h-3.5" aria-hidden />}
                      {t('jackpot.kits.use')}
                    </button>
                  )
                ) : (
                  <span className="shrink-0 inline-flex items-center gap-1 text-[12px]" style={{ color: MIST }}>
                    <Lock className="w-3 h-3" aria-hidden />
                    {t('jackpot.kits.lockedChip')}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
