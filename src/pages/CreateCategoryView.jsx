import React, { useState, useEffect } from 'react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Switch } from "@/components/ui/switch";
import { X, Image as ImageIcon, Tags, Store, Loader2, Globe, MessageCircle } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { getFirstOrganizationId, createCategory, getCategoryById, updateCategory, getProducts } from '../services/catalogService';
import CategoryProductsModal from '../components/admin/CategoryProductsModal';
import { Button } from '@/components/ui/button';

const SectionRow = ({ icon: Icon, title, description, children }) => (
  <div className="flex items-start justify-between gap-4 py-4">
    <div className="flex items-start gap-4">
      <Icon className="h-5 w-5 text-gray-900 mt-0.5 shrink-0" />
      <div>
        <p className="font-semibold text-[15px] mb-0.5">{title}</p>
        {description && <p className="text-sm text-gray-500 leading-relaxed">{description}</p>}
      </div>
    </div>
    <div className="shrink-0 mt-1">{children}</div>
  </div>
);

const CreateCategoryView = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditing = id && id !== 'new';

  const [formData, setFormData] = useState({
    name: '',
    items: [],
    show_in_pos: true,
    show_online: true,
    show_in_whatsapp: true,
    imageUrl: '',
  });
  const [initialData, setInitialData] = useState(null);
  const [allProducts, setAllProducts] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(isEditing);

  useEffect(() => {
    const loadData = async () => {
      try {
        const orgId = await getFirstOrganizationId();
        if (orgId) {
          const prods = await getProducts(orgId);
          setAllProducts(prods);
        }

        if (isEditing) {
          const category = await getCategoryById(id);
          const data = {
            name: category.name,
            items: category.product_categories ? category.product_categories.map(pc => pc.product_id) : [],
            show_in_pos: category.show_in_pos,
            show_online: category.show_online,
            show_in_whatsapp: category.show_in_whatsapp,
            imageUrl: category.image_url || '',
          };
          setFormData(data);
          setInitialData(data);
        } else {
          setInitialData(formData);
        }
      } catch (error) {
        console.error("Error loading data:", error);
        alert("Error al cargar los datos");
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, [id, isEditing]);

  const hasChanges = initialData && JSON.stringify(formData) !== JSON.stringify(initialData);

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
    if (!formData.name) {
      alert("El nombre de la categoría es obligatorio");
      return;
    }
    
    try {
      setIsSaving(true);
      
      if (isEditing) {
        await updateCategory(id, formData);
        toast.success("Categoría actualizada exitosamente");
        setInitialData(formData); // Reset changes tracker
        navigate(-1);
      } else {
        const orgId = await getFirstOrganizationId();
        if (!orgId) throw new Error("Organización no encontrada");
        const created = await createCategory(orgId, formData);
        toast.success("Categoría creada exitosamente");
        navigate(`/categories`, { replace: true });
      }
    } catch (error) {
      console.error(error);
      alert("Error al guardar la categoría");
    } finally {
      setIsSaving(false);
    }
  };

  useDocumentTitle(isEditing ? 'Editar categoría' : 'Crear categoría');

  return (
    <div className="modal-page min-h-screen bg-gray-50 pb-24">
      {/* ── Header ────────────────────────────────────── */}
      <header className="flex items-center justify-between px-6 py-4 bg-white border-b sticky top-0 z-10">
        <Button
          onClick={handleClose}
          className="w-10 h-10 flex items-center justify-center   active:bg-gray-200 transition-colors"
         variant="secondary">
          <X className="h-5 w-5" />
        </Button>
        <h1 className="text-[17px] font-bold">{isEditing ? 'Editar categoría' : 'Crear categoría'}</h1>
        
        <div className="flex items-center gap-3">
          {hasChanges && (
            <span className="text-xs text-amber-600 font-bold animate-pulse select-none hidden sm:inline">
              Tienes cambios sin guardar
            </span>
          )}
          <Button
            onClick={handleSave}
            disabled={isSaving || isLoading}
            className="px-6 py-2.5 bg-black text-white text-[15px] font-semibold active:bg-gray-800 transition-colors disabled:opacity-50 flex items-center"
          >
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {isSaving ? 'Guardando...' : 'Guardar'}
          </Button>
        </div>
      </header>

      {/* ── Body ──────────────────────────────────────── */}
      <main className="max-w-2xl mx-auto px-6 py-8">
        {isLoading ? (
          <div className="flex justify-center py-20 text-gray-400">Cargando categoría...</div>
        ) : (
          <div className="space-y-5">

            {/* Nombre */}
            <div className="form-field flex items-center px-4">
              <input
                className="flex-1 h-14 bg-transparent text-[15px] outline-none placeholder-gray-400 font-medium"
                placeholder="Nombre de la categoría"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            {/* Imagen URL */}
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <p className="font-semibold text-[15px] mb-3">URL de la imagen</p>
              <div className="flex items-center gap-4">
                <div 
                  className="w-12 h-12   bg-gray-100 border border-gray-200 flex items-center justify-center shrink-0 bg-cover bg-center overflow-hidden"
                  style={formData.imageUrl ? { backgroundImage: `url(${formData.imageUrl})` } : {}}
                >
                  {!formData.imageUrl && <ImageIcon className="h-5 w-5 text-gray-400" />}
                </div>
                <input
                  type="url"
                  value={formData.imageUrl}
                  onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
                  className="w-full h-10 px-3 bg-white border border-gray-200   text-[15px] focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder="https://ejemplo.com/imagen.jpg"
                />
              </div>
            </div>

            {/* ── Artículos ────────────────────────────── */}
            <div>
              <p className="text-lg font-bold mb-3 px-1">Artículos</p>
              <div className="bg-white rounded-xl border border-gray-100 px-5 divide-y divide-gray-100">
                <SectionRow
                  icon={Tags}
                  title="Artículos seleccionados"
                  description={formData.items.length > 0 ? `${formData.items.length} artículos asociados a esta categoría` : "No hay nada seleccionado"}
                >
                  <Button 
                    onClick={() => setIsModalOpen(true)}
                    className="text-sm font-semibold underline text-gray-800 active:text-gray-500 transition-colors"
                  >
                    Editar selección
                  </Button>
                </SectionRow>
              </div>
            </div>

            {/* ── Canales de venta ─────────────────────── */}
            <div>
              <p className="text-lg font-bold mb-3 px-1">Puntos de venta</p>
              <div className="bg-white rounded-xl border border-gray-100 px-5 divide-y divide-gray-100">
                
                {/* POS */}
                <SectionRow
                  icon={Store}
                  title="Presencial / Retiro (POS)"
                  description="Mostrar categoría y sus productos en el Punto de Venta"
                >
                  <Switch
                    checked={formData.show_in_pos}
                    onCheckedChange={(val) => setFormData({ ...formData, show_in_pos: val })}
                  />
                </SectionRow>

                {/* Online */}
                <SectionRow
                  icon={Globe}
                  title="Tienda Online (eCommerce)"
                  description="Mostrar categoría y sus productos en la tienda web"
                >
                  <Switch
                    checked={formData.show_online}
                    onCheckedChange={(val) => setFormData({ ...formData, show_online: val })}
                  />
                </SectionRow>

                {/* WhatsApp */}
                <SectionRow
                  icon={MessageCircle}
                  title="Agente de WhatsApp"
                  description="Hacer disponibles los productos de esta categoría vía WhatsApp"
                >
                  <Switch
                    checked={formData.show_in_whatsapp}
                    onCheckedChange={(val) => setFormData({ ...formData, show_in_whatsapp: val })}
                  />
                </SectionRow>

              </div>
            </div>
          </div>
        )}
      </main>

      {/* Modal */}
      <CategoryProductsModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        allProducts={allProducts}
        selectedProductIds={formData.items}
        onSave={(newItems) => setFormData(prev => ({ ...prev, items: newItems }))}
      />
    </div>
  );
};

export default CreateCategoryView;
