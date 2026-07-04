import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import CatalogManager from './pages/CatalogManager';
import CreateProductView from './pages/CreateProductView';
import CategoriesList from './pages/CategoriesList';
import CreateCategoryView from './pages/CreateCategoryView';
import PosView from './pages/PosView';
import KitchenView from './pages/KitchenView';

// Placeholders para las otras rutas
import { Link } from 'react-router-dom';
const Dashboard = () => (
  <div className="p-8">
    <h1 className="text-2xl font-bold mb-2">Dashboard</h1>
    <p className="text-gray-500 mb-6">Resumen de ventas y métricas irían aquí.</p>
    <div className="flex gap-4">
      <Link to="/pos" className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-700 transition">Abrir POS</Link>
      <Link to="/kitchen" className="bg-orange-500 text-white px-6 py-3 rounded-xl font-bold hover:bg-orange-600 transition">Abrir KDS (Cocina)</Link>
    </div>
  </div>
);

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="categories" element={<CategoriesList />} />
          <Route path="products" element={<CatalogManager />} />
        </Route>
        
        {/* Full-screen Modals & Views (Outside Layout) */}
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
  );
}

export default App;
