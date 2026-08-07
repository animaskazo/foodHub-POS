import React, { useState, useEffect, useRef } from 'react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import PageHeader from '../components/ui/PageHeader';
import { supabase } from '../lib/supabase';
import { getFirstOrganizationId } from '../services/organizationService';
import { 
  getTableZones, createTableZone, updateTableZone, deleteTableZone, 
  getRestaurantTables, createRestaurantTable, updateRestaurantTable, deleteRestaurantTable, updateTablesBatch 
} from '../services/tableService';
import { Loader2, Plus, Trash2, Edit2, Save, Move } from 'lucide-react';
import { toast } from 'sonner';

const TablesSettingsView = () => {
  useDocumentTitle('Ajustes de Zonas y Mesas');

  const [loading, setLoading] = useState(true);
  const [branchId, setBranchId] = useState(null);
  
  const [zones, setZones] = useState([]);
  const [tables, setTables] = useState([]);
  const [activeZoneId, setActiveZoneId] = useState(null);

  // Forms state
  const [editingZone, setEditingZone] = useState(null);
  const [newZoneName, setNewZoneName] = useState('');
  
  const [editingTable, setEditingTable] = useState(null);
  const [newTable, setNewTable] = useState({ name: '', capacity: 2, shape: 'square' });

  // Drag state
  const [draggingTable, setDraggingTable] = useState(null);
  const containerRef = useRef(null);

  useEffect(() => {
    loadData();
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
      setBranchId(branchData.id);

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
      console.error(error);
      toast.error('Error al cargar zonas y mesas');
    } finally {
      setLoading(false);
    }
  };

  // ── ZONES ────────────────────────────────────────────────
  const handleSaveZone = async () => {
    if (!newZoneName.trim() || !branchId) return;
    try {
      if (editingZone) {
        const updated = await updateTableZone(editingZone.id, { name: newZoneName });
        setZones(zones.map(z => z.id === updated.id ? updated : z));
        toast.success('Zona actualizada');
      } else {
        const created = await createTableZone({ branch_id: branchId, name: newZoneName, sort_order: zones.length });
        setZones([...zones, created]);
        if (!activeZoneId) setActiveZoneId(created.id);
        toast.success('Zona creada');
      }
      setNewZoneName('');
      setEditingZone(null);
    } catch (error) {
      toast.error('Error al guardar zona');
    }
  };

  const handleDeleteZone = async (id) => {
    if (!confirm('¿Estás seguro de eliminar esta zona y todas sus mesas?')) return;
    try {
      await deleteTableZone(id);
      setZones(zones.filter(z => z.id !== id));
      setTables(tables.filter(t => t.zone_id !== id));
      if (activeZoneId === id) setActiveZoneId(zones[0]?.id || null);
      toast.success('Zona eliminada');
    } catch (error) {
      toast.error('Error al eliminar zona');
    }
  };

  // ── TABLES ───────────────────────────────────────────────
  const handleSaveTable = async () => {
    if (!newTable.name.trim() || !branchId || !activeZoneId) return;
    try {
      if (editingTable) {
        const updated = await updateRestaurantTable(editingTable.id, { 
          name: newTable.name, 
          capacity: newTable.capacity, 
          shape: newTable.shape 
        });
        setTables(tables.map(t => t.id === updated.id ? { ...t, ...updated } : t));
        toast.success('Mesa actualizada');
      } else {
        const created = await createRestaurantTable({ 
          branch_id: branchId, 
          zone_id: activeZoneId,
          name: newTable.name, 
          capacity: newTable.capacity, 
          shape: newTable.shape,
          pos_x: 50,
          pos_y: 50,
          width: 80,
          height: 80
        });
        setTables([...tables, created]);
        toast.success('Mesa creada');
      }
      setNewTable({ name: '', capacity: 2, shape: 'square' });
      setEditingTable(null);
    } catch (error) {
      console.error("Error saving table:", error);
      toast.error('Error al guardar mesa');
    }
  };

  const handleDeleteTable = async (id) => {
    if (!confirm('¿Estás seguro de eliminar esta mesa?')) return;
    try {
      await deleteRestaurantTable(id);
      setTables(tables.filter(t => t.id !== id));
      toast.success('Mesa eliminada');
    } catch (error) {
      toast.error('Error al eliminar mesa');
    }
  };

  // ── DRAG & DROP ──────────────────────────────────────────
  const activeTables = tables.filter(t => t.zone_id === activeZoneId);

  const handleMouseDown = (e, table) => {
    if (e.target.tagName.toLowerCase() === 'button' || e.target.closest('button')) return; // Ignore buttons
    
    e.preventDefault(); // Prevent text selection
    const rect = containerRef.current.getBoundingClientRect();
    
    setDraggingTable({
      ...table,
      offsetX: e.clientX - rect.left - table.pos_x,
      offsetY: e.clientY - rect.top - table.pos_y
    });
  };

  const handleMouseMove = (e) => {
    if (!draggingTable || !containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    let newX = e.clientX - rect.left - draggingTable.offsetX;
    let newY = e.clientY - rect.top - draggingTable.offsetY;
    
    // Snap to grid (20px) and bound to container
    newX = Math.max(0, Math.min(newX, rect.width - draggingTable.width));
    newY = Math.max(0, Math.min(newY, rect.height - draggingTable.height));
    
    newX = Math.round(newX / 20) * 20;
    newY = Math.round(newY / 20) * 20;

    setTables(prev => prev.map(t => 
      t.id === draggingTable.id ? { ...t, pos_x: newX, pos_y: newY } : t
    ));
  };

  const handleMouseUp = () => {
    if (draggingTable) {
      setDraggingTable(null);
    }
  };

  const handleSaveMap = async () => {
    try {
      const updates = activeTables.map(t => ({ id: t.id, pos_x: t.pos_x, pos_y: t.pos_y, zone_id: t.zone_id }));
      await updateTablesBatch(updates);
      toast.success('Diseño guardado');
    } catch (error) {
      toast.error('Error al guardar el diseño');
    }
  };


  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-full bg-gray-50 p-6 md:p-8 flex flex-col">
      <div className="max-w-7xl mx-auto w-full flex-1 flex flex-col">
        <PageHeader 
          title="Gestión de Zonas y Mesas"
          subtitle="Crea sectores, agrega mesas y diseña tu plano interactivo."
        />

        <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-[600px]">
          
          {/* LEFT PANEL: Forms and Lists */}
          <div className="w-full lg:w-80 flex flex-col gap-6 shrink-0">
            
            {/* Zones Section */}
            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
              <h3 className="font-bold text-gray-900 mb-4">Sectores (Zonas)</h3>
              
              <div className="flex gap-2 mb-4">
                <input 
                  type="text" 
                  placeholder="Ej. Terraza, Salón..."
                  className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  value={newZoneName}
                  onChange={e => setNewZoneName(e.target.value)}
                />
                <button 
                  onClick={handleSaveZone}
                  className="bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700 transition"
                >
                  {editingZone ? <Save className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                </button>
                {editingZone && (
                  <button 
                    onClick={() => { setEditingZone(null); setNewZoneName(''); }}
                    className="bg-gray-100 text-gray-600 px-3 py-2 rounded-lg hover:bg-gray-200 transition"
                  >
                    X
                  </button>
                )}
              </div>

              <div className="space-y-2 max-h-48 overflow-y-auto">
                {zones.map(z => (
                  <div 
                    key={z.id}
                    onClick={() => setActiveZoneId(z.id)}
                    className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition ${activeZoneId === z.id ? 'border-blue-500 bg-blue-50' : 'border-gray-100 hover:bg-gray-50'}`}
                  >
                    <span className={`font-semibold text-sm ${activeZoneId === z.id ? 'text-blue-700' : 'text-gray-700'}`}>{z.name}</span>
                    <div className="flex items-center gap-1">
                      <button 
                        onClick={(e) => { e.stopPropagation(); setEditingZone(z); setNewZoneName(z.name); }}
                        className="p-1.5 text-gray-400 hover:text-blue-600 rounded-md"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleDeleteZone(z.id); }}
                        className="p-1.5 text-gray-400 hover:text-red-600 rounded-md"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
                {zones.length === 0 && (
                  <p className="text-sm text-gray-500 text-center py-4">No hay zonas creadas.</p>
                )}
              </div>
            </div>

            {/* Tables Section */}
            {activeZoneId && (
              <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex-1 flex flex-col">
                <h3 className="font-bold text-gray-900 mb-4">Mesas en {zones.find(z => z.id === activeZoneId)?.name}</h3>
                
                <div className="space-y-3 mb-4">
                  <input 
                    type="text" 
                    placeholder="Nombre (ej. Mesa 1)"
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                    value={newTable.name}
                    onChange={e => setNewTable({...newTable, name: e.target.value})}
                  />
                  <div className="flex gap-3">
                    <input 
                      type="number" 
                      placeholder="Cap."
                      className="w-20 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                      value={newTable.capacity}
                      onChange={e => setNewTable({...newTable, capacity: Number(e.target.value)})}
                    />
                    <select 
                      className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                      value={newTable.shape}
                      onChange={e => setNewTable({...newTable, shape: e.target.value})}
                    >
                      <option value="square">Cuadrada</option>
                      <option value="rectangle">Rectangular</option>
                      <option value="round">Redonda</option>
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={handleSaveTable}
                      className="flex-1 bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-bold hover:bg-blue-700 transition"
                    >
                      {editingTable ? 'Guardar Cambios' : 'Agregar Mesa'}
                    </button>
                    {editingTable && (
                      <button 
                        onClick={() => { setEditingTable(null); setNewTable({ name: '', capacity: 2, shape: 'square' }); }}
                        className="bg-gray-100 text-gray-600 px-3 py-2 rounded-lg hover:bg-gray-200 transition"
                      >
                        Cancelar
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto space-y-2 min-h-[150px]">
                  {activeTables.map(t => (
                    <div key={t.id} className="flex items-center justify-between p-3 rounded-xl border border-gray-100 bg-gray-50">
                      <div>
                        <span className="font-semibold text-sm text-gray-800 block">{t.name}</span>
                        <span className="text-xs text-gray-500">{t.capacity} px · {t.shape}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button 
                          onClick={() => { setEditingTable(t); setNewTable({ name: t.name, capacity: t.capacity, shape: t.shape }); }}
                          className="p-1.5 text-gray-400 hover:text-blue-600 rounded-md"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          onClick={() => handleDeleteTable(t.id)}
                          className="p-1.5 text-gray-400 hover:text-red-600 rounded-md"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {activeTables.length === 0 && (
                    <p className="text-sm text-gray-500 text-center py-4">No hay mesas en este sector.</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* RIGHT PANEL: Canvas */}
          <div className="flex-1 bg-white rounded-2xl border border-gray-200 shadow-sm flex flex-col overflow-hidden relative">
            
            {/* Toolbar */}
            <div className="h-14 border-b border-gray-200 flex items-center justify-between px-6 bg-gray-50/50">
              <h3 className="font-bold text-gray-700 text-sm">Plano del Sector</h3>
              <button 
                onClick={handleSaveMap}
                className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-1.5 rounded-lg text-sm font-bold hover:bg-emerald-700 transition"
              >
                <Save className="w-4 h-4" /> Guardar Plano
              </button>
            </div>

            {/* Canvas */}
            <div 
              className="flex-1 relative overflow-auto bg-gray-100"
              style={{
                backgroundImage: 'radial-gradient(#d1d5db 1px, transparent 1px)',
                backgroundSize: '20px 20px'
              }}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              {/* Inner fixed size canvas to allow scrolling if needed, or just let it be container size */}
              <div ref={containerRef} className="absolute top-0 left-0 w-[1200px] h-[800px] origin-top-left">
                {!activeZoneId && (
                  <div className="absolute inset-0 flex items-center justify-center text-gray-400 font-medium">
                    Selecciona o crea un sector para comenzar
                  </div>
                )}
                {activeTables.map(t => (
                  <div
                    key={t.id}
                    onMouseDown={(e) => handleMouseDown(e, t)}
                    className={`absolute flex flex-col items-center justify-center border-2 shadow-sm transition-shadow cursor-move ${draggingTable?.id === t.id ? 'z-50 opacity-90 shadow-xl border-blue-500 bg-blue-50' : 'z-10 border-gray-300 bg-white hover:border-blue-400 hover:shadow-md'} ${t.shape === 'round' ? 'rounded-full' : t.shape === 'rectangle' ? 'rounded-lg' : 'rounded-xl'}`}
                    style={{
                      left: t.pos_x,
                      top: t.pos_y,
                      width: t.shape === 'rectangle' ? t.width * 1.5 : t.width,
                      height: t.height
                    }}
                  >
                    <span className="font-bold text-gray-800 pointer-events-none select-none">{t.name}</span>
                    <span className="text-[10px] text-gray-400 pointer-events-none select-none">{t.capacity} px</span>
                  </div>
                ))}
              </div>
            </div>

          </div>

        </div>
      </div>
    </div>
  );
};

export default TablesSettingsView;
