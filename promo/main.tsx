// Comercial do Instagram (15/10/2026): a gaveta Conexão de verdade, com
// perfis de demonstração. A página expõe window.__promo.seek(t) para a
// captura quadro a quadro (o relógio da página é controlado pelo Playwright).
import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal, flushSync } from 'react-dom';
import { MemoryRouter } from 'react-router-dom';
import i18n from '../src/i18n';
import '../src/index.css';
import ConnectionSheet from '../src/components/connection/ConnectionSheet';
import ConnectionStrip from '../src/components/connection/ConnectionStrip';
import UserAvatar from '../src/components/UserAvatar';
import { LogoMark, LogoWordmark, LogoLockup } from '../src/components/Logo';
import { mapPersonaEntry, type UserPersona } from '../src/lib/persona';
import { NIGHT, NIGHT_BACKGROUND, PAPER, MIST, PIXEL, withAlpha } from '../src/lib/oracleTheme';
import { MOOD_BY_LETTER } from '../src/lib/moods';
import { ME, EX, LUCAS, EX_DETAIL, LUCAS_DETAIL, PERSONA_RPC, PRELOAD_IMAGES } from './data';
import type { ConnectionDetail, ConnectionSide } from '../src/lib/connection';

i18n.changeLanguage('pt');

// ---------------------------------------------------------------------------
// Linha do tempo (segundos). Pode vir pronta em ?tl=<json> (tempos da fala).
// ---------------------------------------------------------------------------
const DEFAULT_TL = {
  exOpen: 0.1,
  debates: 3.4,
  personas: 7.6,
  moods: 11.4,
  exClose: 14.7,
  tap: 16.6,
  lucasOpen: 16.9,
  watch: 20.4,
  end: 24.2,
  duration: 27,
};
type Timeline = typeof DEFAULT_TL;
const TL: Timeline = (() => {
  try {
    const raw = new URLSearchParams(window.location.search).get('tl');
    return raw ? { ...DEFAULT_TL, ...JSON.parse(raw) } : DEFAULT_TL;
  } catch {
    return DEFAULT_TL;
  }
})();

const toPersona = (id: string): UserPersona => {
  const raw = PERSONA_RPC[id] as { code: string; counted: number; threshold: number; scores: { mood_key: string; score: number; films: number }[]; persona: Record<string, unknown> };
  return {
    code: raw.code,
    counted: raw.counted,
    threshold: raw.threshold,
    scores: raw.scores.map((s) => ({ moodKey: s.mood_key, score: s.score, films: s.films })),
    persona: mapPersonaEntry(raw.persona),
  };
};

const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

// ---------------------------------------------------------------------------
// Perfil (atrás da gaveta)
// ---------------------------------------------------------------------------
const PersonaPill: React.FC<{ code: string; title: string }> = ({ code, title }) => {
  const colors = code.split('').map((l) => MOOD_BY_LETTER[l]?.color ?? MIST);
  return (
    <span
      className="inline-flex items-center gap-2 h-8 px-3 rounded-full text-[13px]"
      style={{ background: 'rgba(28,20,51,0.7)', boxShadow: `inset 0 0 0 1px ${withAlpha(colors[0], 0.45)}`, color: PAPER }}
    >
      <span style={{ ...PIXEL }} className="tracking-wider">
        {code.split('').map((l, i) => (
          <span key={i} style={{ color: colors[i] }}>
            {l}
          </span>
        ))}
      </span>
      <span style={{ color: MIST }}>{title}</span>
    </span>
  );
};

const ProfileScreen: React.FC<{ other: ConnectionSide; detail: ConnectionDetail; glow: boolean; onOpen: () => void }> = ({ other, detail, glow, onOpen }) => {
  const persona = toPersona(other.id);
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: NIGHT_BACKGROUND }}>
      <header className="h-14 px-4 flex items-center justify-between border-b border-white/[0.06]" style={{ background: withAlpha(NIGHT, 0.85) }}>
        <LogoMark className="h-[30px] w-auto" />
        <LogoWordmark className="h-3 w-auto" />
        <span className="w-[30px]" />
      </header>
      <div className="px-4 pt-4 flex flex-col items-center text-center">
        <UserAvatar user={other} size={76} />
        <p style={{ ...PIXEL, color: PAPER }} className="mt-2.5 text-[24px] leading-none">
          @{other.username}
        </p>
        <div className="mt-3">
          <PersonaPill code={persona.code ?? ''} title={persona.persona?.titlePt ?? ''} />
        </div>
      </div>
      <div className="px-4 mt-4">
        <ConnectionStrip other={other} me={ME} detail={detail} status="ready" guest={false} onOpen={onOpen} glow={glow} />
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Cartela final
// ---------------------------------------------------------------------------
const EndCard: React.FC<{ p: number }> = ({ p }) => (
  <div className="absolute inset-0 flex flex-col items-center pointer-events-none" style={{ background: withAlpha(NIGHT, 0.97 * clamp01(p * 1.6)) }}>
    <div
      className="mt-[96px] flex flex-col items-center"
      style={{ opacity: clamp01((p - 0.15) * 2.2), transform: `translateY(${(1 - ease(clamp01((p - 0.15) * 2.2))) * 14}px) scale(${0.96 + 0.04 * ease(clamp01((p - 0.15) * 2.2))})` }}
    >
      <LogoLockup className="flex items-center gap-3" markClassName="h-[54px] w-auto" wordClassName="h-[24px] w-auto" />
      <p className="mt-6 text-[17px]" style={{ color: PAPER }}>
        Descubra a sua conexão
      </p>
      <span
        className="mt-4 inline-flex items-center h-11 px-5 rounded-full text-[17px] font-semibold text-white"
        style={{ background: 'linear-gradient(90deg, #7C3AED, #C026D3)', boxShadow: '0 10px 30px -10px rgba(192,38,211,0.7)' }}
      >
        cineoracle.com
      </span>
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Toque (o dedo invisível)
// ---------------------------------------------------------------------------
const Tap: React.FC<{ x: number; y: number; p: number }> = ({ x, y, p }) => {
  if (p <= 0 || p >= 1) return null;
  window.__promoTap = { x, y, p };
  const s = 0.7 + 0.9 * ease(p);
  const o = p < 0.2 ? p / 0.2 : 1 - (p - 0.2) / 0.8;
  return (
    <span
      className="absolute rounded-full pointer-events-none"
      style={{ left: x - 30, top: y - 30, width: 60, height: 60, background: 'rgba(255,255,255,0.22)', boxShadow: '0 0 0 3px rgba(255,255,255,0.85), 0 0 24px 4px rgba(255,255,255,0.35)', transform: `scale(${s})`, opacity: o }}
    />
  );
};

// ---------------------------------------------------------------------------
// Diretor
// ---------------------------------------------------------------------------
interface Frame {
  person: 'ex' | 'lucas';
  open: boolean;
  tap: { x: number; y: number; p: number } | null;
  end: number;
}

const frameAt = (t: number, orb: { x: number; y: number } | null): Frame => {
  const person = t < TL.exClose + 0.45 ? 'ex' : 'lucas';
  const open = person === 'ex' ? t >= TL.exOpen && t < TL.exClose : t >= TL.lucasOpen;
  const tapP = (t - TL.tap) / 0.5;
  return {
    person,
    open,
    tap: orb && tapP > 0 && tapP < 1 ? { x: orb.x, y: orb.y, p: tapP } : null,
    end: clamp01((t - TL.end) / 0.8),
  };
};

// Rolagem da gaveta: cada marca rola até uma seção (ou volta ao topo).
const scrollMarks = (person: 'ex' | 'lucas'): { at: number; section: string | null }[] =>
  person === 'ex'
    ? [
        { at: TL.exOpen, section: null },
        { at: TL.debates, section: 'debates' },
        { at: TL.personas, section: 'personas' },
        { at: TL.moods, section: 'moods' },
      ]
    : [
        { at: TL.lucasOpen, section: null },
        { at: TL.watch, section: 'watch' },
      ];

const sheetBody = () => document.querySelector<HTMLElement>('[role="dialog"] .overscroll-contain');
const sectionTop = (body: HTMLElement, section: string | null) => {
  if (!section) return 0;
  const el =
    section === 'moods'
      ? document.querySelector<HTMLElement>('#connection-personas > div > div.mt-7') ?? document.getElementById('connection-personas')
      : document.getElementById(`connection-${section}`);
  if (!el) return body.scrollTop;
  // Em "Assistam juntos" a câmera para no cartão da sessão (acima da narradora).
  const offset = section === 'watch' ? 118 : -14;
  const top = el.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop + offset;
  return Math.max(0, Math.min(top, body.scrollHeight - body.clientHeight));
};

const SCROLL_S = 0.9;
const applyScroll = (t: number, person: 'ex' | 'lucas') => {
  const body = sheetBody();
  if (!body) return;
  const marks = scrollMarks(person);
  let i = 0;
  for (let k = 0; k < marks.length; k++) if (t >= marks[k].at) i = k;
  const target = sectionTop(body, marks[i].section);
  const from = i > 0 ? sectionTop(body, marks[i - 1].section) : 0;
  const p = ease(clamp01((t - marks[i].at) / SCROLL_S));
  body.scrollTop = from + (target - from) * p;
};

// Animações de CSS (as ondas da esfera) seguem o tempo do vídeo.
const applyCssAnimations = (t: number) => {
  document.getAnimations().forEach((a) => {
    if (typeof CSSAnimation !== 'undefined' && a instanceof CSSAnimation) {
      a.pause();
      a.currentTime = t * 1000;
    }
  });
};

let setFrameExternal: ((f: Frame) => void) | null = null;
let orbPos: { x: number; y: number } | null = null;

const Stage: React.FC = () => {
  const [frame, setFrame] = useState<Frame>(() => frameAt(0, null));
  useEffect(() => {
    setFrameExternal = setFrame;
  }, []);
  const exPersona = useMemo(() => toPersona(EX.id), []);
  const lucasPersona = useMemo(() => toPersona(LUCAS.id), []);
  const isEx = frame.person === 'ex';
  const other = isEx ? EX : LUCAS;
  const detail = isEx ? EX_DETAIL : LUCAS_DETAIL;
  return (
    <div className="fixed inset-0 overflow-hidden" style={{ background: NIGHT }}>
      <ProfileScreen key={frame.person} other={other} detail={detail} glow={!isEx} onOpen={() => undefined} />
      <ConnectionSheet
        key={`sheet-${frame.person}`}
        open={frame.open}
        onClose={() => undefined}
        other={other}
        otherPersona={isEx ? exPersona : lucasPersona}
        detail={detail}
        reload={() => undefined}
        friendship="friends"
        onFriendAction={() => undefined}
      />
      {createPortal(
        <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 2147483000 }}>
          {frame.tap && <Tap {...frame.tap} />}
          {frame.end > 0 && <EndCard p={frame.end} />}
        </div>,
        document.body,
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Pronto para gravar: imagens e fontes carregadas.
// ---------------------------------------------------------------------------
const preload = (src: string) =>
  new Promise<void>((resolve) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = src;
  });

declare global {
  interface Window {
    __promoTap?: { x: number; y: number; p: number };
    __promo: { ready: boolean; duration: number; tl: Timeline; seek: (t: number) => void; failed: string[] };
  }
}

window.__promo = {
  ready: false,
  duration: TL.duration,
  tl: TL,
  failed: [],
  seek: (t: number) => {
    if (!orbPos) {
      const orb = document.querySelector<HTMLElement>('button[title^="Conexão nova"]');
      if (orb) {
        const r = orb.getBoundingClientRect();
        orbPos = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }
    }
    const f = frameAt(t, orbPos);
    if (f.person === 'ex') orbPos = null;
    flushSync(() => setFrameExternal?.(f));
    applyScroll(t, f.person);
    applyCssAnimations(t);
  },
};

Promise.all([...PRELOAD_IMAGES.map(preload), document.fonts.ready]).then(() => {
  window.__promo.ready = true;
});

createRoot(document.getElementById('root')!).render(
  <MemoryRouter>
    <Stage />
  </MemoryRouter>,
);
