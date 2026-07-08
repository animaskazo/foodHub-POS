import React, { useState, useEffect } from 'react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, ChevronDown, ListFilter, Plus, MoreHorizontal, Trash2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { getFirstOrganizationId, getCategories, quickUpdateCategoryStatus, deleteCategory, bulkDeleteCategories, duplicateCategory } from '../services/catalogService';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import ActionMenu from '../components/ui/ActionMenu';
import ConfirmDeleteModal from '../components/ui/ConfirmDeleteModal';
import { toast } from 'sonner';

const CategoriesList = () => {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all'); // all, active, inactive
  const [selectedIds, setSelectedIds] = useState([]);
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, mode: 'single', targetId: null, isDeleting: false });
  const navigate = useNavigate();

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


  return (
    <div className="flex-1 bg-white flex flex-col h-full">
      {/* Header H1 */}
      <div className="px-6 pt-6 pb-2">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Categorías</h1>
      </div>

      {/* Action Bar */}
      {selectedIds.length > 0 ? (
        <div className="px-6 py-4 flex flex-col sm:flex-row gap-4 items-center justify-between border-b bg-blue-50/50">
          <div className="flex items-center gap-3">
            <Badge variant="secondary" className="bg-blue-100 text-blue-700 hover:bg-blue-200 border-none font-medium text-sm px-3 py-1">
              {selectedIds.length} seleccionadas
            </Badge>
          </div>
          <div className="flex items-center gap-3">
            <Button className="rounded-full bg-red-600 text-white hover:bg-red-700 shadow-sm" onClick={() => setDeleteModal({ isOpen: true, mode: 'bulk', targetId: null, isDeleting: false })}>
              <Trash2 className="h-4 w-4 mr-2" /> Eliminar seleccionadas
            </Button>
          </div>
        </div>
      ) : (
        <div className="px-6 py-4 flex flex-col sm:flex-row gap-4 items-center justify-between border-b">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input 
                className="pl-9 w-full sm:w-64 rounded-full border-gray-300" 
                placeholder="Buscar categoría" 
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px] rounded-full border-gray-200">
                <span className="font-normal text-gray-500 mr-1">Estado:</span>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="active">Activo</SelectItem>
                <SelectItem value="inactive">Inactivo</SelectItem>
              </SelectContent>
            </Select>
  
            <Button variant="outline" className="rounded-full font-normal hidden sm:flex">
              <ListFilter className="h-4 w-4 mr-2" /> Todos los filtros
            </Button>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" className="rounded-full">
              Acciones <ChevronDown className="ml-2 h-4 w-4" />
            </Button>
            <Button className="rounded-full bg-black text-white hover:bg-gray-800" onClick={() => navigate('/categories/new')}>
              <Plus className="h-4 w-4 mr-2" /> Nueva categoría
            </Button>
          </div>
        </div>
      )}

      {/* Table Section */}
      <div className="flex-1 overflow-auto">
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
                <Button variant="ghost" size="icon" className="h-6 w-6 text-gray-400 rounded-full hover:bg-gray-100">
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
            ) : categories.filter(c => statusFilter === 'all' || (statusFilter === 'active' ? c.is_active : !c.is_active)).length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                  No se encontraron categorías con ese filtro.
                </td>
              </tr>
            ) : (
              categories.filter(c => statusFilter === 'all' || (statusFilter === 'active' ? c.is_active : !c.is_active)).map((category) => (
                <tr 
                  key={category.id}
                  className="hover:bg-gray-50 group transition-colors"
                >
                  <td className="px-6 py-4">
                    <input 
                      type="checkbox" 
                      className="h-5 w-5 rounded border-gray-300 cursor-pointer"
                      checked={selectedIds.includes(category.id)}
                      onChange={() => handleToggleSelect(category.id)}
                    />
                  </td>
                  <td className="px-6 py-4 font-medium text-gray-900">
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
                      <button 
                        className="px-3 py-1.5 bg-white border border-gray-200 text-gray-700 text-xs font-bold rounded-full hover:bg-gray-50 transition-colors shadow-sm active:bg-gray-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/categories/${category.id}`);
                        }}
                      >
                        Editar
                      </button>
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
  );
};

export default CategoriesList;
