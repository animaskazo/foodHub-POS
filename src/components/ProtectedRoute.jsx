import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

const ProtectedRoute = ({ children, requireSuperAdmin = false, requireAdmin = false }) => {
  const { user, isSuperAdmin, role } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (requireSuperAdmin && !isSuperAdmin) {
    return <Navigate to="/" replace />;
  }

  // Admin del negocio (dueño/admin/encargado) o Super Admin. Vendedores van al POS.
  if (requireAdmin && !isSuperAdmin && !['owner', 'admin', 'manager'].includes(role)) {
    return <Navigate to="/pos" replace />;
  }

  return children;
};

export default ProtectedRoute;
