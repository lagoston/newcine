import React from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PAPER, MIST, PIXEL, FOCUS_RING } from '../lib/oracleTheme';
import { reloadFresh } from '../lib/appUpdate';

// 18/11/2026 (otimização): rede de segurança das telas. Antes não havia
// nenhum ErrorBoundary: se uma tela quebrasse — ou se o pedaço dela não
// chegasse (por exemplo, quem estava com o site aberto durante um deploy pede
// um arquivo que já não existe) — o React desmontava tudo e a pessoa ficava
// com a tela branca. Agora só a área da página mostra o aviso, com a barra de
// navegação no lugar, e "Tentar novamente" recarrega o site (que traz os
// arquivos novos). Mudar de página limpa o aviso.

function ErrorFallback() {
  const { t } = useTranslation();
  return (
    <div role="alert" className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center gap-4 px-6 text-center">
      <p style={{ ...PIXEL, color: PAPER }} className="text-2xl leading-tight">
        {t('common.error')}
      </p>
      <button
        type="button"
        // 18/11/2026 (Reborn, pacote): recarrega já com o service worker novo,
        // se houver (senão a casca antiga voltaria; ver lib/appUpdate.ts)
        onClick={() => void reloadFresh()}
        className={`h-11 px-5 rounded-xl ring-1 ring-white/15 bg-violet-500/20 hover:bg-violet-500/30 text-sm font-medium transition ${FOCUS_RING}`}
        style={{ color: MIST }}
      >
        {t('common.retry')}
      </button>
    </div>
  );
}

interface BoundaryProps {
  resetKey: string;
  children: React.ReactNode;
}

class Boundary extends React.Component<BoundaryProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error('Tela com erro:', error);
  }

  componentDidUpdate(prev: BoundaryProps) {
    // Outra página: tenta de novo (a anterior pode ter sido só ela).
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }

  render() {
    return this.state.failed ? <ErrorFallback /> : this.props.children;
  }
}

export default function RouteErrorBoundary({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  return <Boundary resetKey={pathname}>{children}</Boundary>;
}
