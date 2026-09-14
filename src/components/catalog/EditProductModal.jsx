import React, { useState, useEffect } from 'react';
import Modal from '../ui/Modal';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from 'lucide-react';
import { updateProduct, getCategories, getProductById } from '../../services/catalogService';
import { toast } from 'sonner';

const EditProductModal = ({ isOpen, onClose, onSuccess, productId, organizationId }) => {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [sku, setSku] = useState('');
  const [categoryId, setCategoryId] = useState('none');
  const [status, setStatus] = useState('available');
  const [isFeatured, setIsFeatured] = useState(false);
  const [categories, setCategories] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && productId && organizationId) {
      loadProduct(productId);
      loadCategories(organizationId);
    }
  }, [isOpen, productId, organizationId]);

  const loadProduct = async (id) => {
    setLoading(true);
    try {
      const prod = await getProductById(id);
      setName(prod.name || '');
      setPrice(String(prod.base_price || ''));
      setDescription(prod.description || '');
      setSku(prod.sku || '');
      setCategoryId(prod.categoryId || 'none');
      setStatus(prod.status || 'available');
      setIsFeatured(prod.isFeatured || false);
    } catch (err) {
      console.error('Error loading product:', err);
      toast.error('Error al cargar el producto');
    } finally {
      setLoading(false);
    }
  };

  const loadCategories = async (orgId) => {
    const cats = await getCategories(orgId);
    setCategories(cats);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('El nombre del producto es obligatorio');
      return;
    }
    setIsSaving(true);
    try {
      await updateProduct(productId, {
        name: name.trim(),
        price: parseFloat(price) || 0,
        description,
        sku: sku.trim(),
        categoryId,
        status,
        isFeatured,
      });
      toast.success('Producto actualizado');
      onSuccess?.();
      onClose();
    } catch (err) {
      toast.error('Error al guardar el producto');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Editar Producto" maxWidth="max-w-lg">
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 text-gray-400 animate-spin" />
        </div>
      ) : (
        <>
          <div className="p-6 space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre del producto" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Precio</label>
                <Input type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">SKU</label>
                <Input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="SKU opcional" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Descripción del producto" className="rounded-xl" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Categoría</label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger className="w-full h-10">
                  <SelectValue placeholder="Seleccionar categoría" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">General</SelectItem>
                  {categories.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-full h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="available">Disponible</SelectItem>
                  <SelectItem value="unavailable">No disponible</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-yellow-400 flex items-center justify-center shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 text-white">
                    <path fillRule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.006 5.404.434c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.434 2.082-5.005Z" clipRule="evenodd" />
                  </svg>
                </div>
                <label className="text-sm font-medium text-gray-700 cursor-pointer">Producto destacado</label>
              </div>
              <input
                type="checkbox"
                checked={isFeatured}
                onChange={(e) => setIsFeatured(e.target.checked)}
                className="w-4 h-4 text-yellow-500 rounded border-gray-300 focus:ring-yellow-400"
              />
            </div>
          </div>
          <div className="px-6 py-4 border-t bg-gray-50 flex justify-end gap-3 rounded-b-3xl">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Guardando...</> : 'Guardar cambios'}
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
};

export default EditProductModal;
