import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import Library from './pages/Library';
import AddMovies from './pages/AddMovies';
import PersonalLists from './pages/PersonalLists';
import Profile from './pages/Profile';
import UserProfile from './pages/UserProfile';
import Community from './pages/Community';
import Auth from './pages/Auth';
import ResetPassword from './pages/ResetPassword';
import OracleHub from './pages/OracleHub';
import OraclePrediction from './pages/OraclePrediction';
import OracleRecommend from './pages/OracleRecommend';
import Premium from './pages/Premium';
import PremiumSuccess from './pages/PremiumSuccess';
import CategoryMovies from './pages/CategoryMovies';
import ProtectedRoute from './components/ProtectedRoute';
import { AuthProvider } from './lib/auth';
import { ThemeProvider } from './lib/theme';
import InstallPrompt from './components/InstallPrompt';
import { registerSW } from 'virtual:pwa-register';
import './i18n';

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
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/reset" element={<ResetPassword />} />
              <Route path="/premium" element={<Premium />} />
              <Route path="/premium/success" element={<PremiumSuccess />} />
              <Route
                path="/profile"
                element={
                  <ProtectedRoute>
                    <Profile />
                  </ProtectedRoute>
                }
              />
              <Route path="/profile/:username" element={<UserProfile />} />
              <Route
                path="/community"
                element={
                  <ProtectedRoute>
                    <Community />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/library"
                element={
                  <ProtectedRoute>
                    <Library />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/add-movies"
                element={
                  <ProtectedRoute>
                    <AddMovies />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/lists"
                element={
                  <ProtectedRoute>
                    <PersonalLists />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/oracle"
                element={
                  <ProtectedRoute>
                    <OracleHub />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/oracle/prediction"
                element={
                  <ProtectedRoute>
                    <OraclePrediction />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/oracle/recommend"
                element={
                  <ProtectedRoute>
                    <OracleRecommend />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/category/:category"
                element={
                  <ProtectedRoute>
                    <CategoryMovies />
                  </ProtectedRoute>
                }
              />
            </Routes>
            <Toaster position="bottom-right" />
            <InstallPrompt />
          </div>
        </BrowserRouter>
      </ThemeProvider>
    </AuthProvider>
  );
}

export default App;