import React, { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Package, 
  Tags, 
  PlusCircle, 
  ChevronDown, 
  ChevronRight, 
  Store
} from 'lucide-react';

const Layout = () => {
  const [isProductsOpen, setIsProductsOpen] = useState(true);

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r flex flex-col shadow-sm shrink-0">
        <div className="h-16 flex items-center px-6 border-b">
          <Store className="h-6 w-6 text-black mr-2" />
          <span className="font-bold text-lg">FoodHub</span>
        </div>
        
        <nav className="flex-1 overflow-y-auto py-4">
          <ul className="space-y-1 px-3">
            <li>
              <NavLink 
                to="/" 
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

            <li>
              <NavLink 
                to="/pos" 
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
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;
