import React, { useState, useEffect, useRef } from 'react';
import { ShoppingCart, ArrowLeftRight, Home, ChefHat, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useKitchenOrders } from '../../hooks/useKitchenOrders';

export const NAV_ITEMS = [
  { id: 'pago', label: 'Punto de Venta', icon: ShoppingCart },
  { id: 'transacciones', label: 'Transacciones', icon: ArrowLeftRight },
  { id: 'cocina', label: 'Cocina', icon: ChefHat },
  { id: 'dashboard', label: 'Dashboard', icon: Home },
];

const BottomNav = ({ active = 'pago', onChange }) => {
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
      <button
        onPointerDown={() => navigate('/')}
        className="flex items-center gap-2 text-gray-400 active:text-white select-none mr-8"
        style={{ WebkitTapHighlightColor: 'transparent' }}
      >
        <LogOut className="h-4 w-4" />
        <span className="text-sm font-medium">Admin</span>
      </button>

      {/* Center: Nav items */}
      <div className="flex items-center gap-1 flex-1">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
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
            className={`relative flex items-center gap-2 px-4 py-2 rounded-xl select-none transition-colors ${active === id
              ? 'text-white bg-white/10'
              : 'text-gray-400 active:text-white active:bg-white/5'
              } ${id === 'cocina' && triggerAnimation ? 'animate-pulse' : ''}`}
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <Icon className="h-5 w-5" />
            {id === 'cocina' && pendingCount > 0 && (
              <span className="absolute -top-1 -right-1 flex items-center justify-center h-5 w-5 rounded-full bg-red-600 text-xs text-white font-bold">{pendingCount}</span>
            )}
            <span className={`text-sm font-semibold ${active === id ? 'text-blue-400' : ''}`}>
              {label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default BottomNav;
