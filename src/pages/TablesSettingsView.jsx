import React, { useState, useEffect, useRef } from 'react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import PageHeader from '../components/ui/PageHeader';
import { supabase } from '../lib/supabase';
import { getFirstOrganizationId } from '../services/organizationService';
import { 
  getTableZones, createTableZone, updateTableZone, deleteTableZone, 
  getRestaurantTables, createRestaurantTable, updateRestaurantTable, deleteRestaurantTable, updateTablesBatch 
} from '../services/tableService';
import { Loader2, Plus, Trash2, Edit2, Save, X, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import Modal from '../components/ui/Modal';

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
  const [confirmDeleteZone, setConfirmDeleteZone] = useState(null);
  const [confirmDeleteTable, setConfirmDeleteTable] = useState(null);
  const [deleting, setDeleting] = useState(false);

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

  const handleDeleteZone = async () => {
    if (!confirmDeleteZone) return;
    setDeleting(true);
    try {
      await deleteTableZone(confirmDeleteZone.id);
      setZones(zones.filter(z => z.id !== confirmDeleteZone.id));
      setTables(tables.filter(t => t.zone_id !== confirmDeleteZone.id));
      if (activeZoneId === confirmDeleteZone.id) setActiveZoneId(zones[0]?.id || null);
      setConfirmDeleteZone(null);
      toast.success('Zona eliminada');
    } catch (error) {
      toast.error('Error al eliminar zona');
    } finally {
      setDeleting(false);
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

  const handleDeleteTable = async () => {
    if (!confirmDeleteTable) return;
    setDeleting(true);
    try {
      await deleteRestaurantTable(confirmDeleteTable.id);
      setTables(tables.filter(t => t.id !== confirmDeleteTable.id));
      setConfirmDeleteTable(null);
      toast.success('Mesa eliminada');
    } catch (error) {
      toast.error('Error al eliminar mesa');
    } finally {
      setDeleting(false);
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
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
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
                  className="flex-1 bg-gray-50 border border-gray-200 rounded-full px-4 py-2 text-sm focus:outline-none focus:border-black focus:ring-1 focus:ring-black"
                  value={newZoneName}
                  onChange={e => setNewZoneName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveZone(); }}
                />
                <Button size="icon-sm" onClick={handleSaveZone} title={editingZone ? 'Guardar zona' : 'Crear zona'}>
                  {editingZone ? <Save /> : <Plus />}
                </Button>
                {editingZone && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => { setEditingZone(null); setNewZoneName(''); }}
                    title="Cancelar"
                  >
                    <X />
                  </Button>
                )}
              </div>

              <div className="space-y-2 max-h-48 overflow-y-auto">
                {zones.map(z => (
                  <div 
                    key={z.id}
                    onClick={() => setActiveZoneId(z.id)}
                    className={`flex items-center justify-between p-3 rounded-full border cursor-pointer transition ${activeZoneId === z.id ? 'border-black bg-gray-50' : 'border-gray-100 hover:bg-gray-50'}`}
                  >
                    <span className={`font-semibold text-sm ${activeZoneId === z.id ? 'text-black' : 'text-gray-700'}`}>{z.name}</span>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={(e) => { e.stopPropagation(); setEditingZone(z); setNewZoneName(z.name); }}
                        title="Editar zona"
                      >
                        <Edit2 />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={(e) => { e.stopPropagation(); setConfirmDeleteZone(z); }}
                        title="Eliminar zona"
                        className="hover:text-red-500 hover:bg-red-50"
                      >
                        <Trash2 />
                      </Button>
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
                    className="w-full bg-gray-50 border border-gray-200 rounded-full px-4 py-2 text-sm focus:outline-none focus:border-black focus:ring-1 focus:ring-black"
                    value={newTable.name}
                    onChange={e => setNewTable({...newTable, name: e.target.value})}
                    onKeyDown={e => { if (e.key === 'Enter') handleSaveTable(); }}
                  />
                  <div className="flex gap-3">
                    <div className="relative w-32">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Users className="text-gray-400 h-3.5 w-3.5" />
                      </div>
                      <input 
                        type="number" 
                        min="1"
                        placeholder="Personas"
                        className="w-full bg-gray-50 border border-gray-200 rounded-full pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-black focus:ring-1 focus:ring-black"
                        value={newTable.capacity}
                        onChange={e => setNewTable({...newTable, capacity: Math.max(1, Number(e.target.value) || 1)})}
                        title="Capacidad de personas en la mesa"
                      />
                    </div>
                    <select 
                      className="flex-1 bg-gray-50 border border-gray-200 rounded-full px-4 py-2 text-sm focus:outline-none focus:border-black focus:ring-1 focus:ring-black"
                      value={newTable.shape}
                      onChange={e => setNewTable({...newTable, shape: e.target.value})}
                    >
                      <option value="square">Forma: Cuadrada</option>
                      <option value="rectangle">Forma: Rectangular</option>
                      <option value="round">Forma: Redonda</option>
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={handleSaveTable}
                      className="flex-1"
                    >
                      {editingTable ? 'Guardar Cambios' : 'Agregar Mesa'}
                    </Button>
                    {editingTable && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { setEditingTable(null); setNewTable({ name: '', capacity: 2, shape: 'square' }); }}
                      >
                        Cancelar
                      </Button>
                    )}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto space-y-2 min-h-[150px]">
                  {activeTables.map(t => (
                    <div key={t.id} className="flex items-center justify-between p-3 rounded-full border border-gray-100 bg-gray-50">
                      <div>
                        <span className="font-semibold text-sm text-gray-800 block">{t.name}</span>
                        <span className="text-xs text-gray-500">{t.capacity} personas · {t.shape === 'round' ? 'Redonda' : t.shape === 'rectangle' ? 'Rectangular' : 'Cuadrada'}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => { setEditingTable(t); setNewTable({ name: t.name, capacity: t.capacity, shape: t.shape }); }}
                          title="Editar mesa"
                        >
                          <Edit2 />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => setConfirmDeleteTable(t)}
                          title="Eliminar mesa"
                          className="hover:text-red-500 hover:bg-red-50"
                        >
                          <Trash2 />
                        </Button>
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
              <Button size="sm" onClick={handleSaveMap}>
                <Save /> Guardar Plano
              </Button>
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
                    className={`absolute flex flex-col items-center justify-center border-2 shadow-sm transition-shadow cursor-move ${draggingTable?.id === t.id ? 'z-50 opacity-90 shadow-xl border-black bg-gray-50' : 'z-10 border-gray-300 bg-white hover:border-gray-500 hover:shadow-md'} ${t.shape === 'round' ? 'rounded-full' : t.shape === 'rectangle' ? 'rounded-lg' : 'rounded-xl'}`}
                    style={{
                      left: t.pos_x,
                      top: t.pos_y,
                      width: t.shape === 'rectangle' ? t.width * 1.5 : t.width,
                      height: t.height
                    }}
                  >
                    <span className="font-bold text-gray-800 pointer-events-none select-none text-center px-1">{t.name}</span>
                    <span className="text-[10px] text-gray-500 font-medium pointer-events-none select-none flex items-center gap-1 mt-0.5">
                      <Users className="h-3 w-3" /> {t.capacity}
                    </span>
                  </div>
                ))}
              </div>
            </div>

          </div>

        </div>
      </div>

      {/* ── Modal: Eliminar zona ─────────────────────────── */}
      <Modal
        isOpen={!!confirmDeleteZone}
        onClose={() => setConfirmDeleteZone(null)}
        title="Eliminar zona"
        footer={
          <div className="px-6 py-4 flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setConfirmDeleteZone(null)}>
              Cancelar
            </Button>
            <Button size="sm" variant="destructive" onClick={handleDeleteZone} disabled={deleting}>
              {deleting ? 'Eliminando…' : 'Eliminar'}
            </Button>
          </div>
        }
      >
        <div className="p-6">
          <p className="text-sm text-gray-600 leading-relaxed">
            ¿Eliminar la zona <span className="font-bold text-gray-900">{confirmDeleteZone?.name}</span> y
            todas sus mesas? Esta acción no se puede deshacer.
          </p>
        </div>
      </Modal>

      {/* ── Modal: Eliminar mesa ─────────────────────────── */}
      <Modal
        isOpen={!!confirmDeleteTable}
        onClose={() => setConfirmDeleteTable(null)}
        title="Eliminar mesa"
        footer={
          <div className="px-6 py-4 flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setConfirmDeleteTable(null)}>
              Cancelar
            </Button>
            <Button size="sm" variant="destructive" onClick={handleDeleteTable} disabled={deleting}>
              {deleting ? 'Eliminando…' : 'Eliminar'}
            </Button>
          </div>
        }
      >
        <div className="p-6">
          <p className="text-sm text-gray-600 leading-relaxed">
            ¿Eliminar la mesa <span className="font-bold text-gray-900">{confirmDeleteTable?.name}</span>?
            Esta acción no se puede deshacer.
          </p>
        </div>
      </Modal>
    </div>
  );
};

export default TablesSettingsView;
