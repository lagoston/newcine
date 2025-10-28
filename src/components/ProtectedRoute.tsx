import React, { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  
  // Log route protection status
  useEffect(() => {
    console.log(`🔒 Protected route check: ${location.pathname} (loading=${loading}, authenticated=${!!user})`);
  }, [location.pathname, loading, user]);

  // Only show loading during initial auth check
  if (loading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
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