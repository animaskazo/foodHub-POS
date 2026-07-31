import React, { useState, useEffect } from 'react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Plus, Loader2, ListFilter, ChevronDown, Trash2, Package, History, BarChart3 } from 'lucide-react';
import { getFirstOrganizationId, getInventoryItems, createInventoryItem, updateInventoryItem, deleteInventoryItem, bulkDeleteInventoryItems, adjustInventoryStock, getMovements, getInventoryUsage } from '../services/inventoryService';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import Modal from '../components/ui/Modal';
import ActionMenu from '../components/ui/ActionMenu';
import ConfirmDeleteModal from '../components/ui/ConfirmDeleteModal';
import PageHeader from '../components/ui/PageHeader';
import Tooltip from '../components/ui/tooltip';

const UNITS = [
  { value: 'unit', label: 'Unid', short: 'unid' },
  { value: 'g', label: 'g', short: 'g' },
  { value: 'kg', label: 'Kg', short: 'kgs' },
  { value: 'ml', label: 'ml', short: 'ml' },
  { value: 'l', label: 'L', short: 'lts' },
  { value: 'oz', label: 'oz', short: 'oz' },
  { value: 'lb', label: 'lb', short: 'lb' },
];

const InventoryManager = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, mode: 'single', targetId: null, isDeleting: false });
  const [adjustModal, setAdjustModal] = useState({ isOpen: false, item: null });
  const [movementsModal, setMovementsModal] = useState({ isOpen: false, item: null, movements: [], loading: false });
  const [searchQuery, setSearchQuery] = useState('');
  const [usageMap, setUsageMap] = useState({});

  // Form state
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('unit');
  const [unitPrice, setUnitPrice] = useState('');
  const [stockQuantity, setStockQuantity] = useState('');
  const [lowStockThreshold, setLowStockThreshold] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Adjust form state
  const [adjustQuantity, setAdjustQuantity] = useState('');
  const [adjustNotes, setAdjustNotes] = useState('');
  const [adjustType, setAdjustType] = useState('adjustment');
  const [isAdjusting, setIsAdjusting] = useState(false);

  const loadItems = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    const orgId = await getFirstOrganizationId();
    if (orgId) {
      const [data, usage] = await Promise.all([
        getInventoryItems(orgId),
        getInventoryUsage(orgId),
      ]);
      setItems(data);
      setUsageMap(usage);
    }
    if (showLoading) setLoading(false);
  };

  useEffect(() => {
    loadItems();
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const orgId = await getFirstOrganizationId();
      if (!orgId) throw new Error('No organization found');

      const payload = {
        name,
        unit,
        unit_price: parseFloat(unitPrice) || 0,
        stock_quantity: editingItem ? undefined : (parseFloat(stockQuantity) || 0),
        low_stock_threshold: lowStockThreshold ? parseFloat(lowStockThreshold) : null,
      };

      if (editingItem) {
        await updateInventoryItem(editingItem.id, payload);
        const originalStock = parseFloat(editingItem.stock_quantity || 0);
        const newStock = stockQuantity === '' ? null : parseFloat(stockQuantity);
        if (newStock !== null && !isNaN(newStock) && newStock !== originalStock) {
          await adjustInventoryStock(
            editingItem.id,
            orgId,
            newStock - originalStock,
            'Ajuste de stock desde edición',
            'adjustment'
          );
        }
        toast.success('Insumo actualizado');
      } else {
        payload.stock_quantity = parseFloat(stockQuantity) || 0;
        await createInventoryItem(orgId, payload);
        toast.success('Insumo creado');
      }
      closeModal();
      loadItems(false);
    } catch (error) {
      toast.error('Error al guardar');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAdjust = async (e) => {
    e.preventDefault();
    if (!adjustQuantity || parseFloat(adjustQuantity) === 0) {
      toast.error('Ingresa una cantidad');
      return;
    }
    setIsAdjusting(true);
    try {
      const orgId = await getFirstOrganizationId();
      const qty = adjustType === 'waste' ? -Math.abs(parseFloat(adjustQuantity)) : parseFloat(adjustQuantity);
      await adjustInventoryStock(adjustModal.item.id, orgId, qty, adjustNotes, adjustType);
      toast.success('Stock ajustado');
      setAdjustModal({ isOpen: false, item: null });
      setAdjustQuantity('');
      setAdjustNotes('');
      loadItems(false);
    } catch (error) {
      toast.error('Error al ajustar stock');
    } finally {
      setIsAdjusting(false);
    }
  };

  const openMovements = async (item) => {
    setMovementsModal({ isOpen: true, item, movements: [], loading: true });
    const data = await getMovements(item.id);
    setMovementsModal(prev => ({ ...prev, movements: data, loading: false }));
  };

  const handleDeleteConfirm = async () => {
    setDeleteModal(prev => ({ ...prev, isDeleting: true }));
    try {
      if (deleteModal.mode === 'single') {
        await deleteInventoryItem(deleteModal.targetId);
        toast.success('Insumo eliminado');
      } else {
        await bulkDeleteInventoryItems(selectedIds);
        toast.success(`${selectedIds.length} insumos eliminados`);
        setSelectedIds([]);
      }
      loadItems(false);
    } catch (err) {
      toast.error('Error al eliminar');
    } finally {
      setDeleteModal({ isOpen: false, mode: 'single', targetId: null, isDeleting: false });
    }
  };

  const openModal = (item = null) => {
    if (item) {
      setEditingItem(item);
      setName(item.name);
      setUnit(item.unit);
      setUnitPrice(item.unit_price.toString());
      setStockQuantity(item.stock_quantity ? item.stock_quantity.toString() : '');
      setLowStockThreshold(item.low_stock_threshold ? item.low_stock_threshold.toString() : '');
    } else {
      setEditingItem(null);
      setName('');
      setUnit('unit');
      setUnitPrice('');
      setStockQuantity('');
      setLowStockThreshold('');
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setTimeout(() => {
      setEditingItem(null);
      setName('');
      setUnit('unit');
      setUnitPrice('');
      setStockQuantity('');
      setLowStockThreshold('');
    }, 300);
  };

  useDocumentTitle('Inventario');

  const handleToggleSelect = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleToggleSelectAll = (e, currentItems) => {
    if (e.target.checked) {
      setSelectedIds(currentItems.map(i => i.id));
    } else {
      setSelectedIds([]);
    }
  };

  const getUnitLabel = (unitValue) => {
    const u = UNITS.find(u => u.value === unitValue);
    return u ? u.label : unitValue;
  };

  const getUnitShort = (unitValue) => {
    const u = UNITS.find(u => u.value === unitValue);
    return u ? u.short : unitValue;
  };

  const isLowStock = (item) => {
    if (!item.low_stock_threshold) return false;
    const usage = usageMap[item.id];
    if (!usage) return false;
    const stock = parseFloat(item.stock_quantity);
    const totalEver = usage.totalIn + stock;
    if (totalEver <= 0) return false;
    const stockPct = (stock / totalEver) * 100;
    return stockPct <= parseFloat(item.low_stock_threshold);
  };

  const filteredItems = items.filter(i =>
    i.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const UsageBar = ({ item, usage }) => {
    const stock = parseFloat(item.stock_quantity);
    const totalIn = usage?.totalIn || 0;
    const totalOut = usage?.totalOut || 0;
    const totalEver = totalIn + stock;
    const pct = totalEver > 0 ? Math.min((totalOut / totalEver) * 100, 100) : 0;

    return (
      <div className="flex items-center gap-2 min-w-[120px]">
        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              pct > 80 ? 'bg-red-500' : pct > 50 ? 'bg-yellow-500' : 'bg-blue-500'
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-xs text-gray-500 font-medium w-14 text-right shrink-0">
          {pct.toFixed(0)}%
        </span>
      </div>
    );
  };

  return (
    <div className="flex-1 overflow-auto bg-gray-50 p-6 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <PageHeader
          title="Inventario de Insumos"
          subtitle="Controla el stock de materias primas e insumos de tu cocina."
        />

        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden flex flex-col">
          {/* Action Bar */}
          {selectedIds.length > 0 ? (
            <div className="px-6 py-4 flex flex-col sm:flex-row gap-4 items-center justify-between border-b bg-blue-50/50">
              <div className="flex items-center gap-3">
                <Badge variant="secondary" className="bg-blue-100 text-blue-700 hover:bg-blue-200 border-none font-medium text-sm px-3 py-1">
                  {selectedIds.length} seleccionados
                </Badge>
              </div>
              <div className="flex items-center gap-3">
                <Button variant="destructive" onClick={() => setDeleteModal({ isOpen: true, mode: 'bulk', targetId: null, isDeleting: false })}>
                  <Trash2 className="h-4 w-4 mr-2" /> Eliminar seleccionados
                </Button>
              </div>
            </div>
          ) : (
            <div className="px-6 py-4 flex flex-col sm:flex-row gap-4 items-center justify-between border-b">
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    className="pl-9 w-full sm:w-64 border-gray-300"
                    placeholder="Buscar insumo"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button onClick={() => openModal()}>
                  <Plus className="h-4 w-4 mr-2" /> Crear insumo
                </Button>
              </div>
            </div>
          )}

          {/* Table */}
          <div className="flex-1 overflow-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-white border-b text-gray-500 font-medium sticky top-0 z-10">
                  <tr>
                    <th className="px-6 py-3 w-10">
                      <input
                        type="checkbox"
                        className="h-5 w-5 rounded border-gray-300 cursor-pointer"
                        checked={filteredItems.length > 0 && selectedIds.length === filteredItems.length}
                        onChange={(e) => handleToggleSelectAll(e, filteredItems)}
                      />
                    </th>
                    <th className="px-6 py-3 font-medium">Insumo</th>
                    <th className="px-6 py-3 font-medium">Unidad</th>
                    <th className="px-6 py-3 font-medium">Stock</th>
                    <th className="px-6 py-3 font-medium">Uso</th>
                    <th className="px-6 py-3 font-medium text-right">Costo Unitario</th>
                    <th className="px-6 py-3 font-medium text-right">Acciones</th>
                  </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                      Cargando insumos...
                    </td>
                  </tr>
                ) : filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                      No se encontraron insumos.
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((item) => (
                    <tr
                      key={item.id}
                      className="hover:bg-gray-50 group transition-colors"
                    >
                      <td className="px-6 py-4">
                        <input
                          type="checkbox"
                          className="h-5 w-5 rounded border-gray-300 cursor-pointer"
                          checked={selectedIds.includes(item.id)}
                          onChange={() => handleToggleSelect(item.id)}
                        />
                      </td>
                      <td className="px-6 py-4 font-medium text-gray-900">
                        <span>{item.name}</span>
                      </td>
                      <td className="px-6 py-4 text-gray-500 text-sm">
                        {getUnitShort(item.unit)}
                      </td>
                      <td className="px-6 py-4">
                        <Badge
                          variant="secondary"
                          className={`font-bold text-sm px-3 py-1 ${
                            isLowStock(item)
                              ? 'bg-red-50 text-red-700 border border-red-200'
                              : parseFloat(item.stock_quantity) === 0
                              ? 'bg-gray-100 text-gray-500'
                              : 'bg-green-50 text-green-700 border border-green-200'
                          }`}
                        >
                          {parseFloat(item.stock_quantity).toFixed(item.unit === 'unit' ? 0 : 1)} {getUnitShort(item.unit)}
                        </Badge>
                      </td>
                      <td className="px-6 py-4">
                        <UsageBar item={item} usage={usageMap[item.id]} />
                      </td>
                      <td className="px-6 py-4 text-right text-sm text-gray-600 font-mono">
                        ${parseFloat(item.unit_price).toFixed(2)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Tooltip text="Ajustar stock">
                            <button
                              onClick={() => {
                                setAdjustModal({ isOpen: true, item });
                                setAdjustQuantity('');
                                setAdjustNotes('');
                                setAdjustType('adjustment');
                              }}
                              className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            >
                              <Package className="h-4 w-4" />
                            </button>
                          </Tooltip>
                          <Tooltip text="Historial">
                            <button
                              onClick={() => openMovements(item)}
                              className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                              <History className="h-4 w-4" />
                            </button>
                          </Tooltip>
                          <Tooltip text="Editar">
                            <button
                              onClick={() => openModal(item)}
                              className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                            </button>
                          </Tooltip>
                          <ActionMenu
                            onDelete={() => setDeleteModal({ isOpen: true, mode: 'single', targetId: item.id, isDeleting: false })}
                          />
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal Crear/Editar */}
        <Modal isOpen={isModalOpen} onClose={closeModal} title={editingItem ? 'Editar Insumo' : 'Nuevo Insumo'}>
          <form onSubmit={handleSave} className="flex flex-col h-full">
            <div className="p-6 space-y-4 flex-1">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del Insumo</label>
                <Input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej: Carne molida, Queso, Palta"
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Unidad de Medida</label>
                <Select value={unit} onValueChange={setUnit}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNITS.map(u => (
                      <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {editingItem ? 'Stock Actual' : 'Stock Inicial'}
                  </label>
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    required={!editingItem}
                    value={stockQuantity}
                    onChange={(e) => setStockQuantity(e.target.value)}
                    placeholder="Ej: 10"
                    className="w-full"
                  />
                  {editingItem && (
                    <p className="text-xs text-gray-400 mt-1">Al cambiar, se registra un ajuste de stock.</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Umbral mínimo (%)</label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="any"
                    value={lowStockThreshold}
                    onChange={(e) => setLowStockThreshold(e.target.value)}
                    placeholder="Ej: 20"
                    className="w-full"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Costo Unitario ($)</label>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  required
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(e.target.value)}
                  placeholder="Ej: 1500"
                  className="w-full"
                />
              </div>
            </div>
            <div className="p-6 bg-gray-50 border-t border-gray-100 flex justify-end gap-3 shrink-0">
              <Button type="button" variant="outline" onClick={closeModal} disabled={isSaving}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {editingItem ? 'Guardar Cambios' : 'Crear Insumo'}
              </Button>
            </div>
          </form>
        </Modal>

        {/* Modal Ajustar Stock */}
        <Modal isOpen={adjustModal.isOpen} onClose={() => setAdjustModal({ isOpen: false, item: null })} title={`Ajustar Stock: ${adjustModal.item?.name}`}>
          <form onSubmit={handleAdjust} className="flex flex-col h-full">
            <div className="p-6 space-y-4 flex-1">
              <p className="text-sm text-gray-500">
                Stock actual: <strong>{adjustModal.item ? parseFloat(adjustModal.item.stock_quantity).toFixed(adjustModal.item.unit === 'unit' ? 0 : 1) : 0} {adjustModal.item?.unit}</strong>
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Ajuste</label>
                <Select value={adjustType} onValueChange={setAdjustType}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="purchase">Compra / Ingreso</SelectItem>
                    <SelectItem value="adjustment">Ajuste manual</SelectItem>
                    <SelectItem value="waste">Merma / Pérdida</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Cantidad {adjustType === 'waste' ? '(se restará automáticamente)' : '(usa positivo para ingresar, negativo para egresar)'}
                </label>
                <Input
                  type="number"
                  step="any"
                  required
                  value={adjustQuantity}
                  onChange={(e) => setAdjustQuantity(e.target.value)}
                  placeholder={adjustType === 'waste' ? 'Ej: 2' : 'Ej: 5 o -3'}
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notas (opcional)</label>
                <Input
                  value={adjustNotes}
                  onChange={(e) => setAdjustNotes(e.target.value)}
                  placeholder="Ej: Compra semanal proveedor"
                  className="w-full"
                />
              </div>
            </div>
            <div className="p-6 bg-gray-50 border-t border-gray-100 flex justify-end gap-3 shrink-0">
              <Button type="button" variant="outline" onClick={() => setAdjustModal({ isOpen: false, item: null })} disabled={isAdjusting}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isAdjusting}>
                {isAdjusting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Aplicar Ajuste
              </Button>
            </div>
          </form>
        </Modal>

        {/* Modal Historial de Movimientos */}
        <Modal isOpen={movementsModal.isOpen} onClose={() => setMovementsModal({ isOpen: false, item: null, movements: [], loading: false })} title={`Movimientos: ${movementsModal.item?.name}`}>
          <div className="p-6">
            {movementsModal.loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : movementsModal.movements.length === 0 ? (
              <p className="text-center text-gray-500 py-8">Sin movimientos registrados.</p>
            ) : (
              <div className="space-y-3">
                {movementsModal.movements.map((m) => (
                  <div key={m.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <span className={`font-bold text-sm ${
                        parseFloat(m.quantity) > 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {parseFloat(m.quantity) > 0 ? '+' : ''}{parseFloat(m.quantity).toFixed(2)} {movementsModal.item?.unit}
                      </span>
                      <span className="text-xs text-gray-400 ml-2">
                        {m.movement_type === 'purchase' ? 'Compra' :
                         m.movement_type === 'sale' ? 'Venta' :
                         m.movement_type === 'adjustment' ? 'Ajuste' :
                         m.movement_type === 'waste' ? 'Merma' :
                         m.movement_type === 'initial_stock' ? 'Stock inicial' :
                         m.movement_type}
                      </span>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-500">{m.notes}</p>
                      <p className="text-xs text-gray-400">{new Date(m.created_at).toLocaleString('es-CL')}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Modal>

        <ConfirmDeleteModal
          isOpen={deleteModal.isOpen}
          onClose={() => setDeleteModal(prev => ({ ...prev, isOpen: false }))}
          onConfirm={handleDeleteConfirm}
          isDeleting={deleteModal.isDeleting}
          title={deleteModal.mode === 'single' ? 'Eliminar insumo' : 'Eliminar insumos'}
          description={deleteModal.mode === 'single'
            ? '¿Estás seguro de que deseas eliminar este insumo? Se eliminarán también las recetas asociadas.'
            : `¿Estás seguro de que deseas eliminar los ${selectedIds.length} insumos seleccionados?`
          }
        />
      </div>
    </div>
  );
};

export default InventoryManager;
