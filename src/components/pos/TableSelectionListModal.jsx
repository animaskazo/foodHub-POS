import React, { useState, useEffect } from 'react';
import Modal from '../ui/Modal';
import { getFirstOrganizationId } from '../../services/organizationService';
import { supabase } from '../../lib/supabase';
import { getRestaurantTables, getTableZones } from '../../services/tableService';
import { Loader2 } from 'lucide-react';

const TableSelectionListModal = ({ isOpen, onClose, onTableSelect, onClearTable, activeTable }) => {
  const [tables, setTables] = useState([]);
  const [zones, setZones] = useState([]);
  const [activeZoneId, setActiveZoneId] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadTables = async () => {
      if (tables.length === 0) setLoading(true);
      try {
        const orgId = await getFirstOrganizationId();
        if (!orgId) return;
        const { data: branchData } = await supabase.from('branches').select('id').eq('organization_id', orgId).limit(1).single();
        if (branchData) {
          const [loadedTables, loadedZones] = await Promise.all([
            getRestaurantTables(branchData.id),
            getTableZones(branchData.id)
          ]);
          setTables(loadedTables);
          setZones(loadedZones);
        }
      } catch (err) {
        console.error("Error loading tables", err);
      } finally {
        setLoading(false);
      }
    };
    
    // Always load when opened to ensure fresh data
    if (isOpen) {
      loadTables();
    }
  }, [isOpen]);
  
  // Also do an initial load in the background so it's ready before the first open
  useEffect(() => {
    const initLoad = async () => {
      try {
        const orgId = await getFirstOrganizationId();
        if (!orgId) return;
        const { data: branchData } = await supabase.from('branches').select('id').eq('organization_id', orgId).limit(1).single();
        if (branchData) {
          const [loadedTables, loadedZones] = await Promise.all([
            getRestaurantTables(branchData.id),
            getTableZones(branchData.id)
          ]);
          setTables(loadedTables);
          setZones(loadedZones);
        }
      } catch (err) {}
    };
    initLoad();
  }, []);

  const fmt = (n) => n.toLocaleString('es-CL');
  const filteredTables = activeZoneId === 'all' ? tables : tables.filter(t => t.zone_id === activeZoneId);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Seleccionar Mesa" alignEnd={true} maxWidth="max-w-full md:max-w-md">
      <div className="flex flex-col h-full">
        <div 
          className="px-5 py-4 hover:bg-gray-50 active:bg-gray-100 cursor-pointer border-b border-gray-100 flex items-center justify-between shrink-0"
          onClick={() => {
            onClearTable();
            onClose();
          }}
        >
          <span className="font-bold text-gray-800 text-lg">Venta Directa</span>
          {!activeTable && <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>}
        </div>
        
        {!loading && zones.length > 0 && (
          <div className="flex overflow-x-auto border-b border-gray-100 bg-white shrink-0 px-4 py-3 gap-2 hide-scrollbar">
            <button
              onClick={() => setActiveZoneId('all')}
              className={`px-4 py-1.5 rounded-full text-sm font-bold whitespace-nowrap transition-colors ${
                activeZoneId === 'all'
                  ? 'bg-black text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Todas
            </button>
            {zones.map(z => (
              <button
                key={z.id}
                onClick={() => setActiveZoneId(z.id)}
                className={`px-4 py-1.5 rounded-full text-sm font-bold whitespace-nowrap transition-colors ${
                  activeZoneId === z.id
                    ? 'bg-black text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {z.name}
              </button>
            ))}
          </div>
        )}
        
        <div className="flex-1 overflow-y-auto max-h-[60vh] bg-gray-50/50">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : filteredTables.length === 0 ? (
            <div className="px-5 py-8 text-center text-gray-500">No hay mesas configuradas</div>
          ) : (
            filteredTables.map(table => {
              const activeOrder = table.orders?.find(o => ['pending', 'confirmed', 'preparing', 'ready'].includes(o.status));
              const currentTotal = activeOrder ? activeOrder.total : 0;
              const isActive = activeTable?.id === table.id;
              
              return (
                <div 
                  key={table.id}
                  className={`px-5 py-4 cursor-pointer border-b border-gray-100 flex items-center justify-between transition-colors ${isActive ? 'bg-blue-50 text-blue-700' : 'bg-white text-gray-700 hover:bg-gray-50 active:bg-gray-100'}`}
                  onClick={() => {
                    onTableSelect && onTableSelect(table);
                    onClose();
                  }}
                >
                  <span className={`flex items-center gap-3 text-[17px] ${isActive ? 'font-bold' : 'font-medium'}`}>
                    {table.name}
                    {table.status === 'occupied' && currentTotal > 0 && (
                      <span className="text-[13px] bg-red-100 text-red-700 px-2 py-0.5 rounded-md font-bold shadow-sm">
                        ${fmt(currentTotal)}
                      </span>
                    )}
                  </span>
                  
                  <div className="flex items-center gap-2">
                    {table.status === 'occupied' && (
                      <span className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-sm"></span>
                    )}
                    {table.status === 'free' && (
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm"></span>
                    )}
                    {isActive && (
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-500 ml-1"></span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </Modal>
  );
};

export default TableSelectionListModal;

