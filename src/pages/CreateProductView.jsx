import React, { useState, useEffect } from 'react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { getFirstOrganizationId, createProduct, getProductById, updateProduct, getCategories, getIngredients } from '../services/catalogService';
import { uploadImage } from '../services/storageService';
import { generateProductDescription } from '../services/aiService';
import Modal from '../components/ui/Modal';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  X, Tag, ScanLine, Image as ImageIcon, Store, Globe, Plus, Search, Info, ChevronDown, Trash2, Loader2, Sparkles
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

const CreateProductView = () => {
  const { id } = useParams();
  const navigate = useNavigate();
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
  const [baseIngredients, setBaseIngredients] = useState([]);
  const [extraIngredients, setExtraIngredients] = useState([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isGeneratingDescription, setIsGeneratingDescription] = useState(false);
  const [channels, setChannels] = useState({
    pos: true,
    table: true,
    pickup: true,
    online: true,
    whatsapp: false
  });

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
          
          if (product.baseIngredients) {
            setBaseIngredients(product.baseIngredients);
          }
          if (product.extraIngredients) {
            setExtraIngredients(product.extraIngredients);
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

  const handleGenerateAIDescription = async () => {
    if (!formData.name.trim()) {
      toast.error("Ingresa un nombre para poder generar una descripción.");
      return;
    }
    
    setIsGeneratingDescription(true);
    try {
      const desc = await generateProductDescription(formData.name);
      setFormData(prev => ({ ...prev, description: desc }));
      setHasChanges(true);
      toast.success("Descripción generada con éxito");
    } catch (error) {
      toast.error(error.message || "Error al generar la descripción");
    } finally {
      setIsGeneratingDescription(false);
    }
  };
  const handleSelectChange = (name, value) => {
    setFormData({ ...formData, [name]: value });
    setHasChanges(true);
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploadingImage(true);
      const url = await uploadImage(file, 'products');
      setFormData({ ...formData, imageUrl: url });
      setHasChanges(true);
    } catch (error) {
      alert("Error al subir la imagen. Por favor intenta de nuevo.");
      console.error(error);
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleClose = () => {
    if (hasChanges) {
      if (window.confirm("Tienes cambios sin guardar. ¿Estás seguro de que deseas salir sin guardar?")) {
        navigate(-1);
      }
    } else {
      navigate(-1);
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
        baseIngredients: baseIngredients,
        extraIngredients: extraIngredients,
        status: formData.status === 'available' ? 'Disponible' : 'No disponible'
      };

      if (isEditing) {
        await updateProduct(id, productPayload);
        toast.success("Producto actualizado exitosamente");
      } else {
        const orgId = await getFirstOrganizationId();
        if (!orgId) throw new Error("Organización no encontrada");
        const created = await createProduct(orgId, productPayload);
        toast.success("Producto creado exitosamente");
        navigate(`/products/${created.id}`, { replace: true });
      }
      
      setHasChanges(false);
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
        <h1 className="text-[17px] font-bold">
          {isEditing ? `Editar ${formData.name || 'artículo'}` : `Crear ${formData.name || 'artículo'}`}
        </h1>
        <div className="flex items-center gap-3">
          {hasChanges && (
            <span className="text-xs text-amber-600 font-bold animate-pulse select-none hidden sm:inline">
              Tienes cambios sin guardar
            </span>
          )}
          <Button
            onClick={handleSave}
            disabled={isSaving || isLoading || isUploadingImage}
            className="rounded-full px-6 bg-black text-white hover:bg-gray-800 font-semibold"
          >
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {isSaving ? 'Guardando...' : 'Guardar'}
          </Button>
        </div>
      </header>

      {/* ── Body ──────────────────────────────────────── */}
      <main className="max-w-5xl mx-auto px-6 py-8">
        {isLoading ? (
          <div className="flex justify-center py-20 text-gray-400">Cargando artículo...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-[1fr_320px] gap-8">

            {/* Left column */}
            <div className="space-y-4">

              {/* Nombre */}
              <div className="form-field flex items-center px-4 gap-2">
                <input
                  className="flex-1 h-16 bg-transparent text-lg outline-none placeholder-gray-400 font-bold"
                  placeholder="Nombre del artículo (requerido)"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                />
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
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">Descripción</label>
              <div className="form-field relative">
                <textarea
                  className="w-full h-28 px-4 pt-4 bg-transparent text-[15px] outline-none placeholder-gray-400 resize-none pr-32"
                  placeholder="Descripción para el cliente"
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                />
                {formData.name.trim() && (
                  <div className="absolute bottom-3 right-3 flex items-center gap-2">
                    <span className="text-[11px] font-bold text-blue-600 pointer-events-none select-none">
                      Crear con IA
                    </span>
                    <button
                      type="button"
                      onClick={handleGenerateAIDescription}
                      disabled={isGeneratingDescription}
                      className="w-9 h-9 bg-white hover:bg-gray-50 border border-gray-200 text-blue-600 rounded-full flex items-center justify-center transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none cursor-pointer shadow-sm"
                      title="Crear descripción con IA"
                    >
                      {isGeneratingDescription ? (
                        <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                      ) : (
                        <Sparkles className="h-4.5 w-4.5 text-blue-600 fill-current" />
                      )}
                    </button>
                  </div>
                )}
              </div>
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
                
                <div className="flex-1">
                  <label className="flex items-center justify-center gap-2 w-full h-11 px-3 bg-white border border-gray-200 hover:border-gray-300 rounded-lg text-[14px] font-semibold text-gray-700 cursor-pointer transition-colors">
                    {isUploadingImage ? (
                      <span className="flex items-center gap-2">
                        <svg className="animate-spin h-4 w-4 text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                        Subiendo...
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <ImageIcon className="h-4 w-4" /> 
                        {formData.imageUrl ? 'Cambiar imagen' : 'Subir imagen'}
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
                  <p className="text-[12px] text-gray-400 mt-2 text-center">JPG o PNG, máx. 5MB</p>
                </div>
              </div>
            </div>

            {/* Ingredientes Base (Movido bajo la imagen) */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5 mt-2">
              <div className="flex-1 min-w-0 mb-3">
                <h4 className="font-semibold text-[15px] text-gray-900">Ingredientes Base</h4>
                <p className="text-sm text-gray-500 leading-relaxed">Selecciona los ingredientes que vienen incluidos por defecto en este artículo.</p>
              </div>
              {globalIngredients.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-gray-50 p-4 rounded-xl border border-gray-100 max-h-60 overflow-y-auto">
                  {globalIngredients.map(ing => (
                    <label key={`base-${ing.id}`} className="flex items-center gap-3 bg-white p-3 rounded-lg border border-gray-200 cursor-pointer hover:border-gray-300 transition-colors">
                      <input 
                        type="checkbox"
                        className="h-4 w-4 rounded border-gray-300 text-black focus:ring-black"
                        checked={baseIngredients.includes(ing.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setBaseIngredients([...baseIngredients, ing.id]);
                          } else {
                            setBaseIngredients(baseIngredients.filter(id => id !== ing.id));
                          }
                          setHasChanges(true);
                        }}
                      />
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-gray-900">{ing.name}</span>
                      </div>
                    </label>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400 italic">No hay ingredientes creados en el catálogo.</p>
              )}
            </div>

            {/* SKU */}
            <div className="form-field flex items-center px-4 gap-2">
              <input
                className="flex-1 h-12 bg-transparent text-[15px] outline-none placeholder-gray-400"
                placeholder="SKU (opcional)"
                name="sku"
                value={formData.sku}
                onChange={handleChange}
              />
              <InfoIcon />
            </div>

            {/* Sección: Variantes (Directo en el Card) */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5 mt-2 space-y-4">
              <div>
                <h3 className="font-semibold text-[15px] text-gray-900">Variantes</h3>
                <p className="text-sm text-gray-500 mt-0.5">Agrega opciones como tamaños o sabores, y establece sus precios y SKUs.</p>
              </div>

              {variants.length > 0 && (
                <div className="overflow-x-auto pb-2">
                  <table className="w-full text-sm text-left border-collapse min-w-[550px]">
                    <thead>
                      <tr className="border-b border-gray-100 text-gray-900">
                        <th className="py-3 font-bold text-[13px] w-[35%]">Nombre de Variante</th>
                        <th className="py-3 font-bold text-[13px] w-[20%]">SKU</th>
                        <th className="py-3 font-bold text-[13px] w-[25%]">Precio c/u</th>
                        <th className="py-3 font-bold text-[13px] text-center w-[10%]">Estado</th>
                        <th className="py-3 w-[10%]"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {variants.map((v) => (
                        <tr key={v.id} className="hover:bg-gray-50/50">
                          <td className="py-3 pr-2">
                            <input 
                              type="text" 
                              placeholder="Ej: Familiar, Individual"
                              value={v.name}
                              onChange={(e) => {
                                setVariants(variants.map(v2 => v2.id === v.id ? { ...v2, name: e.target.value } : v2));
                                setHasChanges(true);
                              }}
                              className="w-full h-11 px-3.5 border border-gray-200 rounded-xl text-[14px] font-medium text-gray-900 focus:outline-none focus:border-black placeholder-gray-400"
                            />
                          </td>
                          <td className="py-3 px-2">
                            <input 
                              type="text"
                              value={v.sku}
                              onChange={(e) => {
                                setVariants(variants.map(v2 => v2.id === v.id ? { ...v2, sku: e.target.value } : v2));
                                setHasChanges(true);
                              }}
                              placeholder="SKU"
                              className="w-full h-11 px-3.5 border border-gray-200 rounded-xl text-[14px] font-medium text-gray-900 focus:outline-none focus:border-black placeholder-gray-400"
                            />
                          </td>
                          <td className="py-3 px-2">
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-900 font-semibold text-sm">$</span>
                              <input 
                                type="text"
                                value={v.price}
                                onChange={(e) => {
                                  setVariants(variants.map(v2 => v2.id === v.id ? { ...v2, price: e.target.value } : v2));
                                  setHasChanges(true);
                                }}
                                placeholder="0"
                                className="w-full h-11 pl-7 pr-3 border border-gray-200 rounded-xl text-[14px] font-bold text-right text-gray-900 focus:outline-none focus:border-black placeholder-gray-400"
                              />
                            </div>
                          </td>
                          <td className="py-3 text-center">
                            <div className="flex justify-center items-center">
                              <Switch 
                                checked={v.status === 'available'}
                                onCheckedChange={(checked) => {
                                  setVariants(variants.map(v2 => v2.id === v.id ? { ...v2, status: checked ? 'available' : 'unavailable' } : v2));
                                  setHasChanges(true);
                                }}
                              />
                            </div>
                          </td>
                          <td className="py-3 text-right pl-2">
                            <button 
                              type="button"
                              onClick={() => {
                                setVariants(variants.filter(v2 => v2.id !== v.id));
                                setHasChanges(true);
                              }} 
                              className="p-2.5 text-gray-400 hover:text-red-500 transition-colors bg-white rounded-lg hover:bg-red-50 border border-gray-100"
                            >
                              <Trash2 className="h-4.5 w-4.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <button 
                type="button"
                onClick={() => {
                  setVariants([...variants, { id: Date.now(), name: '', price: '', status: 'available', sku: '' }]);
                  setHasChanges(true);
                }}
                className="text-[14px] font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1.5 py-1 rounded-lg transition-colors"
              >
                <Plus className="h-4 w-4" /> Agregar variantes
              </button>
            </div>

            {/* Opciones Extras */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5 mt-2">
              <div className="flex-1 min-w-0 mb-3">
                <h4 className="font-semibold text-[15px] text-gray-900">Opciones Extras</h4>
                <p className="text-sm text-gray-500 leading-relaxed">Selecciona qué ingredientes adicionales se pueden agregar (se cobrará el precio extra).</p>
              </div>
              {globalIngredients.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-gray-50 p-4 rounded-xl border border-gray-100 max-h-60 overflow-y-auto">
                  {globalIngredients.map(ing => (
                    <label key={`extra-${ing.id}`} className="flex items-center gap-3 bg-white p-3 rounded-lg border border-gray-200 cursor-pointer hover:border-gray-300 transition-colors">
                      <input 
                        type="checkbox"
                        className="h-4 w-4 rounded border-gray-300 text-black focus:ring-black"
                        checked={extraIngredients.includes(ing.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setExtraIngredients([...extraIngredients, ing.id]);
                          } else {
                            setExtraIngredients(extraIngredients.filter(id => id !== ing.id));
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

            {/* Paquetes y Atributos (Combinado en un card más limpio) */}
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden mt-2 divide-y divide-gray-100">
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
                    <SelectValue placeholder="Sin categoría">
                      {formData.categoryId === 'none' 
                        ? 'Sin categoría (General)' 
                        : categories.find(c => c.id === formData.categoryId)?.name || 'Sin categoría (General)'}
                    </SelectValue>
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
            <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
              <div className="flex items-start justify-between pb-1">
                <p className="font-semibold text-[15px] text-gray-900">Sucursales y canales</p>
                <button className="text-xs text-gray-500 underline text-right leading-tight hover:text-gray-800">
                  Editar mosaico<br />del PDV
                </button>
              </div>

              {/* Sucursales */}
              <div className="flex items-center justify-between py-1">
                <div className="flex items-center gap-3">
                  <Store className="h-5 w-5 text-gray-700" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900">Sucursales</span>
                      <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded-full font-bold">TODAS</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">Digital Solutions</p>
                  </div>
                </div>
                <button className="text-xs font-bold text-gray-800 hover:text-black underline">Editar</button>
              </div>

              <Separator />

              {/* Canales / Puntos de Venta */}
              <div className="space-y-3.5 pt-1">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Canales de venta</p>
                
                {/* POS */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 font-bold text-[11px]">POS</div>
                    <span className="text-sm font-medium text-gray-700">Puntos de venta (PDV)</span>
                  </div>
                  <Switch 
                    checked={channels.pos} 
                    onCheckedChange={(val) => { setChannels({ ...channels, pos: val }); setHasChanges(true); }} 
                  />
                </div>

                {/* Mesa */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center text-purple-600 font-bold text-[11px]">MES</div>
                    <span className="text-sm font-medium text-gray-700">Mesa / Consumo Local</span>
                  </div>
                  <Switch 
                    checked={channels.table} 
                    onCheckedChange={(val) => { setChannels({ ...channels, table: val }); setHasChanges(true); }} 
                  />
                </div>

                {/* Retiro */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600 font-bold text-[11px]">RET</div>
                    <span className="text-sm font-medium text-gray-700">Para Llevar / Retiro</span>
                  </div>
                  <Switch 
                    checked={channels.pickup} 
                    onCheckedChange={(val) => { setChannels({ ...channels, pickup: val }); setHasChanges(true); }} 
                  />
                </div>

                {/* Ecommerce */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center text-green-600 font-bold text-[11px]">ECO</div>
                    <span className="text-sm font-medium text-gray-700">Ecommerce / Web Online</span>
                  </div>
                  <Switch 
                    checked={channels.online} 
                    onCheckedChange={(val) => { setChannels({ ...channels, online: val }); setHasChanges(true); }} 
                  />
                </div>

                {/* WhatsApp */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600 font-bold text-[11px]">WSP</div>
                    <span className="text-sm font-medium text-gray-700">WhatsApp Orders</span>
                  </div>
                  <Switch 
                    checked={channels.whatsapp} 
                    onCheckedChange={(val) => { setChannels({ ...channels, whatsapp: val }); setHasChanges(true); }} 
                  />
                </div>
              </div>
            </div>
          </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default CreateProductView;
