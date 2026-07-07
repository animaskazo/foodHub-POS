import React, { useState, useEffect } from 'react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Switch } from "@/components/ui/switch";
import { X, Image as ImageIcon, Network, Tags, Store, Info, ChevronDown, Loader2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { getFirstOrganizationId, createCategory, getCategoryById, updateCategory } from '../services/catalogService';

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
    parentCategory: null,
    items: [],
    posEnabled: true,
    imageUrl: '',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(isEditing);

  useEffect(() => {
    if (isEditing) {
      const loadCategory = async () => {
        try {
          const category = await getCategoryById(id);
          setFormData({
            name: category.name,
            parentCategory: null,
            items: [],
            posEnabled: category.is_active,
            imageUrl: category.image_url || '',
          });
        } catch (error) {
          console.error("Error fetching category:", error);
          alert("Error al cargar la categoría");
        } finally {
          setIsLoading(false);
        }
      };
      loadCategory();
    }
  }, [id, isEditing]);

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
      } else {
        const orgId = await getFirstOrganizationId();
        if (!orgId) throw new Error("Organización no encontrada");
        const created = await createCategory(orgId, formData);
        toast.success("Categoría creada exitosamente");
        navigate(`/categories/${created.id}`, { replace: true });
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
        <button
          onClick={() => navigate(-1)}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-100 active:bg-gray-200 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
        <h1 className="text-[17px] font-bold">{isEditing ? 'Editar categoría' : 'Crear categoría'}</h1>
        <button
          onClick={handleSave}
          disabled={isSaving || isLoading}
          className="px-6 py-2.5 bg-black text-white text-[15px] font-semibold rounded-full active:bg-gray-800 transition-colors disabled:opacity-50 flex items-center"
        >
          {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {isSaving ? 'Guardando...' : 'Guardar'}
        </button>
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
                className="w-12 h-12 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center shrink-0 bg-cover bg-center overflow-hidden"
                style={formData.imageUrl ? { backgroundImage: `url(${formData.imageUrl})` } : {}}
              >
                {!formData.imageUrl && <ImageIcon className="h-5 w-5 text-gray-400" />}
              </div>
              <input
                type="url"
                value={formData.imageUrl}
                onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
                className="w-full h-10 px-3 bg-white border border-gray-200 rounded-lg text-[15px] focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                placeholder="https://ejemplo.com/imagen.jpg"
              />
            </div>
          </div>

          {/* ── Secciones ────────────────────────────── */}
          <div className="bg-white rounded-xl border border-gray-100 px-5 divide-y divide-gray-100">

            <SectionRow
              icon={Network}
              title="Categoría principal"
              description="Selecciona una categoría principal para crear una subcategoría."
            >
              <button className="text-sm font-semibold underline text-gray-800 active:text-gray-500 transition-colors">
                Seleccionar
              </button>
            </SectionRow>

          </div>

          {/* ── Artículos ────────────────────────────── */}
          <div>
            <p className="text-lg font-bold mb-3 px-1">Artículos</p>
            <div className="bg-white rounded-xl border border-gray-100 px-5 divide-y divide-gray-100">
              <SectionRow
                icon={Tags}
                title="Artículos"
                description="No hay nada seleccionado"
              >
                <button className="text-sm font-semibold underline text-gray-800 active:text-gray-500 transition-colors">
                  Agregar
                </button>
              </SectionRow>
            </div>
          </div>

          {/* ── Canales de venta ─────────────────────── */}
          <div>
            <p className="text-lg font-bold mb-3 px-1">Canales de venta y horarios</p>
            <div className="bg-white rounded-xl border border-gray-100 px-5 divide-y divide-gray-100">
              <SectionRow
                icon={Store}
                title="Puntos de venta"
                description="Las categorías solo aparecen en los modos Estándar y de Ventas."
              >
                <div className="flex items-center gap-3">
                  <button className="p-1 text-gray-400 active:text-gray-600">
                    <Info className="h-4.5 w-4.5" />
                  </button>
                  <Switch
                    checked={formData.posEnabled}
                    onCheckedChange={(val) => setFormData({ ...formData, posEnabled: val })}
                  />
                </div>
              </SectionRow>
            </div>
          </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default CreateCategoryView;
