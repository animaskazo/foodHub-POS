import React, { useState, useEffect } from 'react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useParams } from 'react-router-dom';
import { getFirstOrganizationId, createProduct, getProductById, updateProduct, getCategories, getIngredients } from '../services/catalogService';
import Modal from '../components/ui/Modal';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  X, Tag, ScanLine, Image as ImageIcon, Store, Globe, Plus, Search, Info, ChevronDown, Trash2
} from 'lucide-react';

const InfoIcon = () => (
  <svg className="h-4 w-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <circle cx="12" cy="12" r="10" strokeWidth="1.5"/>
    <path d="M12 8v4m0 4h.01" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

const SectionRow = ({ title, description, badge, children }) => (
  <div className="section-row">
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 mb-1">
        <h4 className="font-semibold text-[15px]">{title}</h4>
        {badge && (
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-semibold">{badge}</span>
        )}
      </div>
      {description && (
        <p className="text-sm text-gray-500 leading-relaxed">{description}</p>
      )}
    </div>
    <div className="shrink-0 mt-0.5">{children}</div>
  </div>
);

const CreateProductView = ({ onClose, onSave }) => {
  const { id } = useParams();
  const isEditing = id && id !== 'new';

  const [formData, setFormData] = useState({
    name: '', price: '', description: '', type: 'Producto físico', sku: '', gtin: '', categoryId: 'none', imageUrl: '', status: 'available'
  });
  const [includesIva, setIncludesIva] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [categories, setCategories] = useState([]);
  const [variants, setVariants] = useState([]);
  const [draftVariants, setDraftVariants] = useState([]);
  const [showVariants, setShowVariants] = useState(false);
  const [globalIngredients, setGlobalIngredients] = useState([]);
  const [selectedIngredients, setSelectedIngredients] = useState([]);
  const [hasChanges, setHasChanges] = useState(false);

  useDocumentTitle(isEditing ? 'Editar artículo' : 'Crear artículo');

  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (hasChanges) {
        e.preventDefault();
        e.returnValue = ''; // Requerido por algunos navegadores
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasChanges]);

  useEffect(() => {
    const init = async () => {
      try {
        const orgId = await getFirstOrganizationId();
        if (orgId) {
          const [fetchedCategories, fetchedIngredients] = await Promise.all([
            getCategories(orgId),
            getIngredients(orgId)
          ]);
          setCategories(fetchedCategories);
          setGlobalIngredients(fetchedIngredients.filter(i => i.is_active));
        }

        if (isEditing) {
          const product = await getProductById(id);
          setFormData(prev => ({
            ...prev,
            name: product.name,
            // Assuming base_price is net, and includesIva is true by default
            price: Math.round(product.base_price * 1.19).toString(),
            description: product.description || '',
            type: product.type === 'service' ? 'Servicio' : 'Producto físico',
            sku: product.sku || '',
            gtin: product.gtin || '',
            categoryId: product.categoryId || 'none',
            imageUrl: product.imageUrl || '',
            status: product.status === 'Disponible' ? 'available' : 'unavailable',
          }));
          
          if (product.variants && product.variants.length > 0) {
            const mappedVariants = product.variants.map(v => {
              const baseNetPrice = product.base_price || 0;
              let absNetPrice = baseNetPrice + (v.price_modifier || 0);
              let absGrossPrice = Math.round(absNetPrice * 1.19); // Default includesIva logic
              return {
                id: v.id,
                name: v.name,
                price: absGrossPrice.toString(),
                status: v.is_active ? 'available' : 'unavailable',
                sku: v.sku || ''
              };
            });
            setVariants(mappedVariants);
            setDraftVariants(mappedVariants);
          }
          
          if (product.ingredients) {
            setSelectedIngredients(product.ingredients);
          }
        }
      } catch (error) {
        console.error("Error init product view:", error);
        alert("Error al cargar datos");
      } finally {
        setIsLoading(false);
      }
    };
    init();
  }, [id, isEditing]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setHasChanges(true);
  };
  const handleSelectChange = (name, value) => {
    setFormData({ ...formData, [name]: value });
    setHasChanges(true);
  };

  const handleClose = () => {
    if (hasChanges) {
      if (window.confirm("Tienes cambios sin guardar. ¿Estás seguro de que deseas salir sin guardar?")) {
        onClose?.();
      }
    } else {
      onClose?.();
    }
  };

  const handleSave = async () => {
    if (!formData.name || !formData.price) {
      alert("El nombre y el precio son obligatorios");
      return;
    }
    
    try {
      setIsSaving(true);
      
      let finalPrice = parseFloat(formData.price);
      if (includesIva) {
        finalPrice = Math.round(finalPrice / 1.19);
      }
      
      const finalVariants = variants
        .filter(v => v.name && v.name.trim() !== '')
        .map(v => {
          let vNetPrice = parseFloat(v.price) || 0;
          if (includesIva) {
            vNetPrice = Math.round(vNetPrice / 1.19);
          }
          return {
            name: v.name,
            sku: v.sku,
            is_active: v.status === 'available',
            price_modifier: vNetPrice - finalPrice
          };
        });
      
      const productPayload = {
        name: formData.name,
        price: finalPrice,
        description: formData.description,
        sku: formData.sku,
        gtin: formData.gtin,
        type: formData.type,
        categoryId: formData.categoryId,
        imageUrl: formData.imageUrl,
        variants: finalVariants,
        ingredients: selectedIngredients,
        status: formData.status === 'available' ? 'Disponible' : 'No disponible'
      };

      if (isEditing) {
        await updateProduct(id, productPayload);
      } else {
        const orgId = await getFirstOrganizationId();
        if (!orgId) throw new Error("Organización no encontrada");
        await createProduct(orgId, productPayload);
      }
      
      // Llamar a onSave y onClose para volver atrás
      setHasChanges(false);
      onSave?.();
      onClose?.();
    } catch (error) {
      console.error(error);
      alert("Error al guardar el producto");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="modal-page min-h-screen bg-gray-50 pb-24">
      {/* ── Header ────────────────────────────────────── */}
      <header className="flex items-center justify-between px-6 py-4 bg-white border-b sticky top-0 z-10">
        <button
          onClick={handleClose}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-100 active:bg-gray-200 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
        <h1 className="text-[17px] font-bold">{isEditing ? 'Editar artículo' : 'Crear artículo'}</h1>
        <Button
          onClick={handleSave}
          disabled={isSaving || isLoading}
          className="rounded-full px-6 bg-black text-white hover:bg-gray-800"
        >
          {isSaving ? 'Guardando...' : 'Guardar'}
        </Button>
      </header>

      {/* ── Body ──────────────────────────────────────── */}
      <main className="max-w-5xl mx-auto px-6 py-8">
        {isLoading ? (
          <div className="flex justify-center py-20 text-gray-400">Cargando artículo...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-[1fr_320px] gap-8">

          {/* Left column */}
          <div className="space-y-4">

            {/* Tipo de artículo */}
            <div className="form-field flex items-center px-4 gap-3">
              <Tag className="h-5 w-5 text-gray-400 shrink-0" />
              <div className="flex-1">
                <p className="text-[11px] font-medium text-gray-400 mt-3 mb-0.5">Tipo de artículo</p>
                <Select value={formData.type} onValueChange={(val) => handleSelectChange('type', val)}>
                  <SelectTrigger className="border-0 shadow-none focus:ring-0 w-full h-9 bg-transparent px-0 font-medium text-[15px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Producto físico">Producto físico</SelectItem>
                    <SelectItem value="Servicio">Servicio</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Nombre */}
            <div className="form-field flex items-center px-4 gap-2">
              <input
                className="flex-1 h-14 bg-transparent text-[15px] outline-none placeholder-gray-400 font-medium"
                placeholder="Nombre (requerido)"
                name="name"
                value={formData.name}
                onChange={handleChange}
              />
              <div className="flex items-center gap-1 text-gray-400">
                <button className="p-1.5 rounded-lg active:bg-gray-100"><ScanLine className="h-5 w-5" /></button>
              </div>
            </div>

            {/* Precio */}
            <div className="space-y-2">
              <div className="form-field flex items-center px-4 gap-2">
                <input
                  className="flex-1 h-14 bg-transparent text-[15px] outline-none placeholder-gray-400 font-medium"
                  placeholder="Precio"
                  name="price"
                  type="number"
                  value={formData.price}
                  onChange={handleChange}
                />
                <div className="flex items-center gap-2 text-gray-500">
                  <span className="text-sm font-semibold">c/u</span>
                  <ChevronDown className="h-4 w-4" />
                </div>
              </div>
              
              <div className="px-4 pt-1">
                <label className="flex items-center gap-2 cursor-pointer mb-2">
                  <input 
                    type="checkbox" 
                    checked={includesIva} 
                    onChange={(e) => { setIncludesIva(e.target.checked); setHasChanges(true); }}
                    className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium text-gray-700">El precio incluye IVA (19%)</span>
                </label>
                
                {formData.price && !isNaN(formData.price) && (
                  <div className="bg-gray-50 p-3 rounded-lg border border-gray-100 text-[13px]">
                    {includesIva ? (
                      <div className="flex justify-between text-gray-500">
                        <span>Precio neto (base): ${Math.round(formData.price / 1.19).toLocaleString('es-CL')}</span>
                        <span>IVA: ${Math.round(formData.price - (formData.price / 1.19)).toLocaleString('es-CL')}</span>
                      </div>
                    ) : (
                      <div className="flex justify-between text-gray-500">
                        <span>IVA (19%): ${Math.round(formData.price * 0.19).toLocaleString('es-CL')}</span>
                        <span className="font-semibold text-gray-900">Total con IVA: ${Math.round(formData.price * 1.19).toLocaleString('es-CL')}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Descripción */}
            <div className="form-field">
              <textarea
                className="w-full h-28 px-4 pt-4 bg-transparent text-[15px] outline-none placeholder-gray-400 resize-none"
                placeholder="Descripción para el cliente"
                name="description"
                value={formData.description}
                onChange={handleChange}
              />
            </div>

            {/* Imagen URL */}
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <p className="font-semibold text-[15px] mb-3">Imagen del artículo</p>
              <div className="flex items-center gap-4">
                <div 
                  className="w-16 h-16 rounded-xl bg-gray-100 border border-gray-200 flex items-center justify-center shrink-0 bg-cover bg-center overflow-hidden"
                  style={formData.imageUrl ? { backgroundImage: `url(${formData.imageUrl})` } : {}}
                >
                  {!formData.imageUrl && <ImageIcon className="h-6 w-6 text-gray-400" />}
                </div>
                <input
                  type="url"
                  value={formData.imageUrl}
                  onChange={(e) => { setFormData({ ...formData, imageUrl: e.target.value }); setHasChanges(true); }}
                  className="w-full h-11 px-3 bg-white border border-gray-200 rounded-lg text-[15px] focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder="URL de la imagen (ej. https://...)"
                />
              </div>
            </div>

            {/* Impuestos */}
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="font-semibold text-[15px]">Impuestos</p>
                <p className="text-sm text-gray-500 mt-0.5">IVA (19%)</p>
              </div>
              <Button variant="link" className="font-semibold text-gray-800 underline px-0 h-auto">Editar</Button>
            </div>

            <Separator />

            {/* SKU / GTIN */}
            <div className="grid grid-cols-2 gap-3">
              <div className="form-field flex items-center px-4 gap-2">
                <input
                  className="flex-1 h-12 bg-transparent text-[15px] outline-none placeholder-gray-400"
                  placeholder="SKU"
                  name="sku"
                  value={formData.sku}
                  onChange={handleChange}
                />
                <InfoIcon />
              </div>
              <div className="form-field flex items-center px-4 gap-2">
                <input
                  className="flex-1 h-12 bg-transparent text-[15px] outline-none placeholder-gray-400"
                  placeholder="GTIN"
                  name="gtin"
                  value={formData.gtin}
                  onChange={handleChange}
                />
                <InfoIcon />
              </div>
            </div>
            <button className="text-sm font-semibold text-blue-600 -mt-1">
              Agregar costo por unidad y proveedor
            </button>

            {/* Secciones adicionales */}
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden mt-2 divide-y divide-gray-100">
              <SectionRow
                title="Variantes"
                description={variants.length > 0 ? <span className="font-semibold text-blue-600">{variants.length} variante(s) configurada(s)</span> : "Agrega opciones, como tamaños o sabores y, a continuación, establece los precios, los SKU y el inventario."}
              >
                <Button variant="outline" className="rounded-full gap-1.5 font-semibold h-9" onClick={() => {
                  setShowVariants(true);
                  if (variants.length === 0) {
                    setDraftVariants([
                      { id: Date.now(), name: '', price: '', status: 'available', sku: '' }
                    ]);
                  } else {
                    setDraftVariants([...variants]);
                  }
                }}>
                  {variants.length > 0 ? `Editar (${variants.length})` : 'Agregar'} <ChevronDown className="h-4 w-4" />
                </Button>
              </SectionRow>

              <div className="p-4 sm:p-5 flex flex-col gap-3">
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-[15px]">Ingredientes Adicionales</h4>
                  <p className="text-sm text-gray-500 leading-relaxed">Selecciona qué ingredientes extra se pueden agregar a este artículo.</p>
                </div>
                {globalIngredients.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2 bg-gray-50 p-4 rounded-xl border border-gray-100 max-h-60 overflow-y-auto">
                    {globalIngredients.map(ing => (
                      <label key={ing.id} className="flex items-center gap-3 bg-white p-3 rounded-lg border border-gray-200 cursor-pointer hover:border-gray-300 transition-colors">
                        <input 
                          type="checkbox"
                          className="h-4 w-4 rounded border-gray-300 text-black focus:ring-black"
                          checked={selectedIngredients.includes(ing.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedIngredients([...selectedIngredients, ing.id]);
                            } else {
                              setSelectedIngredients(selectedIngredients.filter(id => id !== ing.id));
                            }
                            setHasChanges(true);
                          }}
                        />
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-gray-900">{ing.name}</span>
                          <span className="text-xs text-gray-500">+${ing.price}</span>
                        </div>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 italic">No hay ingredientes creados en el catálogo.</p>
                )}
              </div>

              <SectionRow
                title="Paquetes"
                badge="Actualizar plan"
                description="Vende productos de tu surtido como paquetes"
              >
                <Button variant="outline" className="rounded-full font-semibold h-9">Agregar</Button>
              </SectionRow>

              <SectionRow
                title="Atributos personalizados"
                description={<>Haz un seguimiento de los detalles adicionales de este artículo. <span className="underline cursor-pointer text-blue-600">Obtén más información</span></>}
              >
                <Button variant="outline" className="rounded-full font-semibold h-9">Agregar</Button>
              </SectionRow>
            </div>
          </div>

          {/* Right column */}
          <div className="space-y-4">
            
            {/* Estado */}
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <p className="font-semibold text-[15px] mb-3">Estado</p>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Visibilidad del artículo</span>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-gray-700">
                    {formData.status === 'available' ? 'Disponible' : 'No disponible'}
                  </span>
                  <Switch 
                    checked={formData.status === 'available'}
                    onCheckedChange={(checked) => handleSelectChange('status', checked ? 'available' : 'unavailable')}
                  />
                </div>
              </div>
            </div>

            {/* Categorías */}
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <p className="font-semibold text-[15px] mb-3">Categorías</p>
              <div className="relative">
                <Select value={formData.categoryId} onValueChange={(val) => handleSelectChange('categoryId', val)}>
                  <SelectTrigger className="w-full bg-gray-50 border-gray-200 rounded-lg">
                    <SelectValue placeholder="Sin categoría" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin categoría (General)</SelectItem>
                    {categories.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Sucursales y canales */}
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <div className="flex items-start justify-between mb-5">
                <p className="font-semibold text-[15px]">Sucursales y canales</p>
                <button className="text-xs text-gray-500 underline text-right leading-tight">
                  Editar mosaico<br />del PDV
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Store className="h-5 w-5 text-gray-900 mx-1.5" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">Sucursales</span>
                      <span className="text-[11px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded-full font-medium">Todas</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">Digital Solutions</p>
                  </div>
                </div>
                <button className="text-sm font-semibold underline text-gray-700">Editar</button>
              </div>

              <Separator className="my-4" />

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Globe className="h-5 w-5 text-gray-900 mx-1.5" />
                  <span className="text-sm font-semibold">Puntos de venta</span>
                </div>
                <Switch defaultChecked />
              </div>

              <Separator className="my-4" />

              <button className="flex items-center gap-3 w-full text-left">
                <Plus className="h-5 w-5 text-gray-900 mx-1.5" />
                <span className="text-sm font-semibold text-gray-700">Agregar canal</span>
              </button>
            </div>
          </div>
          </div>
        )}
      </main>

      <Modal 
        isOpen={showVariants} 
        onClose={() => setShowVariants(false)}
        title={<h3 className="font-bold text-[22px] text-gray-900 tracking-tight">Agregar variantes</h3>}
        maxWidth="max-w-5xl"
      >
        <div className="overflow-x-auto pb-4">
          <table className="w-full text-sm text-left border-collapse min-w-[700px]">
            <thead>
              <tr className="border-b border-gray-100 text-gray-900 bg-white">
                <th className="px-5 py-4 font-bold text-[14px] w-[35%]">Variantes</th>
                <th className="px-5 py-4 font-bold text-[14px] w-[15%]">SKU</th>
                <th className="px-5 py-4 font-bold text-[14px]">
                  <div className="flex items-center gap-1 text-gray-900">
                    Precio 
                    <span className="underline decoration-gray-300 underline-offset-4 ml-1 cursor-pointer flex items-center gap-0.5">
                      c/u <ChevronDown className="h-4 w-4" />
                    </span>
                  </div>
                </th>
                <th className="px-5 py-4 font-bold text-[14px] text-center w-[120px]">Estado</th>
                <th className="pl-2 pr-6 py-4 w-[70px]"></th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {draftVariants.map((v, idx) => (
                <tr key={v.id} className="group hover:bg-gray-50/50 transition-colors">
                  <td className="px-5 py-4 align-top">
                    <div className="flex items-center gap-4">
                      <div className="text-gray-300 cursor-grab active:cursor-grabbing mt-2.5">
                        <svg width="12" height="16" viewBox="0 0 12 16" fill="currentColor">
                          <circle cx="2" cy="2" r="1.5" />
                          <circle cx="2" cy="8" r="1.5" />
                          <circle cx="2" cy="14" r="1.5" />
                          <circle cx="8" cy="2" r="1.5" />
                          <circle cx="8" cy="8" r="1.5" />
                          <circle cx="8" cy="14" r="1.5" />
                        </svg>
                      </div>
                      <div className="relative flex-1">
                        <input 
                          type="text" 
                          placeholder={idx === draftVariants.length - 1 ? "Agregar una variante" : "Nombre de la variante"}
                          value={v.name}
                          onChange={(e) => {
                            const newVariants = draftVariants.map(v2 => v2.id === v.id ? { ...v2, name: e.target.value } : v2);
                            setDraftVariants(newVariants);
                          }}
                          className="w-full h-[46px] px-4 border border-gray-200 rounded-xl text-[15px] font-medium text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 placeholder-gray-400"
                        />
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4 align-top">
                    <input 
                      type="text"
                      value={v.sku}
                      onChange={(e) => {
                        const newVariants = draftVariants.map(v2 => v2.id === v.id ? { ...v2, sku: e.target.value } : v2);
                        setDraftVariants(newVariants);
                      }}
                      placeholder="SKU"
                      className="w-full h-[46px] px-4 border border-gray-200 rounded-xl text-[15px] font-medium text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 placeholder-gray-400"
                    />
                  </td>
                  <td className="px-5 py-4 align-top">
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-900 font-semibold">$</span>
                      <input 
                        type="text"
                        value={v.price}
                        onChange={(e) => {
                          const newVariants = draftVariants.map(v2 => v2.id === v.id ? { ...v2, price: e.target.value } : v2);
                          setDraftVariants(newVariants);
                        }}
                        placeholder="0"
                        className="w-full h-[46px] pl-8 pr-4 border border-gray-200 rounded-xl text-[15px] font-bold text-right text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 placeholder-gray-400"
                      />
                    </div>
                  </td>
                  <td className="px-5 py-4 text-center align-top pt-5">
                    <div className="flex justify-center items-center h-full pt-1">
                      <Switch 
                        checked={v.status === 'available'}
                        onCheckedChange={(checked) => {
                          const newStatus = checked ? 'available' : 'unavailable';
                          const newVariants = draftVariants.map(v2 => v2.id === v.id ? { ...v2, status: newStatus } : v2);
                          setDraftVariants(newVariants);
                        }}
                      />
                    </div>
                  </td>
                  <td className="pl-2 pr-6 py-4 text-center align-top pt-4">
                    <button 
                      onClick={() => setDraftVariants(draftVariants.filter(v2 => v2.id !== v.id))} 
                      className="p-2.5 text-gray-400 hover:text-red-500 transition-all bg-white rounded-xl hover:bg-red-50 shadow-sm border border-gray-100"
                      title="Eliminar variante"
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-5 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between mt-4">
            <button 
              onClick={() => setDraftVariants([...draftVariants, { id: Date.now(), name: '', price: '', status: 'available', sku: '' }])} 
              className="text-[15px] font-bold text-blue-600 hover:text-blue-700 flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-blue-50 transition-colors"
            >
              <Plus className="h-5 w-5" /> Agregar otra variante
            </button>
            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={() => setShowVariants(false)} className="rounded-full px-6 font-semibold">
                Descartar
              </Button>
              <Button onClick={() => { 
                const validVariants = draftVariants.filter(v => v.name && v.name.trim() !== '');
                setVariants(validVariants);
                setHasChanges(true);
                setShowVariants(false); 
              }} className="rounded-full px-6 bg-black text-white hover:bg-gray-800 font-semibold">
                Guardar
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default CreateProductView;
