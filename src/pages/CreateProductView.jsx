import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import EditorHeader from '../components/ui/EditorHeader';
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { getFirstOrganizationId, createProduct, getProductById, updateProduct, getCategories, getIngredients, getProducts } from '../services/catalogService';
import { uploadImage } from '../services/storageService';
import { generateProductDescription, generateProductImage } from '../services/aiService';
import Modal from '../components/ui/Modal';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  X, Tag, ScanLine, Image as ImageIcon, Store, Globe, MessageCircle, Plus, Search, Info, ChevronDown, Trash2, Loader2, Sparkles
} from 'lucide-react';

const InfoIcon = () => (
  <svg className="h-4 w-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <circle cx="12" cy="12" r="10" strokeWidth="1.5" />
    <path d="M12 8v4m0 4h.01" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const SectionRow = ({ title, description, badge, children }) => (
  <div className="section-row">
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 mb-1">
        <h4 className="font-semibold text-[15px]">{title}</h4>
        {badge && (
          <span className="text-[11px] px-2 py-0.5 bg-blue-100 text-blue-700 font-semibold">{badge}</span>
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
  const location = useLocation();
  const isEditing = id && id !== 'new';

  const queryParams = new URLSearchParams(location.search);
  const queryType = queryParams.get('type');
  const initialType = queryType === 'bundle' ? 'Combo / Promoción' : 'Producto físico';

  const [formData, setFormData] = useState({
    name: '', price: '', description: '', type: initialType, sku: '', gtin: '', categoryId: 'none', imageUrl: '', status: 'available'
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
  const [allProducts, setAllProducts] = useState([]);
  const [bundleSlots, setBundleSlots] = useState([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isGeneratingDescription, setIsGeneratingDescription] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [imageDetails, setImageDetails] = useState('');
  const [showImageModal, setShowImageModal] = useState(false);
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
          const [fetchedCategories, fetchedIngredients, fetchedProducts] = await Promise.all([
            getCategories(orgId),
            getIngredients(orgId),
            getProducts(orgId)
          ]);
          setCategories(fetchedCategories);
          setGlobalIngredients(fetchedIngredients.filter(i => i.is_active));
          // Filtramos otros combos del selector para evitar anidación infinita
          setAllProducts(fetchedProducts.filter(p => p.type !== 'bundle' && p.id !== id));
        }

        if (isEditing) {
          const product = await getProductById(id);
          setFormData(prev => ({
            ...prev,
            name: product.name,
            // Assuming base_price is net, and includesIva is true by default
            price: Math.round(product.base_price).toString(),
            description: product.description || '',
            type: product.type === 'service' ? 'Servicio' : (product.type === 'bundle' ? 'Combo / Promoción' : 'Producto físico'),
            sku: product.sku || '',
            gtin: product.gtin || '',
            categoryId: product.categoryId || 'none',
            imageUrl: product.imageUrl || '',
            status: (product.status === 'Disponible' || product.status === 'available') ? 'available' : 'unavailable',
          }));

          if (product.variants && product.variants.length > 0) {
            const mappedVariants = product.variants.map(v => {
              const baseNetPrice = product.base_price || 0;
              let absNetPrice = baseNetPrice + (v.price_modifier || 0);
              let absGrossPrice = Math.round(absNetPrice);
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
          if (product.bundleSlots) {
            // Mapeamos de vuelta al formato del componente
            const mappedSlots = product.bundleSlots.map(s => ({
              id: s.id,
              name: s.name,
              minSelections: s.minSelections || 1,
              maxSelections: s.maxSelections || 1,
              options: s.options.map(o => ({
                id: o.id,
                productId: o.productId,
                variantId: o.variantId || null,
                priceModifier: o.priceModifier,
                isDefault: o.isDefault,
                name: o.name
              }))
            }));
            setBundleSlots(mappedSlots);
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

  useEffect(() => {
    if (showImageModal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [showImageModal]);

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

  const handleGenerateAIImage = async () => {
    if (!formData.name.trim()) {
      toast.error("Ingresa un nombre para poder generar la imagen.");
      return;
    }

    setIsGeneratingImage(true);
    try {
      const comboItems = formData.type === 'Combo / Promoción'
        ? bundleSlots.flatMap(s => s.options?.map(o => o.name).filter(Boolean) || [])
        : [];

      toast.info("Generando imagen gastronómica con IA...");
      const url = await generateProductImage(formData.name, formData.description, comboItems, imageDetails);

      setFormData(prev => ({ ...prev, imageUrl: url }));
      setHasChanges(true);
      toast.success("Imagen generada y cargada exitosamente");
    } catch (error) {
      toast.error(error.message || "Error al generar la imagen");
    } finally {
      setIsGeneratingImage(false);
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

      const finalVariants = variants
        .filter(v => v.name && v.name.trim() !== '')
        .map(v => {
          let vNetPrice = parseFloat(v.price) || 0;
          return {
            name: v.name,
            sku: v.sku,
            is_active: v.status === 'available',
            price_modifier: vNetPrice - finalPrice
          };
        });

      const finalBundleSlots = bundleSlots.map(slot => ({
        name: slot.name,
        minSelections: slot.minSelections,
        maxSelections: slot.maxSelections,
        options: slot.options
          .filter(o => o.productId)
          .map(o => {
            let modifierNet = parseFloat(o.priceModifier) || 0;
            return {
              productId: o.productId,
              variantId: o.variantId || null,
              priceModifier: modifierNet,
              isDefault: o.isDefault
            };
          })
      }));

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
        bundleSlots: finalBundleSlots,
        status: formData.status === 'available' ? 'available' : 'unavailable'
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
      <EditorHeader
        title={isEditing ? `Editar ${formData.name || 'artículo'}` : `Crear ${formData.name || 'artículo'}`}
        onClose={handleClose}
        onSave={handleSave}
        isSaving={isSaving}
        isLoading={isLoading}
        isUploadingImage={isUploadingImage}
        hasChanges={hasChanges}
      />

      {/* ── Body ──────────────────────────────────────── */}
      <main className="max-w-5xl mx-auto px-6 py-8 pt-[104px]">
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

                <div className="px-1 pt-2 pb-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-start gap-6">
                    <label className="flex items-center gap-2 cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={includesIva}
                        onChange={(e) => { setIncludesIva(e.target.checked); setHasChanges(true); }}
                        className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                      />
                      <span className="text-[13px] font-medium text-gray-700">Incluye IVA (19%)</span>
                    </label>

                    {formData.price && !isNaN(formData.price) && (
                      <div className="text-[12px] text-gray-500 flex items-center gap-4">
                        <span>Neto: <span className="font-medium">${includesIva ? Math.round(formData.price / 1.19).toLocaleString('es-CL') : Number(formData.price).toLocaleString('es-CL')}</span></span>
                        <span>IVA: <span className="font-medium">${includesIva ? Math.round(formData.price - (formData.price / 1.19)).toLocaleString('es-CL') : Math.round(formData.price * 0.19).toLocaleString('es-CL')}</span></span>
                      </div>
                    )}
                  </div>
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
                      <Button
                        type="button"
                        onClick={handleGenerateAIDescription}
                        disabled={isGeneratingDescription}
                        className="w-9 h-9 bg-white hover:  border border-gray-200 text-blue-600 flex items-center justify-center transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none cursor-pointer shadow-sm"
                        title="Crear descripción con IA"
                        variant="secondary">
                        {isGeneratingDescription ? (
                          <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                        ) : (
                          <Sparkles className="h-4.5 w-4.5 text-blue-600 fill-current" />
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {/* Imagen URL */}
              <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
                <p className="font-semibold text-[15px] text-gray-900">Imagen del artículo</p>
                <div className="flex items-center gap-4">
                  <div
                    className={`w-24 h-24 rounded-2xl bg-gray-100 border border-gray-200 flex items-center justify-center shrink-0 bg-cover bg-center overflow-hidden relative ${formData.imageUrl ? 'cursor-pointer group' : ''}`}
                    style={formData.imageUrl ? { backgroundImage: `url(${formData.imageUrl})` } : {}}
                    onClick={() => formData.imageUrl && setShowImageModal(true)}
                    title={formData.imageUrl ? "Click para ampliar" : ""}
                  >
                    {!formData.imageUrl ? (
                      <ImageIcon className="h-6 w-6 text-gray-400" />
                    ) : (
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity duration-200">
                        <Search className="h-4.5 w-4.5 text-white" />
                      </div>
                    )}
                  </div>

                  <div className="flex-1 space-y-2">
                    <Button variant="outline" className="w-full relative">
                      {isUploadingImage ? (
                        <span className="flex items-center gap-2">
                          <Loader2 className="animate-spin h-4 w-4" />
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
                        disabled={isUploadingImage || isGeneratingImage}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                    </Button>

                    <Button
                      type="button"
                      onClick={handleGenerateAIImage}
                      disabled={isUploadingImage || isGeneratingImage}
                      className="w-full bg-blue-50 text-blue-600 hover:bg-blue-100 hover:text-blue-700"
                    >
                      {isGeneratingImage ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Generando imagen...
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4 fill-current" />
                          Generar imagen con IA
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {/* Input de detalles adicionales */}
                <div className="pt-1">
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1.5">Detalles de estilo para la imagen (opcional)</label>
                  <Input
                    type="text"
                    placeholder="Ej: Plato rústico de greda, fondo de madera oscura, humo saliendo, estilo gourmet"
                    value={imageDetails}
                    onChange={(e) => setImageDetails(e.target.value)}
                    className="w-full rounded-md"
                  />
                  <p className="text-[10px] text-gray-400 mt-1.5 leading-normal">
                    La IA tomará el nombre del producto, la descripción, los artículos del combo y estas instrucciones adicionales para crear la foto gastronómica perfecta.
                  </p>
                </div>
              </div>

              {formData.type !== 'Combo / Promoción' && (
                <>
                  {/* Ingredientes Base (Movido bajo la imagen) */}
                  <div className="bg-white rounded-2xl border border-gray-100 p-5 mt-2">
                    <div className="flex-1 min-w-0 mb-3">
                      <h4 className="font-semibold text-[15px] text-gray-900">Ingredientes Base</h4>
                      <p className="text-sm text-gray-500 leading-relaxed">Selecciona los ingredientes que vienen incluidos por defecto en este artículo.</p>
                    </div>
                    {globalIngredients.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-gray-50 p-4 rounded-xl border border-gray-100 max-h-60 overflow-y-auto">
                        {globalIngredients.map(ing => (
                          <label key={`base-${ing.id}`} className="flex items-center gap-3 bg-white p-3   border border-gray-200 cursor-pointer hover:border-gray-300 transition-colors">
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
                  <div className="bg-white rounded-2xl border border-gray-100 p-5 mt-2">
                    <div>
                      <h3 className="font-semibold text-[15px] text-gray-900">Variantes</h3>
                      <p className="text-sm text-gray-500 mt-0.5 mb-2">Agrega opciones como tamaños o sabores, y establece sus precios y SKUs.</p>
                    </div>

                    {variants.length > 0 && (
                      <div className="overflow-x-auto pb-2 mt-4">
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
                              <tr key={v.id} className="border-b border-gray-100 last:border-0">
                                <td className="py-3 pr-2">
                                  <Input
                                    type="text"
                                    placeholder="Ej: Familiar, Mediana..."
                                    value={v.name}
                                    onChange={(e) => {
                                      setVariants(variants.map(v2 => v2.id === v.id ? { ...v2, name: e.target.value } : v2));
                                      setHasChanges(true);
                                    }}
                                    className="font-semibold rounded-md"
                                  />
                                </td>
                                <td className="py-3 pr-2">
                                  <Input
                                    type="text"
                                    placeholder="SKU"
                                    value={v.sku}
                                    onChange={(e) => {
                                      setVariants(variants.map(v2 => v2.id === v.id ? { ...v2, sku: e.target.value } : v2));
                                      setHasChanges(true);
                                    }}
                                    className="font-semibold rounded-md"
                                  />
                                </td>
                                <td className="py-3 pr-2">
                                  <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-bold">$</span>
                                    <Input
                                      type="number"
                                      placeholder="Precio de variante"
                                      value={v.price}
                                      onChange={(e) => {
                                        setVariants(variants.map(v2 => v2.id === v.id ? { ...v2, price: e.target.value } : v2));
                                        setHasChanges(true);
                                      }}
                                      className="pl-7 font-semibold rounded-md"
                                    />
                                  </div>
                                </td>
                                <td className="py-3 text-center pr-2">
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
                                  <Button
                                    type="button"
                                    onClick={() => {
                                      setVariants(variants.filter(v2 => v2.id !== v.id));
                                      setHasChanges(true);
                                    }}
                                    className="p-2.5 text-gray-400 hover:text-red-500 transition-colors bg-white   hover:bg-red-50 border border-gray-100"
                                  >
                                    <Trash2 className="h-4.5 w-4.5" />
                                  </Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    <Button
                      type="button"
                      onClick={() => {
                        setVariants([...variants, { id: Date.now(), name: '', price: '', status: 'available', sku: '' }]);
                        setHasChanges(true);
                      }}
                    >
                      <Plus className="h-4 w-4" /> Agregar variantes
                    </Button>
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
                          <label key={`extra-${ing.id}`} className="flex items-center gap-3 bg-white p-3   border border-gray-200 cursor-pointer hover:border-gray-300 transition-colors">
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
                </>
              )}

              {/* Configuración del Combo (Builder Dinámico) */}
              {formData.type === 'Combo / Promoción' && (
                <div className="bg-white rounded-2xl border border-gray-100 p-6 mt-2 space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-[15px] text-gray-900">Configuración de Combo / Paquete</h3>
                      <p className="text-xs text-gray-500 mt-0.5">Define los slots de elección y los productos disponibles para este combo.</p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setBundleSlots([...bundleSlots, {
                          id: 'new-' + Date.now(),
                          name: '',
                          minSelections: 1,
                          maxSelections: 1,
                          options: []
                        }]);
                        setHasChanges(true);
                      }}
                      className="font-semibold h-9 cursor-pointer text-xs flex items-center gap-1.5"
                    >
                      <Plus className="h-4 w-4" /> Agregar Slot
                    </Button>
                  </div>

                  {bundleSlots.length === 0 ? (
                    <div className="text-center py-8 text-gray-400 bg-gray-50 rounded-xl border border-dashed border-gray-250">
                      <p className="text-sm">No has agregado ningún grupo de selección aún.</p>
                      <p className="text-xs mt-1">Presiona "Agregar Slot" para comenzar.</p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {bundleSlots.map((slot) => (
                        <div key={slot.id} className="bg-gray-50 p-4 rounded-xl border border-gray-200 space-y-4 relative">
                          <Button
                            type="button"
                            onClick={() => {
                              setBundleSlots(bundleSlots.filter(s => s.id !== slot.id));
                              setHasChanges(true);
                            }}
                            className="absolute top-4 right-4 p-1.5 text-gray-400 hover:text-red-500 transition-colors   bg-white border border-gray-200 cursor-pointer"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pr-10">
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Nombre del Slot</label>
                              <input
                                type="text"
                                placeholder="Ej: Elige Pizza, Bebida"
                                value={slot.name}
                                onChange={(e) => {
                                  setBundleSlots(bundleSlots.map(s => s.id === slot.id ? { ...s, name: e.target.value } : s));
                                  setHasChanges(true);
                                }}
                                className="w-full h-10 px-3 border border-gray-200 bg-white   text-xs font-semibold text-gray-900 focus:outline-none focus:border-black placeholder-gray-400"
                              />
                            </div>

                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Mín. Selecciones</label>
                              <input
                                type="number"
                                min="0"
                                value={slot.minSelections}
                                onChange={(e) => {
                                  setBundleSlots(bundleSlots.map(s => s.id === slot.id ? { ...s, minSelections: parseInt(e.target.value) || 0 } : s));
                                  setHasChanges(true);
                                }}
                                className="w-full h-10 px-3 border border-gray-200 bg-white   text-xs font-semibold text-gray-900 focus:outline-none focus:border-black"
                              />
                            </div>

                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Máx. Selecciones</label>
                              <input
                                type="number"
                                min="1"
                                value={slot.maxSelections}
                                onChange={(e) => {
                                  setBundleSlots(bundleSlots.map(s => s.id === slot.id ? { ...s, maxSelections: parseInt(e.target.value) || 1 } : s));
                                  setHasChanges(true);
                                }}
                                className="w-full h-10 px-3 border border-gray-200 bg-white   text-xs font-semibold text-gray-900 focus:outline-none focus:border-black"
                              />
                            </div>
                          </div>

                          <div className="space-y-2 pt-1">
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">Opciones de productos</label>
                            {slot.options && slot.options.length > 0 && (
                              <div className="space-y-2">
                                {slot.options.map((opt) => (
                                  <div key={opt.id} className="flex items-center gap-2 bg-white p-2   border border-gray-200">
                                    <div className="flex-1 min-w-0">
                                      <Select
                                        value={opt.productId}
                                        onValueChange={(val) => {
                                          const prod = allProducts.find(p => p.id === val);
                                          setBundleSlots(bundleSlots.map(s => {
                                            if (s.id !== slot.id) return s;
                                            return {
                                              ...s,
                                              options: s.options.map(o => o.id === opt.id ? { ...o, productId: val, name: prod?.name || '', variantId: null } : o)
                                            };
                                          }));
                                          setHasChanges(true);
                                        }}
                                      >
                                        <SelectTrigger className="w-full bg-white border-gray-200 text-xs   h-9">
                                          <SelectValue placeholder="Selecciona producto">
                                            {opt.name || "Selecciona producto"}
                                          </SelectValue>
                                        </SelectTrigger>
                                        <SelectContent>
                                          {allProducts.map(p => (
                                            <SelectItem key={p.id} value={p.id}>{p.name} (${Math.round(p.price).toLocaleString('es-CL')})</SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>

                                    {/* Selector de variantes específicas */}
                                    {(() => {
                                      const selectedProd = allProducts.find(p => p.id === opt.productId);
                                      if (selectedProd && selectedProd.variants && selectedProd.variants.length > 0) {
                                        return (
                                          <div className="w-36 shrink-0">
                                            <Select
                                              value={opt.variantId || 'all'}
                                              onValueChange={(val) => {
                                                setBundleSlots(bundleSlots.map(s => {
                                                  if (s.id !== slot.id) return s;
                                                  return {
                                                    ...s,
                                                    options: s.options.map(o => o.id === opt.id ? { ...o, variantId: val === 'all' ? null : val } : o)
                                                  };
                                                }));
                                                setHasChanges(true);
                                              }}
                                            >
                                              <SelectTrigger className="w-full bg-white border-gray-200 text-xs   h-9">
                                                <SelectValue placeholder="Variante">
                                                  {opt.variantId
                                                    ? selectedProd.variants.find(v => v.id === opt.variantId)?.name
                                                    : "Cualquier variante"}
                                                </SelectValue>
                                              </SelectTrigger>
                                              <SelectContent>
                                                <SelectItem value="all">Cualquier variante</SelectItem>
                                                {selectedProd.variants.map(v => (
                                                  <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                                                ))}
                                              </SelectContent>
                                            </Select>
                                          </div>
                                        );
                                      }
                                      return null;
                                    })()}

                                    <div className="w-24 shrink-0">
                                      <div className="relative">
                                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 text-[10px] font-bold">$</span>
                                        <input
                                          type="number"
                                          placeholder="Extra"
                                          value={opt.priceModifier}
                                          onChange={(e) => {
                                            setBundleSlots(bundleSlots.map(s => {
                                              if (s.id !== slot.id) return s;
                                              return {
                                                ...s,
                                                options: s.options.map(o => o.id === opt.id ? { ...o, priceModifier: parseFloat(e.target.value) || 0 } : o)
                                              };
                                            }));
                                            setHasChanges(true);
                                          }}
                                          className="w-full h-9 pl-5 pr-1.5 border border-gray-200   text-xs font-semibold text-gray-900 focus:outline-none focus:border-black"
                                        />
                                      </div>
                                    </div>

                                    <label className="flex items-center gap-1 cursor-pointer select-none">
                                      <input
                                        type="checkbox"
                                        checked={opt.isDefault}
                                        onChange={(e) => {
                                          setBundleSlots(bundleSlots.map(s => {
                                            if (s.id !== slot.id) return s;
                                            return {
                                              ...s,
                                              options: s.options.map(o => {
                                                if (o.id === opt.id) {
                                                  return { ...o, isDefault: e.target.checked };
                                                }
                                                return s.maxSelections === 1 && e.target.checked ? { ...o, isDefault: false } : o;
                                              })
                                            };
                                          }));
                                          setHasChanges(true);
                                        }}
                                        className="w-3.5 h-3.5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                      />
                                      <span className="text-[10px] font-bold text-gray-500">Defecto</span>
                                    </label>

                                    <Button
                                      type="button"
                                      onClick={() => {
                                        setBundleSlots(bundleSlots.map(s => {
                                          if (s.id !== slot.id) return s;
                                          return { ...s, options: s.options.filter(o => o.id !== opt.id) };
                                        }));
                                        setHasChanges(true);
                                      }}
                                      className="p-1.5 text-gray-400 hover:text-red-500 transition-colors bg-white   hover:bg-red-50 border border-gray-200 cursor-pointer"
                                    >
                                      <X className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            )}

                            <Button
                              type="button"
                              onClick={() => {
                                setBundleSlots(bundleSlots.map(s => {
                                  if (s.id !== slot.id) return s;
                                  return {
                                    ...s,
                                    options: [...s.options, {
                                      id: 'opt-' + Date.now(),
                                      productId: '',
                                      name: '',
                                      priceModifier: 0,
                                      isDefault: false
                                    }]
                                  };
                                }));
                                setHasChanges(true);
                              }}
                              className="text-[11px] font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1.5 py-1 px-2.5   bg-blue-50 hover:bg-blue-100 transition-colors w-fit cursor-pointer"
                            >
                              <Plus className="h-3 w-3" /> Agregar opción de producto
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}


            </div>

            {/* Right column */}
            <div className="space-y-4">

              {/* Estado */}
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <p className="font-semibold text-[15px] mb-3">Estado</p>
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-sm text-gray-500 font-medium">Artículo</span>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-gray-700">
                      {formData.status === 'available' ? 'Disponible' : 'No disponible'}
                    </span>
                    <Switch
                      checked={formData.status === 'available'}
                      onCheckedChange={(checked) => handleSelectChange('status', checked ? 'available' : 'unavailable')}
                    />
                  </div>
                </label>
              </div>

              {/* Tipo de artículo */}
              {formData.type !== 'Combo / Promoción' && (
                <div className="bg-white rounded-xl border border-gray-100 p-5">
                  <p className="font-semibold text-[15px] mb-3">Tipo de artículo</p>
                  <div className="relative">
                    <Select value={formData.type} onValueChange={(val) => handleSelectChange('type', val)}>
                      <SelectTrigger className="w-full bg-gray-50 border-gray-200  ">
                        <SelectValue placeholder="Producto físico" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Producto físico">Producto físico</SelectItem>
                        <SelectItem value="Servicio">Servicio</SelectItem>
                        <SelectItem value="Combo / Promoción">Combo / Promoción</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {/* Categorías */}
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <p className="font-semibold text-[15px] mb-3">Categorías</p>
                <div className="relative">
                  <Select value={formData.categoryId} onValueChange={(val) => handleSelectChange('categoryId', val)}>
                    <SelectTrigger className="w-full bg-gray-50 border-gray-200  ">
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
              <div>
                <p className="text-lg font-bold mb-3 px-1">Puntos de venta</p>
                <div className="bg-white rounded-xl border border-gray-100 px-5 divide-y divide-gray-100">
                    
                    {/* POS */}
                    <div className="flex items-start justify-between gap-4 py-4">
                      <div className="flex items-start gap-4">
                        <Store className="h-5 w-5 text-gray-900 mt-0.5 shrink-0" />
                        <div>
                          <p className="font-semibold text-[15px] mb-0.5">Presencial / Retiro (POS)</p>
                          <p className="text-sm text-gray-500 leading-relaxed">Mostrar artículo en el Punto de Venta</p>
                        </div>
                      </div>
                      <div className="shrink-0 mt-1">
                        <Switch
                          checked={channels.table}
                          onCheckedChange={(val) => { setChannels({ ...channels, table: val }); setHasChanges(true); }}
                        />
                      </div>
                    </div>

                    {/* Online */}
                    <div className="flex items-start justify-between gap-4 py-4">
                      <div className="flex items-start gap-4">
                        <Globe className="h-5 w-5 text-gray-900 mt-0.5 shrink-0" />
                        <div>
                          <p className="font-semibold text-[15px] mb-0.5">Tienda Online (eCommerce)</p>
                          <p className="text-sm text-gray-500 leading-relaxed">Mostrar artículo en la tienda web</p>
                        </div>
                      </div>
                      <div className="shrink-0 mt-1">
                        <Switch
                          checked={channels.online}
                          onCheckedChange={(val) => { setChannels({ ...channels, online: val }); setHasChanges(true); }}
                        />
                      </div>
                    </div>

                    {/* WhatsApp */}
                    <div className="flex items-start justify-between gap-4 py-4">
                      <div className="flex items-start gap-4">
                        <MessageCircle className="h-5 w-5 text-gray-900 mt-0.5 shrink-0" />
                        <div>
                          <p className="font-semibold text-[15px] mb-0.5">Agente de WhatsApp</p>
                          <p className="text-sm text-gray-500 leading-relaxed">Hacer disponible este artículo vía WhatsApp</p>
                        </div>
                      </div>
                      <div className="shrink-0 mt-1">
                        <Switch
                          checked={channels.whatsapp}
                          onCheckedChange={(val) => { setChannels({ ...channels, whatsapp: val }); setHasChanges(true); }}
                        />
                      </div>
                    </div>

                  </div>
              </div>
            </div>
          </div>
        )}
        {/* Modal para ver la imagen en grande */}
        {showImageModal && formData.imageUrl && createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm overflow-hidden select-none transition-all duration-300"
            onClick={() => setShowImageModal(false)}
          >
            <div
              className="relative max-w-4xl w-full max-h-full flex flex-col items-center justify-center"
              onClick={(e) => e.stopPropagation()}
            >
              <Button
                type="button"
                onClick={() => setShowImageModal(false)}
                className="absolute -top-12 right-0 z-10 w-9 h-9 bg-black/50 hover:bg-black/80 backdrop-blur-sm flex items-center justify-center text-white transition-all hover:scale-105 active:scale-95 cursor-pointer shadow-lg border border-white/10"
              >
                <X className="h-5 w-5" />
              </Button>
              <img
                src={formData.imageUrl}
                alt={formData.name || "Imagen del producto"}
                className="max-w-[90vw] max-h-[80vh] object-contain rounded-2xl shadow-2xl border border-white/10"
              />
              {formData.name && (
                <p className="mt-4 text-white text-xs font-bold uppercase tracking-wider bg-black/60 backdrop-blur-sm px-6 py-3 border border-white/10 shadow-lg select-none">
                  {formData.name}
                </p>
              )}
            </div>
          </div>,
          document.body
        )}
      </main>
    </div>
  );
};

export default CreateProductView;
