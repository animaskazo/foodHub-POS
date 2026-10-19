import { SettingsOptionRow } from '@/components/ui/SettingsOptionRow';
import { IconButton } from '@/components/ui/IconButton';
import React, { useState, useEffect } from 'react';
import Modal from '../ui/Modal';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Loader2, Minus, Plus } from 'lucide-react';
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
  const [trackStock, setTrackStock] = useState(false);
  const [stockQuantity, setStockQuantity] = useState('');
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
      const hasDirect = (prod.track_inventory ?? prod.trackInventory) === true;
      setTrackStock(hasDirect);
      const sq = prod.stock_quantity ?? prod.stockQuantity;
      setStockQuantity(sq !== null && sq !== undefined ? String(sq) : '');
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
        trackInventory: trackStock === true,
        stockQuantity: trackStock ? (stockQuantity === '' ? 0 : Number(stockQuantity)) : null,
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
        <Loader2 className="h-8 w-8 animate-spin" />
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
            <div className="rounded-xl border border-gray-200 p-4">
              <SettingsOptionRow
                title="Stock"
                description="Se descuenta al vender. En 0 bloquea en combos."
                control={(labelProps) => (
                  <Switch {...labelProps}
                    checked={trackStock} onCheckedChange={setTrackStock} aria-label="Controlar stock"
                  />
                )}
              />
              {trackStock && (
                <div className="mt-3 flex items-center gap-2">
                  <IconButton
                    type="button"
                    onClick={() => setStockQuantity(String(Math.max(0, (parseInt(stockQuantity || '0', 10) || 0) - 1)))}
                    className="shrink-0 flex items-center justify-center bg-gray-100 text-gray-600 hover:bg-gray-200 active:scale-95 transition-all"
                    label="Quitar una unidad"
                   variant="ghost">
                    <Minus className="h-4 w-4" aria-hidden="true" />
                  </IconButton>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    value={stockQuantity}
                    onChange={(e) => setStockQuantity(e.target.value)}
                    placeholder="0"
                    className="bg-white text-center font-bold tabular-nums h-10"
                  />
                  <IconButton
                    type="button"
                    onClick={() => setStockQuantity(String((parseInt(stockQuantity || '0', 10) || 0) + 1))}
                    className="shrink-0 flex items-center justify-center bg-gray-100 text-gray-600 hover:bg-gray-200 active:scale-95 transition-all"
                    label="Agregar una unidad"
                   variant="ghost">
                    <Plus className="h-4 w-4" aria-hidden="true" />
                  </IconButton>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700 cursor-pointer">Producto destacado</label>
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
