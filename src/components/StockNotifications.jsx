import React, { useState, useEffect, useRef } from 'react';
import { Bell, AlertTriangle, X } from 'lucide-react';
import { getFirstOrganizationId, getInventoryItems, getInventoryUsage } from '../services/inventoryService';
import { useNavigate } from 'react-router-dom';

const isLowStock = (item, usageMap) => {
  if (!item.low_stock_threshold) return false;
  const usage = usageMap[item.id];
  if (!usage) return false;
  const stock = parseFloat(item.stock_quantity);
  const totalEver = usage.totalIn + stock;
  if (totalEver <= 0) return false;
  const stockPct = (stock / totalEver) * 100;
  return stockPct <= parseFloat(item.low_stock_threshold);
};

const getUnitShort = (unit) => {
  const map = { unit: 'unid', g: 'g', kg: 'kgs', ml: 'ml', l: 'lts', oz: 'oz', lb: 'lb' };
  return map[unit] || unit;
};

const getStockPct = (item, usageMap) => {
  const usage = usageMap[item.id];
  if (!usage) return 100;
  const stock = parseFloat(item.stock_quantity);
  const totalEver = usage.totalIn + stock;
  if (totalEver <= 0) return 100;
  return (stock / totalEver) * 100;
};

const StockNotifications = () => {
  const [lowStockItems, setLowStockItems] = useState([]);
  const [usageMap, setUsageMap] = useState({});
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetch = async () => {
      const orgId = await getFirstOrganizationId();
      if (!orgId) return;
      const [items, usage] = await Promise.all([
        getInventoryItems(orgId),
        getInventoryUsage(orgId),
      ]);
      setUsageMap(usage);
      setLowStockItems(items.filter(i => isLowStock(i, usage)));
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

  if (lowStockItems.length === 0) return null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2.5 text-gray-600 hover:bg-gray-100 rounded-full transition-colors border border-gray-200"
      >
        <Bell className="h-5 w-5" />
        <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 shadow-sm animate-pulse">
          {lowStockItems.length}
        </span>
      </button>
      {open && (
        <div className="absolute right-full top-0 mr-2 w-80 bg-white border border-gray-200 rounded-xl shadow-lg z-50">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <div>
                <h3 className="font-semibold text-sm text-gray-900">Insumos con stock bajo</h3>
                <p className="text-xs text-gray-500 mt-0.5">Estos insumos están por debajo del umbral mínimo</p>
              </div>
            <button onClick={() => setOpen(false)} className="p-1 text-gray-400 hover:text-gray-600 rounded">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="max-h-72 overflow-y-auto p-2">
            {lowStockItems.map(item => (
              <button
                key={item.id}
                onClick={() => { setOpen(false); navigate('/inventory'); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 text-left transition-colors"
              >
                <div className="w-8 h-8 bg-red-50 rounded-lg flex items-center justify-center shrink-0">
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                  <p className="text-xs text-red-600">
                    {parseFloat(item.stock_quantity).toFixed(item.unit === 'unit' ? 0 : 1)} {getUnitShort(item.unit)} ({getStockPct(item, usageMap).toFixed(0)}% restante) — umbral {item.low_stock_threshold}%
                  </p>
                </div>
              </button>
            ))}
          </div>
          <div className="px-4 py-2.5 border-t border-gray-100">
            <button
              onClick={() => { setOpen(false); navigate('/inventory'); }}
              className="w-full text-center text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              Ir a Inventario
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default StockNotifications;
