import React from 'react';
import { useTranslation } from 'react-i18next';
import { Spade } from 'lucide-react';
// 04/11/2026: o selo importa o próprio CSS. O fundo de veludo (.pe-velvet) mora
// em pokerEntry.css, que só as telas do pôquer carregavam: dentro da gaveta do
// Jackpot, sem nenhuma tela do pôquer aberta antes, o selo aparecia sem fundo.
// O arquivo só tem seletores .pe-*, então não mexe em mais nada da gaveta.
import '../../../styles/pokerEntry.css';

// Selo "Prêmio da mesa" (03/11/2026): marca na Coleção o pôster ganho no
// Grande Blefe, que não entra em trocas (user_posters.tradeable = false).
// `size="xs"` cabe no canto da miniatura; `md` vai no detalhe do pôster.
const TablePrizeSeal: React.FC<{ size?: 'xs' | 'md'; className?: string }> = ({ size = 'md', className = '' }) => {
  const { t } = useTranslation();
  const small = size === 'xs';
  return (
    <span
      className={`pe-velvet inline-flex items-center gap-1 rounded-full font-semibold leading-none ${small ? 'h-[18px] px-1.5 text-[9.5px]' : 'h-6 px-2.5 text-[11.5px]'} ${className}`}
      style={{ color: '#FFE8A3' }}
      title={small ? t('pokerEntry.trades.sealHint') : undefined}
    >
      <Spade className={small ? 'w-2.5 h-2.5' : 'w-3 h-3'} aria-hidden />
      {t('pokerEntry.trades.seal')}
    </span>
  );
};

export default TablePrizeSeal;
