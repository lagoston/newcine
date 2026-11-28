import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Snowflake } from 'lucide-react';
import OracleSheet from '../OracleSheet';
import UserAvatar from '../UserAvatar';
import { ChipFace } from '../posterJackpot/Chips';
import { overlays } from '../../overlays';
import { emit } from '../../lib/bus';
import { FOCUS_RING, INK, MIST, PAPER, PIXEL } from '../../lib/oracleTheme';
import { prizeText, scratchSecretFriend, type ScratchPrize, type SecretFriendReceived } from '../../lib/secretFriend';

// A raspadinha de Natal (28/11/2026). Pedido do Bruno: "Uma raspadinha de
// Natal que poderá dar até 3 fichas especiais, e com um mínimo de 2 fichas
// comuns."
//
// O bilhete tem três janelas cobertas de tinta prateada: em cada uma pode sair
// uma ficha especial. As 2 fichas comuns são garantidas e já vêm impressas. O
// sorteio é do banco (secret_friend_scratch) e só acontece no primeiro gesto
// de raspar: abrir e fechar a gaveta sem raspar não gasta a raspadinha. Depois
// das três janelas, o bilhete conta quem era o amigo secreto.
//
// Raspar é com o dedo ou o mouse; "Raspar tudo" faz o mesmo para quem usa
// teclado ou leitor de tela.

const GOLD = '#F5C451';
const WINE = '#6E1826';
const COAT = '#B9BEC9';
const COAT_LINE = '#9EA4B2';
const WINDOW_PX = 84;
// raspou mais da metade: a janela abre sozinha
const OPEN_AT = 0.5;

interface WindowProps {
  index: number;
  // o que há embaixo (null = o banco ainda não respondeu)
  special: boolean | null;
  open: boolean;
  onStart: () => void;
  onOpen: (index: number) => void;
}

const ScratchWindow: React.FC<WindowProps> = ({ index, special, open, onStart, onOpen }) => {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const down = useRef(false);
  const moves = useRef(0);

  // a tinta prateada, com riscos na diagonal
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = WINDOW_PX * ratio;
    canvas.height = WINDOW_PX * ratio;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = COAT;
    ctx.fillRect(0, 0, WINDOW_PX, WINDOW_PX);
    ctx.fillStyle = COAT_LINE;
    for (let d = -WINDOW_PX; d < WINDOW_PX; d += 8) {
      for (let y = 0; y < WINDOW_PX; y += 2) ctx.fillRect(d + y, y, 3, 2);
    }
  }, []);

  const scratchAt = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const box = canvas.getBoundingClientRect();
    const x = ((event.clientX - box.left) / box.width) * WINDOW_PX;
    const y = ((event.clientY - box.top) / box.height) * WINDOW_PX;
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(x, y, 13, 0, Math.PI * 2);
    ctx.fill();
    moves.current += 1;
    if (moves.current % 6 !== 0) return;
    // quanto já saiu: uma grade de 10 × 10 amostras
    const ratio = canvas.width / WINDOW_PX;
    let clear = 0;
    for (let gy = 0; gy < 10; gy += 1) {
      for (let gx = 0; gx < 10; gx += 1) {
        const pixel = ctx.getImageData(Math.floor((gx * 8.4 + 4) * ratio), Math.floor((gy * 8.4 + 4) * ratio), 1, 1).data;
        if (pixel[3] < 40) clear += 1;
      }
    }
    if (clear / 100 >= OPEN_AT) onOpen(index);
  };

  const label = !open
    ? t('events.christmas.scratch.windowCovered', { n: index + 1 })
    : special
      ? t('events.christmas.scratch.windowSpecial', { n: index + 1 })
      : t('events.christmas.scratch.windowEmpty', { n: index + 1 });

  return (
    <div
      role="img"
      aria-label={label}
      className="relative overflow-hidden rounded-lg"
      style={{ width: WINDOW_PX, height: WINDOW_PX, background: PAPER, boxShadow: `inset 0 0 0 2px ${WINE}` }}
    >
      <div className="absolute inset-0 grid place-items-center">
        {special === null ? (
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: WINE }} aria-hidden />
        ) : special ? (
          <ChipFace kind="special" className="w-12 h-12" />
        ) : (
          <Snowflake className="w-9 h-9" style={{ color: '#9DB7D6' }} strokeWidth={1.8} aria-hidden />
        )}
      </div>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full transition-opacity duration-300"
        style={{ touchAction: 'none', cursor: open ? 'default' : 'grab', opacity: open ? 0 : 1, pointerEvents: open ? 'none' : 'auto' }}
        onPointerDown={(event) => {
          down.current = true;
          event.currentTarget.setPointerCapture?.(event.pointerId);
          onStart();
          scratchAt(event);
        }}
        onPointerMove={(event) => {
          if (down.current) scratchAt(event);
        }}
        onPointerUp={() => {
          down.current = false;
        }}
        onPointerCancel={() => {
          down.current = false;
        }}
      />
    </div>
  );
};

interface Props {
  open: boolean;
  onClose: () => void;
  // o ensaio da Conta Diretor ('christmas') ou null
  preview: string | null;
  // a raspadinha já raspada (reabrir mostra o resultado, sem sortear de novo)
  known: SecretFriendReceived | null;
  // raspou agora: o painel relê o estado
  onScratched: () => void;
}

const ScratchCardSheet: React.FC<Props> = ({ open, onClose, preview, known, onScratched }) => {
  const { t } = useTranslation();
  const [prize, setPrize] = useState<ScratchPrize | null>(null);
  const [opened, setOpened] = useState<boolean[]>([false, false, false]);
  const [failed, setFailed] = useState(false);
  const asked = useRef(false);
  const fresh = useRef(false);

  // cada vez que a gaveta abre: o bilhete coberto, ou o resultado já conhecido
  useEffect(() => {
    if (!open) return;
    setFailed(false);
    fresh.current = false;
    if (known?.scratched) {
      asked.current = true;
      setPrize({ tickets: known.tickets ?? 0, special: known.special ?? 0, spots: known.spots ?? [], from: known.from ?? null });
      setOpened([true, true, true]);
    } else {
      asked.current = false;
      setPrize(null);
      setOpened([false, false, false]);
    }
    // só ao abrir: `known` muda quando o painel relê o estado depois da raspada
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // o primeiro gesto de raspar: o banco sorteia e credita
  const ask = useCallback(() => {
    if (asked.current) return;
    asked.current = true;
    scratchSecretFriend(preview).then((result) => {
      if (!result) {
        asked.current = false;
        setFailed(true);
        return;
      }
      fresh.current = true;
      setPrize(result);
      if (!result.trial) emit('jackpot:chips', {});
      onScratched();
    });
  }, [preview, onScratched]);

  const openWindow = useCallback((index: number) => setOpened((current) => (current[index] ? current : current.map((value, i) => value || i === index))), []);
  const openAll = () => {
    ask();
    setOpened([true, true, true]);
  };

  const done = Boolean(prize) && opened.every(Boolean);
  const total = prize ? prizeText(t, prize.tickets, prize.special) : '';

  return (
    <OracleSheet open={open} onClose={onClose} title={t('events.christmas.scratch.title')} size="md">
      <div className="flex flex-col items-center">
        {/* o bilhete */}
        <div className="w-full max-w-[320px] rounded-2xl p-[3px]" style={{ background: GOLD }}>
          <div className="rounded-[13px] px-3.5 pt-3.5 pb-3" style={{ background: WINE }}>
            <p style={{ ...PIXEL, color: GOLD }} className="text-center text-[22px] leading-none">
              {t('events.christmas.scratch.ticketTitle')}
            </p>
            <p className="mt-1.5 text-center text-xs" style={{ color: '#F3C9CE' }}>
              {t('events.christmas.scratch.instruction')}
            </p>
            <div className="mt-3 flex justify-center gap-2.5">
              {[0, 1, 2].map((index) => (
                <ScratchWindow
                  key={`${open ? 'on' : 'off'}-${index}`}
                  index={index}
                  special={prize ? prize.spots.includes(index) : null}
                  open={opened[index]}
                  onStart={ask}
                  onOpen={openWindow}
                />
              ))}
            </div>
            {/* o prêmio garantido, impresso no bilhete */}
            <div className="mt-3 flex items-center justify-center gap-2 rounded-lg px-3 py-2" style={{ background: 'rgba(0,0,0,0.28)' }}>
              <ChipFace kind="normal" className="w-6 h-6" />
              <ChipFace kind="normal" className="w-6 h-6 -ml-3" />
              <span className="text-[13px] font-semibold" style={{ color: PAPER }}>
                {t('events.christmas.scratch.guaranteed')}
              </span>
            </div>
          </div>
        </div>

        {failed && (
          <p className="mt-3 text-sm text-center" style={{ color: '#FCA5A5' }} role="alert">
            {t('events.christmas.scratch.failed')}
          </p>
        )}

        {!done ? (
          <button
            type="button"
            onClick={openAll}
            className={`mt-4 inline-flex items-center justify-center min-h-[44px] px-5 rounded-xl text-sm font-semibold border border-white/20 hover:bg-white/10 transition ${FOCUS_RING}`}
            style={{ color: PAPER }}
          >
            {t('events.christmas.scratch.all')}
          </button>
        ) : (
          prize && (
            <div className="mt-4 w-full max-w-[320px] text-center" aria-live="polite">
              <p style={{ ...PIXEL, color: GOLD }} className="text-2xl leading-tight">
                {t('events.christmas.scratch.won', { prize: total })}
              </p>
              {prize.from && (
                <p className="mt-3 inline-flex items-center justify-center gap-2 text-sm" style={{ color: PAPER }}>
                  <UserAvatar user={prize.from} size={28} />
                  <span>{t('events.christmas.scratch.from', { name: `@${prize.from.username ?? ''}` })}</span>
                </p>
              )}
              {prize.trial && (
                <p className="mt-3 text-xs" style={{ color: MIST }}>
                  {t('events.christmas.scratch.trial')}
                </p>
              )}
              <div className="mt-4 flex flex-wrap justify-center gap-2.5">
                {!prize.trial && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      overlays.open('jackpot', { tab: 'machine' });
                    }}
                    className={`inline-flex items-center justify-center min-h-[44px] px-5 rounded-xl text-sm font-semibold transition hover:brightness-110 ${FOCUS_RING}`}
                    style={{ background: GOLD, color: INK }}
                  >
                    {t('events.christmas.scratch.toJackpot')}
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className={`inline-flex items-center justify-center min-h-[44px] px-5 rounded-xl text-sm font-semibold border border-white/20 hover:bg-white/10 transition ${FOCUS_RING}`}
                  style={{ color: PAPER }}
                >
                  {t('common.close')}
                </button>
              </div>
            </div>
          )
        )}
      </div>
    </OracleSheet>
  );
};

export default ScratchCardSheet;
