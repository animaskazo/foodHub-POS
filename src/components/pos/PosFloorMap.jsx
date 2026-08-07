import React, { useState, useEffect } from 'react';
import { getFirstOrganizationId } from '../../services/organizationService';
import { supabase } from '../../lib/supabase';
import { getTableZones, getRestaurantTables } from '../../services/tableService';
import { Loader2 } from 'lucide-react';

const PosFloorMap = ({ onTableSelect }) => {
  const [loading, setLoading] = useState(true);
  const [zones, setZones] = useState([]);
  const [tables, setTables] = useState([]);
  const [activeZoneId, setActiveZoneId] = useState(null);

  useEffect(() => {
    loadData();
    
    // Subscribe to changes in tables (e.g. status changes)
    const tablesSubscription = supabase
      .channel('public:restaurant_tables')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurant_tables' }, (payload) => {
        setTables(current => {
          if (payload.eventType === 'INSERT') return [...current, payload.new];
          if (payload.eventType === 'UPDATE') return current.map(t => t.id === payload.new.id ? payload.new : t);
          if (payload.eventType === 'DELETE') return current.filter(t => t.id !== payload.old.id);
          return current;
        });
      })
      .subscribe();
      
    return () => {
      supabase.removeChannel(tablesSubscription);
    };
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const orgId = await getFirstOrganizationId();
      if (!orgId) return;

      const { data: branchData } = await supabase
        .from('branches')
        .select('id')
        .eq('organization_id', orgId)
        .limit(1)
        .single();
      
      if (!branchData) return;

      const [loadedZones, loadedTables] = await Promise.all([
        getTableZones(branchData.id),
        getRestaurantTables(branchData.id)
      ]);

      setZones(loadedZones);
      setTables(loadedTables);
      
      if (loadedZones.length > 0) {
        setActiveZoneId(loadedZones[0].id);
      }
    } catch (error) {
      console.error("Error loading floor map data", error);
    } finally {
      setLoading(false);
    }
  };

  const activeTables = tables.filter(t => t.zone_id === activeZoneId);

  const getStatusColor = (status) => {
    switch (status) {
      case 'free': return 'bg-emerald-50 border-emerald-300 text-emerald-800';
      case 'occupied': return 'bg-red-50 border-red-300 text-red-800';
      case 'cleaning': return 'bg-amber-50 border-amber-300 text-amber-800';
      case 'reserved': return 'bg-blue-50 border-blue-300 text-blue-800';
      default: return 'bg-white border-gray-300 text-gray-800';
    }
  };

  const getStatusDot = (status) => {
    switch (status) {
      case 'free': return 'bg-emerald-500';
      case 'occupied': return 'bg-red-500';
      case 'cleaning': return 'bg-amber-500';
      case 'reserved': return 'bg-blue-500';
      default: return 'bg-gray-500';
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (zones.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
        <p className="text-xl font-medium mb-2">No hay zonas configuradas</p>
        <p className="text-sm">Configura tus zonas y mesas en el panel de administración.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col w-full h-full overflow-hidden bg-gray-50">
      
      {/* Zones Header */}
      <div className="h-16 bg-white border-b border-gray-200 px-6 flex items-center gap-3 overflow-x-auto shrink-0 shadow-sm z-10">
        {zones.map(z => (
          <button
            key={z.id}
            onClick={() => setActiveZoneId(z.id)}
            className={`px-5 py-2.5 rounded-full text-sm font-bold whitespace-nowrap transition-colors ${
              activeZoneId === z.id 
                ? 'bg-black text-white' 
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {z.name}
          </button>
        ))}
      </div>

      {/* Map Canvas */}
      <div 
        className="flex-1 relative overflow-auto bg-gray-100"
        style={{
          backgroundImage: 'radial-gradient(#d1d5db 1px, transparent 1px)',
          backgroundSize: '20px 20px'
        }}
      >
        <div className="absolute top-0 left-0 w-[1200px] h-[800px] origin-top-left">
          {activeTables.map(t => {
            const activeOrder = t.orders?.find(o => ['pending', 'confirmed', 'preparing', 'ready'].includes(o.status));
            const currentTotal = activeOrder ? activeOrder.total : 0;
            
            return (
            <button
              key={t.id}
              onClick={() => onTableSelect(t)}
              className={`absolute flex flex-col items-center justify-center border-2 shadow-sm transition-all hover:scale-105 active:scale-95 ${getStatusColor(t.status)} ${t.shape === 'round' ? 'rounded-full' : t.shape === 'rectangle' ? 'rounded-lg' : 'rounded-xl'}`}
              style={{
                left: t.pos_x,
                top: t.pos_y,
                width: t.shape === 'rectangle' ? t.width * 1.5 : t.width,
                height: t.height
              }}
            >
              <div className="absolute top-2 right-2 flex gap-1">
                <span className={`w-2.5 h-2.5 rounded-full ${getStatusDot(t.status)} shadow-sm`}></span>
              </div>
              <span className="font-bold text-center px-1 leading-tight">{t.name}</span>
              <div className="flex flex-col items-center mt-1">
                <span className="text-[11px] font-medium opacity-70 flex items-center gap-1">
                  <span className="text-[10px]">👤</span> {t.capacity}
                </span>
                {t.status === 'occupied' && currentTotal > 0 && (
                  <span className="text-[12px] font-black mt-0.5 bg-black/10 px-1.5 rounded-md">
                    ${new Intl.NumberFormat('es-CL').format(currentTotal)}
                  </span>
                )}
              </div>
            </button>
            );
          })}
          {activeTables.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-gray-400 font-medium text-lg">
              No hay mesas en este sector.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PosFloorMap;
