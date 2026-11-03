import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import OracleSheet from '../../OracleSheet';
import { FOCUS_RING, MIST, PAPER } from '../../../lib/oracleTheme';
import { confirmPokerAge } from '../jackpot/entryApi';
import '../../../styles/posterJackpot.css';
import '../../../styles/pokerEntry.css';

// Confirmação 18+ autodeclarada (veredito Q12; SPEC §7.8): aparece antes da
// primeira partida valendo prêmio (e antes de qualquer partida se o servidor
// ligar casino_age_gate). [Tenho 18 ou mais] grava no servidor
// (poker_confirm_age) e só então chama onConfirmed; [Agora não] fecha e a
// mesa livre continua disponível.
//
// Uso (pacote D1, no lobby ou em /blefe/premio):
//   <AgeGate open={needAge} onConfirmed={() => startBounty()} onClose={() => setNeedAge(false)} />
// onConfirmed roda depois que o servidor confirmou; a folha não fecha
// sozinha — quem chama decide (em geral fecha e segue para a mesa).

export interface AgeGateProps {
  open: boolean;
  onConfirmed: () => void;
  onClose: () => void;
  // Camada da folha: por cima da gaveta do Jackpot por padrão.
  zIndexClass?: string;
}

const AgeGate: React.FC<AgeGateProps> = ({ open, onConfirmed, onClose, zIndexClass = 'z-[10005]' }) => {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await confirmPokerAge();
      onConfirmed();
    } catch (error) {
      console.error('Poker age gate:', error);
      toast.error(t('pokerEntry.age.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <OracleSheet open={open} onClose={busy ? () => undefined : onClose} title={t('pokerEntry.age.title')} size="md" zIndexClass={zIndexClass}>
      <div className="pb-2 text-center">
        <div className="pe-velvet relative mx-auto grid place-items-center w-[92px] h-[92px] rounded-full">
          <span
            className="grid place-items-center w-[74px] h-[74px] rounded-full text-[28px] font-extrabold leading-none"
            style={{ color: '#FFE8A3', boxShadow: 'inset 0 0 0 1.5px rgba(244,196,84,0.75)', background: 'rgba(46,11,20,0.55)' }}
            aria-hidden
          >
            18+
          </span>
        </div>
        <p className="mx-auto mt-4 max-w-[34ch] text-[15px] leading-relaxed" style={{ color: PAPER }}>
          {t('pokerEntry.age.body')}
        </p>
        <p className="mx-auto mt-2 max-w-[38ch] text-[13px] leading-relaxed" style={{ color: MIST }}>
          {t('pokerEntry.age.note')}
        </p>
        <div className="mt-5 grid gap-2.5">
          <button
            type="button"
            onClick={confirm}
            disabled={busy}
            className={`pj-spin inline-flex items-center justify-center gap-2 h-12 rounded-full text-[15px] font-bold disabled:opacity-80 ${FOCUS_RING}`}
          >
            {busy && <Loader2 className="relative w-4 h-4 animate-spin" aria-hidden />}
            <span className="relative">{t('pokerEntry.age.confirm')}</span>
          </button>
          <button type="button" onClick={onClose} disabled={busy} className={`pe-ghost h-11 rounded-full text-[14px] font-semibold disabled:opacity-60 ${FOCUS_RING}`}>
            {t('pokerEntry.age.decline')}
          </button>
        </div>
      </div>
    </OracleSheet>
  );
};

export { AgeGate };
export default AgeGate;
