import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { PAPER, PIXEL, FOCUS_RING, ORACLES, oracleCardImage, withAlpha } from '../../lib/oracleTheme';

// A porta da Biblioteca dos Oráculos no Oracle Hub (31/10/2026). Substitui o
// painel "Escolhidos a dedo": um botão do mesmo porte da porta do Poster
// Jackpot, mas no mundo dos oráculos — o tubo de neon nas três cores, as
// três cartas em leque (abrem um pouco ao passar o mouse), o letreiro em
// pixel com brilho e quantas prateleiras e títulos eles guardam.

let statsPromise: Promise<{ shelves: number; titles: number }> | null = null;
const loadStats = () => {
  if (!statsPromise) {
    statsPromise = (async () => {
      const { data, error } = await supabase.rpc('get_oracle_library_stats');
      if (error) throw error;
      const raw = (data || {}) as { shelves?: number; titles?: number };
      return { shelves: Number(raw.shelves) || 27, titles: Number(raw.titles) || 0 };
    })().catch((error) => {
      statsPromise = null;
      throw error;
    });
  }
  return statsPromise;
};

// Leque: Bogart à esquerda, Cypher à direita, Fincher no meio, na frente.
const FAN = [
  { id: 'bogart', rest: '[transform:translate(calc(-50%_-_30px),-46%)_rotate(-12deg)]', open: 'group-hover:[transform:translate(calc(-50%_-_38px),-48%)_rotate(-16deg)]', z: 1 },
  { id: 'cypher', rest: '[transform:translate(calc(-50%_+_30px),-46%)_rotate(12deg)]', open: 'group-hover:[transform:translate(calc(-50%_+_38px),-48%)_rotate(16deg)]', z: 1 },
  { id: 'fincher', rest: '[transform:translate(-50%,-52%)]', open: 'group-hover:[transform:translate(-50%,-56%)]', z: 2 },
] as const;

const OracleLibraryDoor: React.FC<{ cardStyle: string }> = ({ cardStyle }) => {
  const { t, i18n } = useTranslation();
  const [stats, setStats] = useState<{ shelves: number; titles: number } | null>(null);

  useEffect(() => {
    let alive = true;
    loadStats()
      .then((value) => alive && setStats(value))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  return (
    <Link
      to="/oracle/libraries?oracle=bogart"
      className={`group relative w-full flex items-center gap-4 sm:gap-6 text-left rounded-2xl pl-3 pr-3.5 py-3.5 sm:pl-5 sm:pr-5 sm:py-4 overflow-hidden transition hover:brightness-110 ${FOCUS_RING}`}
      style={{
        background: [
          ...ORACLES.map((oracle, i) => `radial-gradient(40% 90% at ${8 + i * 9}% 100%, ${withAlpha(oracle.color, 0.2)}, transparent 70%)`),
          'radial-gradient(70% 120% at 100% 0%, rgba(240,171,252,0.14), transparent 60%)',
          'linear-gradient(135deg, #160f2c, #0e0a1a 55%, #1a0f24)',
        ].join(', '),
        boxShadow: 'inset 0 0 0 1px rgba(243,234,211,0.14), 0 18px 40px -26px rgba(240,171,252,0.5)',
      }}
    >
      {/* O tubo de neon com as cores dos três oráculos. */}
      <span
        aria-hidden
        className="absolute left-5 right-5 top-0 h-[2px] rounded-full opacity-80 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background: `linear-gradient(90deg, ${ORACLES.map((o) => o.color).join(', ')})`,
          boxShadow: `0 0 10px 1px ${withAlpha(ORACLES[1].color, 0.55)}, 0 0 22px 2px ${withAlpha(ORACLES[0].color, 0.3)}`,
        }}
      />

      {/* As três cartas em leque */}
      <span className="relative shrink-0 w-[104px] h-[92px] sm:w-[128px] sm:h-[108px]" aria-hidden>
        {FAN.map((card) => {
          const oracle = ORACLES.find((o) => o.id === card.id)!;
          return (
            <img
              key={card.id}
              src={oracleCardImage(oracle.id, cardStyle)}
              alt=""
              decoding="async"
              draggable={false}
              className={`absolute left-1/2 top-1/2 w-[50px] sm:w-[60px] h-auto rounded-md transition-transform duration-300 ease-out ${card.rest} ${card.open}`}
              style={{ zIndex: card.z, boxShadow: `0 10px 20px -8px rgba(0,0,0,0.9), 0 0 16px -4px ${withAlpha(oracle.color, 0.7)}` }}
            />
          );
        })}
      </span>

      <span className="relative min-w-0 flex-1">
        <span
          style={{ ...PIXEL, color: PAPER, textShadow: '0 0 14px rgba(240,171,252,0.55)' }}
          className="block text-[22px] sm:text-[30px] leading-none transition-[text-shadow] duration-300 group-hover:[text-shadow:0_0_18px_rgba(240,171,252,0.9)]"
        >
          {t('oracle.libraryDoor.title')}
        </span>
        <span className="block mt-1.5 text-[13px] sm:text-sm leading-snug" style={{ color: '#CFC6EC' }}>
          {stats && stats.titles > 0
            ? t('oracle.libraryDoor.hint', { shelves: stats.shelves, formatted: stats.titles.toLocaleString(i18n.language) })
            : t('oracle.libraryDoor.hintShort')}
        </span>
        <span className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {ORACLES.map((oracle) => (
            <span
              key={oracle.id}
              className="inline-flex items-center gap-1.5 rounded-full pl-0.5 pr-2 py-0.5 text-[12px] font-semibold"
              style={{ background: withAlpha(oracle.color, 0.14), color: oracle.color }}
            >
              <img src={oracle.avatar} alt="" width={18} height={18} className="w-[18px] h-[18px] rounded-full object-cover" />
              {oracle.name}
            </span>
          ))}
        </span>
      </span>

      <span className="relative hidden sm:inline-flex items-center gap-1 text-sm font-semibold" style={{ color: '#F0ABFC' }}>
        {t('oracle.libraryDoor.enter')}
        <ArrowRight className="w-4 h-4 transition group-hover:translate-x-0.5" aria-hidden />
      </span>
    </Link>
  );
};

export default OracleLibraryDoor;
