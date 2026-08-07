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
      case 'free': return 'bg-white border-gray-200 text-gray-800 shadow-[0_8px_30px_rgb(0,0,0,0.08)]';
      case 'occupied': return 'bg-black border-black text-white shadow-[0_8px_30px_rgb(0,0,0,0.25)]';
      case 'cleaning': return 'bg-amber-100 border-amber-300 text-amber-900 shadow-lg';
      case 'reserved': return 'bg-indigo-600 border-indigo-600 text-white shadow-lg';
      default: return 'bg-white border-gray-200 text-gray-800 shadow-sm';
    }
  };

  const getStatusDot = (status) => {
    switch (status) {
      case 'free': return 'bg-emerald-500 ring-2 ring-white';
      case 'occupied': return 'bg-red-500 ring-2 ring-black';
      case 'cleaning': return 'bg-amber-500 ring-2 ring-amber-100';
      case 'reserved': return 'bg-blue-400 ring-2 ring-indigo-600';
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
            className={`px-6 py-2.5 rounded-full text-[15px] font-bold whitespace-nowrap transition-colors ${
              activeZoneId === z.id 
                ? 'bg-black text-white shadow-md' 
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {z.name}
          </button>
        ))}
      </div>

      {/* Map Canvas */}
      <div 
        className="flex-1 relative overflow-auto bg-[#F2F4F7]"
        style={{
          backgroundImage: 'radial-gradient(#d1d5db 1px, transparent 1px)',
          backgroundSize: '24px 24px'
        }}
      >
        <div className="absolute top-0 left-0 w-[1600px] h-[1200px] origin-top-left p-8">
          {activeTables.map(t => {
            const activeOrder = t.orders?.find(o => ['pending', 'confirmed', 'preparing', 'ready'].includes(o.status));
            const currentTotal = activeOrder ? activeOrder.total : 0;
            
            return (
            <button
              key={t.id}
              onClick={() => onTableSelect(t)}
              className={`absolute flex flex-col items-center justify-center border-2 transition-all hover:scale-[1.03] active:scale-95 ${getStatusColor(t.status)} ${t.shape === 'round' ? 'rounded-full' : t.shape === 'rectangle' ? 'rounded-2xl' : 'rounded-3xl'}`}
              style={{
                left: t.pos_x,
                top: t.pos_y,
                width: t.shape === 'rectangle' ? (t.width * 1.5) + 30 : t.width + 30,
                height: t.height + 30
              }}
            >
              <div className="absolute top-3 right-3 flex gap-1">
                <span className={`w-3.5 h-3.5 rounded-full ${getStatusDot(t.status)} shadow-sm`}></span>
              </div>
              <span className="font-extrabold text-center px-2 text-xl leading-tight tracking-tight">{t.name}</span>
              <div className="flex flex-col items-center mt-2">
                <span className={`text-[13px] font-bold flex items-center gap-1.5 ${t.status === 'occupied' ? 'text-gray-400' : 'text-gray-500'}`}>
                  <span className="text-[12px]">👤</span> {t.capacity}
                </span>
                {t.status === 'occupied' && currentTotal > 0 && (
                  <span className="text-[14px] font-black mt-2 bg-white/10 px-2.5 py-1 rounded-lg tracking-wide border border-white/20">
                    ${new Intl.NumberFormat('es-CL').format(currentTotal)}
                  </span>
                )}
              </div>
            </button>
            );
          })}
          {activeTables.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-gray-400 font-bold text-2xl">
              No hay mesas en este sector.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PosFloorMap;
