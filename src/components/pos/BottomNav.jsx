import React, { useState, useEffect, useRef } from 'react';
import { ShoppingCart, ArrowLeftRight, Home, ChefHat, LogOut, LayoutGrid, KeyRound, Lock, Menu } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useKitchenOrders } from '../../hooks/useKitchenOrders';
import { Button } from '@/components/ui/button';

export const NAV_ITEMS = [
  { id: 'pago', label: 'Vender', icon: ShoppingCart },
  { id: 'mesas', label: 'Mesas', icon: LayoutGrid },
  { id: 'transacciones', label: 'Transacciones', icon: ArrowLeftRight },
  { id: 'cocina', label: 'Cocina', icon: ChefHat },
  { id: 'dashboard', label: 'Panel', icon: Home },
];

export const getNavItems = (role, dineInEnabled = false, isAdmin = false) => {
  return NAV_ITEMS.filter(item => {
    if (item.id === 'mesas') {
      return dineInEnabled && ['waiter', 'owner', 'admin', 'manager'].includes(role);
    }
    // Vendedores: solo POS + cocina.
    if ((item.id === 'transacciones' || item.id === 'dashboard') && !isAdmin) {
      return false;
    }
    return true;
  });
};

const LEFT_ITEM_IDS = ['pago', 'cocina'];
const leftItems = NAV_ITEMS.filter(item => LEFT_ITEM_IDS.includes(item.id));

const MenuItem = ({ icon: Icon, onClick, children, danger = false }) => (
  <button
    type="button"
    onClick={onClick}
    className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-3 transition-colors ${
      danger
        ? 'text-red-600 hover:bg-red-50 font-medium'
        : 'text-gray-700 hover:bg-gray-50'
    }`}
  >
    <Icon className={`h-4 w-4 ${danger ? 'text-red-600' : 'text-gray-800'}`} />
    {children}
  </button>
);

const BottomNav = ({ active = 'pago', onChange, role, dineInEnabled = false, isAdmin = false, onLogout, onChangePin, shiftEnabled = false, shiftOpen = false, canCloseShift = false, onCloseShift }) => {
  const navigate = useNavigate();
  const { pendingCount, newOrderFlag } = useKitchenOrders();
  const [triggerAnimation, setTriggerAnimation] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const prevNewOrderFlag = useRef(newOrderFlag);
  const menuRef = useRef(null);

  useEffect(() => {
    if (newOrderFlag !== prevNewOrderFlag.current) {
      setTriggerAnimation(true);
      prevNewOrderFlag.current = newOrderFlag;
    }
  }, [newOrderFlag]);

  // Reset animation after short duration
  useEffect(() => {
    if (triggerAnimation) {
      const timer = setTimeout(() => setTriggerAnimation(false), 1500);
      return () => clearTimeout(timer);
    }
  }, [triggerAnimation]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const menuNavItems = getNavItems(role, dineInEnabled, isAdmin)
    .filter(({ id }) => id === 'transacciones' || id === 'mesas');

  return (
    <div className="bg-[#111111] text-white hidden md:flex items-center justify-between gap-2 px-6 h-16 shrink-0 z-50">
      {/* Left: Vender + Cocina */}
      <div className="flex items-center gap-2">
        {leftItems.map(({ id, label, icon: Icon }) => (
          <Button
            key={id}
            variant="ghost"
            size="sm"
            onPointerDown={() => {
              if (id === 'cocina') {
                navigate('/kitchen');
                onChange && onChange(id);
                // Reset animation after showing
                if (triggerAnimation) setTriggerAnimation(false);
              } else {
                onChange && onChange(id);
              }
            }}
            className={`px-5 relative ${active === id
              ? 'text-white bg-white/10 hover:bg-white/10 hover:text-white'
              : 'text-gray-400 hover:text-white hover:bg-gray-100/5'
              } ${id === 'cocina' && triggerAnimation ? 'animate-pulse' : ''}`}
          >
            <Icon className="size-5" />
            {id === 'cocina' && pendingCount > 0 && (
              <span className="absolute -top-1 -right-1 flex items-center justify-center h-5 w-5 rounded-full bg-red-600 text-xs text-white font-bold">{pendingCount}</span>
            )}
            <span className="text-sm font-semibold">
              {label}
            </span>
          </Button>
        ))}
      </div>

      {/* Right: dropdown grouping session + cash register */}
      <div className="relative" ref={menuRef}>
        <Button
          variant="ghost"
          size="sm"
          onPointerDown={(e) => {
            e.preventDefault();
            setMenuOpen((open) => !open);
          }}
          className={`px-5 ${menuOpen ? 'text-white bg-white/10' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}
          title="Opciones de sesión"
        >
          <Menu className="size-5" />
          <span className="text-sm font-semibold">Menú</span>
        </Button>

        {menuOpen && (
          <div className="absolute bottom-full right-0 mb-2 w-52 bg-white rounded-xl shadow-lg border border-gray-100 z-50 overflow-hidden">
            <div className="py-1">
              {menuNavItems.map(({ id, label, icon: Icon }) => (
                  <MenuItem
                    key={id}
                    icon={Icon}
                    onClick={() => {
                      setMenuOpen(false);
                      onChange && onChange(id);
                    }}
                  >
                    {label}
                  </MenuItem>
                ))}

              {menuNavItems.length > 0 && (
                <div className="my-1 border-t border-gray-100" aria-hidden="true" />
              )}

              {isAdmin ? (
                <MenuItem
                  icon={Home}
                  onClick={() => { setMenuOpen(false); navigate('/'); }}
                >
                  Ir al Panel
                </MenuItem>
              ) : (
                <>
                  <MenuItem
                    icon={KeyRound}
                    onClick={() => {
                      setMenuOpen(false);
                      onChangePin ? onChangePin() : navigate('/update-password');
                    }}
                  >
                    Cambiar mi PIN
                  </MenuItem>
                  <MenuItem
                    icon={LogOut}
                    danger
                    onClick={() => {
                      setMenuOpen(false);
                      onLogout ? onLogout() : navigate('/login');
                    }}
                  >
                    Cerrar Sesión
                  </MenuItem>
                </>
              )}

              {shiftEnabled && shiftOpen && canCloseShift && (
                <MenuItem
                  icon={Lock}
                  danger
                  onClick={() => {
                    setMenuOpen(false);
                    onCloseShift && onCloseShift();
                  }}
                >
                  Cerrar Caja
                </MenuItem>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BottomNav;
