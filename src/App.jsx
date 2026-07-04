import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import CatalogManager from './pages/CatalogManager';
import CreateProductView from './pages/CreateProductView';
import CategoriesList from './pages/CategoriesList';
import CreateCategoryView from './pages/CreateCategoryView';
import PosView from './pages/PosView';
import KitchenView from './pages/KitchenView';
import LoginView from './pages/LoginView';
import SignupView from './pages/SignupView';
import SuperAdminView from './pages/SuperAdminView';
import DashboardView from './pages/DashboardView';
import { AuthProvider, useAuth } from './components/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
        <Route path="/" element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }>
          <Route index element={<DashboardView />} />
          <Route path="superadmin" element={
            <ProtectedRoute requireSuperAdmin={true}>
              <SuperAdminView />
            </ProtectedRoute>
          } />
          <Route path="categories" element={<CategoriesList />} />
          <Route path="products" element={<CatalogManager />} />
        </Route>
        
        {/* Full-screen Modals & Views (Outside Layout) */}
        <Route path="/login" element={<LoginView />} />
        <Route path="/signup" element={<SignupView />} />
        <Route path="/pos" element={<PosView />} />
        <Route path="/kitchen" element={<KitchenView />} />
        <Route path="/categories/:id" element={<CreateCategoryView />} />
        <Route path="/products/:id" element={
          <CreateProductView 
            onClose={() => window.history.back()} 
            onSave={() => window.history.back()} 
          />
        } />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
