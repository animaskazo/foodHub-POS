import React, { useState, useEffect } from 'react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Plus, Loader2, ListFilter, ChevronDown, Image as ImageIcon, Trash2 } from 'lucide-react';
import { getFirstOrganizationId, getIngredients, createIngredient, updateIngredient, deleteIngredient, bulkDeleteIngredients, duplicateIngredient } from '../services/catalogService';
import { uploadImage } from '../services/storageService';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import Modal from '../components/ui/Modal';
import ActionMenu from '../components/ui/ActionMenu';
import ConfirmDeleteModal from '../components/ui/ConfirmDeleteModal';
import PageHeader from '../components/ui/PageHeader';

const IngredientsManager = () => {
  const [ingredients, setIngredients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingIngredient, setEditingIngredient] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, mode: 'single', targetId: null, isDeleting: false });
  
  // Form state
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const loadIngredients = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    const orgId = await getFirstOrganizationId();
    if (orgId) {
      const data = await getIngredients(orgId);
      setIngredients(data);
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

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingImage(true);
    try {
      const url = await uploadImage(file);
      setImageUrl(url);
      toast.success("Imagen subida con éxito");
    } catch (error) {
      toast.error("Error al subir imagen");
    } finally {
      setIsUploadingImage(false);
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
        image_url: imageUrl || null
      };

      if (editingIngredient) {
        await updateIngredient(editingIngredient.id, payload);
        toast.success("Ingrediente actualizado");
      } else {
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
      setImageUrl(ingredient.image_url || '');
    } else {
      setEditingIngredient(null);
      setName('');
      setPrice('');
      setImageUrl('');
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setTimeout(() => {
      setEditingIngredient(null);
      setName('');
      setPrice('');
      setImageUrl('');
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

  return (
    <div className="flex-1 overflow-auto bg-gray-50 p-6 md:p-8">
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
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-white border-b text-gray-500 font-medium sticky top-0 z-10">
            <tr>
              <th className="px-6 py-3 w-10">
                <input 
                  type="checkbox" 
                  className="h-5 w-5 rounded border-gray-300 cursor-pointer"
                  checked={ingredients.length > 0 && selectedIds.length === ingredients.length}
                  onChange={(e) => handleToggleSelectAll(e, ingredients)}
                />
              </th>
              <th className="px-6 py-3 font-medium">Ingrediente</th>
              <th className="px-6 py-3 font-medium">Precio Adicional</th>
              <th className="px-6 py-3 font-medium text-center">Estado</th>
              <th className="px-6 py-3 font-medium text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                  Cargando ingredientes...
                </td>
              </tr>
            ) : ingredients.filter(c => statusFilter === 'all' || (statusFilter === 'active' ? c.is_active : !c.is_active)).length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                  No se encontraron ingredientes.
                </td>
              </tr>
            ) : (
              ingredients.filter(c => statusFilter === 'all' || (statusFilter === 'active' ? c.is_active : !c.is_active)).map((ingredient) => (
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
                      <div 
                        className="w-10 h-10   bg-gray-100 border border-gray-200 flex items-center justify-center shrink-0 bg-cover bg-center overflow-hidden"
                        style={ingredient.image_url ? { backgroundImage: `url(${ingredient.image_url})` } : {}}
                      >
                        {!ingredient.image_url && <ImageIcon className="h-4 w-4 text-gray-400" />}
                      </div>
                      <span>{ingredient.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-gray-600">
                    +${ingredient.price}
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
                    <div className="flex items-center justify-end gap-2">
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
      <Modal isOpen={isModalOpen} onClose={closeModal} title={editingIngredient ? "Editar Ingrediente" : "Nuevo Ingrediente"}>
        <form onSubmit={handleSave} className="flex flex-col h-full">
          <div className="p-6 space-y-4 flex-1">
            <div className="flex items-center gap-4 mb-2">
              <div 
                className="w-16 h-16 rounded-xl bg-gray-100 border border-gray-200 flex items-center justify-center shrink-0 bg-cover bg-center overflow-hidden"
                style={imageUrl ? { backgroundImage: `url(${imageUrl})` } : {}}
              >
                {!imageUrl && <ImageIcon className="h-6 w-6 text-gray-400" />}
              </div>
              
              <div className="flex-1">
                <label className="flex items-center justify-center gap-2 w-full h-11 px-3 bg-white border border-gray-200 hover:border-gray-300   text-[14px] font-semibold text-gray-700 cursor-pointer transition-colors">
                  {isUploadingImage ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="animate-spin h-4 w-4 text-gray-500" />
                      Subiendo...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <ImageIcon className="h-4 w-4" /> 
                      {imageUrl ? 'Cambiar imagen' : 'Subir imagen'}
                    </span>
                  )}
                  <input 
                    type="file" 
                    accept="image/*"
                    onChange={handleImageUpload}
                    disabled={isUploadingImage}
                    className="hidden"
                  />
                </label>
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
          </div>
          <div className="p-6 bg-gray-50 border-t border-gray-100 flex justify-end gap-3 shrink-0">
            <Button type="button" variant="outline" className="" onClick={closeModal} disabled={isSaving || isUploadingImage}>
              Cancelar
            </Button>
            <Button type="submit" className="" disabled={isSaving || isUploadingImage}>
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {editingIngredient ? 'Guardar Cambios' : 'Crear Ingrediente'}
            </Button>
          </div>
        </form>
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
