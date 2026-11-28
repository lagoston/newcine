import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Info } from 'lucide-react';
import { FOCUS_RING, MIST, PAPER, PIXEL, ORACLES } from '../../lib/oracleTheme';
import { MOOD_BY_KEY } from '../../lib/moods';
import { ambientInterval, useCalm } from '../../lib/motion';
import { mentorTint, type OracleAffinity } from '../../lib/oracleAffinity';
import type { OracleSlot } from '../../lib/mesa/types';
import { usePatronus } from '../patronus/patronus';
import { useSeasonalEvent } from '../../contexts/SeasonalEventContext';
import { drawBurst, PATRONUS_SKY, wispSprite, type Sprite } from '../patronus/sprite';
import { drawMoth, mothScale, type MothSpec } from '../personaWorld/draw';
import { HALL_H, MENTOR_HEAD_Y, drawHall, mentorCenters, type HallState } from './mentorArt';

// O salão dos mentores (25/11/2026): as três abas de oráculo do Acervo viram
// uma cena em pixels. Pedido do Bruno: remodelar o Acervo "mantendo as
// estruturas", na pegada "mitológica, hotel habboolística, da dungeons and
// dragons"; os mentores vestem a cor da prateleira em que a pessoa mais os
// procura; e "o verdadeiro GAME onde a mariposinha que vive no estúdio do
// cinéfilo é a personagem que adentra nele". Logo depois: "tem que ser tudo
// intuitivo e prático também, para que um usuário comum possa se deleitar sem
// necessariamente 'jogar'".
//
// Por isso a estrutura é a mesma das abas de antes (AcervoTabs, 05/11): três
// botões lado a lado, um toque troca de oráculo, tocar de novo no ativo abre o
// perfil dele, as setas do teclado andam entre eles. A cena é só o fundo desses
// três botões; ninguém precisa entender nada dela para usar.
//   • cada mentor (o sapo de capuz, a raposa de terno, a cobra de boina) leva
//     no corpo a cor da prateleira dele para esta pessoa, e o nome diz qual é
//     ("Raposa Catártica");
//   • a mariposa da pessoa (a mesma do estúdio, usePatronus) entra voando no
//     salão e pousa ao lado do mentor escolhido; quem ainda não tem Persona
//     vê a fagulha no lugar dela;
//   • quando a pessoa dá nota a um título daqui, a mariposa solta um clarão.
// Com "menos movimento" (ou no modo economia) a cena é um quadro parado.

interface MentorHallProps {
  active: OracleSlot;
  panelId: string;
  // undefined = ainda chegando; null = não há (cada mentor fica na cor de sempre)
  affinity: OracleAffinity | null | undefined;
  userId: string | undefined;
  onSelect: (oracle: OracleSlot) => void;
  onOpenProfile: (oracle: OracleSlot) => void;
  // sobe 1 cada vez que a pessoa avalia um título do Acervo
  pulse?: number;
}

const FRAME_MS = 125;
// meia envergadura da mariposa no salão (o mentor tem 21 pixels de largura)
const MOTH_SPAN = 6;
// o pulinho do mentor quando é chamado (pixels acima do chão, um por quadro)
const HOP = [2, 3, 2, 1];
// Em telas baixas (celular pequeno, celular deitado) a cena perde as 16 linhas
// de cima (o alto das estantes): os mentores e as tochas ficam, e a grade de
// títulos sobe 32 px. "Tem que ser tudo intuitivo e prático também."
const SHORT_SCREEN = 720;
const SHORT_CROP = 16;
// "Sapo Aventureiro", "Raposa Aventureira": o gênero da palavra em português
const GENDER: Record<OracleSlot, 'm' | 'f'> = { bogart: 'm', fincher: 'f', cypher: 'f' };

interface Scene {
  tick: number;
  // onde a mariposa está (null = ainda não entrou)
  mothX: number | null;
  hop: number | null;
  burst: number | null;
}

const MentorHall: React.FC<MentorHallProps> = ({ active, panelId, affinity, userId, onSelect, onOpenProfile, pulse = 0 }) => {
  const { t } = useTranslation();
  const calm = useCalm();
  const patronus = usePatronus(userId);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // a cena tem HALL_H pixels de altura e é ampliada k vezes (k inteiro, para
  // o pixel não borrar); a largura dela acompanha a da tela
  const [box, setBox] = useState({ k: 2, w: 164 });
  const [crop, setCrop] = useState(0);

  useEffect(() => {
    const measure = () => setCrop(window.innerHeight < SHORT_SCREEN ? SHORT_CROP : 0);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const width = el.clientWidth;
      if (!width) return;
      const k = width >= 620 ? 3 : 2;
      const w = Math.ceil(width / k);
      setBox((current) => (current.k === k && current.w === w ? current : { k, w }));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // a cor de cada mentor e as lombadas do nicho dele (as três prateleiras de cima)
  const mentors = useMemo(() => {
    const out = {} as HallState['mentors'];
    ORACLES.forEach((oracle) => {
      const order = affinity?.[oracle.id].order;
      out[oracle.id] = {
        tint: mentorTint(affinity, oracle.id),
        shelf: order ? order.slice(0, 3).map((key) => MOOD_BY_KEY[key].color) : [oracle.color],
      };
    });
    return out;
  }, [affinity]);

  const scene = useRef<Scene>({ tick: 0, mothX: null, hop: null, burst: null });
  const wisps = useRef<{ on?: Sprite; off?: Sprite }>({});
  // o que o desenho lê a cada quadro (sem recriar o laço quando algo muda)
  // 28/11/2026: com o Natal no ar o salão ganha o varal de luzes e os três, o gorro
  const festive = useSeasonalEvent().event?.id === 'christmas';
  const latest = useRef({ active, mentors, box, calm, festive, spec: patronus.spec as MothSpec | null, settled: patronus.settled });
  latest.current = { active, mentors, box, calm, festive, spec: patronus.spec, settled: patronus.settled };

  // onde a mariposa quer estar: ao lado da cabeça do mentor escolhido
  const mothTarget = () => {
    const now = latest.current;
    return Math.min(now.box.w - MOTH_SPAN - 3, mentorCenters(now.box.w)[now.active] + 13);
  };

  // Só desenha (quem anda com a cena é o laço, mais abaixo): pode ser chamado
  // a qualquer hora sem adiantar nada.
  const paint = useRef(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const now = latest.current;
    const state = scene.current;
    const width = now.box.w;
    const still = now.calm;
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, width, HALL_H);
    const hop = !still && state.hop !== null ? (HOP[state.hop] ?? 0) : 0;
    drawHall(ctx, width, { active: now.active, mentors: now.mentors, tick: still ? 0 : state.tick, hop, festive: now.festive });

    // A mariposa: paira ao lado do mentor escolhido; ao trocar de mentor, voa
    // até o outro; na primeira vez, entra pela esquerda do salão.
    if (!now.settled) return;
    const target = mothTarget();
    if (state.mothX === null) state.mothX = still ? target : -MOTH_SPAN - 2;
    if (still) state.mothX = target;
    const flying = Math.abs(target - state.mothX) >= 1;
    const x = Math.round(state.mothX);
    const bob = still ? 0 : Math.round(Math.sin(state.tick / 3) * 1.2);
    const y = MENTOR_HEAD_Y + 2 + bob - (flying ? 2 : 0);
    if (now.spec) {
      const beat = flying ? state.tick % 2 : Math.floor(state.tick / 2) % 4;
      const flap = still ? 1 : flying ? [1, 0.5][beat] : [1, 0.75, 0.5, 0.75][beat];
      drawMoth(ctx, x, y, MOTH_SPAN / mothScale(now.spec.stage), now.spec, flap, true);
    } else {
      // sem Persona ainda: a fagulha (o Patrono que não tomou forma)
      const twinkle = !still && Math.floor(state.tick / 3) % 2 === 1;
      const slot = twinkle ? 'on' : 'off';
      const sprite = wisps.current[slot] ?? (wisps.current[slot] = wispSprite(twinkle, PATRONUS_SKY));
      ctx.drawImage(sprite.canvas, x - sprite.ax, y - sprite.ay);
    }
    if (!still && state.burst !== null) drawBurst(ctx, x, y, state.burst, now.mentors[now.active].tint);
  });

  // O laço da cena: só existe com o salão na tela e o app na frente (lib/motion).
  // A cada quadro o relógio anda, a mariposa chega mais perto de onde quer estar
  // e o pulinho e o clarão avançam um passo.
  useEffect(() => {
    paint.current();
    if (calm) return;
    return ambientInterval(
      wrapRef.current,
      (steps) => {
        const state = scene.current;
        state.tick += steps;
        if (state.mothX !== null) {
          const gap = mothTarget() - state.mothX;
          state.mothX = Math.abs(gap) < 1 ? state.mothX + gap : state.mothX + Math.sign(gap) * Math.max(1, Math.abs(gap) * 0.24 * steps);
        }
        paint.current();
        if (state.hop !== null) state.hop = state.hop + steps >= HOP.length ? null : state.hop + steps;
        if (state.burst !== null) state.burst = state.burst >= 2 ? null : state.burst + 1;
      },
      FRAME_MS
    );
  }, [calm, box]);

  // mudou algo que aparece (a cor, o mentor, a mariposa): desenha já, sem esperar o próximo quadro
  const specKey = patronus.spec ? JSON.stringify(patronus.spec) : patronus.settled ? 'wisp' : '';
  useEffect(() => {
    paint.current();
  }, [mentors, specKey, festive]);

  // trocou de mentor: ele dá um pulinho
  const firstActive = useRef(true);
  useEffect(() => {
    if (firstActive.current) firstActive.current = false;
    else scene.current.hop = 0;
    paint.current();
  }, [active]);

  // a pessoa avaliou um título daqui: o clarão na mariposa
  const firstPulse = useRef(true);
  useEffect(() => {
    if (firstPulse.current) {
      firstPulse.current = false;
      return;
    }
    scene.current.burst = 0;
  }, [pulse]);

  const epithetOf = (slot: OracleSlot): string => {
    const key = affinity?.[slot].order[0];
    const mood = key ? MOOD_BY_KEY[key] : null;
    if (!mood) return '';
    const short = mood.labelKey.split('.').pop();
    return t('acervo.hall.epithet', { animal: t(`acervo.hall.animal.${slot}`), mood: t(`acervo.hall.mood.${short}.${GENDER[slot]}`) });
  };

  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    const last = ORACLES.length - 1;
    let next = -1;
    if (e.key === 'ArrowRight') next = index === last ? 0 : index + 1;
    else if (e.key === 'ArrowLeft') next = index === 0 ? last : index - 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = last;
    if (next < 0) return;
    e.preventDefault();
    refs.current[next]?.focus();
    onSelect(ORACLES[next].id);
  };

  const sceneHeight = (HALL_H - crop) * box.k;

  return (
    <div ref={wrapRef} className="relative lg:max-w-[720px]">
      {/* A cena: fica atrás dos três botões e não recebe toque nenhum. */}
      <div aria-hidden className="absolute inset-x-0 top-0 overflow-hidden rounded-xl pointer-events-none" style={{ height: sceneHeight, boxShadow: 'inset 0 0 0 1px rgba(243,234,211,0.1)' }}>
        <canvas
          ref={canvasRef}
          width={box.w}
          height={HALL_H}
          className="block max-w-none"
          style={{ width: box.w * box.k, height: HALL_H * box.k, marginTop: -crop * box.k, imageRendering: 'pixelated' }}
        />
      </div>

      {/* role="tablist" com roving tabindex: Tab entra na aba ativa, as setas andam. */}
      <div role="tablist" aria-label={t('acervo.title')} className="relative grid grid-cols-3">
        {ORACLES.map((oracle, index) => {
          const isActive = oracle.id === active;
          const tint = mentors[oracle.id].tint;
          const epithet = epithetOf(oracle.id);
          const name = [t('acervo.oracleTab', { oracle: oracle.name }), epithet].filter(Boolean).join(', ');
          return (
            <button
              key={oracle.id}
              ref={(el) => {
                refs.current[index] = el;
              }}
              type="button"
              role="tab"
              id={`acervo-tab-${oracle.id}`}
              aria-selected={isActive}
              aria-controls={panelId}
              tabIndex={isActive ? 0 : -1}
              // Na ativa, o nome acessível diz o que o toque faz agora (abrir o perfil).
              aria-label={isActive ? `${name}. ${t('acervo.profileHint')}` : name}
              title={isActive ? t('acervo.profileHint') : undefined}
              onClick={() => (isActive ? onOpenProfile(oracle.id) : onSelect(oracle.id))}
              onKeyDown={(e) => onKeyDown(e, index)}
              className={`group relative flex flex-col items-center min-w-0 pb-[7px] rounded-xl focus-visible:z-10 ${FOCUS_RING}`}
              style={{ paddingTop: sceneHeight + 6 }}
            >
              <span className="flex items-center justify-center gap-1 max-w-full">
                <span
                  style={{ ...PIXEL, color: isActive ? PAPER : MIST }}
                  className={`truncate text-[16px] sm:text-[18px] leading-none transition-colors ${isActive ? '' : 'group-hover:text-[#F3EAD3]'}`}
                >
                  {oracle.name}
                </span>
                {/* a marca de "saiba mais": a aba ativa abre o perfil do oráculo
                    (o bonequinho de perfil, neste tamanho, parecia um ®) */}
                {isActive && <Info className="w-3.5 h-3.5 shrink-0" style={{ color: MIST }} strokeWidth={2.2} aria-hidden />}
              </span>
              {/* a linha fica reservada: nada pula quando a cor do mentor chega */}
              <span
                className="mt-[3px] max-w-full truncate whitespace-nowrap text-[11px] max-[389px]:text-[10.5px] max-[389px]:tracking-tight sm:text-xs leading-[14px] min-h-[14px] text-center"
                style={{ color: tint, opacity: isActive ? 1 : 0.72 }}
              >
                {epithet || ' '}
              </span>
              {/* o traço na cor da prateleira, embaixo de quem está falando */}
              <span aria-hidden className="absolute left-[22%] right-[22%] bottom-0 h-[3px] rounded-full transition-opacity" style={{ background: tint, opacity: isActive ? 1 : 0 }} />
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default MentorHall;
