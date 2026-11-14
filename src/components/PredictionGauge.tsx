import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { ratingBarColor, ratingTone } from '../lib/oracleTheme';
import { formatChance, lampLevels, landingSpot } from '../lib/prediction';
import type { MothSpec } from './personaWorld/draw';
import { usePatronus } from './patronus/patronus';
import { drawBurst, PATRONUS_SKY, patronusSprite, wispSprite, type Sprite } from './patronus/sprite';
import { columnOf, DECK, drawConsole, drawNeedle, drawSpeedLines, layoutFor, type Layout } from './patronus/spectrometer';

// A nota prevista no menu do título: o Espectrômetro e o Patrono.
//
// História (tudo em 14/11/2026, a pedido do Bruno):
//   1. os dois números (nota prevista, chance de nota 10) viraram um medidor;
//   2. o medidor virou o Astrolábio: um arco azul, púrpura e dourado, com uma
//      agulha que varria o arco de ponta a ponta antes de travar;
//   3. esta versão. O que ele pediu: as cores do padrão do site (as das
//      prateleiras da biblioteca), a agulha sem oscilar tanto, "um movimento
//      mais cartoonesco e um design mais Old Cartoon Network anos 2000,
//      cartoonzão, Laboratório de Dexter", em sintonia com o modal Sua
//      Persona, e uma diretriz nova em volta da borboleta, "o Espectro
//      Patrono do usuário, como em Harry Potter".
//
// O que se vê:
//   • O aparelho: onze lâmpadas, uma por nota (0 a 10), nas cores de nota do
//     site. Acesas onde a nota deve cair, a meia-luz onde ainda pode, apagadas
//     no resto. É o espectro das notas previstas.
//   • O cursor: uma haste que corre por cima das lâmpadas.
//   • O Patrono: a mariposa da própria pessoa, feita de luz. É ela quem leva o
//     cursor até a nota e pousa em cima dele. Quem ainda não tem Persona tem
//     uma fagulha no lugar (o Patrono que ainda não tomou forma).
//
// O movimento (desenho animado, 12 quadros por segundo, pose a pose):
//   • enquanto a previsão não chega, a fagulha fica parada em cima do cursor,
//     no meio da escala, só piscando: nada varre o aparelho;
//   • quando chega: um clarão, a fagulha vira mariposa, ela recua um passo
//     (a antecipação), dispara de uma vez até a nota deixando um rastro,
//     passa um pouco do ponto, volta e pousa. As lâmpadas acendem;
//   • depois disso, nada mais se mexe.
// Um movimento só, com começo e fim. Com "reduzir movimento" não há nem esse:
// o aparelho já aparece com o Patrono pousado.
//
// Os números não somem para quem precisa deles: estão no texto para leitores
// de tela e na dica ao passar o mouse.

// 12 quadros por segundo: o ritmo do desenho animado feito "em dois".
const TICK_MS = 83;
// A fagulha aparece pelo menos por este tempo antes de virar mariposa.
const MIN_IDLE_MS = 420;
// Quanto se espera pela mariposa da pessoa antes de seguir só com a fagulha.
const PATRONUS_WAIT_MS = 600;
// meia envergadura do Patrono, em pixels do desenho
const SPAN = 10;
// a altura do pouso (o centro do corpo: a mariposa senta na cabeça do cursor)
// e a do voo, dois pixels acima
const PERCH_Y = DECK - 9;
const FLY_Y = PERCH_Y - 2;
const WISP_IDLE_Y = DECK - 13;
const WISP_PERCH_Y = DECK - 9;
// ampliação do desenho na tela
const SCALE = 2;

type Form = 'wisp' | 'moth';

// A cor que o Patrono e a bolinha da antena tomam ao pousar: a da nota no
// padrão do site, entre o tom fechado das barras e o claro dos números. (Só o
// tom claro não serve: o vermelho claro de 1 a 3 e o rosa claro do 10 ficam
// parecidos demais numa aura.)
const landingTint = (rating: number): string => {
  const deep = parseInt(ratingBarColor(rating).slice(1), 16);
  const soft = parseInt(ratingTone(rating).color.slice(1), 16);
  const channel = (shift: number) => Math.round(((deep >> shift) & 255) * 0.65 + ((soft >> shift) & 255) * 0.35);
  return `#${[16, 8, 0].map((shift) => channel(shift).toString(16).padStart(2, '0')).join('')}`;
};

interface Pose {
  // a coluna do cursor
  needle: number;
  levels: number[];
  form: Form | 'none';
  x: number;
  y: number;
  flap?: number;
  twinkle?: boolean;
  // para onde a mariposa olha (-1 esquerda, 0 em frente, 1 direita)
  gaze?: number;
  tint: string;
  // a bolinha da antena (null = apagada)
  beacon: string | null;
  // estica e amassa (1 = normal): o Patrono se alonga no disparo e achata no pouso
  stretch?: [number, number];
  ghosts?: { x: number; y: number; alpha: number; flap?: number }[];
  burst?: { x: number; y: number; step: number; color: string };
  speed?: { from: number; to: number; y: number };
  // o raio entre o cursor e a fagulha (0 e 1 = os dois desenhos)
  bolt?: 0 | 1;
  dust?: 0 | 1;
}

const DARK: number[] = new Array(11).fill(0);

// A espera: a fagulha em cima do cursor, no meio da escala, e a bolinha da
// antena piscando. Tudo no lugar: nada varre o aparelho. O pisca é lento (duas
// vezes por segundo) para não cansar.
const idlePoses = (column: number): Pose[] =>
  Array.from({ length: 12 }, (_, tick) => ({
    needle: column,
    levels: DARK,
    form: 'wisp' as const,
    x: column,
    y: WISP_IDLE_Y - (tick >= 6 ? 1 : 0),
    twinkle: tick % 6 >= 3,
    tint: PATRONUS_SKY,
    beacon: tick % 6 < 3 ? PATRONUS_SKY : null,
    bolt: (tick % 6 < 3 ? 0 : 1) as 0 | 1,
  }));

// O pouso: como o aparelho fica depois que tudo para.
const restPose = (column: number, form: Form, levels: number[], tint: string): Pose => ({
  needle: column,
  levels,
  form,
  x: column,
  y: form === 'moth' ? PERCH_Y : WISP_PERCH_Y,
  flap: 1,
  twinkle: false,
  gaze: 0,
  tint,
  beacon: tint,
});

// A cena inteira, pose a pose: da espera ao pouso.
//   conjure: a fagulha vira mariposa no começo (false = o Patrono já está no ar)
//   tenColumn: a coluna da lâmpada do 10, quando a nota prevista é 10
function eventPoses(from: number, to: number, form: Form, levels: number[], tint: string, conjure: boolean, tenColumn: number | null): Pose[] {
  const poses: Pose[] = [];
  const sky = PATRONUS_SKY;
  const distance = to - from;
  const dir = distance < 0 ? -1 : 1;
  const flyY = form === 'moth' ? FLY_Y : WISP_IDLE_Y;
  const base = { levels: DARK, form, tint: sky, beacon: sky, gaze: dir };

  if (form === 'moth' && conjure) {
    // o clarão em que a fagulha toma forma
    const empty = { needle: from, levels: DARK, form: 'none' as const, x: from, y: flyY, tint: sky, beacon: sky };
    poses.push({ ...empty, burst: { x: from, y: flyY, step: 0, color: sky } });
    poses.push({ ...empty, burst: { x: from, y: flyY, step: 1, color: sky } });
    poses.push({ ...base, gaze: 0, needle: from, x: from, y: flyY - 1, flap: 0.5, burst: { x: from, y: flyY, step: 2, color: sky } });
    poses.push({ ...base, gaze: 0, needle: from, x: from, y: flyY, flap: 1 });
    poses.push({ ...base, needle: from, x: from, y: flyY, flap: 1 });
  } else if (conjure) {
    poses.push({ ...base, needle: from, x: from, y: flyY - 1, twinkle: true });
    poses.push({ ...base, needle: from, x: from, y: flyY, twinkle: false });
  }

  if (Math.abs(distance) < 5) {
    // a nota é quase no meio: um pulinho no lugar
    poses.push({ ...base, needle: from, x: from, y: flyY + 1, flap: 0.5, twinkle: true, stretch: [1.15, 0.85] });
    poses.push({ ...base, needle: to, x: to, y: flyY - 3, flap: 1, stretch: [0.9, 1.15] });
    poses.push({ ...base, needle: to, x: to, y: flyY - 1, flap: 0.78, twinkle: true });
  } else {
    const over = Math.min(7, Math.max(3, Math.round(Math.abs(distance) * 0.15)));
    const at = (share: number) => Math.round(from + distance * share);
    // antecipação: encolhe e recua antes de disparar
    poses.push({ ...base, needle: from - dir, x: from - dir * 3, y: flyY, flap: 0.78, twinkle: true, stretch: [0.92, 1.05] });
    poses.push({ ...base, needle: from - dir * 3, x: from - dir * 5, y: flyY + 1, flap: 0.5, stretch: [0.85, 1.12] });
    // o disparo: esticada, com rastro e riscos de velocidade
    poses.push({
      ...base,
      needle: at(0.45),
      x: at(0.62),
      y: flyY - 1,
      flap: 1,
      twinkle: true,
      stretch: [1.4, 0.8],
      ghosts: [
        { x: at(0.18), y: flyY, alpha: 0.2, flap: 0.5 },
        { x: at(0.4), y: flyY - 1, alpha: 0.4, flap: 0.78 },
      ],
      speed: { from: from - dir * 5, to: at(0.5), y: flyY },
    });
    // passa do ponto
    poses.push({
      ...base,
      needle: to + dir * over,
      x: to + dir * over,
      y: flyY,
      flap: 0.78,
      stretch: [1.15, 0.9],
      ghosts: [{ x: at(0.84), y: flyY - 1, alpha: 0.32, flap: 1 }],
      speed: { from: at(0.5), to: at(0.9), y: flyY },
    });
    // e volta
    poses.push({ ...base, needle: to - dir * 2, x: to - dir * 2, y: flyY + 1, flap: 0.5, twinkle: true });
  }

  // o pouso: ela achata na batida, as lâmpadas acendem (primeiro as fortes,
  // depois a meia-luz) e tudo para
  const strong = levels.map((level) => (level >= 2 ? 2 : 0));
  const rest = restPose(to, form, levels, tint);
  const ten = (step: number) => (tenColumn !== null ? { burst: { x: tenColumn, y: DECK + 7, step, color: ratingTone(10).color } } : {});
  poses.push({ ...rest, y: rest.y + 1, levels: strong, stretch: [1.2, 0.8], dust: 0, ...ten(0) });
  poses.push({ ...rest, flap: 0.78, twinkle: true, dust: 1, ...ten(1) });
  if (tenColumn !== null) poses.push({ ...rest, ...ten(2) });
  poses.push(rest);
  return poses;
}

// A mariposa aparece depois (a cena dela chegou tarde): só o clarão, no lugar.
const latePoses = (column: number, levels: number[], tint: string): Pose[] => {
  const rest = restPose(column, 'moth', levels, tint);
  const empty = { ...rest, form: 'none' as const };
  return [
    { ...empty, burst: { x: column, y: PERCH_Y, step: 0, color: tint } },
    { ...empty, burst: { x: column, y: PERCH_Y, step: 1, color: tint } },
    { ...rest, flap: 0.5, burst: { x: column, y: PERCH_Y, step: 2, color: tint } },
    { ...rest, flap: 0.78 },
    rest,
  ];
};

// A mariposa em uma linha: muda só quando o desenho dela muda.
const specKeyOf = (spec: MothSpec | null): string =>
  spec ? [spec.shape, spec.third, spec.stage, spec.bands.map((band) => `${band.letter}${band.upTo.toFixed(2)}`).join(','), spec.eyes.map((eye) => `${eye.letter}${eye.gold ? 'g' : ''}`).join(',')].join('|') : '';

interface PredictionGaugeProps {
  // a nota dos selos (inteira, já com o corte de 9 e 10)
  predicted: number | null;
  // a expectativa e a largura (ruído pessoal) do modelo
  mu: number | null;
  sigma: number | null;
  // a chance de nota 10 (0 a 1)
  tenChance: number | null;
  // a previsão ainda não chegou: a fagulha espera
  pending?: boolean;
  // de quem é o Patrono (quem está vendo o título)
  userId?: string | null;
}

const PredictionGauge: React.FC<PredictionGaugeProps> = ({ predicted, mu, sigma, tenChance, pending = false, userId }) => {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const patronus = usePatronus(userId);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [available, setAvailable] = useState(212);
  const layout = useMemo<Layout>(() => layoutFor(available), [available]);

  const shown = predicted ?? (mu !== null ? Math.round(mu) : null);
  const ready = !pending && shown !== null;
  const spot = shown !== null ? landingSpot(shown, mu) : 5;
  const levelsKey = ready && shown !== null ? lampLevels(shown, mu, sigma, tenChance).join('') : '';
  // a cena depende do desenho da mariposa, não do objeto (o mesmo desenho
  // conferido de novo com o banco não reinicia nada)
  const specKey = specKeyOf(patronus.spec);
  const specRef = useRef(patronus.spec);
  specRef.current = patronus.spec;

  // os desenhos do Patrono já prontos (um por batida de asa e por cor)
  const sprites = useRef(new Map<string, Sprite>());
  useEffect(() => {
    sprites.current.clear();
  }, [specKey]);

  // onde a cena está: esperando, no meio do movimento, ou já pousada
  const stage = useRef<{ phase: 'idle' | 'event' | 'rest'; idleSince: number; spot: number; form: Form }>({ phase: 'idle', idleSince: 0, spot: 5, form: 'wisp' });

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const measure = () => setAvailable(wrap.clientWidth);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const sprite = (pose: Pose, flap: number): Sprite => {
      const spec = specRef.current;
      const moth = pose.form === 'moth' && spec;
      const id = moth ? `m${flap}${pose.gaze ?? 0}${pose.tint}` : `w${pose.twinkle ? 1 : 0}${pose.tint}`;
      const hit = sprites.current.get(id);
      if (hit) return hit;
      const made = moth ? patronusSprite(spec, SPAN, flap, pose.tint, pose.gaze ?? 0) : wispSprite(Boolean(pose.twinkle), pose.tint);
      sprites.current.set(id, made);
      return made;
    };
    const paint = (pose: Pose) => {
      ctx.clearRect(0, 0, layout.width, layout.height);
      ctx.imageSmoothingEnabled = false;
      if (pose.speed) drawSpeedLines(ctx, pose.speed.from, pose.speed.to, pose.speed.y, 'rgba(243,234,211,0.5)');
      drawConsole(ctx, layout, pose.levels, pose.beacon);
      drawNeedle(ctx, pose.needle);
      if (pose.bolt !== undefined) {
        // o raio que chama o Patrono: um zigue-zague entre o cursor e a fagulha
        const flip = pose.bolt ? 1 : 0;
        for (let row = 0; row < 4; row += 1) {
          ctx.fillStyle = row % 2 === flip ? '#FFFFFF' : PATRONUS_SKY;
          ctx.fillRect(pose.needle - 1 + ((row + flip) % 2), DECK - 9 + row, 1, 1);
        }
      }
      if (pose.form !== 'none') {
        (pose.ghosts ?? []).forEach((ghost) => {
          const image = sprite(pose, ghost.flap ?? 1);
          ctx.globalAlpha = ghost.alpha;
          ctx.drawImage(image.canvas, ghost.x - image.ax, ghost.y - image.ay);
        });
        ctx.globalAlpha = 1;
        const image = sprite(pose, pose.flap ?? 1);
        const [wide, tall] = pose.stretch ?? [1, 1];
        if (wide === 1 && tall === 1) ctx.drawImage(image.canvas, pose.x - image.ax, pose.y - image.ay);
        else {
          // estica e amassa em volta do centro do corpo, sempre em pixel inteiro
          const w = Math.round(image.canvas.width * wide);
          const h = Math.round(image.canvas.height * tall);
          ctx.drawImage(image.canvas, pose.x - Math.round(image.ax * wide), pose.y - Math.round(image.ay * tall), w, h);
        }
      }
      if (pose.burst) drawBurst(ctx, pose.burst.x, pose.burst.y, pose.burst.step, pose.burst.color);
      if (pose.dust !== undefined) {
        // a poeirinha do pouso
        const reach = pose.dust ? 7 : 5;
        ctx.fillStyle = 'rgba(243,234,211,0.7)';
        ctx.fillRect(pose.needle - reach - 5, DECK - 2 - pose.dust, 1, 1);
        ctx.fillRect(pose.needle + reach + 4, DECK - 2 - pose.dust, 1, 1);
      }
    };

    let frame = 0;
    const timers: number[] = [];
    // Toca uma lista de poses, uma por batida. Em laço (a espera) ou até a
    // última, que fica na tela (a cena).
    const play = (poses: Pose[], loop: boolean, onEnd?: () => void) => {
      const started = performance.now();
      let shownIndex = -1;
      const step = (now: number) => {
        const index = Math.max(0, Math.floor((now - started) / TICK_MS));
        if (index !== shownIndex) {
          shownIndex = index;
          if (!loop && index >= poses.length - 1) {
            paint(poses[poses.length - 1]);
            frame = 0;
            onEnd?.();
            return;
          }
          paint(poses[loop ? index % poses.length : index]);
        }
        frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    };
    const stop = () => {
      if (frame) cancelAnimationFrame(frame);
      timers.forEach((id) => window.clearTimeout(id));
    };

    const now = performance.now();
    const center = columnOf(layout, 5);
    const state = stage.current;

    if (!ready || shown === null) {
      // esperando a previsão
      if (state.phase !== 'idle' || !state.idleSince) stage.current = { phase: 'idle', idleSince: now, spot: 5, form: 'wisp' };
      const poses = idlePoses(center);
      if (reduceMotion) paint({ ...poses[0], bolt: undefined, beacon: null });
      else {
        paint(poses[0]);
        play(poses, true);
      }
      return stop;
    }

    const levels = levelsKey.split('').map(Number);
    const tint = landingTint(shown);
    const form: Form = specKey ? 'moth' : 'wisp';
    const to = columnOf(layout, spot);
    const rest = restPose(to, form, levels, tint);
    const tenColumn = shown === 10 ? columnOf(layout, 10) : null;
    const land = () => {
      stage.current = { phase: 'rest', idleSince: 0, spot, form };
    };

    if (reduceMotion || state.phase === 'event') {
      // sem movimento (ou algo mudou no meio do movimento): direto ao pouso
      paint(rest);
      land();
      return stop;
    }
    if (state.phase === 'rest') {
      if (state.form === 'wisp' && form === 'moth' && state.spot === spot) {
        // a mariposa chegou depois do pouso
        stage.current = { ...state, phase: 'event' };
        play(latePoses(to, levels, tint), false, land);
      } else if (state.spot !== spot) {
        // outra previsão para o mesmo aparelho: o Patrono vai de onde está
        stage.current = { ...state, phase: 'event' };
        play(eventPoses(columnOf(layout, state.spot), to, form, levels, tint, false, tenColumn), false, land);
      } else {
        // mesma previsão (mudou o tamanho da tela ou o desenho): redesenha parado
        paint(rest);
        land();
      }
      return stop;
    }

    // da espera ao pouso: a fagulha fica um instante e a cena começa
    if (!state.idleSince) stage.current = { ...state, idleSince: now };
    const begin = stage.current.idleSince + MIN_IDLE_MS + (patronus.settled ? 0 : PATRONUS_WAIT_MS);
    const waiting = idlePoses(center);
    paint(waiting[0]);
    play(waiting, true);
    timers.push(
      window.setTimeout(
        () => {
          if (frame) cancelAnimationFrame(frame);
          stage.current = { ...stage.current, phase: 'event' };
          play(eventPoses(center, to, form, levels, tint, true, tenColumn), false, land);
        },
        Math.max(0, begin - now),
      ),
    );
    return stop;
  }, [layout, ready, shown, spot, levelsKey, specKey, patronus.settled, reduceMotion]);

  const label =
    !ready || shown === null
      ? t('movieModal.score.gaugePending')
      : tenChance !== null && shown <= 9
        ? t('movieModal.score.gaugeAria', { rating: shown, chance: formatChance(tenChance) })
        : t('movieModal.score.gaugeAriaPlain', { rating: shown });

  return (
    <span ref={wrapRef} className="block w-full">
      {/* a folga dos lados (a asa do Patrono passa da ponta da escala) vaza para a margem da coluna */}
      <span className="flex justify-center md:justify-start" style={{ marginInline: -(layout.bodyX * SCALE) }}>
        <canvas
          ref={canvasRef}
          width={layout.width}
          height={layout.height}
          role="img"
          aria-label={label}
          title={ready ? label : undefined}
          className="block shrink-0"
          style={{ width: layout.width * SCALE, height: layout.height * SCALE, imageRendering: 'pixelated' }}
        />
      </span>
    </span>
  );
};

export default PredictionGauge;
