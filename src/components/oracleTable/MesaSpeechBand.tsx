import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { MIST } from '../../lib/oracleTheme';
import type { Speaker, Spoken } from '../../lib/mesa/dialogue/types';
import SignedBalloon from './SignedBalloon';

// A faixa de fala (SPEC §3.2), 05/11/2026: altura fixa (56 px; 64 no
// computador), um balão por vez, com o rabicho apontando para a carta de quem
// fala. Um toque avança. Quando a fila acaba, a última fala continua ali,
// apagada. Para leitor de tela, um aria-live com "Nome: texto".

const NAME: Record<Speaker, string> = { bogart: 'Bogart', fincher: 'Fincher', cypher: 'Cypher', espelho: '' };

interface BandProps {
  current: Spoken | null;
  last: Spoken | null;
  onSkip: () => void;
  reduced: boolean;
  tailFor: (who: Speaker) => string | null;
  loading: boolean;
}

const MesaSpeechBand: React.FC<BandProps> = ({ current, last, onSkip, reduced, tailFor, loading }) => {
  const { t } = useTranslation();
  const line = current ?? last;
  const name = line ? (line.who === 'espelho' ? t('mesa.espelho.name') : NAME[line.who]) : '';
  return (
    <div className="ms-speech">
      <p className="sr-only" aria-live="polite">
        {current ? `${name}: ${current.text}` : ''}
      </p>
      <AnimatePresence mode="wait" initial={false}>
        {line ? (
          <motion.div
            key={`${line.id}-${line.exchange?.part ?? 0}`}
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 6 }}
            animate={{ opacity: current ? 1 : 0.55, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <SignedBalloon
              who={line.who}
              text={line.text}
              name={name}
              variant="band"
              reduced={reduced || !current}
              tailX={tailFor(line.who)}
              onClick={current ? onSkip : undefined}
              style={{ cursor: current ? 'pointer' : 'default' }}
            />
            {current && (
              <button type="button" onClick={onSkip} className="sr-only focus:not-sr-only">
                {t('mesa.speech.next')}
              </button>
            )}
          </motion.div>
        ) : (
          <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-[50px] grid place-items-center">
            {loading && (
              <span className="text-[18px] tracking-[0.3em]" style={{ color: MIST, opacity: 0.6 }} aria-hidden>
                …
              </span>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default MesaSpeechBand;
