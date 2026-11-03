import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft } from 'lucide-react';
import { loadJackpotFont } from '../../../lib/posterJackpot';
import '../../../styles/posterJackpot.css';
import '../../../styles/poker.css';

// Salão fechado para esta conta (03/11/2026): o main publica sozinho, então quem
// não está liberado no servidor vê só o letreiro e o caminho de volta.
const ComingSoon: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  useEffect(() => {
    loadJackpotFont();
  }, []);
  return (
    <main className="pk-lobby grid place-items-center">
      <div className="pj-stars" aria-hidden />
      <div className="pk-lobby-inner text-center grid gap-4 justify-items-center">
        <div className="pk-marquee">
          <div className="pk-bulbrow mx-auto max-w-[240px]" aria-hidden>
            {Array.from({ length: 11 }, (_, i) => <i key={i} />)}
          </div>
          <h1 className="pk-display pj-gold-text">{t('poker.name')}</h1>
          <p>{t('poker.subtitle')}</p>
        </div>
        <p className="text-[16px] max-w-[300px]" style={{ color: '#F3EAD3' }}>{t('poker.soon')}</p>
        <button type="button" className="pk-cta-ghost" onClick={() => navigate('/')}>
          <ChevronLeft className="w-5 h-5" aria-hidden />
          {t('poker.lobby.back')}
        </button>
      </div>
    </main>
  );
};

export default ComingSoon;
