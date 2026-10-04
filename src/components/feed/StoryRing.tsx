import React, { useId } from 'react';
import { NIGHT, PAPER, PIXEL } from '../../lib/oracleTheme';

// Avatar com o anel dos stories. Um gomo por story do amigo (como no
// Instagram): os não vistos em degradê âmbar → coral → fúcsia → violeta,
// girando devagar, com um halo que respira e dois grãos de pólen orbitando;
// os vistos num traço fino e parado.

const GRADIENT = ['#FCD34D', '#FB923C', '#F472B6', '#C084FC'];

interface StoryRingProps {
  // diâmetro do avatar (o anel fica em volta)
  size: number;
  // um item por story, na ordem: true = ainda não visto
  segments: boolean[];
  avatarUrl: string | null;
  username: string;
  ringWidth?: number;
  gap?: number;
  // sem animação (ex.: o próprio story, ou cabeçalho do visualizador)
  still?: boolean;
}

const storyRingOuter =(size: number, ringWidth = 3, gap = 3) => size + (ringWidth + gap) * 2;

const StoryRing: React.FC<StoryRingProps> = ({ size, segments, avatarUrl, username, ringWidth = 3, gap = 3, still = false }) => {
  const gradientId = `story-ring-${useId().replace(/:/g, '')}`;
  const outer = storyRingOuter(size, ringWidth, gap);
  const anyUnseen = segments.some(Boolean);
  const animate = anyUnseen && !still;
  const center = outer / 2;
  const radius = center - ringWidth / 2;
  const circumference = 2 * Math.PI * radius;
  const count = Math.max(1, segments.length);
  // vão entre gomos (com a ponta arredondada, o traço avança meia largura
  // de cada lado, então o vão desconta isso)
  const gapLength = count > 1 ? Math.min(8, circumference / count / 3) + ringWidth : 0;
  const segmentLength = circumference / count - gapLength;
  const seenWidth = Math.max(1.5, ringWidth - 1);

  return (
    <span className="relative inline-grid place-items-center shrink-0" style={{ width: outer, height: outer }}>
      {animate && (
        <span
          aria-hidden
          className="co-ring-bloom pointer-events-none absolute rounded-full"
          style={{
            inset: -6,
            background: `radial-gradient(circle, transparent 54%, rgba(251,146,60,0.42) 64%, rgba(244,114,182,0.3) 72%, transparent 80%)`,
            filter: 'blur(3px)',
          }}
        />
      )}

      <svg
        aria-hidden
        width={outer}
        height={outer}
        viewBox={`0 0 ${outer} ${outer}`}
        className={`absolute inset-0 ${animate ? 'co-ring-spin' : ''}`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="1" x2="1" y2="0">
            {GRADIENT.map((color, i) => (
              <stop key={color} offset={`${(i / (GRADIENT.length - 1)) * 100}%`} stopColor={color} />
            ))}
          </linearGradient>
        </defs>
        {(segments.length ? segments : [false]).map((unseen, i) => (
          <circle
            key={i}
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={unseen ? `url(#${gradientId})` : 'rgba(243,234,211,0.26)'}
            strokeWidth={unseen ? ringWidth : seenWidth}
            strokeLinecap={count > 1 ? 'round' : 'butt'}
            strokeDasharray={count > 1 ? `${Math.max(0.5, segmentLength)} ${circumference}` : undefined}
            strokeDashoffset={count > 1 ? -(i * (segmentLength + gapLength)) : undefined}
            transform={`rotate(-90 ${center} ${center})`}
          />
        ))}
      </svg>

      {/* pólen: dois grãos que dão a volta no anel, acendendo e apagando */}
      {animate && (
        <span aria-hidden className="co-pollen-orbit pointer-events-none absolute inset-0">
          <span
            className="co-pollen absolute rounded-full"
            style={{ width: 4, height: 4, left: center - 2, top: -1, background: '#FDE68A', boxShadow: '0 0 6px 2px rgba(253,230,138,0.75)' }}
          />
          <span
            className="co-pollen absolute rounded-full"
            style={{
              width: 3,
              height: 3,
              left: outer - 2,
              top: center - 1.5,
              background: '#F9A8D4',
              boxShadow: '0 0 6px 2px rgba(249,168,212,0.7)',
              animationDelay: '-1.5s',
            }}
          />
        </span>
      )}

      <span className="relative block rounded-full overflow-hidden" style={{ width: size, height: size, background: NIGHT }}>
        {avatarUrl ? (
          <img src={avatarUrl} alt="" draggable={false} className="w-full h-full object-cover" loading="lazy" decoding="async" />
        ) : (
          <span className="w-full h-full grid place-items-center" style={{ ...PIXEL, color: PAPER, fontSize: size * 0.4 }}>
            {username.charAt(0).toUpperCase()}
          </span>
        )}
      </span>
    </span>
  );
};

export default StoryRing;
