import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { spectrumColor } from '../lib/prediction';

// O Fio do Destino (14/11/2026): a nota prevista nas capas.
//
// Pedido do Bruno: tirar o número de cima do pôster ("o nosso refúgio
// sagrado") e pôr no lugar uma linha fina na base da capa. "Borda brilhando
// no canto direito em tom dourado? É um filme para mim. Borda apagada no
// canto esquerdo? Passo."
//
//   • O fio: uma linha de 3 px na base do pôster, na cor da previsão (azul
//     gélido, púrpura ou dourado — a mesma paleta do Astrolábio do menu).
//   • A centelha: um ponto de luz com um rastro curto, parado na posição da
//     nota (esquerda = baixa, direita = alta). Em repouso tudo fica discreto.
//   • Ao passar o mouse, ao tocar ou ao chegar pelo teclado, o fio acende e a
//     centelha corre da esquerda até o lugar dela.
//   • No celular não existe "passar o mouse": ali a centelha corre uma vez,
//     sozinha, quando a capa entra na tela.
//
// Não é uma barra de progresso: não há trecho preenchido, só o fio inteiro
// bem apagado e a centelha com o rastro. O número continua no texto para
// leitores de tela. Com "reduzir movimento" a centelha não corre; o fio só
// acende.

// Um vigia só para todas as capas da página (celular: a centelha corre uma
// vez quando a capa aparece).
const arrivals = new WeakMap<Element, () => void>();
let watcher: IntersectionObserver | null = null;
const watchArrival = (element: Element, onArrive: () => void): (() => void) => {
  if (typeof IntersectionObserver === 'undefined') return () => undefined;
  if (!watcher) {
    watcher = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const arrive = arrivals.get(entry.target);
          arrivals.delete(entry.target);
          watcher?.unobserve(entry.target);
          arrive?.();
        });
      },
      { threshold: 0.6 },
    );
  }
  arrivals.set(element, onArrive);
  watcher.observe(element);
  return () => {
    arrivals.delete(element);
    watcher?.unobserve(element);
  };
};

interface FateThreadProps {
  // a nota prevista (0 a 10)
  rating: number;
  // palpite (quem ainda tem poucas notas): o fio fica mais apagado
  quiet?: boolean;
  // quantos pixels acima da base (ex.: por cima da barra de episódios de uma série)
  lift?: number;
  // o texto para leitores de tela (padrão: "Nota prevista para você: N")
  label?: string;
}

const FateThread: React.FC<FateThreadProps> = ({ rating, quiet = false, lift = 0, label }) => {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const rootRef = useRef<HTMLSpanElement>(null);
  const runnerRef = useRef<HTMLSpanElement>(null);
  const sparkRef = useRef<HTMLSpanElement>(null);
  const [lit, setLit] = useState(false);
  const stop = Math.min(10, Math.max(0, rating)) * 10;

  // A centelha corre da esquerda até a posição da nota (mais longe, um pouco mais de tempo).
  const run = useCallback(() => {
    const runner = runnerRef.current;
    const spark = sparkRef.current;
    if (reduceMotion || !runner || !spark || typeof runner.animate !== 'function') return;
    const duration = 260 + stop * 3.6;
    runner.getAnimations().forEach((animation) => animation.cancel());
    spark.getAnimations().forEach((animation) => animation.cancel());
    runner.animate([{ transform: 'translateX(0%)' }, { transform: `translateX(${stop}%)` }], { duration, easing: 'cubic-bezier(0.2, 0.75, 0.25, 1)' });
    spark.animate([{ transform: 'scale(0.7)' }, { transform: 'scale(2.2)', offset: 0.78 }, { transform: 'scale(1)' }], { duration: duration + 240, easing: 'ease-out' });
  }, [reduceMotion, stop]);

  useEffect(() => {
    const root = rootRef.current;
    // quem recebe o mouse, o toque e o foco é o botão da capa (ou, sem botão, o pôster)
    const host = (root?.closest('button, a, [role="button"]') as HTMLElement | null) ?? root?.parentElement;
    if (!root || !host) return;
    let fading: number | undefined;
    const ignite = () => {
      window.clearTimeout(fading);
      setLit(true);
      run();
    };
    const fade = (delay = 0) => {
      window.clearTimeout(fading);
      fading = window.setTimeout(() => setLit(false), delay);
    };
    const enter = (event: PointerEvent) => event.pointerType === 'mouse' && ignite();
    const leave = (event: PointerEvent) => event.pointerType === 'mouse' && fade();
    const press = (event: PointerEvent) => {
      if (event.pointerType === 'mouse') return;
      ignite();
      fade(1200);
    };
    const focus = () => host.matches(':focus-visible') && ignite();
    const blur = () => fade();
    host.addEventListener('pointerenter', enter);
    host.addEventListener('pointerleave', leave);
    host.addEventListener('pointerdown', press);
    host.addEventListener('focusin', focus);
    host.addEventListener('focusout', blur);

    let arriving: number | undefined;
    const unwatch =
      typeof window.matchMedia === 'function' && window.matchMedia('(hover: none)').matches
        ? watchArrival(root, () => {
            // um atraso sorteado: as capas de uma fileira não acendem todas no mesmo instante
            arriving = window.setTimeout(() => {
              ignite();
              fade(1300);
            }, Math.random() * 380);
          })
        : () => undefined;

    return () => {
      host.removeEventListener('pointerenter', enter);
      host.removeEventListener('pointerleave', leave);
      host.removeEventListener('pointerdown', press);
      host.removeEventListener('focusin', focus);
      host.removeEventListener('focusout', blur);
      window.clearTimeout(fading);
      window.clearTimeout(arriving);
      unwatch();
    };
  }, [run]);

  return (
    <span
      ref={rootRef}
      className="fate-thread"
      data-lit={lit}
      data-quiet={quiet || undefined}
      style={{ '--fate-color': spectrumColor(rating), '--fate-stop': `${stop}%`, '--fate-tail': `${Math.min(34, stop)}%`, bottom: lift || undefined } as React.CSSProperties}
    >
      <span className="sr-only">{label ?? `${t('home.desk.predictedForYou')}: ${rating}`}</span>
      <span aria-hidden className="fate-thread__shade" />
      <span aria-hidden className="fate-thread__track">
        <span className="fate-thread__line" />
        <span ref={runnerRef} className="fate-thread__runner">
          <span className="fate-thread__tail" />
          <span ref={sparkRef} className="fate-thread__spark" />
        </span>
      </span>
    </span>
  );
};

export default FateThread;
