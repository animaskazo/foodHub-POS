import React, { useState, useEffect, useRef } from 'react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, ChevronDown, Plus, MoreHorizontal, Trash2, GripVertical } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { getFirstOrganizationId, getCategories, quickUpdateCategoryStatus, deleteCategory, bulkDeleteCategories, duplicateCategory, reorderCategories } from '../services/catalogService';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import ActionMenu from '../components/ui/ActionMenu';
import ConfirmDeleteModal from '../components/ui/ConfirmDeleteModal';
import { toast } from 'sonner';

import PageHeader from '../components/ui/PageHeader';

const CategoriesList = () => {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all'); // all, active, inactive
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, mode: 'single', targetId: null, isDeleting: false });
  const [dragId, setDragId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const orderBeforeDragRef = useRef(null);
  const didDropRef = useRef(false);
  const navigate = useNavigate();

  const reorderLive = (draggedId, targetId) => {
    setCategories(prev => {
      if (!draggedId || draggedId === targetId) return prev;
      const drag = prev.find(c => c.id === draggedId);
      if (!drag) return prev;
      const di = prev.findIndex(c => c.id === draggedId);
      const ti = prev.findIndex(c => c.id === targetId);
      if (di === -1 || ti === -1 || di === ti) return prev;
      const order = [...prev];
      order.splice(di, 1);
      order.splice(ti, 0, drag);
      return order;
    });
  };

  const handleDropOn = async () => {
    const finalOrder = [...categories];
    setDragId(null);
    setDragOverId(null);
    try {
      await reorderCategories(finalOrder.map((c, i) => ({ id: c.id, sort_order: i })));
      toast.success('Orden de categorías actualizado');
    } catch (err) {
      toast.error('Error al guardar el orden');
      loadCategories(false);
    }
  };

  const handleDragEnd = () => {
    if (!didDropRef.current && orderBeforeDragRef.current) {
      setCategories(orderBeforeDragRef.current);
    }
    didDropRef.current = false;
    orderBeforeDragRef.current = null;
    setDragId(null);
    setDragOverId(null);
  };

  const loadCategories = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    const orgId = await getFirstOrganizationId();
    if (orgId) {
      const data = await getCategories(orgId);
      setCategories(data);
    }
    if (showLoading) setLoading(false);
  };

  useEffect(() => {
    loadCategories();
  }, []);

  const handleStatusChange = async (categoryId, newStatus) => {
    try {
      const isActive = newStatus === 'active';
      await quickUpdateCategoryStatus(categoryId, isActive);
      setCategories(prev => prev.map(c => 
        c.id === categoryId ? { ...c, is_active: isActive } : c
      ));
    } catch (error) {
      alert("Error al actualizar estado");
    }
  };

  useDocumentTitle('Categorías');

  const handleToggleSelect = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleToggleSelectAll = (e, currentCategories) => {
    if (e.target.checked) {
      setSelectedIds(currentCategories.map(c => c.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleDeleteConfirm = async () => {
    setDeleteModal(prev => ({ ...prev, isDeleting: true }));
    try {
      if (deleteModal.mode === 'single') {
        await deleteCategory(deleteModal.targetId);
        toast.success("Categoría eliminada");
      } else {
        await bulkDeleteCategories(selectedIds);
        toast.success(`${selectedIds.length} categorías eliminadas`);
        setSelectedIds([]);
      }
      loadCategories(false);
    } catch (err) {
      toast.error("Error al eliminar");
    } finally {
      setDeleteModal({ isOpen: false, mode: 'single', targetId: null, isDeleting: false });
    }
  };

  const handleDuplicate = async (id) => {
    try {
      await duplicateCategory(id);
      toast.success("Categoría duplicada con éxito");
      loadCategories(false);
    } catch (err) {
      toast.error("Error al duplicar categoría");
    }
  };

  const handleBulkStatusChange = async (isActive) => {
    const count = selectedIds.length;
    try {
      await Promise.all(selectedIds.map((id) => quickUpdateCategoryStatus(id, isActive)));
      setCategories(prev => prev.map(c =>
        selectedIds.includes(c.id) ? { ...c, is_active: isActive } : c
      ));
      setSelectedIds([]);
      toast.success(`Se actualizaron ${count} categorías`);
    } catch (err) {
      toast.error("Error al actualizar estados");
    }
  };


  const visibleCategories = categories.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
    (statusFilter === 'all' || (statusFilter === 'active' ? c.is_active : !c.is_active))
  );

  return (
    <div className="min-h-full bg-gray-50 p-6 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <PageHeader 
          title="Categorías"
          subtitle="Organiza tus artículos de comida en grupos y categorías."
        />

        <div className="md:bg-white md:rounded-2xl md:border md:border-gray-200 md:overflow-hidden flex flex-col">
        {/* Action Bar */}
        {selectedIds.length > 0 ? (
        <div className="py-4 md:px-6 flex flex-col sm:flex-row gap-3 md:gap-4 md:items-center justify-between md:border-b bg-blue-50/50 md:bg-blue-50/50 rounded-2xl md:rounded-none px-4 md:px-6">
          <div className="flex items-center gap-3">
            <Badge variant="secondary" className="bg-blue-100 text-blue-700 hover:bg-blue-200 border-none font-medium text-sm px-3 py-1">
              {selectedIds.length} seleccionadas
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => handleBulkStatusChange(true)} className="flex-1 sm:flex-none justify-center">
              Activar
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleBulkStatusChange(false)} className="flex-1 sm:flex-none justify-center">
              Desactivar
            </Button>
            <Button variant="destructive" size="sm" onClick={() => setDeleteModal({ isOpen: true, mode: 'bulk', targetId: null, isDeleting: false })} className="flex-1 sm:flex-none justify-center">
              <Trash2 className="h-4 w-4 mr-2" /> Eliminar
            </Button>
          </div>
        </div>
      ) : (
        <div className="py-4 md:px-6 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-3 md:border-b">
          <Button className="order-1 w-full sm:w-auto sm:order-4" onClick={() => navigate('/categories/new')}>
            <Plus className="h-4 w-4 mr-2" /> Nueva categoría
          </Button>
          <div className="relative order-2 w-full sm:w-auto sm:order-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                className="pl-9 w-full sm:w-64 border-gray-300"
                placeholder="Buscar categoría"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="order-3 w-full sm:w-[180px] sm:order-2 border-gray-200 hidden sm:flex">
              <span className="font-normal text-gray-500 mr-1">Estado:</span>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="active">Activo</SelectItem>
              <SelectItem value="inactive">Inactivo</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" className="hidden sm:inline-flex sm:order-3 sm:ml-auto">
            Acciones <ChevronDown className="ml-2 h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Tabla en desktop / cards en móvil */}
      <div className="hidden md:block">
        <table className="w-full text-sm text-left">
          <thead className="bg-white border-b text-gray-500 font-medium sticky top-0 z-10">
            <tr>
              <th className="px-6 py-3 w-10">
                <input 
                  type="checkbox" 
                  className="h-5 w-5 rounded border-gray-300 cursor-pointer"
                  checked={categories.length > 0 && selectedIds.length === categories.length}
                  onChange={(e) => handleToggleSelectAll(e, categories)}
                />
              </th>
              <th className="px-6 py-3 font-medium">Categoría</th>
              <th className="px-6 py-3 font-medium">Artículos asignados</th>
              <th className="px-6 py-3 font-medium text-center">Estado</th>
              <th className="px-6 py-3 w-10 text-center">
                <Button variant="ghost" size="icon" className="h-6 w-6 text-gray-400 hover: " variant="secondary">
                  <Plus className="h-4 w-4" />
                </Button>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                  Cargando categorías...
                </td>
              </tr>
            ) : visibleCategories.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                  No se encontraron categorías con ese filtro.
                </td>
              </tr>
            ) : (
              visibleCategories.map((category) => (
                <tr 
                  key={category.id}
                  draggable={statusFilter === 'all'}
                  onDragStart={(e) => {
                    if (statusFilter !== 'all') return;
                    orderBeforeDragRef.current = [...categories];
                    didDropRef.current = false;
                    e.dataTransfer.effectAllowed = 'move';
                    setDragId(category.id);
                  }}
                  onDragEnter={(e) => e.preventDefault()}
                  onDragOver={(e) => {
                    if (statusFilter !== 'all') return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    if (!dragId || dragId === category.id) return;
                    if (dragOverId !== category.id) {
                      reorderLive(dragId, category.id);
                      setDragOverId(category.id);
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (statusFilter !== 'all') return;
                    didDropRef.current = true;
                    handleDropOn();
                  }}
                  onDragEnd={handleDragEnd}
                  className={`group transition-colors ${
                    dragId === category.id
                      ? 'opacity-50'
                      : dragOverId === category.id
                      ? 'bg-blue-50/50'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  <td className="pl-6 pr-0 py-4">
                    <div className="flex items-center gap-3">
                      <input 
                        type="checkbox" 
                        className="h-5 w-5 rounded border-gray-300 cursor-pointer"
                        checked={selectedIds.includes(category.id)}
                        onChange={() => handleToggleSelect(category.id)}
                      />
                      {statusFilter === 'all' && (
                        <GripVertical className="h-4 w-4 text-gray-300 group-hover:text-gray-500 cursor-grab transition-colors" />
                      )}
                    </div>
                  </td>
                  <td className="pl-1 pr-6 py-4 font-medium text-gray-900">
                    {category.name}
                  </td>
                  <td className="px-6 py-4 text-gray-600">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-gray-900">{category.product_count}</span>
                      <span>{category.product_count === 1 ? 'artículo' : 'artículos'}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="flex justify-center items-center">
                      <Switch 
                        checked={category.is_active} 
                        onCheckedChange={(checked) => handleStatusChange(category.id, checked ? 'active' : 'inactive')}
                      />
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button 
                        variant="secondary"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/categories/${category.id}`);
                        }}
                      >
                        Editar
                      </Button>
                      <ActionMenu 
                        onDelete={() => setDeleteModal({ isOpen: true, mode: 'single', targetId: category.id, isDeleting: false })}
                        onDuplicate={() => handleDuplicate(category.id)}
                      />
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Cards solo en móvil: tap edita */}
      <div className="md:hidden divide-y divide-gray-200">
        {loading ? (
          <div className="px-4 py-8 text-center text-gray-500 text-sm">
            Cargando categorías...
          </div>
        ) : visibleCategories.length === 0 ? (
          <div className="px-4 py-8 text-center text-gray-500 text-sm">
            No se encontraron categorías con ese filtro.
          </div>
        ) : (
          visibleCategories.map((category) => (
            <div
              key={category.id}
              onClick={() => navigate(`/categories/${category.id}`)}
              className="flex items-center gap-3 px-4 py-3.5 active:bg-gray-50 cursor-pointer"
            >
              <input
                type="checkbox"
                aria-label={`Seleccionar ${category.name}`}
                className="h-5 w-5 rounded border-gray-300 cursor-pointer shrink-0"
                checked={selectedIds.includes(category.id)}
                onClick={(e) => e.stopPropagation()}
                onChange={() => handleToggleSelect(category.id)}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{category.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {category.product_count} {category.product_count === 1 ? 'artículo' : 'artículos'}
                </p>
              </div>
              <div onClick={(e) => e.stopPropagation()} className="shrink-0">
                <Switch
                  checked={category.is_active}
                  onCheckedChange={(checked) => handleStatusChange(category.id, checked ? 'active' : 'inactive')}
                />
              </div>
            </div>
          ))
        )}
      </div>
      </div>
      <ConfirmDeleteModal 
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal(prev => ({ ...prev, isOpen: false }))}
        onConfirm={handleDeleteConfirm}
        isDeleting={deleteModal.isDeleting}
        title={deleteModal.mode === 'single' ? "Eliminar categoría" : "Eliminar categorías"}
        description={deleteModal.mode === 'single' 
          ? "¿Estás seguro de que deseas eliminar esta categoría? Si tiene artículos, quedarán sin categoría asignada."
          : `¿Estás seguro de que deseas eliminar las ${selectedIds.length} categorías seleccionadas? Sus artículos quedarán sin categoría asignada.`
        }
      />
      </div>
    </div>
  );
};

export default CategoriesList;
