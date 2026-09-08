import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

const ProtectedRoute = ({ children, requireSuperAdmin = false, requireAdmin = false }) => {
  const { user, isSuperAdmin } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (requireSuperAdmin && !isSuperAdmin) {
    return <Navigate to="/" replace />;
  }

  // Solo Super Admin. El resto (vendedores) va al POS.
  if (requireAdmin && !isSuperAdmin) {
    return <Navigate to="/pos" replace />;
  }

  return children;
};

export default ProtectedRoute;
