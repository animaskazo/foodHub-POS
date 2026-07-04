import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

const ProtectedRoute = ({ children, requireSuperAdmin = false }) => {
  const { user, isSuperAdmin } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (requireSuperAdmin && !isSuperAdmin) {
    return <Navigate to="/" replace />;
  }

  return children;
};

export default ProtectedRoute;
