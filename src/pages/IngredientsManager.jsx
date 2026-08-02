import React, { useState, useEffect } from 'react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Plus, Loader2, ListFilter, ChevronDown, Trash2, Package, History, Shapes, Wand2 } from 'lucide-react';
import { getFirstOrganizationId, getIngredients, createIngredient, updateIngredient, deleteIngredient, bulkDeleteIngredients, duplicateIngredient } from '../services/catalogService';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import Modal from '../components/ui/Modal';
import ActionMenu from '../components/ui/ActionMenu';
import ConfirmDeleteModal from '../components/ui/ConfirmDeleteModal';
import PageHeader from '../components/ui/PageHeader';
import Tooltip from '../components/ui/tooltip';
import IngredientIcon from '../components/ui/IngredientIcon';
import { getIngredientUsage, getIngredientMovements, adjustIngredientStock } from '../services/inventoryService';
import { searchFoodIcons, recommendIngredientIcon } from '../utils/ingredientIcons';

const UNITS = [
  { value: 'unit', label: 'Unid', short: 'unid', full: 'Unidad' },
  { value: 'g', label: 'g', short: 'g', full: 'Gramo' },
  { value: 'kg', label: 'Kg', short: 'kgs', full: 'Kilogramo' },
  { value: 'ml', label: 'ml', short: 'ml', full: 'Mililitro' },
  { value: 'l', label: 'L', short: 'lts', full: 'Litro' },
  { value: 'oz', label: 'oz', short: 'oz', full: 'Onza' },
  { value: 'lb', label: 'lb', short: 'lb', full: 'Libra' },
];

const IngredientsManager = () => {
  const [ingredients, setIngredients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingIngredient, setEditingIngredient] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, mode: 'single', targetId: null, isDeleting: false });
  const [adjustModal, setAdjustModal] = useState({ isOpen: false, item: null });
  const [movementsModal, setMovementsModal] = useState({ isOpen: false, item: null, movements: [], loading: false });
  const [searchQuery, setSearchQuery] = useState('');
  const [usageMap, setUsageMap] = useState({});

  // Form state
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [icon, setIcon] = useState(null);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [iconQuery, setIconQuery] = useState('');
  const [unit, setUnit] = useState('unit');
  const [stockQuantity, setStockQuantity] = useState('');
  const [lowStockThreshold, setLowStockThreshold] = useState('');
  const [portionQuantity, setPortionQuantity] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Adjust form state
  const [adjustQuantity, setAdjustQuantity] = useState('');
  const [adjustNotes, setAdjustNotes] = useState('');
  const [adjustType, setAdjustType] = useState('adjustment');
  const [isAdjusting, setIsAdjusting] = useState(false);

  const loadIngredients = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    const orgId = await getFirstOrganizationId();
    if (orgId) {
      const [data, usage] = await Promise.all([
        getIngredients(orgId),
        getIngredientUsage(orgId),
      ]);
      setIngredients(data);
      setUsageMap(usage);
    }
    if (showLoading) setLoading(false);
  };

  useEffect(() => {
    loadIngredients();
  }, []);

  const handleStatusChange = async (ingredientId, newStatus) => {
    try {
      const isActive = newStatus === 'active';
      await updateIngredient(ingredientId, { is_active: isActive });
      setIngredients(prev => prev.map(i => 
        i.id === ingredientId ? { ...i, is_active: isActive } : i
      ));
    } catch (error) {
      alert("Error al actualizar estado");
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const orgId = await getFirstOrganizationId();
      if (!orgId) throw new Error("No organization found");
      
      const payload = {
        name,
        price: parseFloat(price) || 0,
        icon: icon || null,
        unit,
        stock_quantity: editingIngredient ? undefined : (parseFloat(stockQuantity) || 0),
        low_stock_threshold: lowStockThreshold ? parseFloat(lowStockThreshold) : null,
        portion_quantity: parseFloat(portionQuantity) || 0
      };

      if (editingIngredient) {
        await updateIngredient(editingIngredient.id, payload);
        const originalStock = parseFloat(editingIngredient.stock_quantity || 0);
        const newStock = stockQuantity === '' ? null : parseFloat(stockQuantity);
        if (newStock !== null && !isNaN(newStock) && newStock !== originalStock) {
          await adjustIngredientStock(
            editingIngredient.id,
            orgId,
            newStock - originalStock,
            'Ajuste de stock desde edición',
            'adjustment'
          );
        }
        toast.success("Ingrediente actualizado");
      } else {
        payload.stock_quantity = parseFloat(stockQuantity) || 0;
        await createIngredient(orgId, payload);
        toast.success("Ingrediente creado");
      }
      closeModal();
      loadIngredients(false);
    } catch (error) {
      toast.error("Error al guardar");
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
      await adjustIngredientStock(adjustModal.item.id, orgId, qty, adjustNotes, adjustType);
      toast.success('Stock ajustado');
      setAdjustModal({ isOpen: false, item: null });
      setAdjustQuantity('');
      setAdjustNotes('');
      loadIngredients(false);
    } catch (error) {
      toast.error('Error al ajustar stock');
    } finally {
      setIsAdjusting(false);
    }
  };

  const openMovements = async (ingredient) => {
    setMovementsModal({ isOpen: true, item: ingredient, movements: [], loading: true });
    const data = await getIngredientMovements(ingredient.id);
    setMovementsModal(prev => ({ ...prev, movements: data, loading: false }));
  };

  const handleDeleteConfirm = async () => {
    setDeleteModal(prev => ({ ...prev, isDeleting: true }));
    try {
      if (deleteModal.mode === 'single') {
        await deleteIngredient(deleteModal.targetId);
        toast.success("Ingrediente eliminado");
      } else {
        await bulkDeleteIngredients(selectedIds);
        toast.success(`${selectedIds.length} ingredientes eliminados`);
        setSelectedIds([]);
      }
      loadIngredients(false);
    } catch (err) {
      toast.error("Error al eliminar");
    } finally {
      setDeleteModal({ isOpen: false, mode: 'single', targetId: null, isDeleting: false });
    }
  };

  const handleDuplicate = async (id) => {
    try {
      await duplicateIngredient(id);
      toast.success("Ingrediente duplicado con éxito");
      loadIngredients(false);
    } catch (err) {
      toast.error("Error al duplicar ingrediente");
    }
  };

  const openModal = (ingredient = null) => {
    if (ingredient) {
      setEditingIngredient(ingredient);
      setName(ingredient.name);
      setPrice(ingredient.price.toString());
      setIcon(ingredient.icon || null);
      setUnit(ingredient.unit || 'unit');
      setStockQuantity(ingredient.stock_quantity ? ingredient.stock_quantity.toString() : '');
      setLowStockThreshold(ingredient.low_stock_threshold ? ingredient.low_stock_threshold.toString() : '');
      setPortionQuantity(ingredient.portion_quantity ? ingredient.portion_quantity.toString() : '');
    } else {
      setEditingIngredient(null);
      setName('');
      setPrice('');
      setIcon(null);
      setUnit('unit');
      setStockQuantity('');
      setLowStockThreshold('');
      setPortionQuantity('');
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setTimeout(() => {
      setEditingIngredient(null);
      setName('');
      setPrice('');
      setIcon(null);
      setUnit('unit');
      setStockQuantity('');
      setLowStockThreshold('');
      setPortionQuantity('');
    }, 300);
  };

  useDocumentTitle('Ingredientes');

  const handleToggleSelect = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleToggleSelectAll = (e, currentIngredients) => {
    if (e.target.checked) {
      setSelectedIds(currentIngredients.map(i => i.id));
    } else {
      setSelectedIds([]);
    }
  };

  const getUnitShort = (unitValue) => {
    const u = UNITS.find(u => u.value === unitValue);
    return u ? u.short : unitValue;
  };

  const isLowStock = (ingredient) => {
    if (!ingredient.low_stock_threshold) return false;
    const usage = usageMap[ingredient.id];
    if (!usage) return false;
    const stock = parseFloat(ingredient.stock_quantity || 0);
    const totalEver = usage.totalIn + stock;
    if (totalEver <= 0) return false;
    const stockPct = (stock / totalEver) * 100;
    return stockPct <= parseFloat(ingredient.low_stock_threshold);
  };

  const filteredIngredients = ingredients.filter(i =>
    i.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
    (statusFilter === 'all' || (statusFilter === 'active' ? i.is_active : !i.is_active))
  );

  const UsageBar = ({ ingredient, usage }) => {
    const stock = parseFloat(ingredient.stock_quantity || 0);
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
    <div className="min-h-full bg-gray-50 p-6 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <PageHeader 
          title="Ingredientes Adicionales"
          subtitle="Agrega extras, aderezos o ingredientes opcionales a tus comidas."
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
                placeholder="Buscar ingrediente"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px] border-gray-200">
                <span className="font-normal text-gray-500 mr-1">Estado:</span>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="active">Activo</SelectItem>
                <SelectItem value="inactive">Inactivo</SelectItem>
              </SelectContent>
            </Select>
  
            <Button variant="outline" className="font-normal hidden sm:flex">
              <ListFilter className="h-4 w-4 mr-2" /> Todos los filtros
            </Button>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" className="">
              Acciones <ChevronDown className="ml-2 h-4 w-4" />
            </Button>
            <Button className="" onClick={() => openModal()}>
              <Plus className="h-4 w-4 mr-2" /> Crear ingrediente
            </Button>
          </div>
        </div>
      )}

      {/* Table Section */}
      <div>
        <table className="w-full text-sm text-left">
          <thead className="bg-white border-b text-gray-500 font-medium sticky top-0 z-10">
            <tr>
              <th className="px-6 py-3 w-10">
                <input 
                  type="checkbox" 
                  className="h-5 w-5 rounded border-gray-300 cursor-pointer"
                  checked={filteredIngredients.length > 0 && selectedIds.length === filteredIngredients.length}
                  onChange={(e) => handleToggleSelectAll(e, filteredIngredients)}
                />
              </th>
              <th className="px-6 py-3 font-medium">Ingrediente</th>
              <th className="px-6 py-3 font-medium">Precio Adicional</th>
              <th className="px-6 py-3 font-medium">Porción</th>
              <th className="px-6 py-3 font-medium">Stock</th>
              <th className="px-6 py-3 font-medium">Uso</th>
              <th className="px-6 py-3 font-medium text-center">Estado</th>
              <th className="px-6 py-3 font-medium text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={8} className="px-6 py-8 text-center text-gray-500">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                  Cargando ingredientes...
                </td>
              </tr>
            ) : filteredIngredients.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-8 text-center text-gray-500">
                  No se encontraron ingredientes.
                </td>
              </tr>
            ) : (
              filteredIngredients.map((ingredient) => (
                <tr 
                  key={ingredient.id}
                  className="hover:bg-gray-50 group transition-colors"
                >
                  <td className="px-6 py-4">
                    <input 
                      type="checkbox" 
                      className="h-5 w-5 rounded border-gray-300 cursor-pointer"
                      checked={selectedIds.includes(ingredient.id)}
                      onChange={() => handleToggleSelect(ingredient.id)}
                    />
                  </td>
                  <td className="px-6 py-4 font-medium text-gray-900">
                    <div className="flex items-center gap-3">
                      <IngredientIcon
                        icon={ingredient.icon}
                        className={`h-6 w-6 shrink-0 ${ingredient.icon ? 'text-gray-900' : 'text-gray-400'}`}
                      />
                      <span>{ingredient.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-gray-600">
                    +${ingredient.price}
                  </td>
                  <td className="px-6 py-4 text-gray-500 text-sm">
                    {parseFloat(ingredient.portion_quantity || 0) > 0 ? (
                      <span>
                        {parseFloat(ingredient.portion_quantity).toFixed(ingredient.unit === 'unit' ? 0 : 3)} {getUnitShort(ingredient.unit)}
                      </span>
                    ) : (
                      <span className="text-gray-400 italic">Sin porción</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <Badge
                      variant="secondary"
                      className={`font-bold text-sm px-3 py-1 ${
                        isLowStock(ingredient)
                          ? 'bg-red-50 text-red-700 border border-red-200'
                          : parseFloat(ingredient.stock_quantity || 0) === 0
                          ? 'bg-gray-100 text-gray-500'
                          : 'bg-green-50 text-green-700 border border-green-200'
                      }`}
                    >
                      {parseFloat(ingredient.stock_quantity || 0).toFixed(ingredient.unit === 'unit' ? 0 : 1)} {getUnitShort(ingredient.unit)}
                    </Badge>
                  </td>
                  <td className="px-6 py-4">
                    <UsageBar ingredient={ingredient} usage={usageMap[ingredient.id]} />
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="flex justify-center items-center">
                      <Switch 
                        checked={ingredient.is_active} 
                        onCheckedChange={(checked) => handleStatusChange(ingredient.id, checked ? 'active' : 'inactive')}
                      />
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Tooltip text="Ajustar stock">
                        <button
                          onClick={() => {
                            setAdjustModal({ isOpen: true, item: ingredient });
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
                          onClick={() => openMovements(ingredient)}
                          className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                          <History className="h-4 w-4" />
                        </button>
                      </Tooltip>
                      <Button 
                        onClick={() => openModal(ingredient)}
                        className="px-3 py-1.5 bg-white border border-gray-200 text-gray-700 text-xs font-bold hover:bg-gray-50 transition-colors active:bg-gray-100"
                      >
                        Editar
                      </Button>
                      <ActionMenu 
                        onDelete={() => setDeleteModal({ isOpen: true, mode: 'single', targetId: ingredient.id, isDeleting: false })}
                        onDuplicate={() => handleDuplicate(ingredient)}
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
      <Modal isOpen={isModalOpen} onClose={closeModal} title={editingIngredient ? "Editar Ingrediente" : "Nuevo Ingrediente"} maxWidth="max-w-2xl">
        <form onSubmit={handleSave} className="flex flex-col h-full">
          <div className="p-6 space-y-4 flex-1">
            <div className="flex items-center gap-3">
              <IngredientIcon icon={icon} className="h-7 w-7" />
              <div className="flex-1">
                <button
                  type="button"
                  onClick={() => {
                    setIconQuery('');
                    setIconPickerOpen(true);
                  }}
                  className="flex items-center justify-center gap-2 w-full h-11 px-3 bg-white border border-gray-200 hover:border-gray-300 rounded-lg text-[14px] font-semibold text-gray-700 cursor-pointer transition-colors"
                >
                  <Shapes className="h-4 w-4 text-gray-500" />
                  {icon ? 'Cambiar icono' : 'Elegir icono'}
                </button>
                <p className="text-xs text-gray-400 mt-1">Identifica el ingrediente visualmente en el menú.</p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del Ingrediente</label>
              <Input 
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: Anchoas" 
                className="w-full rounded-xl"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Costo Adicional ($)</label>
              <Input 
                type="number"
                min="0"
                required
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="Ej: 500" 
                className="w-full rounded-xl"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Unidad de Medida</label>
                <Select value={unit} onValueChange={setUnit}>
                  <SelectTrigger className="w-full rounded-xl">
                    <SelectValue>
                      {(() => { const u = UNITS.find(x => x.value === unit); return u ? `${u.label} (${u.full})` : unit; })()}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {UNITS.map(u => (
                      <SelectItem key={u.value} value={u.value}>{u.label} ({u.full})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Porción (cantidad c/u)</label>
                <Input 
                  type="number"
                  min="0"
                  step="any"
                  value={portionQuantity}
                  onChange={(e) => setPortionQuantity(e.target.value)}
                  placeholder={`Ej: 0.100 (${getUnitShort(unit)})`}
                  className="w-full rounded-xl"
                />
                <p className="text-xs text-gray-400 mt-1">Se consume al usarse en un producto.</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {editingIngredient ? 'Stock Actual' : 'Stock Inicial'}
                </label>
                <Input 
                  type="number"
                  min="0"
                  step="any"
                  required={!editingIngredient}
                  value={stockQuantity}
                  onChange={(e) => setStockQuantity(e.target.value)}
                  placeholder="Ej: 10"
                  className="w-full rounded-xl"
                />
                <p className="text-xs text-gray-400 mt-1">
                  {editingIngredient ? 'Al cambiar, se registra un ajuste de stock.' : 'Se registra como stock inicial.'}
                </p>
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
                  className="w-full rounded-xl"
                />
              </div>
            </div>
          </div>
          <div className="p-6 bg-gray-50 border-t border-gray-100 flex justify-end gap-3 shrink-0">
            <Button type="button" variant="outline" className="" onClick={closeModal} disabled={isSaving}>
              Cancelar
            </Button>
            <Button type="submit" className="" disabled={isSaving}>
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {editingIngredient ? 'Guardar Cambios' : 'Crear Ingrediente'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal Selector de Icono */}
      <Modal isOpen={iconPickerOpen} onClose={() => setIconPickerOpen(false)} title="Elegir icono" maxWidth="max-w-2xl">
        <div className="flex flex-col h-full">
          <div className="p-6 space-y-4 flex-1 overflow-auto">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  className="pl-9 w-full"
                  placeholder="Buscar icono (ej: pollo, queso, café)"
                  value={iconQuery}
                  onChange={(e) => setIconQuery(e.target.value)}
                />
              </div>
              <Tooltip text="Recomendar según el nombre del ingrediente">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const rec = recommendIngredientIcon(name);
                    if (rec) {
                      setIcon(rec);
                      setIconPickerOpen(false);
                      toast.success(`Icono recomendado: ${searchFoodIcons(rec)[0]?.label || rec}`);
                    } else {
                      toast.info("No encontré un icono claro para ese nombre");
                    }
                  }}
                >
                  <Wand2 className="h-4 w-4 mr-2" /> Recomendar
                </Button>
              </Tooltip>
            </div>

            {icon && (
              <button
                type="button"
                onClick={() => {
                  setIcon(null);
                  setIconPickerOpen(false);
                }}
                className="text-xs font-semibold text-red-500 hover:text-red-600"
              >
                Quitar icono seleccionado
              </button>
            )}

            <div className="grid grid-cols-6 sm:grid-cols-8 gap-2">
              {searchFoodIcons(iconQuery).map(({ name: iconName, label }) => (
                <button
                  key={iconName}
                  type="button"
                  title={label}
                  onClick={() => {
                    setIcon(iconName);
                    setIconPickerOpen(false);
                  }}
                  className={`flex flex-col items-center justify-center gap-1 p-2 rounded-xl border transition-colors ${
                    icon === iconName
                      ? 'border-orange-400 bg-orange-50 text-orange-600'
                      : 'border-gray-200 bg-white text-gray-500 hover:border-orange-300 hover:bg-orange-50 hover:text-orange-600'
                  }`}
                >
                  <IngredientIcon icon={iconName} className="h-6 w-6" />
                  <span className="text-[10px] text-gray-400 truncate w-full text-center">{label}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="p-6 bg-gray-50 border-t border-gray-100 flex justify-end gap-3 shrink-0">
            <Button type="button" variant="outline" onClick={() => setIconPickerOpen(false)}>
              Cancelar
            </Button>
            {icon && (
              <Button type="button" onClick={() => setIconPickerOpen(false)}>
                Usar este icono
              </Button>
            )}
          </div>
        </div>
      </Modal>

      {/* Modal Ajustar Stock */}
      <Modal isOpen={adjustModal.isOpen} onClose={() => setAdjustModal({ isOpen: false, item: null })} title={`Ajustar Stock: ${adjustModal.item?.name}`}>
        <form onSubmit={handleAdjust} className="flex flex-col h-full">
          <div className="p-6 space-y-4 flex-1">
            <p className="text-sm text-gray-500">
              Stock actual: <strong>{adjustModal.item ? parseFloat(adjustModal.item.stock_quantity || 0).toFixed(adjustModal.item.unit === 'unit' ? 0 : 1) : 0} {adjustModal.item?.unit}</strong>
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
        title={deleteModal.mode === 'single' ? "Eliminar ingrediente" : "Eliminar ingredientes"}
        description={deleteModal.mode === 'single' 
          ? "¿Estás seguro de que deseas eliminar este ingrediente? Podría afectar los artículos que lo usan."
          : `¿Estás seguro de que deseas eliminar los ${selectedIds.length} ingredientes seleccionados? Podría afectar los artículos que los usan.`
        }
      />
      </div>
    </div>
  );
};

export default IngredientsManager;
