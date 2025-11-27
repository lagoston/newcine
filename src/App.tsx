import React, { useEffect, Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';
import { AuthProvider } from './lib/auth';
import { ThemeProvider } from './lib/theme';
import InstallPrompt from './components/InstallPrompt';
import { registerSW } from 'virtual:pwa-register';
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
const OracleHub = lazy(() => import('./pages/OracleHub'));
const OraclePrediction = lazy(() => import('./pages/OraclePrediction'));
const OracleRecommend = lazy(() => import('./pages/OracleRecommend'));
const Premium = lazy(() => import('./pages/Premium'));
const PremiumSuccess = lazy(() => import('./pages/PremiumSuccess'));
const CategoryMovies = lazy(() => import('./pages/CategoryMovies'));

const LoadingFallback = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
  </div>
);

function App() {
  useEffect(() => {
    if (import.meta.env.PROD && 'serviceWorker' in navigator) {
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
        <BrowserRouter>
          <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors pt-[calc(env(safe-area-inset-top)+3.5rem)]">
            <Navbar />
            <main>
              <Suspense fallback={<LoadingFallback />}>
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
                  <Route path="/oracle" element={<ProtectedRoute><OracleHub /></ProtectedRoute>} />
                  <Route path="/oracle/prediction" element={<ProtectedRoute><OraclePrediction /></ProtectedRoute>} />
                  <Route path="/oracle/recommend" element={<ProtectedRoute><OracleRecommend /></ProtectedRoute>} />
                  <Route path="/premium" element={<ProtectedRoute><Premium /></ProtectedRoute>} />
                  <Route path="/premium/success" element={<ProtectedRoute><PremiumSuccess /></ProtectedRoute>} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Suspense>
            </main>
            <InstallPrompt />
          </div>
        </BrowserRouter>
        <Toaster position="bottom-right" />
      </ThemeProvider>
    </AuthProvider>
  );
}

export default App;