import React, { useState } from 'react';
import { ShoppingCart, ClipboardList, ArrowLeftRight, Bell, MoreHorizontal, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const NAV_ITEMS = [
  { id: 'pago', label: 'Pago', icon: ShoppingCart },
  { id: 'inventario', label: 'Inventario', icon: ClipboardList },
  { id: 'transacciones', label: 'Transacciones', icon: ArrowLeftRight },
  { id: 'notificaciones', label: 'Notificaciones', icon: Bell },
  { id: 'mas', label: 'Más', icon: MoreHorizontal },
];

const BottomNav = ({ active = 'pago', onChange }) => {
  const navigate = useNavigate();

  return (
    <div className="bg-[#111111] text-white flex items-center px-6 h-16 shrink-0">
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
            onPointerDown={() => onChange && onChange(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl select-none transition-colors ${
              active === id
                ? 'text-white bg-white/10'
                : 'text-gray-400 active:text-white active:bg-white/5'
            }`}
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <Icon className="h-5 w-5" />
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
