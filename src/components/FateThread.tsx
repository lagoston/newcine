import React, { useEffect, useRef } from 'react';
import { useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { ratingBarColor, ratingTone } from '../lib/oracleTheme';

// O Fio do Destino (14/11/2026): a nota prevista nas capas.
//
// Pedido do Bruno: tirar o número de cima do pôster ("o nosso refúgio
// sagrado") e pôr no lugar uma linha fina na base da capa, com uma centelha
// parada na posição da nota (esquerda = baixa, direita = alta).
//
// Ajustes do mesmo dia, também a pedido dele:
//   • As cores são as do padrão do site para nota (as das prateleiras da
//     biblioteca): cinza no 0, vermelho de 1 a 3, amarelo de 4 a 6, verde de
//     7 a 9 e rosa no 10. A primeira versão tinha uma paleta própria (azul,
//     púrpura, dourado).
//   • A centelha corre UMA vez, quando a capa aparece na tela, e para. A
//     primeira versão corria de novo a cada passada do mouse, a cada toque e a
//     cada foco do teclado: "a animação da capa está reiniciando toda hora".
//     Agora não há nada ligado ao mouse nem ao toque. E a corrida vale uma vez
//     por título em cada visita ao site (runKey): voltar para a página, ou ver
//     o mesmo título em outra fileira, não corre de novo.
//
// A centelha é o Patrono da pessoa na forma de fagulha (ver a diretriz do
// Espectro Patrono): nas capas ele só passa; no menu do título ele toma corpo.
//
// Não é uma barra de progresso: não há trecho preenchido, só o fio inteiro
// bem apagado e a centelha com um rastro curto. O número continua no texto
// para leitores de tela. Com "reduzir movimento" a centelha não corre.

// Os títulos cuja centelha já correu nesta visita.
const alreadyRan = new Set<string>();

// Um vigia só para todas as capas da página.
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
  // qual é o título ("movie:603"): a centelha corre uma vez só por título
  runKey?: string;
}

const FateThread: React.FC<FateThreadProps> = ({ rating, quiet = false, lift = 0, label, runKey }) => {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const rootRef = useRef<HTMLSpanElement>(null);
  const runnerRef = useRef<HTMLSpanElement>(null);
  const sparkRef = useRef<HTMLSpanElement>(null);
  const stop = Math.min(10, Math.max(0, rating)) * 10;
  const band = Math.round(Math.min(10, Math.max(0, rating)));

  // A corrida: uma vez, na primeira vez em que a capa aparece na tela.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || reduceMotion) return;
    if (runKey && alreadyRan.has(runKey)) return;
    let delay: number | undefined;
    const unwatch = watchArrival(root, () => {
      if (runKey) alreadyRan.add(runKey);
      // um atraso sorteado: as capas de uma fileira não correm todas no mesmo instante
      delay = window.setTimeout(() => {
        const runner = runnerRef.current;
        const spark = sparkRef.current;
        if (!runner || !spark || typeof runner.animate !== 'function') return;
        // mais longe, um pouco mais de tempo
        const duration = 260 + stop * 3.6;
        runner.animate([{ transform: 'translateX(0%)' }, { transform: `translateX(${stop}%)` }], { duration, easing: 'cubic-bezier(0.2, 0.75, 0.25, 1)' });
        spark.animate([{ transform: 'rotate(45deg) scale(0.7)' }, { transform: 'rotate(45deg) scale(1.9)', offset: 0.78 }, { transform: 'rotate(45deg) scale(1)' }], { duration: duration + 240, easing: 'ease-out' });
      }, Math.random() * 380);
    });
    return () => {
      window.clearTimeout(delay);
      unwatch();
    };
    // só na chegada: se a nota mudar depois, a centelha troca de lugar sem correr
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduceMotion, runKey]);

  return (
    <span
      ref={rootRef}
      className="fate-thread"
      data-quiet={quiet || undefined}
      style={
        {
          '--fate-color': ratingTone(band).color,
          '--fate-deep': ratingBarColor(band),
          '--fate-stop': `${stop}%`,
          '--fate-tail': `${Math.min(34, stop)}%`,
          bottom: lift || undefined,
        } as React.CSSProperties
      }
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
