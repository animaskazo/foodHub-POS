import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import React, { useMemo } from 'react';
import Layout from './components/Layout';
import CatalogManager from './pages/CatalogManager';
import IngredientsManager from './pages/IngredientsManager';
import CreateProductView from './pages/CreateProductView';
import CategoriesList from './pages/CategoriesList';
import CreateCategoryView from './pages/CreateCategoryView';
import InventoryManager from './pages/InventoryManager';
import PosView from './pages/PosView';
import KitchenView from './pages/KitchenView';
import LoginView from './pages/LoginView';
import SignupView from './pages/SignupView';
import SuperAdminView from './pages/SuperAdminView';
import DashboardView from './pages/DashboardView';
import SettingsView from './pages/SettingsView';
import DeliverySettingsView from './pages/DeliverySettingsView';
import ShiftsSettingsView from './pages/ShiftsSettingsView';
import TablesSettingsView from './pages/TablesSettingsView';
import OrderView from './pages/OrderView';
import CustomersView from './pages/CustomersView';
import ConversationsView from './pages/ConversationsView';
import ReportsView from './pages/ReportsView';
import SubscriptionConfirmation from './components/public/SubscriptionConfirmation';
import { AuthProvider, useAuth } from './components/AuthContext';
import UpdatePasswordView from './pages/UpdatePasswordView';
import ForgotPasswordView from './pages/ForgotPasswordView';
import ProtectedRoute from './components/ProtectedRoute';
import { Toaster } from 'sonner';
import { getTenantSlug } from './utils/tenant';

function App() {
  const tenantSlug = useMemo(() => getTenantSlug(), []);

  React.useEffect(() => {
    const handleGlobalFocus = (e) => {
      const target = e.target;
      if (!target || target.tagName !== 'INPUT') return;

      const isNumeric =
        target.type === 'number' ||
        target.inputMode === 'numeric' ||
        target.inputMode === 'decimal' ||
        target.getAttribute('type') === 'number';

      if (isNumeric) {
        setTimeout(() => {
          if (document.activeElement === target) {
            target.select?.();
          }
        }, 10);
      }
    };

    document.addEventListener('focusin', handleGlobalFocus);
    return () => document.removeEventListener('focusin', handleGlobalFocus);
  }, []);

  if (tenantSlug) {
    // Subdominio de tienda (ej. sushiwok.foodhub.work): solo el storefront.
    return (
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<OrderView />} />
            <Route path="/order/:slug" element={<OrderView />} />
            <Route path="*" element={<OrderView />} />
          </Routes>
          <Toaster position="bottom-right" richColors expand={false} offset="80px" />
        </BrowserRouter>
      </AuthProvider>
    );
  }

  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
        <Route path="/" element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }>
          <Route index element={<ProtectedRoute requireAdmin={true}><DashboardView /></ProtectedRoute>} />
          <Route path="superadmin" element={
            <ProtectedRoute requireSuperAdmin={true}>
              <SuperAdminView />
            </ProtectedRoute>
          } />
          <Route path="categories" element={<ProtectedRoute requireAdmin={true}><CategoriesList /></ProtectedRoute>} />
          <Route path="ingredients" element={<ProtectedRoute requireAdmin={true}><IngredientsManager /></ProtectedRoute>} />
          <Route path="inventory" element={<ProtectedRoute requireAdmin={true}><InventoryManager /></ProtectedRoute>} />
          <Route path="products" element={<ProtectedRoute requireAdmin={true}><CatalogManager /></ProtectedRoute>} />
          <Route path="settings" element={<ProtectedRoute requireAdmin={true}><SettingsView /></ProtectedRoute>} />
          <Route path="delivery" element={<ProtectedRoute requireAdmin={true}><DeliverySettingsView /></ProtectedRoute>} />
          <Route path="shifts-settings" element={<ProtectedRoute requireAdmin={true}><ShiftsSettingsView /></ProtectedRoute>} />
          <Route path="tables" element={<ProtectedRoute requireAdmin={true}><TablesSettingsView /></ProtectedRoute>} />
          <Route path="customers" element={<ProtectedRoute requireAdmin={true}><CustomersView /></ProtectedRoute>} />
          <Route path="conversations" element={<ProtectedRoute requireAdmin={true}><ConversationsView /></ProtectedRoute>} />
          <Route path="reports" element={<ProtectedRoute requireAdmin={true}><ReportsView /></ProtectedRoute>} />
        </Route>
        
        {/* Full-screen Modals & Views (Outside Layout) */}
        <Route path="/login" element={<LoginView />} />
        <Route path="/signup" element={<SignupView />} />
        <Route path="/forgot-password" element={<ForgotPasswordView />} />
        <Route path="/update-password" element={<UpdatePasswordView />} />
        <Route path="/pos" element={<PosView />} />
        <Route path="/kitchen" element={<KitchenView />} />
        <Route path="/order/:slug" element={<OrderView />} />
        <Route path="/subscription-confirmation" element={<SubscriptionConfirmation />} />
        <Route path="/categories/:id" element={<CreateCategoryView />} />
        <Route path="/products/:id" element={<CreateProductView />} />
        </Routes>
        <Toaster position="bottom-right" richColors expand={false} offset="80px" />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
