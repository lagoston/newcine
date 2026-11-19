import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Film } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PAPER, INK, MIST, PIXEL, FOCUS_RING, ORACLE_BY_ID, OracleId } from '../../lib/oracleTheme';
import { BUBBLE_BG } from './shared';

// Selos dos oráculos cuja pool tem esse filme — cada um com a sua frase, num
// balão que aparece sozinho 2s depois de abrir, fica o tempo de ler (6s a
// 11s) e alterna a qualquer toque.
//
// 18/11/2026 (otimização): os balões e os temporizadores deles moram aqui.
// Antes, cada balão que aparecia ou sumia sozinho re-renderizava a ficha
// inteira (4 a 5 renders com o menu parado); agora só esta seção.

interface OracleSealsProps {
  // os oráculos com selo e a frase de cada um (useOracleComments, na casca)
  sources: string[];
  phrases: Record<string, string>;
}

type BubbleTimers = Record<string, { showTimer?: ReturnType<typeof setTimeout>; hideTimer?: ReturnType<typeof setTimeout> }>;
const NONE_VISIBLE: Set<string> = new Set();

const OracleSeals: React.FC<OracleSealsProps> = ({ sources, phrases }) => {
  const { t } = useTranslation();
  // Controla quais balões estão visíveis agora (não "dispensados" — o padrão
  // é começar ESCONDIDO e aparecer sozinho depois de um tempo, ver useEffect
  // abaixo). Um toque no selo ou no balão alterna manualmente e cancela
  // qualquer temporizador pendente daquele oráculo.
  const [visible, setVisible] = useState<Set<string>>(NONE_VISIBLE);
  const timersRef = useRef<BubbleTimers>({});

  const clearTimers = (source: string) => {
    const timers = timersRef.current[source];
    if (timers?.showTimer) clearTimeout(timers.showTimer);
    if (timers?.hideTimer) clearTimeout(timers.hideTimer);
    timersRef.current[source] = {};
  };

  const toggle = (source: string, e: React.MouseEvent) => {
    e.stopPropagation();
    // O toque "quebra a cadeia" — cancela as aparições/desaparições
    // automáticas pendentes, e dali em diante é controle manual. Um balão
    // por vez: abrir o de um oráculo fecha o do outro (os selos ficam
    // lado a lado e os balões se cobririam).
    Object.keys(timersRef.current).forEach(clearTimers);
    setVisible((prev) => (prev.has(source) ? new Set() : new Set([source])));
  };

  useEffect(() => {
    const record = timersRef.current;
    const clearAll = () =>
      Object.keys(record).forEach((source) => {
        const timers = record[source];
        if (timers?.showTimer) clearTimeout(timers.showTimer);
        if (timers?.hideTimer) clearTimeout(timers.hideTimer);
        record[source] = {};
      });
    // Limpa temporizadores do filme anterior antes de trocar — evita um
    // balão do filme antigo aparecer sozinho depois que o usuário já
    // navegou pra outro filme.
    clearAll();
    setVisible((prev) => (prev.size === 0 ? prev : NONE_VISIBLE));

    // Temporizador por selo: o primeiro balão aparece sozinho 2s depois
    // de abrir o modal e fica o tempo de ler o comentário (de 6s a 11s,
    // conforme o tamanho); os seguintes entram em fila, um de cada vez.
    // Um toque a qualquer momento cancela esse ciclo (ver toggle).
    let startAt = 2000;
    sources.filter((source) => !!phrases[source]).forEach((source) => {
      const duration = Math.min(11000, Math.max(6000, 2000 + phrases[source].length * 50));
      const showTimer = setTimeout(() => {
        setVisible(new Set([source]));
        const hideTimer = setTimeout(() => {
          setVisible((prev) => {
            if (!prev.has(source)) return prev;
            const next = new Set(prev);
            next.delete(source);
            return next;
          });
        }, duration);
        record[source] = { ...record[source], hideTimer };
      }, startAt);
      record[source] = { showTimer };
      startAt += duration + 500;
    });

    return clearAll;
  }, [sources, phrases]);

  if (sources.length === 0) return null;

  return (
    <div className="absolute bottom-0.5 left-0.5 z-20 flex items-end">
      {sources.map((source) => {
        const oracle = ORACLE_BY_ID[source as OracleId];
        const phrase = phrases[source];
        const showBubble = !!phrase && visible.has(source);
        return (
          <div key={source} className="relative">
            <button
              type="button"
              onClick={(e) => toggle(source, e)}
              aria-label={t('movieModal.oracleSays', { name: oracle?.name || source })}
              aria-expanded={showBubble}
              className={`grid place-items-center w-11 h-11 rounded-full ${FOCUS_RING}`}
            >
              {oracle ? (
                <img
                  src={oracle.avatar}
                  alt=""
                  width={28}
                  height={28}
                  className="w-7 h-7 rounded-full object-cover"
                  style={{ boxShadow: `0 0 0 2px ${oracle.color}, 0 6px 14px -4px rgba(0,0,0,0.85)` }}
                />
              ) : (
                <span className="grid place-items-center w-7 h-7 rounded-full" style={{ background: BUBBLE_BG, color: MIST }}>
                  <Film className="w-3.5 h-3.5" aria-hidden />
                </span>
              )}
            </button>
            <AnimatePresence>
              {showBubble && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  transition={{ duration: 0.2 }}
                  className="absolute bottom-full left-1 mb-1 w-52 z-30 cursor-pointer"
                  onClick={(e) => toggle(source, e)}
                >
                  <div
                    className="relative rounded-xl px-3 py-2 shadow-2xl"
                    style={{ background: PAPER, color: INK, borderLeft: `4px solid ${oracle?.color || MIST}` }}
                  >
                    {oracle && <p style={PIXEL} className="text-[13px] leading-none mb-1">{oracle.name}</p>}
                    <p className="text-[11px] italic leading-snug">“{phrase}”</p>
                    <span
                      aria-hidden
                      className="absolute top-full left-4 w-0 h-0 border-x-[6px] border-x-transparent border-t-[7px]"
                      style={{ borderTopColor: PAPER }}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
};

export default React.memo(OracleSeals);
