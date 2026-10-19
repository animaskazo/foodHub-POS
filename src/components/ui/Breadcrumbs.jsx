import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

const settingsLabels = {
  general: 'General',
  hours: 'Horarios',
  staff: 'Equipo',
  printers: 'Impresoras',
  payments: 'Pasarela de pago',
  coupons: 'Cupones',
};

export function getBreadcrumbs(pathname, search = '') {
  if (pathname === '/settings') {
    const tab = new URLSearchParams(search).get('tab') || 'general';
    if (!settingsLabels[tab]) return [];
    return [
      { label: 'Configuración', to: '/settings?tab=general' },
      { label: settingsLabels[tab] },
    ];
  }
  const sections = {
    '/products': ['Catálogo', 'Productos'],
    '/categories': ['Catálogo', 'Categorías'],
    '/ingredients': ['Catálogo', 'Ingredientes'],
    '/shifts-settings': ['Configuración', 'Caja y Turnos'],
    '/tables': ['Configuración', 'Zonas y Mesas'],
  };
  const section = sections[pathname];
  if (!section) return [];
  return [
    { label: section[0], ...(section[0] === 'Configuración' ? { to: '/settings?tab=general' } : {}) },
    { label: section[1] },
  ];
}

export function Breadcrumbs({ items = [], className = '' }) {
  if (items.length < 2) return null;
  const linkClass = 'inline-flex min-h-9 items-center rounded-sm text-gray-600 hover:text-black hover:underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black';
  return (
    <nav aria-label="Ruta de navegación" className={`min-w-0 text-xs sm:text-sm ${className}`}>
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        {items.map((item, index) => (
          <li key={`${index}-${item.label}`} className="flex min-w-0 max-w-full items-center gap-2">
            {index > 0 && <ChevronRight className="size-3.5 shrink-0" aria-hidden="true" />}
            {index === items.length - 1 ? (
              <span aria-current="page" className="break-words py-2 font-medium text-black">{item.label}</span>
            ) : item.onClick ? (
              <button type="button" onClick={item.onClick} className={linkClass}>{item.label}</button>
            ) : item.to ? (
              <Link to={item.to} className={linkClass}>{item.label}</Link>
            ) : (
              <span className="py-2 text-gray-600">{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
