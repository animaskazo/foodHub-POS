import React, { useState, useEffect } from 'react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Plus, Loader2, ListFilter, ChevronDown } from 'lucide-react';
import { getFirstOrganizationId, getIngredients, createIngredient, updateIngredient, deleteIngredient } from '../services/catalogService';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import Modal from '../components/ui/Modal';
import ActionMenu from '../components/ui/ActionMenu';

const IngredientsManager = () => {
  const [ingredients, setIngredients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingIngredient, setEditingIngredient] = useState(null);
  
  // Form state
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadIngredients();
  }, []);

  const loadIngredients = async () => {
    setLoading(true);
    const orgId = await getFirstOrganizationId();
    if (orgId) {
      const data = await getIngredients(orgId);
      setIngredients(data);
    }
    setLoading(false);
  };

  const handleStatusChange = async (id, newStatus) => {
    try {
      const isActive = newStatus === 'active';
      const ingredient = ingredients.find(i => i.id === id);
      await updateIngredient(id, { ...ingredient, is_active: isActive });
      setIngredients(prev => prev.map(c => 
        c.id === id ? { ...c, is_active: isActive } : c
      ));
    } catch (error) {
      alert("Error al actualizar estado");
    }
  };

  const openModal = (ingredient = null) => {
    if (ingredient) {
      setEditingIngredient(ingredient);
      setName(ingredient.name);
      setPrice(ingredient.price.toString());
    } else {
      setEditingIngredient(null);
      setName('');
      setPrice('');
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingIngredient(null);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    
    setIsSaving(true);
    try {
      const orgId = await getFirstOrganizationId();
      const payload = {
        name: name.trim(),
        price: parseFloat(price) || 0,
        is_active: true
      };

      if (editingIngredient) {
        payload.is_active = editingIngredient.is_active;
        const updated = await updateIngredient(editingIngredient.id, payload);
        setIngredients(prev => prev.map(i => i.id === updated.id ? updated : i));
      } else {
        const created = await createIngredient(orgId, payload);
        setIngredients(prev => [...prev, created]);
      }
      closeModal();
    } catch (error) {
      console.error(error);
      alert("Error al guardar el ingrediente");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (confirm("¿Estás seguro de eliminar este ingrediente?")) {
      try {
        await deleteIngredient(id);
        setIngredients(prev => prev.filter(i => i.id !== id));
      } catch (error) {
        alert("Error al eliminar ingrediente. Es posible que esté en uso.");
      }
    }
  };

  const handleDuplicate = async (ingredient) => {
    try {
      const orgId = getFirstOrganizationId();
      const newIng = await createIngredient(orgId, {
        name: ingredient.name + ' (Copia)',
        price: ingredient.price,
        is_active: false
      });
      if (newIng) {
        setIngredients(prev => [newIng, ...prev]);
      }
    } catch (error) {
      alert("Error al duplicar el ingrediente.");
    }
  };

  useDocumentTitle('Ingredientes Adicionales');


  return (
    <div className="flex-1 bg-white flex flex-col h-full">
      {/* Header H1 */}
      <div className="px-6 pt-6 pb-2">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Ingredientes Adicionales</h1>
      </div>

      {/* Action Bar */}
      <div className="px-6 py-4 flex flex-col sm:flex-row gap-4 items-center justify-between border-b">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input 
              className="pl-9 w-full sm:w-64 rounded-full border-gray-300" 
              placeholder="Buscar ingrediente" 
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
          <Button className="rounded-full bg-black text-white hover:bg-gray-800" onClick={() => openModal()}>
            <Plus className="h-4 w-4 mr-2" /> Crear ingrediente
          </Button>
        </div>
      </div>

      {/* Table Section */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-white border-b text-gray-500 font-medium sticky top-0 z-10">
            <tr>
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
                  <td className="px-6 py-4 font-medium text-gray-900">
                    {ingredient.name}
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
                      <button 
                        onClick={() => openModal(ingredient)}
                        className="px-3 py-1.5 bg-white border border-gray-200 text-gray-700 text-xs font-bold rounded-full hover:bg-gray-50 transition-colors shadow-sm active:bg-gray-100"
                      >
                        Editar
                      </button>
                      <ActionMenu 
                        onDelete={() => handleDelete(ingredient.id)}
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

      {/* Modal Crear/Editar */}
      <Modal isOpen={isModalOpen} onClose={closeModal} title={editingIngredient ? "Editar Ingrediente" : "Nuevo Ingrediente"}>
        <form onSubmit={handleSave} className="flex flex-col h-full">
          <div className="p-6 space-y-4 flex-1">
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
            <Button type="button" variant="outline" className="rounded-full" onClick={closeModal} disabled={isSaving}>
              Cancelar
            </Button>
            <Button type="submit" className="rounded-full bg-black text-white hover:bg-gray-800" disabled={isSaving}>
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {editingIngredient ? 'Guardar Cambios' : 'Crear Ingrediente'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default IngredientsManager;
