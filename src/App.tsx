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
import PageBackground from './components/PageBackground';
import { SeasonalEventProvider } from './contexts/SeasonalEventContext';
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
// A Mesa dos Oráculos e o Acervo (05/11/2026): substituem a Biblioteca dos
// Oráculos. A rota antiga da Biblioteca virou um redirecionador por intenção
// (links antigos com ?mood= vão à Mesa com a pergunta; com ?oracle=&type=, ao
// Acervo) — ver pages/OracleLibrariesRedirect.tsx.
const OracleTable = lazy(() => import('./pages/OracleTable'));
const OracleAcervo = lazy(() => import('./pages/OracleAcervo'));
const OracleLibrariesRedirect = lazy(() => import('./pages/OracleLibrariesRedirect'));
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

// /oracle → home, levando junto o state do link (a Central dos Oráculos foi
// extinta em 02/11/2026).
function OracleRedirect() {
  const location = useLocation();
  return <Navigate to="/" replace state={location.state} />;
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
          <div className="min-h-screen pt-[calc(env(safe-area-inset-top)+3.5rem)]">
            <PageBackground />
            <SeasonalBackdrop />
            <Navbar />
            <WhispersNotificationPopup />
            {/* Fichas voadoras (02/11/2026): a ficha do Poster Jackpot que às vezes
                atravessa a tela — rara, no máximo uma por dia (o banco decide). */}
            <Suspense fallback={null}>
              <FlyingChip />
            </Suspense>
            <main>
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
                  {/* 05/11/2026: a Mesa (o olho da barra e a porta da home) e o
                      Acervo (as 27 prateleiras inteiras, uma de cada vez). */}
                  <Route path="/oracle/mesa" element={<ProtectedRoute><OracleTable /></ProtectedRoute>} />
                  <Route path="/oracle/acervo" element={<ProtectedRoute><OracleAcervo /></ProtectedRoute>} />
                  <Route path="/oracle/libraries" element={<ProtectedRoute><OracleLibrariesRedirect /></ProtectedRoute>} />
                  <Route path="/oracle/duel" element={<ProtectedRoute><OracleDuel /></ProtectedRoute>} />
                  {/* Salas secretas (Clube do Terror…): ver lib/secretRooms.ts */}
                  <Route path="/sala/:roomKey" element={<ProtectedRoute><SecretRoom /></ProtectedRoute>} />
                  {/* Pôster Poker (03/11/2026): o jogo em /poster-poker; o /blefe antigo redireciona lá dentro. */}
                  <Route path="/poster-poker/*" element={<ProtectedRoute><Blefe /></ProtectedRoute>} />
                  <Route path="/blefe/*" element={<ProtectedRoute><Blefe /></ProtectedRoute>} />
                  {/* Curadoria do catálogo de pôsteres (04/11/2026): ver pages/PosterCuration.tsx. */}
                  <Route path="/curadoria/posteres" element={<ProtectedRoute><PosterCuration /></ProtectedRoute>} />
                  <Route path="/premium" element={<ProtectedRoute><Premium /></ProtectedRoute>} />
                  <Route path="/premium/success" element={<ProtectedRoute><PremiumSuccess /></ProtectedRoute>} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Suspense>
            </main>
            {/* "Instalar o app" só faz sentido no navegador. */}
            {!IS_NATIVE_APP && <InstallPrompt />}
          </div>
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
    </AuthProvider>
  );
}

export default App;