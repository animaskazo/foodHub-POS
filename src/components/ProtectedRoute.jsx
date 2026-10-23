import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { getSubscriptionStatus } from '../services/subscriptionDemo';

const ProtectedRoute = ({ children, requireSuperAdmin = false, requireAdmin = false }) => {
  const { user, isSuperAdmin, role, organization } = useAuth();
  const location = useLocation();

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

  const subscription = getSubscriptionStatus(organization?.id);
  const isSubscriptionPage = location.pathname === '/subscription';
  if (!subscription.isActive && !isSubscriptionPage) {
    return <Navigate to="/subscription" replace />;
  }

  return children;
};

export default ProtectedRoute;
