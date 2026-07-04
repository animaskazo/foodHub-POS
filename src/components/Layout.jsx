import React, { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { 
  LayoutDashboard, 
  Package, 
  Tags, 
  PlusCircle, 
  ChevronDown, 
  ChevronRight, 
  Store,
  Building2,
  LogOut,
  Menu,
  X
} from 'lucide-react';
import { supabase } from '../lib/supabase';

const Layout = () => {
  const [isProductsOpen, setIsProductsOpen] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { isSuperAdmin } = useAuth();

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      
      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-white border-r flex flex-col shadow-sm transition-transform duration-300 ease-in-out
        lg:relative lg:translate-x-0
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="h-16 flex items-center justify-between px-6 border-b shrink-0">
          <div className="flex items-center">
            <Store className="h-6 w-6 text-black mr-2" />
            <span className="font-bold text-lg">FoodHub</span>
          </div>
          <button 
            className="lg:hidden p-1 text-gray-500 hover:text-black"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        
        <nav className="flex-1 overflow-y-auto py-4">
          <ul className="space-y-1 px-3">
            <li>
              <NavLink 
                to="/" 
                onClick={() => setIsMobileMenuOpen(false)}
                className={({ isActive }) => 
                  `flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive ? 'bg-gray-100 text-black' : 'text-gray-600 hover:bg-gray-50 hover:text-black'
                  }`
                }
              >
                <LayoutDashboard className="h-4 w-4" />
                Dashboard
              </NavLink>
            </li>

            {isSuperAdmin && (
              <li>
                <NavLink 
                  to="/superadmin" 
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={({ isActive }) => 
                    `flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      isActive ? 'bg-gray-100 text-black' : 'text-gray-600 hover:bg-gray-50 hover:text-black'
                    }`
                  }
                >
                  <Building2 className="h-4 w-4" />
                  Super Admin
                </NavLink>
              </li>
            )}

            <li>
              <NavLink 
                to="/pos" 
                onClick={() => setIsMobileMenuOpen(false)}
                className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors text-white bg-blue-600 hover:bg-blue-700 shadow-sm mt-2"
              >
                <Store className="h-4 w-4" />
                Ir a Caja (POS)
              </NavLink>
            </li>
            
            <li className="pt-2">
              <button 
                onClick={() => setIsProductsOpen(!isProductsOpen)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-md text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-black transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Package className="h-4 w-4" />
                  Productos
                </div>
                {isProductsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
              
              {isProductsOpen && (
                <ul className="mt-1 ml-4 pl-4 border-l border-gray-200 space-y-1">
                  <li>
                    <NavLink 
                      to="/categories" 
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={({ isActive }) => 
                        `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                          isActive ? 'bg-gray-100 text-black font-medium' : 'text-gray-500 hover:bg-gray-50 hover:text-black'
                        }`
                      }
                    >
                      <Tags className="h-4 w-4" />
                      Categorías
                    </NavLink>
                  </li>
                  <li>
                    <NavLink 
                      to="/products" 
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={({ isActive }) => 
                        `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                          isActive ? 'bg-gray-100 text-black font-medium' : 'text-gray-500 hover:bg-gray-50 hover:text-black'
                        }`
                      }
                    >
                      <Package className="h-4 w-4" />
                      Artículos
                    </NavLink>
                  </li>
                </ul>
              )}
            </li>
          </ul>
        </nav>

        {/* Footer / Logout */}
        <div className="p-4 border-t shrink-0">
          <button 
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2 w-full rounded-md text-sm font-medium text-gray-600 hover:bg-red-50 hover:text-red-600 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Mobile Header */}
        <header className="lg:hidden bg-white border-b h-16 flex items-center px-4 shrink-0">
          <button 
            onClick={() => setIsMobileMenuOpen(true)}
            className="p-2 -ml-2 mr-2 text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            <Menu className="h-6 w-6" />
          </button>
          <span className="font-bold text-lg">FoodHub</span>
        </header>

        <Outlet />
      </main>
    </div>
  );
};

export default Layout;
