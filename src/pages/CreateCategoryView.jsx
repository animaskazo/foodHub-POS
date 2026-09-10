import React, { useState, useEffect } from 'react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Switch } from "@/components/ui/switch";
import { X, Image as ImageIcon, Tags, Store, Loader2, Globe, MessageCircle, ShieldAlert, ArrowLeft } from 'lucide-react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';
import { getFirstOrganizationId, createCategory, getCategoryById, updateCategory, getProducts } from '../services/catalogService';
import CategoryProductsModal from '../components/admin/CategoryProductsModal';
import { Button } from '@/components/ui/button';
import EditorHeader from '../components/ui/EditorHeader';

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
  const location = useLocation();
  const isEditing = id && id !== 'new';

  // ── Modo Super Admin: permite editar categorías de cualquier negocio ──
  // El SuperAdminView enlaza a /categories/:id?org=<orgId>&from=superadmin
  const queryParams = new URLSearchParams(location.search);
  const orgOverride = queryParams.get('org');
  const fromSuperadmin = queryParams.get('from') === 'superadmin';
  const superadminMode = Boolean(orgOverride && fromSuperadmin);
  const [effectiveOrgId, setEffectiveOrgId] = useState(orgOverride || null);
  const [superOrgName, setSuperOrgName] = useState(queryParams.get('orgName') || '');

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
        // En modo super-admin se usa la org indicada en la URL, no la del staff logueado.
        const orgId = orgOverride || await getFirstOrganizationId();
        setEffectiveOrgId(orgId);
        if (superadminMode && orgId && !superOrgName) {
          try {
            const { data: org } = await supabase
              .from('organizations')
              .select('name')
              .eq('id', orgId)
              .maybeSingle();
            if (org?.name) setSuperOrgName(org.name);
          } catch { /* nombre opcional, no bloquea */ }
        }
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

  const goBack = () => {
    if (superadminMode && (effectiveOrgId || orgOverride)) {
      navigate(`/superadmin?org=${effectiveOrgId || orgOverride}`);
    } else {
      navigate(-1);
    }
  };

  const handleClose = () => {
    if (hasChanges) {
      if (window.confirm("Tienes cambios sin guardar. ¿Estás seguro de que deseas salir sin guardar?")) {
        goBack();
      }
    } else {
      goBack();
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
        goBack();
      } else {
        const orgId = effectiveOrgId || orgOverride || await getFirstOrganizationId();
        if (!orgId) throw new Error("Organización no encontrada");
        const created = await createCategory(orgId, formData);
        toast.success("Categoría creada exitosamente");
        if (superadminMode) {
          navigate(`/categories/${created.id}?org=${orgId}&from=superadmin`, { replace: true });
        } else {
          navigate(`/categories`, { replace: true });
        }
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
      <EditorHeader
        title={isEditing ? `Editar ${formData.name || 'categoría'}` : `Crear ${formData.name || 'categoría'}`}
        onClose={handleClose}
        onSave={handleSave}
        isSaving={isSaving}
        isLoading={isLoading}
        hasChanges={hasChanges}
      />

      {/* ── Body ──────────────────────────────────────── */}
      <main className="max-w-2xl mx-auto px-6 py-8 pt-[104px]">
        {superadminMode && (
          <div className="mb-4 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 shrink-0">
              <ShieldAlert className="h-5 w-5 text-amber-700" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-amber-900">
                Modo Super Admin{superOrgName ? ` · ${superOrgName}` : ''}
              </p>
              <p className="text-xs text-amber-700">
                Estás editando las categorías de otra tienda.
              </p>
            </div>
            <button
              type="button"
              onClick={goBack}
              className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-xs font-bold text-amber-800 hover:bg-amber-100 transition-colors shrink-0"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Volver al panel
            </button>
          </div>
        )}
        {isLoading ? (
          <div className="flex justify-center py-20 text-gray-400">Cargando categoría...</div>
        ) : (
          <div className="space-y-5">

            {/* Nombre */}
            <div className="form-field flex items-center px-4 gap-2 mb-4">
              <input
                className="flex-1 h-16 bg-transparent text-lg outline-none placeholder-gray-400 font-bold"
                placeholder="Nombre de la categoría"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
              />
            </div>



            {/* ── Artículos ────────────────────────────── */}
            <div className="bg-white rounded-2xl border border-gray-100 p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h4 className="font-semibold text-[15px] text-gray-900">Artículos</h4>
                  <p className="text-sm text-gray-500 leading-relaxed mt-0.5">Administra los artículos asignados a esta categoría.</p>
                </div>
              </div>
              <div className="bg-gray-50 rounded-xl border border-gray-100 px-4">
                <SectionRow
                  icon={Tags}
                  title="Artículos seleccionados"
                  description={formData.items.length > 0 ? `${formData.items.length} artículos asociados a esta categoría` : "No hay nada seleccionado"}
                >
                  <Button 
                    onClick={() => setIsModalOpen(true)}
                    variant="outline"
                    className="text-sm font-semibold rounded-full"
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
