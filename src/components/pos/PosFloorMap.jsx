import React, { useState, useEffect } from 'react';
import { getFirstOrganizationId } from '../../services/organizationService';
import { supabase } from '../../lib/supabase';
import { getTableZones, getRestaurantTables, onTablesChanged } from '../../services/tableService';
import { getOpenOrders, sumOpenOrdersTotal } from '../../services/orderService';
import { Loader2, Users, Menu } from 'lucide-react';

const PosFloorMap = ({ onTableSelect, onOpenMobileMenu }) => {
  const [loading, setLoading] = useState(true);
  const [zones, setZones] = useState([]);
  const [tables, setTables] = useState([]);
  const [activeZoneId, setActiveZoneId] = useState(null);

  // Drag to scroll state
  const mapRef = React.useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });
  const [hasDragged, setHasDragged] = useState(false); // To prevent click on table if dragged

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

  useEffect(() => {
    loadData();

    // Cualquier cambio en restaurant_tables recarga la lista completa en vez de
    // parchear la fila: `payload.new` es la fila cruda y viene sin los pedidos
    // embebidos, así que replacing la dejaba con 0 pedidos aunque tuviera una
    // orden abierta (pasaba al renombrar una mesa desde TablesSettings).
    const tablesSubscription = supabase
      .channel('public:restaurant_tables')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurant_tables' }, () => {
        loadData();
      })
      .subscribe();

    // El POS avisa tras cobrar o enviar a cocina.
    const unsubscribe = onTablesChanged(loadData);
      
    return () => {
      supabase.removeChannel(tablesSubscription);
      unsubscribe();
    };
  }, []);

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
      
      {/* Top Header */}
      <div className="bg-white pt-5 pb-4 px-3 md:px-5 border-b border-gray-100 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button
            onPointerDown={onOpenMobileMenu}
            className="md:hidden p-2 -ml-2 rounded-lg text-gray-700 active:bg-gray-100 shrink-0 select-none"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <Menu className="h-7 w-7" />
          </button>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-900">Sectores</h1>
          </div>
        </div>
      </div>

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
            const openOrders = getOpenOrders(t.orders);
            const currentTotal = sumOpenOrdersTotal(t.orders);
            // `restaurant_tables.status` no lo mantiene el POS (nunca se pone en
            // 'occupied'), así que la ocupación real se deriva de las órdenes
            // abiertas. Si no hay, se respeta el estado manual ('cleaning',
            // 'reserved', etc.).
            const visualStatus = openOrders.length > 0 ? 'occupied' : t.status;

            return (
            <button
              key={t.id}
              onClick={() => {
                if (!hasDragged) onTableSelect(t);
              }}
              className={`absolute flex flex-col items-center justify-center border transition-all duration-300 ease-out active:scale-[0.98] ${getStatusColor(visualStatus)} ${t.shape === 'round' ? 'rounded-full' : t.shape === 'rectangle' ? 'rounded-2xl' : 'rounded-3xl'}`}
              style={{
                left: t.pos_x,
                top: t.pos_y,
                width: t.shape === 'rectangle' ? (t.width * 1.5) + 40 : t.width + 40,
                height: t.height + 40
              }}
            >
              <div className="absolute top-4 right-4 flex gap-1">
                <span className={`w-2.5 h-2.5 rounded-full ${getStatusDot(visualStatus)}`}></span>
              </div>
              
              <span className="font-semibold text-center px-4 text-[17px] tracking-tight">{t.name}</span>
              
              <div className="flex flex-col items-center mt-1.5 gap-1.5">
                <div className={`flex items-center gap-1.5 text-[12px] font-medium opacity-60`}>
                  <Users className="w-3.5 h-3.5" />
                  <span>{t.capacity}</span>
                </div>
                
                {openOrders.length > 0 && currentTotal > 0 && (
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
