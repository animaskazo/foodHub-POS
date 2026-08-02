import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
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
  Users,
  Truck,
  Clock,
  User,
  DollarSign,
  Printer,
  ChevronLeft,
  MessageCircle,
  BarChart3,
  ShoppingBag,
  ClipboardList
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import FeedbackBubble from './FeedbackBubble';
import StockNotifications from './StockNotifications';
import PrepTimeSelector from './ui/PrepTimeSelector';

const Layout = () => {
  const location = useLocation();
  const isDashboard = location.pathname === '/';
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isProductsOpen, setIsProductsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const { isSuperAdmin, role } = useAuth();
  const [inboxEnabled, setInboxEnabled] = useState(false);

  useEffect(() => {
    const checkInbox = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const { data: staff } = await supabase
          .from('staff')
          .select('organization_id')
          .eq('id', session.user.id)
          .single();
        if (!staff) return;
        const { data: org } = await supabase
          .from('organizations')
          .select('whatsapp_inbox_enabled')
          .eq('id', staff.organization_id)
          .single();
        if (org?.whatsapp_inbox_enabled) setInboxEnabled(true);
      } catch (e) {
        // silently ignore
      }
    };
    checkInbox();
  }, []);
  
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(
    localStorage.getItem('sidebar_collapsed') === 'true'
  );

  const toggleSidebar = () => {
    const newState = !isSidebarCollapsed;
    setIsSidebarCollapsed(newState);
    localStorage.setItem('sidebar_collapsed', newState.toString());
  };

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
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
        ${!isSidebarCollapsed ? 'lg:relative lg:translate-x-0' : 'lg:absolute lg:-translate-x-full'}
      `}>
        <div className="h-16 flex items-center justify-between px-6 border-b shrink-0">
          <div className="flex items-center">
            <Store className="h-6 w-6 text-black mr-2" />
            <span className="font-bold text-lg">FoodHub</span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={toggleSidebar} className="hidden lg:flex p-1 hover:bg-gray-100 rounded text-gray-500 transition-colors">
              <ChevronLeft className={`h-5 w-5 transition-transform ${isSidebarCollapsed ? 'rotate-180' : ''}`} />
            </button>
            <button onClick={() => setIsMobileMenuOpen(false)} className="lg:hidden p-1 hover:bg-gray-100 rounded text-gray-500 transition-colors">
              <X className="h-6 w-6" />
            </button>
          </div>
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
                      <ShoppingBag className="h-[18px] w-[18px]" />
                      Productos
                    </NavLink>
                  </li>
                </ul>
              )}
            </li>

            <li className="pt-2">
              <NavLink 
                to="/inventory" 
                onClick={() => setIsMobileMenuOpen(false)}
                className={({ isActive }) => 
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-[15px] font-semibold transition-colors ${
                    isActive ? 'bg-gray-100 text-black' : 'text-gray-600 hover:bg-gray-50 hover:text-black'
                  }`
                }
              >
                <ClipboardList className="h-[18px] w-[18px]" />
                Inventario
              </NavLink>
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
                to="/reports" 
                onClick={() => setIsMobileMenuOpen(false)}
                className={({ isActive }) => 
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-[15px] font-semibold transition-colors ${
                    isActive ? 'bg-gray-100 text-black' : 'text-gray-600 hover:bg-gray-50 hover:text-black'
                  }`
                }
              >
                <BarChart3 className="h-[18px] w-[18px]" />
                Reportes
              </NavLink>
            </li>

            {inboxEnabled && (
              <li className="pt-2">
                <NavLink 
                  to="/conversations" 
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={({ isActive }) => 
                    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-[15px] font-semibold transition-colors ${
                      isActive ? 'bg-green-50 text-green-800' : 'text-gray-600 hover:bg-gray-50 hover:text-black'
                    }`
                  }
                >
                  <MessageCircle className="h-[18px] w-[18px]" />
                  Conversaciones
                </NavLink>
              </li>
            )}

            <li className="pt-2">
              <NavLink 
                to="/delivery" 
                onClick={() => setIsMobileMenuOpen(false)}
                className={({ isActive }) => 
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-[15px] font-semibold transition-colors ${
                    isActive ? 'bg-gray-100 text-black' : 'text-gray-600 hover:bg-gray-50 hover:text-black'
                  }`
                }
              >
                <Truck className="h-[18px] w-[18px]" />
                Delivery
              </NavLink>
            </li>
            
            <li className="pt-2">
              <button 
                onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-[15px] font-semibold text-gray-600 hover:bg-gray-50 hover:text-black transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Settings className="h-[18px] w-[18px]" />
                  Configuración
                </div>
                <ChevronDown className={`h-4 w-4 transition-transform ${isSettingsOpen ? 'rotate-180' : ''}`} />
              </button>
              
              {isSettingsOpen && (
                <ul className="mt-1 ml-4 pl-4 border-l border-gray-200 space-y-1">
                  <li>
                    <NavLink 
                      to="/settings?tab=general" 
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={({ isActive, isPending }) => {
                        const isCurrentTab = window.location.search === '?tab=general' || window.location.search === '';
                        const isSettingsPath = window.location.pathname === '/settings';
                        const isMatch = isSettingsPath && isCurrentTab;
                        return `flex items-center gap-3 px-3 py-2 rounded-lg text-[14px] font-semibold transition-colors ${
                          isMatch ? 'bg-gray-100 text-black' : 'text-gray-500 hover:bg-gray-50 hover:text-black'
                        }`;
                      }}
                    >
                      <Store className="h-[18px] w-[18px]" />
                      General
                    </NavLink>
                  </li>
                  <li>
                    <NavLink 
                      to="/settings?tab=hours" 
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={({ isActive }) => {
                        const isMatch = window.location.pathname === '/settings' && window.location.search === '?tab=hours';
                        return `flex items-center gap-3 px-3 py-2 rounded-lg text-[14px] font-semibold transition-colors ${
                          isMatch ? 'bg-gray-100 text-black' : 'text-gray-500 hover:bg-gray-50 hover:text-black'
                        }`;
                      }}
                    >
                      <Clock className="h-[18px] w-[18px]" />
                      Horarios
                    </NavLink>
                  </li>
                  <li>
                    <NavLink 
                      to="/settings?tab=staff" 
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={({ isActive }) => {
                        const isMatch = window.location.pathname === '/settings' && window.location.search === '?tab=staff';
                        return `flex items-center gap-3 px-3 py-2 rounded-lg text-[14px] font-semibold transition-colors ${
                          isMatch ? 'bg-gray-100 text-black' : 'text-gray-500 hover:bg-gray-50 hover:text-black'
                        }`;
                      }}
                    >
                      <User className="h-[18px] w-[18px]" />
                      Equipo
                    </NavLink>
                  </li>
                  <li>
                    <NavLink 
                      to="/settings?tab=printers" 
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={({ isActive }) => {
                        const isMatch = window.location.pathname === '/settings' && window.location.search === '?tab=printers';
                        return `flex items-center gap-3 px-3 py-2 rounded-lg text-[14px] font-semibold transition-colors ${
                          isMatch ? 'bg-gray-100 text-black' : 'text-gray-500 hover:bg-gray-50 hover:text-black'
                        }`;
                      }}
                    >
                      <Printer className="h-[18px] w-[18px]" />
                      Impresoras
                    </NavLink>
                  </li>
                  <li>
                    <NavLink 
                      to="/shifts-settings" 
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={({ isActive }) => 
                        `flex items-center gap-3 px-3 py-2 rounded-lg text-[14px] font-semibold transition-colors ${
                          isActive ? 'bg-gray-100 text-black' : 'text-gray-500 hover:bg-gray-50 hover:text-black'
                        }`
                      }
                    >
                      <DollarSign className="h-[18px] w-[18px]" />
                      Caja y Turnos
                    </NavLink>
                  </li>
                </ul>
              )}
            </li>
          </ul>
        </nav>

        {/* Footer / Logout */}
        <div className="p-4 border-t shrink-0 flex flex-col gap-2">
          
          <div className="flex flex-col gap-2 mb-1">
            <NavLink 
              to="/pos"
              className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 w-full rounded-lg text-[15px] font-bold transition-all border ${
                isActive ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-blue-50 text-blue-700 border-blue-100 hover:bg-blue-100 hover:border-blue-200'
              }`}
            >
              <MonitorPlay className="h-[18px] w-[18px]" />
              Punto de Venta
            </NavLink>
            <NavLink 
              to="/kitchen"
              className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 w-full rounded-lg text-[15px] font-bold transition-all border ${
                isActive ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-blue-50 text-blue-700 border-blue-100 hover:bg-blue-100 hover:border-blue-200'
              }`}
            >
              <ChefHat className="h-[18px] w-[18px]" />
              Cocina
            </NavLink>
          </div>
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
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto relative">
        {/* Mobile Header OR Desktop Header when sidebar is collapsed */}
        <header className={`${!isSidebarCollapsed ? 'lg:hidden' : 'lg:flex'} bg-white border-b h-16 flex items-center px-4 shrink-0 shadow-sm sticky top-0 z-40`}>
          <button 
            onClick={() => {
              if (window.innerWidth >= 1024) toggleSidebar();
              else setIsMobileMenuOpen(true);
            }}
            className="p-2 -ml-2 mr-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <Menu className="h-6 w-6" />
          </button>
          <span className="font-bold text-lg lg:hidden">FoodHub</span>
          <div className="flex-1" />
          {isDashboard && (
            <div className="flex items-center gap-2 lg:hidden">
              <PrepTimeSelector compact />
              <StockNotifications />
            </div>
          )}
        </header>

        <Outlet />
      </main>
      {(isSuperAdmin || role === 'owner') && <FeedbackBubble />}
    </div>
  );
};

export default Layout;
