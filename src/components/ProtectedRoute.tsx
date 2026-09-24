import React, { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../lib/auth';
import GlassLoader from './GlassLoader';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  const { t } = useTranslation();
  
  // Log route protection status
  useEffect(() => {
    console.log(`🔒 Protected route check: ${location.pathname} (loading=${loading}, authenticated=${!!user})`);
  }, [location.pathname, loading, user]);

  // Only show loading during initial auth check. Mesmo tamanho e label
  // do loading que cada página específica mostra em seguida (size="lg"
  // com label) — antes esse aqui era "md" sem texto, então a transição
  // de um pra outro criava um "flick" visível assim que a autenticação
  // confirmava e a página começava a carregar seus próprios dados.
  if (loading) {
    return <GlassLoader fullPage size="lg" label={t('common.loading')} />;
  }

  // Redirect to auth if not authenticated
  if (!user) {
    console.log(`🔒 Access denied: Redirecting from ${location.pathname} to /auth`);
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  // User is authenticated, render children
  console.log(`🔒 Access granted to ${location.pathname}`);
  return <>{children}</>;
};

export default ProtectedRoute;