import React, { useState, useEffect, useRef } from 'react';
import { Bell, AlertTriangle, X } from 'lucide-react';
import { getFirstOrganizationId, getInventoryItems, getInventoryUsage, getIngredientUsage } from '../services/inventoryService';
import { getIngredients } from '../services/catalogService';
import { useNavigate } from 'react-router-dom';

const getUnitShort = (unit) => {
  const map = { unit: 'unid', g: 'g', kg: 'kgs', ml: 'ml', l: 'lts', oz: 'oz', lb: 'lb' };
  return map[unit] || unit;
};

const computeStockPct = (stock, usage) => {
  const totalEver = (usage?.totalIn || 0) + stock;
  if (totalEver <= 0) return 100;
  return (stock / totalEver) * 100;
};

const isLowStock = (stock, threshold, usage) => {
  if (!threshold) return false;
  if (!usage) return false;
  return computeStockPct(stock, usage) <= parseFloat(threshold);
};

const StockNotifications = () => {
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetch = async () => {
      const orgId = await getFirstOrganizationId();
      if (!orgId) return;
      const [items, iUsage, ingredients, ingUsage] = await Promise.all([
        getInventoryItems(orgId),
        getInventoryUsage(orgId),
        getIngredients(orgId),
        getIngredientUsage(orgId),
      ]);

      const alerts = [];

      (items || []).forEach(item => {
        const stock = parseFloat(item.stock_quantity || 0);
        if (isLowStock(stock, item.low_stock_threshold, iUsage[item.id])) {
          alerts.push({
            type: 'inventory',
            id: item.id,
            name: item.name,
            unit: item.unit,
            stock,
            threshold: item.low_stock_threshold,
            pct: computeStockPct(stock, iUsage[item.id]),
          });
        }
      });

      (ingredients || []).forEach(ing => {
        const stock = parseFloat(ing.stock_quantity || 0);
        if (isLowStock(stock, ing.low_stock_threshold, ingUsage[ing.id])) {
          alerts.push({
            type: 'ingredient',
            id: ing.id,
            name: ing.name,
            unit: ing.unit,
            stock,
            threshold: ing.low_stock_threshold,
            pct: computeStockPct(stock, ingUsage[ing.id]),
          });
        }
      });

      setNotifications(alerts);
    };
    fetch();
    const interval = setInterval(fetch, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  if (notifications.length === 0) return null;

  const goTo = (type) => {
    setOpen(false);
    navigate(type === 'ingredient' ? '/ingredients' : '/inventory');
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        title="Insumos en riesgo"
        className="relative p-2.5 bg-red-500 text-white hover:bg-red-600 rounded-full transition-colors shadow-sm shadow-red-200"
      >
        <Bell className="h-5 w-5" />
        <span className="absolute -top-1 -right-1 bg-white text-red-600 text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 shadow-sm">
          {notifications.length}
        </span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-gray-200 rounded-xl shadow-lg z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <div>
              <h3 className="font-semibold text-sm text-gray-900">Insumos con stock bajo</h3>
              <p className="text-xs text-gray-500 mt-0.5">Por debajo del umbral mínimo de riesgo</p>
            </div>
            <button onClick={() => setOpen(false)} className="p-1 text-gray-400 hover:text-gray-600 rounded">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="max-h-72 overflow-y-auto p-2">
            {notifications.map(item => (
              <button
                key={`${item.type}-${item.id}`}
                onClick={() => goTo(item.type)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 text-left transition-colors"
              >
                <div className="w-8 h-8 bg-red-50 rounded-lg flex items-center justify-center shrink-0">
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                  <p className="text-xs text-red-600">
                    {item.stock.toFixed(item.unit === 'unit' ? 0 : 1)} {getUnitShort(item.unit)} ({item.pct.toFixed(0)}% restante) — umbral {item.threshold}%
                  </p>
                </div>
              </button>
            ))}
          </div>
          <div className="px-4 py-2.5 border-t border-gray-100">
            <button
              onClick={() => setOpen(false)}
              className="w-full text-center text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default StockNotifications;
