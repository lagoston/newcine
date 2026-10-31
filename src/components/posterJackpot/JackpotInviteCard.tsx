import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import PosterArt from './PosterArt';
import { FOCUS_RING } from '../../lib/oracleTheme';
import { fetchJackpotCatalog, loadJackpotFont, type CatalogPoster, type PosterEffect } from '../../lib/posterJackpot';
import '../../styles/posterJackpot.css';

// O convite do lançamento do Poster Jackpot nos sussurros (31/10/2026): um
// mini palco com o céu estrelado, a moldura dourada em arco, três pôsteres
// lendários em leque (o do meio holográfico) e o "Jogar agora".

export const LAUNCH_GIFT = 3;

// Se o catálogo não vier, estes três (lendários do lote 3) seguram o leque.
const FALLBACK = ['/d2oMUQaCJzlLctiGlXQ7pm87uyy.jpg', '/8LGB9KHsNVllGcQnDq0rhxmsYoz.jpg', '/4CArEDxO6jANdaU3H0bOGwACQGO.jpg'];
const FAN: { rotate: number; x: number; y: number; effect: PosterEffect; z: number }[] = [
  { rotate: -12, x: -46, y: 8, effect: 'none', z: 1 },
  { rotate: 12, x: 46, y: 8, effect: 'negative', z: 1 },
  { rotate: 0, x: 0, y: 0, effect: 'holo', z: 2 },
];

const JackpotInviteCard: React.FC<{ onPlay: () => void }> = ({ onPlay }) => {
  const { t } = useTranslation();
  const [catalog, setCatalog] = useState<CatalogPoster[]>([]);

  useEffect(() => {
    loadJackpotFont();
    fetchJackpotCatalog()
      .then(setCatalog)
      .catch(() => undefined);
  }, []);

  const posters = useMemo(() => {
    const legendary = catalog.filter((p) => p.rarity === 'legendary').map((p) => p.file_path);
    const pool = legendary.length >= 3 ? legendary : FALLBACK;
    // Três diferentes, sorteados uma vez.
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 3);
  }, [catalog]);

  return (
    <div className="mt-3 pj-stage-frame" style={{ borderRadius: '50% 50% 22px 22px / 44px 44px 22px 22px' }}>
      <div className="pj-stage px-4 pt-8 pb-5 text-center" style={{ borderRadius: '50% 50% 19px 19px / 41px 41px 19px 19px' }}>
        <span className="pj-stars" aria-hidden />
        <div className="relative mx-auto h-[150px] w-[220px]" aria-hidden>
          {posters.map((file, i) => (
            <span
              key={`${file}:${i}`}
              className="absolute left-1/2 top-1/2 w-[78px]"
              style={{ transform: `translate(calc(-50% + ${FAN[i].x}px), calc(-50% + ${FAN[i].y}px)) rotate(${FAN[i].rotate}deg)`, zIndex: FAN[i].z }}
            >
              <PosterArt filePath={file} effect={FAN[i].effect} size="w185" className="aspect-[2/3] rounded-lg shadow-[0_14px_26px_-10px_rgba(0,0,0,0.95)]" />
            </span>
          ))}
        </div>
        <p className="relative pj-display pj-gold-text mt-3 text-[26px] font-black leading-none">Poster Jackpot</p>
        <p className="relative mt-2.5 mx-auto max-w-sm text-[13.5px] leading-relaxed" style={{ color: '#E4DDF7' }}>
          {t('jackpot.launch.body')}
        </p>
        <p className="relative mt-2 text-[13px] font-semibold" style={{ color: '#FFE8A3' }}>
          {t('jackpot.launch.gift', { count: LAUNCH_GIFT })}
        </p>
        <button
          type="button"
          onClick={onPlay}
          className={`relative pj-spin pj-ready mt-4 inline-flex items-center justify-center gap-2 h-12 px-7 rounded-full pj-display text-[18px] font-black ${FOCUS_RING}`}
        >
          <Sparkles className="w-4 h-4" aria-hidden />
          <span className="relative">{t('jackpot.launch.play')}</span>
        </button>
      </div>
    </div>
  );
};

export default JackpotInviteCard;
