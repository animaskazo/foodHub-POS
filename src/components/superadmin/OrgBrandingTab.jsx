import React, { useEffect, useState } from 'react';
import { Loader2, ExternalLink, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { getOrganizationDetails, updateOrganizationDetails } from '../../services/organizationService';
import { uploadImage } from '../../services/storageService';
import { getStoreUrl } from '../../utils/tenant';

const OrgBrandingTab = ({ organizationId, onSaved }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [form, setForm] = useState({
    name: '',
    slug: '',
    description: '',
    logo_url: '',
    cover_url: '',
    cover_is_video: false,
    force_closed: false,
    closed_message: '',
  });

  useEffect(() => {
    const load = async () => {
      if (!organizationId) return;
      setLoading(true);
      try {
        const data = await getOrganizationDetails(organizationId);
        setForm({
          name: data.name || '',
          slug: data.slug || '',
          description: data.description || '',
          logo_url: data.logo_url || '',
          cover_url: data.cover_url || '',
          cover_is_video: data.cover_is_video === true,
          force_closed: data.force_closed === true,
          closed_message: data.closed_message || '',
        });
      } catch (err) {
        console.error('Error loading org branding:', err);
        toast.error('No se pudo cargar la información del negocio');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [organizationId]);

  const handleImageUpload = async (e, type) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      if (type === 'logo') {
        setUploadingLogo(true);
        const url = await uploadImage(file, 'logo');
        setForm((prev) => ({ ...prev, logo_url: url }));
      } else {
        const isVideo = file.type.startsWith('video/');
        if (isVideo && file.size > 10 * 1024 * 1024) {
          toast.error('El video no puede pesar más de 10MB.');
          e.target.value = '';
          return;
        }
        setUploadingCover(true);
        const url = await uploadImage(file, 'cover');
        setForm((prev) => ({ ...prev, cover_url: url, cover_is_video: isVideo }));
      }
      toast.success('Archivo subido. Recuerda guardar los cambios.');
    } catch (err) {
      console.error('Error uploading:', err);
      toast.error('Error al subir el archivo');
    } finally {
      setUploadingLogo(false);
      setUploadingCover(false);
      e.target.value = '';
    }
  };

  const handleSave = async () => {
    if (!organizationId) return;
    if (!form.name.trim()) {
      toast.error('El nombre del negocio es obligatorio');
      return;
    }
    setSaving(true);
    const toastId = toast.loading('Guardando...');
    try {
      const formattedSlug = form.slug.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
      const updated = await updateOrganizationDetails(organizationId, {
        name: form.name.trim(),
        slug: formattedSlug || null,
        description: form.description.trim() || null,
        logo_url: form.logo_url || null,
        cover_url: form.cover_url || null,
        cover_is_video: form.cover_is_video || false,
        force_closed: form.force_closed === true,
        closed_message: form.closed_message.trim() || null,
      });
      setForm((prev) => ({ ...prev, slug: formattedSlug }));
      toast.success('Información del negocio actualizada', { id: toastId });
      onSaved?.(updated);
    } catch (err) {
      console.error('Error saving org branding:', err);
      toast.error('Error al guardar. Revisa los permisos RLS de organizations.', { id: toastId });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <Loader2 className="h-8 w-8 text-gray-400 animate-spin" />
      </div>
    );
  }

  const storeUrl = getStoreUrl(form.slug) || (form.slug ? `/order/${encodeURIComponent(form.slug)}` : '');

  return (
    <div className="space-y-6">
      {/* Logotipo + Portada */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5 flex flex-col items-center">
          <p className="font-semibold text-sm text-gray-700 mb-3 text-left w-full">Logotipo</p>
          <div
            className="w-24 h-24 bg-white border-2 border-gray-200 flex items-center justify-center shrink-0 bg-cover bg-center overflow-hidden relative rounded-full shadow-md"
            style={form.logo_url ? { backgroundImage: `url(${form.logo_url})` } : {}}
          >
            {!form.logo_url && <span className="text-3xl">🏬</span>}
            {uploadingLogo && (
              <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
              </div>
            )}
          </div>
          <label className="mt-4 px-4 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors shadow-sm">
            {form.logo_url ? 'Cambiar Logo' : 'Subir Logo'}
            <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, 'logo')} disabled={uploadingLogo} className="hidden" />
          </label>
          {form.logo_url && (
            <button
              type="button"
              onClick={() => setForm((prev) => ({ ...prev, logo_url: '' }))}
              className="mt-2 text-[11px] text-red-500 hover:text-red-700 font-semibold"
            >
              Quitar logo
            </button>
          )}
        </div>

        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5 flex flex-col items-center">
          <p className="font-semibold text-sm text-gray-700 mb-3 text-left w-full">Portada (foto o video)</p>
          <div
            className="w-full h-24 rounded-xl bg-white border border-gray-200 flex items-center justify-center shrink-0 bg-cover bg-center overflow-hidden relative"
            style={!form.cover_is_video && form.cover_url ? { backgroundImage: `url(${form.cover_url})` } : {}}
          >
            {form.cover_is_video && form.cover_url ? (
              <video src={form.cover_url} autoPlay muted loop playsInline className="w-full h-full object-cover" />
            ) : !form.cover_url ? (
              <span className="text-3xl">🎞️</span>
            ) : null}
            {uploadingCover && (
              <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
              </div>
            )}
          </div>
          <label className="mt-4 px-4 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors shadow-sm">
            {form.cover_url ? 'Cambiar Portada' : 'Subir Portada'}
            <input type="file" accept="image/*,video/*" onChange={(e) => handleImageUpload(e, 'cover')} disabled={uploadingCover} className="hidden" />
          </label>
          <p className="mt-2 text-[11px] text-gray-400 text-center">Videos: máx. 10MB</p>
          {form.cover_url && (
            <button
              type="button"
              onClick={() => setForm((prev) => ({ ...prev, cover_url: '', cover_is_video: false }))}
              className="mt-1 text-[11px] text-red-500 hover:text-red-700 font-semibold"
            >
              Quitar portada
            </button>
          )}
        </div>
      </div>

      {/* Nombre + slug + descripción */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Nombre del Negocio</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full h-12 px-4 bg-white border border-gray-300 rounded-xl outline-none text-[15px] focus:ring-2 focus:ring-black"
            placeholder="Ej: Pizza Nostra"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Slug de la Tienda (URL)</label>
          <input
            type="text"
            value={form.slug}
            onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
            className="w-full h-12 px-4 bg-white border border-gray-300 rounded-xl outline-none text-[15px] focus:ring-2 focus:ring-black"
            placeholder="ej: pizza-nostra"
          />
        </div>
      </div>

      {storeUrl && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-blue-50/70 border border-blue-200 rounded-xl p-3.5">
          <span className="text-xs font-semibold text-blue-950 truncate">{storeUrl}</span>
          <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => navigator.clipboard.writeText(storeUrl)}
              className="h-8 px-3 text-xs text-blue-700 hover:bg-blue-100/80 font-bold rounded-lg"
            >
              <Copy className="h-3.5 w-3.5 mr-1" /> Copiar
            </Button>
            <a
              href={storeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="h-8 px-3 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 flex items-center gap-1.5 transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Ver Tienda
            </a>
          </div>
        </div>
      )}

      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">Descripción</label>
        <textarea
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          className="w-full h-24 px-4 py-3 bg-white border border-gray-300 rounded-xl outline-none text-[15px] resize-none focus:ring-2 focus:ring-black"
          placeholder="Cuéntale a los clientes de qué se trata el negocio..."
        />
      </div>

      <div className={`border rounded-2xl p-5 space-y-4 ${form.force_closed ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
        <label className="flex items-center justify-between gap-4 cursor-pointer select-none">
          <span>
            <span className="block text-sm font-bold text-gray-800">Cerrar tienda temporalmente</span>
            <span className="block text-xs text-gray-500 mt-0.5 max-w-sm">
              El cliente podrá ver el menú, pero no hacer pedidos (ahora o programados). Siempre verá que no hay horarios disponibles ni pedidos para ahora.
            </span>
          </span>
          <input
            type="checkbox"
            checked={form.force_closed}
            onChange={(e) => setForm({ ...form, force_closed: e.target.checked })}
            className="h-5 w-5 accent-black shrink-0 cursor-pointer"
          />
        </label>
        {form.force_closed && (
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Mensaje para el cliente (opcional)</label>
            <input
              type="text"
              value={form.closed_message}
              onChange={(e) => setForm({ ...form, closed_message: e.target.value })}
              className="w-full h-12 px-4 bg-white border border-gray-300 rounded-xl outline-none text-[15px] focus:ring-2 focus:ring-black"
              placeholder="Ej: Volvemos el miércoles, ¡gracias!"
            />
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving || uploadingLogo || uploadingCover} className="bg-black text-white hover:bg-gray-800 font-bold px-6">
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Guardar cambios
        </Button>
      </div>
    </div>
  );
};

export default OrgBrandingTab;
