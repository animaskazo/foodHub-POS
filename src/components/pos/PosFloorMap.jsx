import React, { useState, useEffect } from 'react';
import { getFirstOrganizationId } from '../../services/organizationService';
import { supabase } from '../../lib/supabase';
import { getTableZones, getRestaurantTables } from '../../services/tableService';
import { Loader2, Users } from 'lucide-react';

const PosFloorMap = ({ onTableSelect }) => {
  const [loading, setLoading] = useState(true);
  const [zones, setZones] = useState([]);
  const [tables, setTables] = useState([]);
  const [activeZoneId, setActiveZoneId] = useState(null);

  // Drag to scroll state
  const mapRef = React.useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });
  const [hasDragged, setHasDragged] = useState(false); // To prevent click on table if dragged

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

  const handlePointerDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return; // Only left click
    if (!mapRef.current) return;
    setIsDragging(true);
    setHasDragged(false);
    setDragStart({
      x: e.pageX,
      y: e.pageY,
      scrollLeft: mapRef.current.scrollLeft,
      scrollTop: mapRef.current.scrollTop
    });
    // Set cursor to grabbing
    document.body.style.cursor = 'grabbing';
  };

  const handlePointerMove = (e) => {
    if (!isDragging || !mapRef.current) return;
    
    const dx = e.pageX - dragStart.x;
    const dy = e.pageY - dragStart.y;
    
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
      setHasDragged(true);
    }
    
    mapRef.current.scrollLeft = dragStart.scrollLeft - dx;
    mapRef.current.scrollTop = dragStart.scrollTop - dy;
  };

  const handlePointerUp = () => {
    setIsDragging(false);
    document.body.style.cursor = '';
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'free': return 'bg-white border-gray-200 text-gray-700 shadow-sm hover:shadow-md hover:border-gray-300';
      case 'occupied': return 'bg-zinc-900 border-zinc-800 text-white shadow-lg hover:shadow-xl hover:bg-black';
      case 'cleaning': return 'bg-amber-50 border-amber-200 text-amber-800 shadow-sm hover:shadow-md';
      case 'reserved': return 'bg-indigo-50 border-indigo-200 text-indigo-800 shadow-sm hover:shadow-md';
      default: return 'bg-white border-gray-200 text-gray-700 shadow-sm';
    }
  };

  const getStatusDot = (status) => {
    switch (status) {
      case 'free': return 'bg-emerald-400 ring-4 ring-emerald-50/50';
      case 'occupied': return 'bg-rose-500 ring-4 ring-rose-500/20';
      case 'cleaning': return 'bg-amber-400 ring-4 ring-amber-400/20';
      case 'reserved': return 'bg-indigo-400 ring-4 ring-indigo-400/20';
      default: return 'bg-gray-400';
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
        ref={mapRef}
        className={`flex-1 relative overflow-auto bg-[#fafafa] select-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        <div className="absolute top-0 left-0 w-[1600px] h-[1200px] origin-top-left p-8">
          {activeTables.map(t => {
            const activeOrder = t.orders?.find(o => ['pending', 'confirmed', 'preparing', 'ready'].includes(o.status));
            const currentTotal = activeOrder ? activeOrder.total : 0;
            
            return (
            <button
              key={t.id}
              onClick={() => {
                if (!hasDragged) onTableSelect(t);
              }}
              className={`absolute flex flex-col items-center justify-center border transition-all duration-300 ease-out active:scale-[0.98] ${getStatusColor(t.status)} ${t.shape === 'round' ? 'rounded-full' : t.shape === 'rectangle' ? 'rounded-2xl' : 'rounded-3xl'}`}
              style={{
                left: t.pos_x,
                top: t.pos_y,
                width: t.shape === 'rectangle' ? (t.width * 1.5) + 40 : t.width + 40,
                height: t.height + 40
              }}
            >
              <div className="absolute top-4 right-4 flex gap-1">
                <span className={`w-2.5 h-2.5 rounded-full ${getStatusDot(t.status)}`}></span>
              </div>
              
              <span className="font-semibold text-center px-4 text-[17px] tracking-tight">{t.name}</span>
              
              <div className="flex flex-col items-center mt-1.5 gap-1.5">
                <div className={`flex items-center gap-1.5 text-[12px] font-medium opacity-60`}>
                  <Users className="w-3.5 h-3.5" />
                  <span>{t.capacity}</span>
                </div>
                
                {t.status === 'occupied' && currentTotal > 0 && (
                  <span className="text-[13px] font-bold tracking-wide">
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
