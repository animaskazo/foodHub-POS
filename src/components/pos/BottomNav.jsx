import React, { useState, useEffect, useRef } from 'react';
import { ShoppingCart, ArrowLeftRight, Home, ChefHat, LogOut, LayoutGrid, KeyRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useKitchenOrders } from '../../hooks/useKitchenOrders';
import { Button } from '@/components/ui/button';

export const NAV_ITEMS = [
  { id: 'pago', label: 'Punto de Venta', icon: ShoppingCart },
  { id: 'mesas', label: 'Sectores', icon: LayoutGrid },
  { id: 'transacciones', label: 'Transacciones', icon: ArrowLeftRight },
  { id: 'cocina', label: 'Cocina', icon: ChefHat },
  { id: 'dashboard', label: 'Dashboard', icon: Home },
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

const BottomNav = ({ active = 'pago', onChange, role, dineInEnabled = false, isAdmin = false, onLogout, onChangePin }) => {
  const navigate = useNavigate();
  const { pendingCount, newOrderFlag } = useKitchenOrders();
  const [triggerAnimation, setTriggerAnimation] = useState(false);
  const prevNewOrderFlag = useRef(newOrderFlag);

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

  return (
    <div className="bg-[#111111] text-white hidden md:flex items-center px-6 h-16 shrink-0 z-50">
      {/* Left: Session info */}
      {isAdmin ? (
        <Button
          variant="ghost"
          size="sm"
          onPointerDown={() => navigate('/')}
          className="text-gray-400 hover:text-white hover:bg-white/10 mr-8"
        >
          <LogOut />
          Admin
        </Button>
      ) : (
        <div className="flex items-center gap-1 mr-8">
          <Button
            variant="ghost"
            size="sm"
            onPointerDown={() => onChangePin ? onChangePin() : navigate('/update-password')}
            className="text-gray-400 hover:text-white hover:bg-white/10"
            title="Cambiar mi PIN"
          >
            <KeyRound />
            Mi PIN
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onPointerDown={() => onLogout ? onLogout() : navigate('/login')}
            className="text-gray-400 hover:text-white hover:bg-white/10"
            title="Cerrar sesión"
          >
            <LogOut />
            Salir
          </Button>
        </div>
      )}

      {/* Center: Nav items */}
      <div className="flex items-center gap-1 flex-1">
        {getNavItems(role, dineInEnabled, isAdmin).map(({ id, label, icon: Icon }) => (
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
              } else if (id === 'dashboard') {
                navigate('/');
                onChange && onChange(id);
              } else {
                onChange && onChange(id);
              }
            }}
            className={`relative ${active === id
              ? 'text-white bg-white/10 hover:bg-white/10 hover:text-white'
              : 'text-gray-400 hover:text-white hover:bg-white/5'
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
    </div>
  );
};

export default BottomNav;
