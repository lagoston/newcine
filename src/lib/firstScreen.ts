// A "primeira tela útil" (18/11/2026, Protocolo Reborn, pacote).
//
// É o momento em que a pessoa vê a tela de verdade (a saudação da Home, para
// quem tem conta; a vitrine, para o visitante), e não mais um carregador. Quem
// desenha essa tela chama markFirstScreen(); quem estava esperando por ela é
// avisado uma vez:
//   • no app (APK), a tela de abertura (o Olho Lunar) fica até aqui
//     (lib/nativeShell.ts). Antes ela saía dois quadros depois do primeiro
//     desenho e a pessoa via três telas: Olho Lunar → carregador de vidro → Home;
//   • no site, o service worker só é registrado depois daqui (main.tsx), para
//     não disputar a rede com a própria abertura.
// Toda espera tem um teto (maxWaitMs): se o aviso não vier (rede lenta, outra
// página aberta direto), segue assim mesmo.
// Também deixa a marca "co:first-screen" no performance (para medir a abertura:
// scripts/perf/measure.mjs).
const EVENT = 'co:first-screen';
let done = false;

export function markFirstScreen(): void {
  if (done || typeof window === 'undefined') return;
  done = true;
  try {
    performance.mark(EVENT);
  } catch {
    // sem a API de medição: só o aviso
  }
  window.dispatchEvent(new Event(EVENT));
}

export function whenFirstScreen(run: () => void, maxWaitMs: number): void {
  if (typeof window === 'undefined') return;
  if (done) {
    run();
    return;
  }
  let fired = false;
  let timer = 0;
  const go = () => {
    if (fired) return;
    fired = true;
    window.removeEventListener(EVENT, go);
    window.clearTimeout(timer);
    run();
  };
  timer = window.setTimeout(go, maxWaitMs);
  window.addEventListener(EVENT, go);
}
