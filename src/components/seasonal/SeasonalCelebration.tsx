import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Check, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';
import { PAPER, MIST, PIXEL, FOCUS_RING, withAlpha } from '../../lib/oracleTheme';
import { stepTextKey, type SeasonalEventState, type SeasonalStep, type SeasonalTheme } from '../../lib/seasonalEvents';
import { BatFlights, LightsGarland, MoonGlow, Snowfall } from './SeasonalArt';

// Comemoração de uma tag especial do evento: aparece por cima de qualquer
// página assim que o servidor concede a tag. A última etapa também avisa
// que o perfil foi decorado.

interface Props {
  steps: SeasonalStep[];
  event: SeasonalEventState;
  theme: SeasonalTheme;
  userId: string;
  onClose: () => void;
}

const SeasonalCelebration: React.FC<Props> = ({ steps, event, theme, userId, onClose }) => {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const primaryRef = useRef<HTMLButtonElement>(null);
  const [saving, setSaving] = useState(false);
  const [using, setUsing] = useState(false);

  const ordered = [...steps].sort((a, b) => a.index - b.index);
  const top = ordered[ordered.length - 1];
  const decorated = ordered.some((step) => step.tag === event.decoration_tag);

  useEffect(() => {
    primaryRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const wearTag = async () => {
    if (saving || using) return;
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({ active_tag: { category: 'special', name: top.name, emoji: top.emoji } })
      .eq('id', userId);
    setSaving(false);
    if (error) {
      toast.error(t('customize.updateError'));
      return;
    }
    setUsing(true);
    toast.success(t('customize.tagUpdated'));
  };

  return createPortal(
    <div className="fixed inset-0 z-[10050] grid place-items-center p-5" role="dialog" aria-modal="true" aria-labelledby="seasonal-celebration-title">
      <motion.div
        className="absolute inset-0 bg-black/75 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        onClick={onClose}
      />
      <motion.div
        className="relative w-full max-w-md rounded-3xl p-px"
        style={{ background: theme.border, boxShadow: `0 40px 90px -30px ${withAlpha(theme.accent, 0.6)}` }}
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.9, y: 16 }}
        animate={reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 240, damping: 22 }}
      >
        <div className="relative overflow-hidden rounded-[calc(1.5rem-1px)] px-6 pt-10 pb-6 sm:px-8 text-center" style={{ background: theme.panelBackground }}>
          {/* cena */}
          {theme.id === 'halloween' ? (
            <>
              <MoonGlow size={64} style={{ top: -18, right: -14 }} strength={0.75} />
              <BatFlights
                flights={[
                  { top: '14%', size: 22, dur: 9, delay: -2 },
                  { top: '30%', size: 15, dur: 13, delay: -8 },
                ]}
                color="#0B0612"
                glow={withAlpha(theme.accent, 0.5)}
              />
            </>
          ) : (
            <>
              <LightsGarland count={10} className="absolute inset-x-0 top-0" sag={9} bulb={7} />
              <Snowfall count={18} seed={11} speed={[7, 14]} opacity={[0.35, 0.8]} />
            </>
          )}

          <div className="relative">
            <p style={{ ...PIXEL, color: theme.accentText }} className="text-sm tracking-wide uppercase">
              {t('events.celebration.eyebrow', { count: ordered.length })}
            </p>

            <div className="mt-5 flex items-center justify-center gap-3">
              {ordered.map((step, i) => (
                <motion.span
                  key={step.tag}
                  className="grid place-items-center w-20 h-20 rounded-full text-[44px] leading-none"
                  style={{
                    background: `radial-gradient(circle, ${withAlpha(theme.glow, 0.35)}, ${withAlpha(theme.accent, 0.14)} 60%, transparent 72%)`,
                    boxShadow: `inset 0 0 0 2px ${withAlpha(theme.accent, 0.7)}, 0 0 36px ${withAlpha(theme.accent, 0.45)}`,
                  }}
                  initial={reduceMotion ? false : { scale: 0.3, rotate: -20, opacity: 0 }}
                  animate={{ scale: 1, rotate: 0, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 14, delay: 0.15 + i * 0.12 }}
                  aria-hidden
                >
                  {step.emoji}
                </motion.span>
              ))}
            </div>

            <h2 id="seasonal-celebration-title" style={{ ...PIXEL, color: PAPER }} className="mt-5 text-3xl leading-tight">
              {ordered.map((step) => step.name).join(' · ')}
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed" style={{ color: PAPER }}>
              {t(`events.${event.id}.steps.${stepTextKey(top)}.reward`)}
            </p>

            {decorated && (
              <p
                className="mt-4 flex items-start gap-2.5 rounded-2xl px-4 py-3 text-left text-sm leading-snug"
                style={{ background: withAlpha(theme.accent, 0.14), color: PAPER, boxShadow: `inset 0 0 0 1px ${withAlpha(theme.accent, 0.35)}` }}
              >
                <Sparkles className="w-4 h-4 mt-0.5 shrink-0" style={{ color: theme.glow }} aria-hidden />
                {t(`events.${event.id}.decorationHint`, { tag: top.name })}
              </p>
            )}

            <p className="mt-4 text-xs leading-relaxed" style={{ color: MIST }}>
              {t('events.celebration.forever', { count: ordered.length })}
            </p>

            <div className="mt-6 flex flex-col gap-2.5">
              <button
                ref={primaryRef}
                onClick={wearTag}
                disabled={saving}
                className={`inline-flex items-center justify-center gap-2 h-12 px-5 rounded-xl text-sm font-semibold transition hover:brightness-110 disabled:opacity-70 ${FOCUS_RING}`}
                style={{ background: theme.accent, color: theme.ink }}
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : using ? <Check className="w-4 h-4" aria-hidden /> : <span aria-hidden>{top.emoji}</span>}
                {using ? t('events.celebration.using') : t('events.celebration.useTag', { name: top.name })}
              </button>
              {decorated ? (
                <Link
                  to="/profile"
                  onClick={onClose}
                  className={`inline-flex items-center justify-center h-12 px-5 rounded-xl text-sm font-medium border border-white/20 hover:border-white/40 hover:bg-white/5 transition ${FOCUS_RING}`}
                  style={{ color: PAPER }}
                >
                  {t('events.viewProfile')}
                </Link>
              ) : (
                <button
                  onClick={onClose}
                  className={`inline-flex items-center justify-center h-12 px-5 rounded-xl text-sm font-medium border border-white/20 hover:border-white/40 hover:bg-white/5 transition ${FOCUS_RING}`}
                  style={{ color: PAPER }}
                >
                  {t('events.celebration.continue')}
                </button>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
};

export default SeasonalCelebration;
