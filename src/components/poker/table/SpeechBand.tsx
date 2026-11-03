import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { PIXEL } from '../../../lib/oracleTheme';
import type { SpeechItem } from '../../../lib/poker/client/useDirector';
import { ORACLE_COLOR } from '../../../lib/poker/client/cosmetics';

// A faixa de fala (SPEC §7.3): reservada, na largura inteira, sempre com duas
// linhas, para nenhum balão cobrir carta, aposta ou pote. O rabicho aponta para
// quem fala. Cada um tem a sua assinatura: o Sapo com bolhas, a Cobra em
// zigue-zague com o texto "digitado" em até 400 ms, o Raposo como intertítulo de
// cinema mudo. Um toque passa para a próxima.

const TAIL_X: Record<string, string> = { bogart: '17%', fincher: '50%', cypher: '83%', human: '50%' };

const Typed: React.FC<{ text: string; ms: number; off: boolean }> = ({ text, ms, off }) => {
  const [n, setN] = useState(off ? text.length : 0);
  useEffect(() => {
    if (off) {
      setN(text.length);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const tick = () => {
      const k = Math.min(1, (performance.now() - start) / ms);
      setN(Math.ceil(k * text.length));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [text, ms, off]);
  return (
    <>
      {text.slice(0, n)}
      <span style={{ opacity: 0 }}>{text.slice(n)}</span>
    </>
  );
};

// `ribbon` (03/11/2026, Pôster Poker): a faixa do efeito em vigor (o alvo do Raymond, a
// opala…), que ocupa a faixa de fala só quando ninguém fala.
const SpeechBand: React.FC<{ speech: SpeechItem | null; onSkip: () => void; reduced: boolean; hint?: React.ReactNode; ribbon?: React.ReactNode }> = ({
  speech,
  onSkip,
  reduced,
  hint,
  ribbon,
}) => {
  const { t } = useTranslation();
  const who = speech?.speaker ?? null;
  const color = who ? ORACLE_COLOR[who] ?? '#F3EAD3' : '#F3EAD3';
  const name = who === 'human' ? t('poker.table.you') : who ? t(`poker.oracles.${who}.short`, { defaultValue: who }) : '';
  return (
    <div className="pk-speech" data-who={who ?? undefined}>
      <AnimatePresence mode="wait">
        {speech ? (
          <motion.div
            key={`${speech.lineId}-${speech.exchange?.part ?? 0}`}
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className={`pk-balloon is-${who}`}
            style={{ '--c': color } as React.CSSProperties}
            onClick={onSkip}
            role="button"
            tabIndex={-1}
            aria-label={`${name}: ${speech.text}`}
          >
            <span className="pk-balloon-tail" style={{ left: TAIL_X[who ?? 'fincher'] ?? '50%' }} aria-hidden />
            {who === 'cypher' && <span className="pk-zig" aria-hidden />}
            <p className="pk-balloon-text" aria-hidden>
              <span className="pk-balloon-name" style={{ ...PIXEL, color: who === 'human' ? '#5A3E1A' : color }}>
                {name}
              </span>
              {who === 'cypher' ? <Typed text={speech.text} ms={380} off={reduced} /> : speech.text}
            </p>
          </motion.div>
        ) : hint ? (
          <motion.div key="hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="pk-balloon is-fincher" style={{ '--c': '#EE7A3E' } as React.CSSProperties}>
            <span className="pk-balloon-tail" style={{ left: '50%' }} aria-hidden />
            <p className="pk-balloon-text">{hint}</p>
          </motion.div>
        ) : ribbon ? (
          <motion.div key="ribbon" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            {ribbon}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
};

export default SpeechBand;
