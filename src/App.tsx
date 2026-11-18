import React, { useEffect, Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Toaster } from 'react-hot-toast';
import { Toaster as SonnerToaster } from 'sonner';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';
import { AuthProvider } from './lib/auth';
import { WhispersProvider } from './contexts/WhispersContext';
import WhispersNotificationPopup from './components/WhispersNotificationPopup';
import { ThemeProvider } from './lib/theme';
import InstallPrompt from './components/InstallPrompt';
import GlassLoader from './components/GlassLoader';
import RouteErrorBoundary from './components/RouteErrorBoundary';
import PageBackground from './components/PageBackground';
import { SeasonalEventProvider } from './contexts/SeasonalEventContext';
import { OverlayProvider } from './overlays';
import { DirectorProvider } from './contexts/DirectorContext';
import { SeasonalBackdrop } from './components/seasonal/SeasonalDecor';
import { registerSW } from 'virtual:pwa-register';
import { IS_NATIVE_APP } from './lib/platform';
import './i18n';

const Home = lazy(() => import('./pages/Home'));
const Library = lazy(() => import('./pages/Library'));
const AddMovies = lazy(() => import('./pages/AddMovies'));
const PersonalLists = lazy(() => import('./pages/PersonalLists'));
const Profile = lazy(() => import('./pages/Profile'));
const UserProfile = lazy(() => import('./pages/UserProfile'));
const Community = lazy(() => import('./pages/Community'));
const Auth = lazy(() => import('./pages/Auth'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
// O Acervo dos oráculos (09/11/2026): a página única da Mesa dos Oráculos.
// A Mesa de três cartas (05–09/11) saiu; /oracle/mesa e a rota antiga da
// Biblioteca (/oracle/libraries) viraram redirecionadores por intenção para o
// Acervo (?ask=occ:galera → ?ocasiao=galera etc.) — ver
// pages/OracleAcervoRedirect.tsx.
const OracleAcervo = lazy(() => import('./pages/OracleAcervo'));
const OracleAcervoRedirect = lazy(() => import('./pages/OracleAcervoRedirect'));
const OracleDuel = lazy(() => import('./pages/OracleDuel'));
const SecretRoom = lazy(() => import('./pages/SecretRoom'));
const Premium = lazy(() => import('./pages/Premium'));
const PremiumSuccess = lazy(() => import('./pages/PremiumSuccess'));
const CategoryMovies = lazy(() => import('./pages/CategoryMovies'));
const FlyingChip = lazy(() => import('./components/posterJackpot/FlyingChip'));
// Pôster Poker (03/11/2026; antes O Grande Blefe): o pôquer, carregado só em /poster-poker.
const Blefe = lazy(() => import('./pages/Blefe'));
// Curadoria do catálogo de pôsteres (04/11/2026): a vitrine do Poster Jackpot para
// quem escolhe os pôsteres (só testadores; o banco recusa os outros com 'forbidden').
// Página interna, sem link no menu, carregada só quando alguém abre a URL.
const PosterCuration = lazy(() => import('./pages/PosterCuration'));
// Sala do Diretor (16/11/2026): o painel da Conta Diretor. Só abre para ela (o
// banco confere cada ação); para os outros, a rota volta para o Início.
const DirectorPanel = lazy(() => import('./pages/DirectorPanel'));
// As ferramentas da Sala (16/11/2026): prateleiras, pôsteres da roleta e o diário.
const DirectorShelves = lazy(() => import('./pages/DirectorShelves'));
const DirectorPosters = lazy(() => import('./pages/DirectorPosters'));
const DirectorDiary = lazy(() => import('./pages/DirectorDiary'));

// /oracle → home, levando junto o state do link (a Central dos Oráculos foi
// extinta em 02/11/2026).
function OracleRedirect() {
  const location = useLocation();
  return <Navigate to="/" replace state={location.state} />;
}

// 18/11/2026 (otimização, modais F1): cada modal trava a rolagem salvando e
// devolvendo o valor anterior de body.style.overflow. Com dois abertos (Ver
// todos + menu do título) e a página saindo (voltar, bolha do amigo), o React
// limpa de pai para filho e o de cima devolve 'hidden' por último: a página
// seguinte nascia sem rolar (medido: 0 px contra 700 px). Depois de cada troca
// de página, sem nenhum diálogo na tela, a trava sai. O Acervo (.ac-layer) e
// as folhas do pôquer (.pp-layer) travam de propósito e ficam de fora.
// Onda 2a: as gavetas já têm uma dona só para a trava (src/overlays); isto
// continua até a 2b pelas camadas que ainda travam sozinhas (o menu do título).
function ScrollLockJanitor() {
  const { pathname } = useLocation();
  useEffect(() => {
    const id = window.setTimeout(() => {
      // espera as animações de saída (as gavetas levam ~0,3 s para sair)
      if (document.querySelector('[aria-modal="true"], .ac-layer, .pp-layer')) return;
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    }, 450);
    return () => window.clearTimeout(id);
  }, [pathname]);
  return null;
}



function App() {
  const { t } = useTranslation();

  useEffect(() => {
    // No app nativo o site já vem dentro do pacote: sem service worker
    // (ele guardaria uma cópia velha por cima da que veio com o app).
    if (import.meta.env.PROD && !IS_NATIVE_APP && 'serviceWorker' in navigator) {
      const updateSW = registerSW({
        onNeedRefresh() {
          if (confirm('New version available. Reload to update?')) {
            updateSW(true);
          }
        },
        immediate: true
      });
    }
  }, []);

  return (
    <AuthProvider>
      {/* Conta Diretor (16/11/2026): o papel vem do banco; ver lib/director.ts. */}
      <DirectorProvider>
      <ThemeProvider>
        <BrowserRouter future={{ v7_relativeSplatPath: true }}>
          {/* WhispersProvider precisa estar DENTRO do BrowserRouter agora —
              usa useLocation() pra decidir onde abrir o modal de sussurros
              quando uma notificação é clicada (Home vs. qualquer outra
              página), e useLocation só funciona dentro de um Router. */}
          <WhispersProvider>
          {/* Evento sazonal no ar (Halloween, Natal…): painel da home,
              decoração do site e dos perfis, comemoração das tags. */}
          <SeasonalEventProvider>
          {/* 18/11/2026 (Protocolo Reborn, onda 2a): o anfitrião único de camadas
              (src/overlays). Uma pilha só para o z-index, o Esc, a trava de
              rolagem e o voltar das gavetas. Fica dentro do roteador e dos
              provedores acima porque as camadas que ele desenha os usam. */}
          <OverlayProvider>
          <div className="min-h-screen pt-[calc(env(safe-area-inset-top)+3.5rem)]">
            <PageBackground />
            <SeasonalBackdrop />
            <Navbar />
            <WhispersNotificationPopup />
            <ScrollLockJanitor />
            {/* Fichas voadoras (02/11/2026): a ficha do Poster Jackpot que às vezes
                atravessa a tela — rara, no máximo uma por dia (o banco decide). */}
            <Suspense fallback={null}>
              <FlyingChip />
            </Suspense>
            <main>
              {/* 18/11/2026 (otimização): se uma tela quebrar ou o pedaço dela não
                  chegar (ex.: deploy com o site aberto), o aviso fica só aqui, em
                  vez da tela branca. Ver components/RouteErrorBoundary.tsx. */}
              <RouteErrorBoundary>
              <Suspense fallback={<GlassLoader fullPage size="lg" label={t('common.loading')} />}>
                <Routes>
                  <Route path="/auth" element={<Auth />} />
                  <Route path="/reset-password" element={<ResetPassword />} />
                  <Route path="/" element={<Home />} />
                  <Route path="/category/:category" element={<CategoryMovies />} />
                  <Route path="/library" element={<ProtectedRoute><Library /></ProtectedRoute>} />
                  <Route path="/add-movies" element={<ProtectedRoute><AddMovies /></ProtectedRoute>} />
                  <Route path="/lists" element={<ProtectedRoute><PersonalLists /></ProtectedRoute>} />
                  <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
                  <Route path="/profile/:username" element={<UserProfile />} />
                  <Route path="/community" element={<ProtectedRoute><Community /></ProtectedRoute>} />
                  {/* A Central dos Oráculos foi extinta em 02/11/2026: as portas dela
                      (Biblioteca dos Oráculos, Poster Jackpot e Persona) moram na home.
                      Links antigos para /oracle voltam para lá, com o state junto
                      (ex.: { openJackpot: 'trades' }). */}
                  <Route path="/oracle" element={<OracleRedirect />} />
                  {/* 09/11/2026: o Acervo (o olho da barra e a porta da home) é a
                      Mesa dos Oráculos; os endereços da Mesa de cartas e da
                      Biblioteca antiga abrem o Acervo com o mesmo filtro. */}
                  <Route path="/oracle/acervo" element={<ProtectedRoute><OracleAcervo /></ProtectedRoute>} />
                  <Route path="/oracle/mesa" element={<ProtectedRoute><OracleAcervoRedirect /></ProtectedRoute>} />
                  <Route path="/oracle/libraries" element={<ProtectedRoute><OracleAcervoRedirect /></ProtectedRoute>} />
                  <Route path="/oracle/duel" element={<ProtectedRoute><OracleDuel /></ProtectedRoute>} />
                  {/* Salas secretas (Clube do Terror…): ver lib/secretRooms.ts */}
                  <Route path="/sala/:roomKey" element={<ProtectedRoute><SecretRoom /></ProtectedRoute>} />
                  {/* Pôster Poker (03/11/2026): o jogo em /poster-poker; o /blefe antigo redireciona lá dentro. */}
                  <Route path="/poster-poker/*" element={<ProtectedRoute><Blefe /></ProtectedRoute>} />
                  <Route path="/blefe/*" element={<ProtectedRoute><Blefe /></ProtectedRoute>} />
                  {/* Curadoria do catálogo de pôsteres (04/11/2026): ver pages/PosterCuration.tsx. */}
                  <Route path="/curadoria/posteres" element={<ProtectedRoute><PosterCuration /></ProtectedRoute>} />
                  <Route path="/diretor" element={<ProtectedRoute><DirectorPanel /></ProtectedRoute>} />
                  <Route path="/diretor/prateleiras" element={<ProtectedRoute><DirectorShelves /></ProtectedRoute>} />
                  <Route path="/diretor/posteres" element={<ProtectedRoute><DirectorPosters /></ProtectedRoute>} />
                  <Route path="/diretor/diario" element={<ProtectedRoute><DirectorDiary /></ProtectedRoute>} />
                  <Route path="/premium" element={<ProtectedRoute><Premium /></ProtectedRoute>} />
                  <Route path="/premium/success" element={<ProtectedRoute><PremiumSuccess /></ProtectedRoute>} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Suspense>
              </RouteErrorBoundary>
            </main>
            {/* "Instalar o app" só faz sentido no navegador. */}
            {!IS_NATIVE_APP && <InstallPrompt />}
          </div>
          </OverlayProvider>
          </SeasonalEventProvider>
          </WhispersProvider>
        </BrowserRouter>
        <Toaster
          position="bottom-right"
          // co-hot-toaster: no celular sobe acima da barra de navegação
          // (src/styles/mobile-dock.css).
          containerClassName="co-hot-toaster"
          // z-index padrão da biblioteca é 9999 — menor que vários
          // modais do site (os de review, por exemplo, usam z-[10000]
          // e z-[10001]). Um toast escondido atrás de um modal aberto é
          // pior que inútil, já que a mensagem simplesmente não pode
          // ser lida. Notificação transitória deve sempre ficar por
          // cima de qualquer coisa que esteja aberta na tela.
          containerStyle={{ zIndex: 99999 }}
          toastOptions={{ style: { zIndex: 99999 } }}
        />
        {/* O site usa DUAS bibliotecas de notificação: react-hot-toast e
            sonner (20 arquivos, ~107 chamadas — erros de checkout, do
            Duelo, validação de username, "adicionado à biblioteca"...).
            Só o Toaster do react-hot-toast estava montado, então TODAS as
            notificações do sonner eram disparadas e nunca apareciam. Mesma
            posição e sempre acima de qualquer modal aberto. */}
        <SonnerToaster
          position="bottom-right"
          style={{ zIndex: 99999 }}
          toastOptions={{ style: { zIndex: 99999 } }}
        />
      </ThemeProvider>
      </DirectorProvider>
    </AuthProvider>
  );
}

export default App;