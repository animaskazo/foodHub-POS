import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { getSubscriptionStatus } from '../services/subscription';

const ProtectedRoute = ({ children, requireSuperAdmin = false, requireAdmin = false }) => {
  const { user, isSuperAdmin, role, subscription, subscriptionLoading } = useAuth();
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

  if (subscriptionLoading) return null;
  const billing = getSubscriptionStatus(subscription);
  const isSubscriptionPage = location.pathname === '/subscription';
  if (!billing.isActive && !isSubscriptionPage && !isSuperAdmin) {
    return <Navigate to="/subscription" replace />;
  }

  return children;
};

export default ProtectedRoute;
