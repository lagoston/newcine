import React from 'react';
import { useTranslation } from 'react-i18next';
import OracleSheet from '../OracleSheet';
import { MIST, PAPER, PIXEL, ORACLES } from '../../lib/oracleTheme';
import { useDialogFocus, useMesaLayerEntry } from './MesaLayer';
import { EyeMark } from './MesaArt';

// "Como a mesa funciona" (SPEC §2.2, menu ⋯), 05/11/2026: cinco parágrafos e,
// no computador, a linha dos atalhos.
const HowSheet: React.FC<{ open: boolean; onClose: () => void; desktop: boolean }> = ({ open, onClose, desktop }) => {
  const { t } = useTranslation();
  useMesaLayerEntry(open, onClose, { ownEscape: true, modal: true });
  useDialogFocus(open);
  return (
    <OracleSheet
      open={open}
      onClose={onClose}
      // Título em 20 px e sem o olho ao lado: a 360–390 px ele era cortado com
      // "…" (o mesmo caso do m3 do QA). O olho foi para a fileira dos retratos.
      title={<span style={{ fontSize: 20 }}>{t('mesa.how.title')}</span>}
      size="md"
    >
      <div className="flex items-center gap-2 mb-4" aria-hidden>
        <EyeMark size={30} className="mr-1" />
        {ORACLES.map((o) => (
          <img key={o.id} src={o.avatar} alt="" className="w-8 h-8 rounded-full object-cover" style={{ boxShadow: `0 0 0 1.5px ${o.color}` }} />
        ))}
      </div>
      <div className="space-y-3 text-[15px] leading-relaxed" style={{ color: PAPER }}>
        {(['p1', 'p2', 'p3', 'p4', 'p5'] as const).map((k) => (
          <p key={k}>{t(`mesa.how.${k}`)}</p>
        ))}
      </div>
      {desktop && (
        <p className="mt-5 text-[12px]" style={{ ...PIXEL, color: MIST }}>
          {t('mesa.kbd')}
        </p>
      )}
    </OracleSheet>
  );
};

export default HowSheet;
