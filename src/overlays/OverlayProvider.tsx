// O anfitrião único de camadas (18/11/2026, Protocolo Reborn, onda 2a).
// Montado uma vez no App.tsx, dentro do BrowserRouter e dos provedores que as
// camadas usam (sussurros, evento sazonal). Faz duas coisas:
//   • liga a pilha de camadas (stack.ts) ao histórico do navegador
//     (history.ts), avisando a cada mudança de página do roteador;
//   • desenha as camadas abertas com overlays.open() (host.ts), cada uma
//     carregada sob demanda e com a própria rede de segurança: se o código de
//     uma camada não chegar (deploy com o site aberto), ela fecha e o app
//     continua de pé.
// Os componentes antigos entram na pilha sozinhos, pela useLayerEntry
// (hooks.ts): não precisam deste provedor em volta.
import React, { Suspense, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import * as history from './history';
import { getDef, getMounts, outletMounted, overlays, subscribeMounts, type Mount } from './host';
import { ScopeContext, SlotContext } from './hooks';

// Separado do provedor para que só ele seja desenhado de novo a cada troca de página.
const HistoryBridge: React.FC = () => {
  const location = useLocation();
  const move = useNavigationType();
  const first = useRef(true);
  // Efeitos de layout: o ouvinte do voltar entra antes do ouvinte do roteador
  // (que é registrado pelo BrowserRouter, em volta deste componente).
  useLayoutEffect(() => {
    history.attach();
    return history.detach;
  }, []);
  useLayoutEffect(() => {
    const href = location.pathname + location.search + location.hash;
    history.routerMoved({ key: location.key, state: location.state, href }, first.current ? 'INIT' : move);
    first.current = false;
  }, [location, move]);
  return null;
};

type LayerComponent = React.LazyExoticComponent<React.ComponentType<{ params: never }>>;
const lazies = new Map<string, LayerComponent>();
const lazyFor = (kind: string): LayerComponent | null => {
  const known = lazies.get(kind);
  if (known) return known;
  const def = getDef(kind);
  if (!def) return null;
  const component = React.lazy(def.load as () => Promise<{ default: React.ComponentType<{ params: never }> }>);
  lazies.set(kind, component);
  return component;
};

class LayerBoundary extends React.Component<{ onError: () => void; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error('overlay:', error);
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

const HostLayer = React.memo(({ mount }: { mount: Mount }) => {
  const Component = lazyFor(mount.kind);
  if (!Component) return null;
  return (
    <LayerBoundary
      onError={() => {
        // o próximo open() tenta baixar de novo
        lazies.delete(mount.kind);
        overlays.close(mount.mark);
      }}
    >
      <ScopeContext.Provider value={mount.mark}>
        <SlotContext.Provider value={mount}>
          <Suspense fallback={null}>
            <Component params={mount.params as never} />
          </Suspense>
        </SlotContext.Provider>
      </ScopeContext.Provider>
    </LayerBoundary>
  );
});
HostLayer.displayName = 'HostLayer';

const LayerOutlet: React.FC = () => {
  const mounts = useSyncExternalStore(subscribeMounts, getMounts);
  useLayoutEffect(() => {
    outletMounted(true);
    return () => outletMounted(false);
  }, []);
  return (
    <>
      {mounts.map((mount) => (
        <HostLayer key={mount.mark} mount={mount} />
      ))}
    </>
  );
};

export const OverlayProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <>
    <HistoryBridge />
    {children}
    <LayerOutlet />
  </>
);
