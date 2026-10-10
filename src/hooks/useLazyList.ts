import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Movie } from '../lib/tmdb';
import { TitleRef, loadTitleCards, peekTitleCard, titleKey } from '../lib/titleCards';

// Peças das listas "sob demanda" (10/10/2026): uma prateleira só busca o que
// mostra quando chega perto da tela, vai buscando mais conforme a pessoa rola
// de lado, e cada pôster entra com uma animação suave ao aparecer.

const hasIO = () => typeof window !== 'undefined' && 'IntersectionObserver' in window;

// Sobe na árvore até achar quem rola no eixo pedido (a faixa de pôsteres, a
// janela de "Ver todos"...). null = a própria página.
function findScrollParent(el: Element | null, axis: 'x' | 'y'): Element | null {
  let node = el?.parentElement || null;
  while (node && node !== document.body && node !== document.documentElement) {
    const style = window.getComputedStyle(node);
    const overflow = axis === 'x' ? style.overflowX : style.overflowY;
    if (overflow === 'auto' || overflow === 'scroll') return node;
    node = node.parentElement;
  }
  return null;
}

// true depois que o elemento chega a `margin` px da tela (e continua true).
export function useInViewOnce<T extends Element>(margin = 700): [(el: T | null) => void, boolean] {
  const [el, setEl] = useState<T | null>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (seen || !el) return;
    if (!hasIO()) {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setSeen(true);
      },
      { rootMargin: `${margin}px 0px ${margin}px 0px` }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [el, seen, margin]);
  return [setEl, seen];
}

interface ProgressiveOptions {
  total: number;
  // Quantos aparecem de cara e quantos entram a cada vez que o fim se aproxima.
  initial: number;
  step: number;
  enabled: boolean;
  // Rolagem de lado (faixa de pôsteres) ou para baixo (grade).
  axis?: 'x' | 'y';
  // Antecedência, em px, com que o próximo lote é pedido.
  margin?: number;
  // Muda quando a lista é outra (filtro, ordem): volta ao primeiro lote.
  resetKey?: string;
}

// Quantos itens mostrar. endRef vai num marcador logo depois do último item:
// quando ele chega perto da borda de quem rola, entra mais um lote — e de
// novo, enquanto continuar perto (uma faixa larga se completa sozinha).
export function useProgressiveCount({ total, initial, step, enabled, axis = 'x', margin = 420, resetKey = '' }: ProgressiveOptions) {
  const [count, setCount] = useState(initial);
  const lastReset = useRef(resetKey);
  if (lastReset.current !== resetKey) {
    lastReset.current = resetKey;
    // reinicia já neste render (sem um quadro com o lote antigo)
    if (count !== initial) setCount(initial);
  }
  const shown = Math.min(count, total);

  const [endEl, setEndEl] = useState<Element | null>(null);
  const endRef = useCallback((el: Element | null) => setEndEl(el), []);

  useEffect(() => {
    if (!enabled || !endEl || shown >= total) return;
    if (!hasIO()) {
      setCount(total);
      return;
    }
    const root = findScrollParent(endEl, axis);
    const rootMargin = axis === 'x' ? `0px ${margin}px 0px ${margin}px` : `${margin}px 0px ${margin}px 0px`;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setCount((c) => Math.min(total, Math.max(c, shown) + step));
        }
      },
      { root, rootMargin }
    );
    io.observe(endEl);
    return () => io.disconnect();
  }, [enabled, endEl, shown, total, step, axis, margin]);

  return { count: shown, endRef, hasMore: shown < total };
}

// Cartões dos primeiros `count` títulos (mais `ahead` de folga, pra estarem
// prontos antes de a pessoa chegar neles). Re-renderiza quando chegam.
export function useTitleCards(refs: TitleRef[], count: number, { enabled = true, ahead = 6 } = {}) {
  const { i18n } = useTranslation();
  const [, setVersion] = useState(0);
  const wanted = useMemo(() => refs.slice(0, Math.min(refs.length, count + ahead)), [refs, count, ahead]);
  const wantedKey = useMemo(() => wanted.map(titleKey).join(','), [wanted]);
  const lang = i18n.language;

  useEffect(() => {
    if (!enabled || wanted.length === 0) return;
    const missing = wanted.filter((ref) => !peekTitleCard(ref));
    if (missing.length === 0) return;
    let alive = true;
    loadTitleCards(missing).then(() => {
      if (alive) setVersion((v) => v + 1);
    });
    return () => {
      alive = false;
    };
    // wantedKey resume `wanted`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, wantedKey, lang]);

  return useCallback((ref: TitleRef): Movie | undefined => peekTitleCard(ref), [
    // novo identificador a cada idioma, pra quem usa memo re-renderizar
    // eslint-disable-next-line react-hooks/exhaustive-deps
    lang,
  ]);
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Animação de entrada: cada elemento com a classe `reveal-tile` recebe o
// ref devolvido aqui e "acende" (data-revealed) quando aparece na tela. Os
// que aparecem juntos entram em sequência, da esquerda para a direita.
// Feito direto no DOM (sem estado do React) pra não re-renderizar a lista.
export function useReveal() {
  const ioRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => () => ioRef.current?.disconnect(), []);

  return useCallback((el: HTMLElement | null) => {
    if (!el || el.dataset.revealed) return;
    if (!hasIO() || prefersReducedMotion()) {
      el.dataset.revealed = '1';
      return;
    }
    if (!ioRef.current) {
      ioRef.current = new IntersectionObserver(
        (entries) => {
          const visible = entries
            .filter((entry) => entry.isIntersecting)
            .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top || a.boundingClientRect.left - b.boundingClientRect.left);
          visible.forEach((entry, index) => {
            const target = entry.target as HTMLElement;
            target.style.setProperty('--reveal-delay', `${Math.min(index, 9) * 55}ms`);
            target.dataset.revealed = '1';
            ioRef.current?.unobserve(target);
          });
        },
        { rootMargin: '0px 0px -4% 0px', threshold: 0.08 }
      );
    }
    ioRef.current.observe(el);
  }, []);
}

// Largura útil para calcular quantos pôsteres cabem numa faixa.
export function tilesThatFit(tileWidth: number, gap = 16) {
  if (typeof window === 'undefined') return 8;
  return Math.max(3, Math.ceil(window.innerWidth / (tileWidth + gap)));
}
