import React from 'react';
import { useTranslation } from 'react-i18next';
import { PIXEL, MIST, withAlpha } from '../../lib/oracleTheme';
import { connectionTone, formatConnection, confidenceKey, type ConnectionConfidence } from '../../lib/connection';

// A conexão com alguém, como um selo pequeno (13/10/2026): "87%" (ou "~72%"
// na prévia) na cor da faixa, sobre um fundo da mesma cor. O número está
// sempre escrito; a cor nunca é o único sinal. Sem número, não aparece.

interface ConnectionChipProps {
  pct: number | null | undefined;
  confidence: ConnectionConfidence | 'none' | null | undefined;
  size?: 'sm' | 'md';
  // Escreve "conexão" ao lado.
  withLabel?: boolean;
  className?: string;
}

export const TonePill: React.FC<{ color: string; size?: 'sm' | 'md'; children: React.ReactNode; title?: string }> = ({
  color,
  size = 'sm',
  children,
  title,
}) => (
  <span
    title={title}
    className={`inline-flex items-center justify-center shrink-0 rounded-full tabular-nums leading-none ${size === 'md' ? 'h-7 px-2.5 text-[15px]' : 'h-6 px-2 text-[13px]'}`}
    style={{ ...PIXEL, color, background: withAlpha(color, 0.12), boxShadow: `inset 0 0 0 1px ${withAlpha(color, 0.35)}` }}
  >
    {children}
  </span>
);

const ConnectionChip: React.FC<ConnectionChipProps> = ({ pct, confidence, size = 'sm', withLabel = false, className = '' }) => {
  const { t } = useTranslation();
  if (pct === null || pct === undefined || !confidence || confidence === 'none') return null;
  const tone = connectionTone(pct);
  const text = formatConnection(pct);
  const label = `${text} ${t('connection.label')} · ${t(confidenceKey(confidence))}`;
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`} aria-label={label} title={label}>
      <TonePill color={tone.color} size={size}>
        {text}
      </TonePill>
      {withLabel && (
        <span className="text-[12px]" style={{ color: MIST }}>
          {t('connection.label')}
        </span>
      )}
    </span>
  );
};

export default ConnectionChip;
