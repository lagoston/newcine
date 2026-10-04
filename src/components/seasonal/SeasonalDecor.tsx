import React from 'react';
import { useTranslation } from 'react-i18next';
import { useSeasonalEvent } from '../../contexts/SeasonalEventContext';
import { PAPER, PIXEL, withAlpha } from '../../lib/oracleTheme';
import { daysUntilEventDay, type SeasonalEventId } from '../../lib/seasonalEvents';
import { BatFlights, Cobweb, GoldStar, HangingSpider, JackOLantern, LightsGarland, MoonGlow, PennantBunting, SantaCap, Snowfall } from './SeasonalArt';

// Decoração dos eventos espalhada pelo site — de propósito, mínima:
//   • SeasonalBackdrop: atmosfera no fundo de todas as páginas (lua e três
//     morcegos no Halloween; neve fina no Natal), atrás de tudo;
//   • NavbarSeasonalAccent: um fio no pé da barra do topo (brilho de abóbora
//     com uma aranha / varal de luzes);
//   • PanelSeasonalScene: a cena dentro do painel do evento na home;
//   • ProfileSeasonalScene + AvatarSeasonalAccessory + SeasonalCountdown: o
//     perfil decorado de quem está usando 🎃 Headless Horseman ou 🎅 Ho Ho Ho
//     (o ano inteiro, com a contagem para o próximo 31/10 ou 25/12);
//   • CardSeasonalScene + SeasonalCountdownMini: a versão do mini perfil
//     (cartões da Comunidade).

const HALLOWEEN_ORANGE = '#FF8A1F';

export const SeasonalBackdrop: React.FC = () => {
  const { event } = useSeasonalEvent();
  if (!event) return null;

  if (event.id === 'halloween') {
    return (
      <div aria-hidden className="fixed inset-0 -z-10 pointer-events-none overflow-hidden">
        <div
          className="absolute inset-0"
          style={{ background: `radial-gradient(ellipse 90% 35% at 50% 108%, ${withAlpha(HALLOWEEN_ORANGE, 0.1)}, transparent 70%)` }}
        />
        <BatFlights
          flights={[
            { top: '16%', size: 22, dur: 48, delay: -10, rest: '18%' },
            { top: '31%', size: 15, dur: 66, delay: -34, rest: '62%' },
            { top: '9%', size: 12, dur: 83, delay: -57, rest: '80%' },
          ]}
          color="#2A1C3D"
          glow={withAlpha(HALLOWEEN_ORANGE, 0.3)}
          opacity={0.85}
        />
      </div>
    );
  }

  return (
    <div aria-hidden className="fixed inset-0 -z-10 pointer-events-none overflow-hidden">
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(ellipse 90% 35% at 50% 108%, rgba(245,196,81,0.08), transparent 70%)' }}
      />
      <Snowfall count={26} seed={3} maxSize={3.5} opacity={[0.15, 0.4]} speed={[18, 34]} />
    </div>
  );
};

export const NavbarSeasonalAccent: React.FC = () => {
  const { event } = useSeasonalEvent();
  if (!event) return null;

  if (event.id === 'halloween') {
    return (
      <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 block">
        <span
          className="absolute inset-x-0 -bottom-px h-px block"
          style={{
            background: `linear-gradient(90deg, transparent, ${withAlpha(HALLOWEEN_ORANGE, 0.85)} 25%, rgba(168,85,247,0.7) 50%, ${withAlpha(HALLOWEEN_ORANGE, 0.85)} 75%, transparent)`,
            boxShadow: `0 0 10px 1px ${withAlpha(HALLOWEEN_ORANGE, 0.35)}`,
          }}
        />
        <HangingSpider thread={6} className="hidden lg:block" style={{ top: 0, right: '9%' }} eyes={HALLOWEEN_ORANGE} />
      </span>
    );
  }

  return (
    <span aria-hidden className="pointer-events-none absolute inset-x-0 top-full block">
      <LightsGarland count={22} className="w-full -mt-px" sag={7} bulb={5} />
    </span>
  );
};

// Cena do painel do evento na home (atrás do conteúdo).
export const PanelSeasonalScene: React.FC<{ eventId: SeasonalEventId }> = ({ eventId }) => {
  if (eventId === 'halloween') {
    return (
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <Cobweb size={150} className="absolute left-0 top-0" color="rgba(243,234,211,0.22)" />
        <MoonGlow size={72} className="hidden lg:block" style={{ top: 104, right: 48 }} strength={0.85} />
        <HangingSpider thread={52} className="hidden sm:block" style={{ top: 0, right: '38%' }} />
        <BatFlights
          flights={[
            { top: '10%', size: 20, dur: 22, delay: -4, rest: '55%' },
            { top: '22%', size: 13, dur: 31, delay: -19, rest: '75%' },
          ]}
          color="#0B0612"
          glow={withAlpha(HALLOWEEN_ORANGE, 0.45)}
        />
        <div
          className="absolute inset-x-0 bottom-0 h-1/3"
          style={{ background: `radial-gradient(ellipse 80% 100% at 50% 100%, ${withAlpha(HALLOWEEN_ORANGE, 0.12)}, transparent 70%)` }}
        />
      </div>
    );
  }

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <LightsGarland count={16} className="absolute inset-x-0 top-0" sag={12} bulb={8} />
      <GoldStar size={26} className="absolute hidden lg:block" style={{ top: 112, right: 64 }} />
      <Snowfall count={30} seed={5} maxSize={3.5} opacity={[0.25, 0.65]} speed={[10, 20]} />
      <div
        className="absolute inset-x-0 bottom-0 h-16"
        style={{ background: 'linear-gradient(to top, rgba(248,244,236,0.07), transparent)' }}
      />
    </div>
  );
};

// Perfil decorado (dentro do cartão de identidade, atrás do conteúdo).
export const ProfileSeasonalScene: React.FC<{ eventId: SeasonalEventId }> = ({ eventId }) => {
  if (eventId === 'halloween') {
    return (
      <div aria-hidden className="pointer-events-none absolute inset-0 z-[1] overflow-hidden">
        <Cobweb size={118} className="absolute left-0 top-0" color="rgba(243,234,211,0.28)" />
        <Cobweb size={84} flip className="absolute right-0 top-0" color="rgba(243,234,211,0.2)" />
        <PennantBunting count={14} className="absolute top-0" style={{ left: '12%', right: '12%' }} />
        <HangingSpider thread={58} style={{ top: 0, right: '30%' }} eyes={HALLOWEEN_ORANGE} />
        <BatFlights
          flights={[
            { top: '14%', size: 22, dur: 19, delay: -6, rest: '45%' },
            { top: '44%', size: 14, dur: 27, delay: -15, rest: '70%' },
          ]}
          color="#0B0612"
          glow={withAlpha(HALLOWEEN_ORANGE, 0.5)}
        />
        <div
          className="absolute inset-x-0 bottom-0 h-1/2"
          style={{ background: `radial-gradient(ellipse 70% 100% at 50% 100%, ${withAlpha(HALLOWEEN_ORANGE, 0.22)}, transparent 70%)` }}
        />
      </div>
    );
  }

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-[1] overflow-hidden">
      <LightsGarland count={14} className="absolute inset-x-0 top-0" sag={12} bulb={8} />
      <Snowfall count={22} seed={9} maxSize={4} opacity={[0.3, 0.75]} speed={[9, 18]} />
      <div className="absolute inset-x-0 bottom-0 h-12" style={{ background: 'linear-gradient(to top, rgba(248,244,236,0.1), transparent)' }} />
    </div>
  );
};

// Enfeite no avatar: a abóbora acesa no canto (Halloween) ou o gorro do
// Papai Noel (Natal). O pai precisa ser `relative`.
export const AvatarSeasonalAccessory: React.FC<{ eventId: SeasonalEventId; size?: number }> = ({ eventId, size = 120 }) => {
  if (eventId === 'halloween') {
    const s = Math.round(size * 0.42);
    return (
      <span aria-hidden className="pointer-events-none absolute z-20 block" style={{ right: -s * 0.28, bottom: -s * 0.12 }}>
        <JackOLantern size={s} style={{ filter: `drop-shadow(0 0 10px ${withAlpha(HALLOWEEN_ORANGE, 0.6)})` }} />
      </span>
    );
  }
  // O gorro senta no topo, levemente inclinado, com a barra encostada na
  // borda do avatar (o desenho já vem na escala do avatar).
  // Ele sobe ~46% do tamanho acima do avatar: quem usa reserva esse espaço.
  return <SantaCap size={size} className="z-20" style={{ filter: 'drop-shadow(0 5px 6px rgba(0,0,0,0.45))' }} />;
};

// Contagem regressiva no perfil decorado: dias para o próximo 31/10
// (Halloween) ou 25/12 (Natal), no calendário de Brasília. No dia, a saudação.
export const SeasonalCountdown: React.FC<{ eventId: SeasonalEventId }> = ({ eventId }) => {
  const { t } = useTranslation();
  const days = daysUntilEventDay(eventId);
  const halloween = eventId === 'halloween';
  const accent = halloween ? HALLOWEEN_ORANGE : '#F5C451';
  const ring = halloween ? withAlpha(HALLOWEEN_ORANGE, 0.55) : 'rgba(229,72,77,0.6)';
  return (
    <p
      className="relative inline-flex items-center gap-3 rounded-2xl pl-2 pr-4 py-2 backdrop-blur-[2px]"
      style={{ background: 'rgba(0,0,0,0.42)', boxShadow: `inset 0 0 0 1px ${ring}, 0 12px 26px -16px ${accent}` }}
    >
      <span
        className="grid place-items-center w-11 h-11 shrink-0 rounded-xl text-2xl leading-none"
        style={{ background: halloween ? withAlpha(HALLOWEEN_ORANGE, 0.16) : 'rgba(229,72,77,0.2)' }}
        aria-hidden
      >
        {halloween ? '🎃' : '🎅'}
      </span>
      {days === 0 ? (
        <span style={{ ...PIXEL, color: accent, textShadow: `0 0 16px ${withAlpha(accent, 0.6)}` }} className="text-xl leading-none">
          {t(`events.${eventId}.countdownToday`)}
        </span>
      ) : (
        <>
          <span
            style={{ ...PIXEL, color: accent, textShadow: `0 0 16px ${withAlpha(accent, 0.6)}` }}
            className="text-[2rem] leading-none tabular-nums"
          >
            {days}
          </span>
          <span className="max-w-[7.5rem] text-[11px] font-semibold uppercase tracking-wider leading-tight text-left" style={{ color: PAPER }}>
            {t(`events.${eventId}.countdown`, { count: days })}
          </span>
        </>
      )}
    </p>
  );
};

// Mini perfil (cartão da Comunidade): a faixa do banner decorada. O pai é a
// faixa do banner (position relative).
export const CardSeasonalScene: React.FC<{ eventId: SeasonalEventId }> = ({ eventId }) => {
  if (eventId === 'halloween') {
    return (
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-t-2xl">
        <div
          className="absolute inset-0"
          style={{ background: `radial-gradient(ellipse 80% 120% at 60% 130%, ${withAlpha(HALLOWEEN_ORANGE, 0.28)}, transparent 70%)` }}
        />
        <Cobweb size={66} className="absolute left-0 top-0" color="rgba(243,234,211,0.32)" />
        <PennantBunting count={9} scale={0.7} className="absolute top-0" style={{ left: '18%', right: '3%' }} />
        <BatFlights flights={[{ top: '42%', size: 14, dur: 15, delay: -5, rest: '55%' }]} color="#0B0612" glow={withAlpha(HALLOWEEN_ORANGE, 0.5)} />
      </div>
    );
  }
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-t-2xl">
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 80% 120% at 60% 130%, rgba(245,196,81,0.18), transparent 70%)' }} />
      <LightsGarland count={10} className="absolute inset-x-0 top-0" sag={8} bulb={6} />
      <Snowfall count={14} seed={13} maxSize={3} opacity={[0.35, 0.8]} speed={[6, 11]} />
    </div>
  );
};

// Contagem do mini perfil: uma pílula no canto da faixa do banner.
export const SeasonalCountdownMini: React.FC<{ eventId: SeasonalEventId; className?: string; style?: React.CSSProperties }> = ({
  eventId,
  className = '',
  style,
}) => {
  const { t } = useTranslation();
  const days = daysUntilEventDay(eventId);
  const halloween = eventId === 'halloween';
  const accent = halloween ? HALLOWEEN_ORANGE : '#F5C451';
  const ring = halloween ? withAlpha(HALLOWEEN_ORANGE, 0.6) : 'rgba(229,72,77,0.65)';
  return (
    <span
      className={`pointer-events-none inline-flex items-center gap-1.5 h-7 pl-1.5 pr-2.5 rounded-full text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap backdrop-blur-[2px] ${className}`}
      style={{ background: 'rgba(0,0,0,0.58)', boxShadow: `inset 0 0 0 1px ${ring}`, color: PAPER, ...style }}
    >
      <span className="text-sm leading-none normal-case" aria-hidden>
        {halloween ? '🎃' : '🎅'}
      </span>
      {days === 0 ? (
        <span style={{ color: accent }}>{t(`events.${eventId}.countdownToday`)}</span>
      ) : (
        <>
          <span style={{ ...PIXEL, color: accent }} className="text-sm leading-none tabular-nums normal-case tracking-normal">
            {days}
          </span>
          <span>{t(`events.${eventId}.countdown`, { count: days })}</span>
        </>
      )}
    </span>
  );
};

