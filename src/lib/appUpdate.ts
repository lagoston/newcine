// Recarregar o site "de verdade" (18/11/2026, Protocolo Reborn, pacote).
//
// Desde esta data o service worker guarda de antemão só a casca do site (o
// index.html e o que ele precisa para abrir); as telas entram no cache quando
// a pessoa as abre. Consequência: depois de um deploy, quem ainda está com a
// casca ANTIGA pode pedir uma tela que nunca abriu, com o nome antigo, que já
// não existe no servidor. Um location.reload() simples não resolveria: o
// service worker antigo devolveria a mesma casca antiga. Por isso, antes de
// recarregar:
//   1. pede ao navegador para conferir se há service worker novo (reg.update());
//   2. se houver (instalando ou esperando), manda assumir já (SKIP_WAITING) e
//      espera ele tomar a página;
//   3. recarrega. A página volta com a casca nova e os nomes novos.
// Sem service worker (app nativo, navegador sem suporte, primeira visita) é só
// o reload. Cada espera tem teto: nunca fica presa.
// Quem usa: o vite:preloadError (main.tsx), o "Tentar novamente" do
// RouteErrorBoundary e o botão "Atualizar" do aviso de versão nova.
const wait = <T,>(promise: Promise<T>, ms: number): Promise<T | undefined> =>
  Promise.race([promise, new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), ms))]);

let reloading = false;

export async function reloadFresh(): Promise<void> {
  if (reloading) return;
  reloading = true;
  try {
    const registration = 'serviceWorker' in navigator ? await wait(navigator.serviceWorker.getRegistration(), 1500) : undefined;
    if (registration) {
      await wait(registration.update().catch(() => undefined), 5000);
      const next = registration.waiting ?? registration.installing;
      if (next) {
        await wait(
          new Promise<void>((resolve) => {
            navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true });
            const skip = () => registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
            if (registration.waiting) skip();
            next.addEventListener('statechange', () => {
              if (next.state === 'installed') skip();
              // 'activated' cobre a página que ainda não era controlada por nenhum
              if (next.state === 'activated' || next.state === 'redundant') resolve();
            });
          }),
          10000,
        );
      }
    }
  } catch {
    // qualquer falha aqui: recarrega do jeito simples
  }
  window.location.reload();
}
