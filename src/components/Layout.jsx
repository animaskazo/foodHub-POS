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
  Settings,
  LogOut,
  Menu,
  X,
  MonitorPlay,
  ChefHat,
  Users
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
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-[15px] font-semibold transition-colors ${
                    isActive ? 'bg-gray-100 text-black' : 'text-gray-600 hover:bg-gray-50 hover:text-black'
                  }`
                }
              >
                <LayoutDashboard className="h-[18px] w-[18px]" />
                Dashboard
              </NavLink>
            </li>

            {isSuperAdmin && (
              <li>
                <NavLink 
                  to="/superadmin" 
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={({ isActive }) => 
                    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-[15px] font-semibold transition-colors ${
                      isActive ? 'bg-gray-100 text-black' : 'text-gray-600 hover:bg-gray-50 hover:text-black'
                    }`
                  }
                >
                  <Building2 className="h-[18px] w-[18px]" />
                  Super Admin
                </NavLink>
              </li>
            )}

            <li className="pt-2">
              <button 
                onClick={() => setIsProductsOpen(!isProductsOpen)}
                className="w-full flex items-center justify-between px-3 py-2.5 text-gray-600 hover:bg-gray-50 hover:text-black rounded-lg transition-colors"
              >
                <div className="flex items-center gap-3 text-[15px] font-semibold">
                  <Package className="h-[18px] w-[18px]" />
                  Catálogo
                </div>
                {isProductsOpen ? <ChevronDown className="h-[18px] w-[18px]" /> : <ChevronRight className="h-[18px] w-[18px]" />}
              </button>
              
              {isProductsOpen && (
                <ul className="mt-1 ml-4 pl-4 border-l border-gray-200 space-y-1">
                  <li>
                    <NavLink 
                      to="/categories" 
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={({ isActive }) => 
                        `flex items-center gap-3 px-3 py-2 rounded-lg text-[14px] font-semibold transition-colors ${
                          isActive ? 'bg-gray-100 text-black' : 'text-gray-500 hover:bg-gray-50 hover:text-black'
                        }`
                      }
                    >
                      <Tags className="h-[18px] w-[18px]" />
                      Categorías
                    </NavLink>
                  </li>
                  <li>
                    <NavLink 
                      to="/ingredients" 
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={({ isActive }) => 
                        `flex items-center gap-3 px-3 py-2 rounded-lg text-[14px] font-semibold transition-colors ${
                          isActive ? 'bg-gray-100 text-black' : 'text-gray-500 hover:bg-gray-50 hover:text-black'
                        }`
                      }
                    >
                      <PlusCircle className="h-[18px] w-[18px]" />
                      Ingredientes
                    </NavLink>
                  </li>
                  <li>
                    <NavLink 
                      to="/products" 
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={({ isActive }) => 
                        `flex items-center gap-3 px-3 py-2 rounded-lg text-[14px] font-semibold transition-colors ${
                          isActive ? 'bg-gray-100 text-black' : 'text-gray-500 hover:bg-gray-50 hover:text-black'
                        }`
                      }
                    >
                      <Package className="h-[18px] w-[18px]" />
                      Artículos
                    </NavLink>
                  </li>
                </ul>
              )}
            </li>

            <li className="pt-2">
              <NavLink 
                to="/customers" 
                onClick={() => setIsMobileMenuOpen(false)}
                className={({ isActive }) => 
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-[15px] font-semibold transition-colors ${
                    isActive ? 'bg-gray-100 text-black' : 'text-gray-600 hover:bg-gray-50 hover:text-black'
                  }`
                }
              >
                <Users className="h-[18px] w-[18px]" />
                Clientes
              </NavLink>
            </li>

            <li className="pt-2">
              <NavLink 
                to="/settings" 
                onClick={() => setIsMobileMenuOpen(false)}
                className={({ isActive }) => 
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-[15px] font-semibold transition-colors ${
                    isActive ? 'bg-gray-100 text-black' : 'text-gray-600 hover:bg-gray-50 hover:text-black'
                  }`
                }
              >
                <Settings className="h-[18px] w-[18px]" />
                Configuración
              </NavLink>
            </li>
          </ul>
        </nav>

        {/* Footer / Logout */}
        <div className="p-4 border-t shrink-0 flex flex-col gap-2">
          <NavLink 
            to="/pos"
            className="flex items-center gap-3 px-3 py-2.5 w-full rounded-lg text-[15px] font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-sm"
          >
            <MonitorPlay className="h-[18px] w-[18px]" />
            Punto de Venta
          </NavLink>
          <NavLink 
            to="/kitchen"
            className="flex items-center gap-3 px-3 py-2.5 w-full rounded-lg text-[15px] font-bold text-orange-600 bg-orange-50 hover:bg-orange-100 transition-colors"
          >
            <ChefHat className="h-[18px] w-[18px]" />
            Vista Cocina
          </NavLink>
          <button 
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 w-full rounded-lg text-[15px] font-semibold text-gray-600 hover:bg-red-50 hover:text-red-600 transition-colors mt-2"
          >
            <LogOut className="h-[18px] w-[18px]" />
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
