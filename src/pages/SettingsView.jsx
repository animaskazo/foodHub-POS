import React, { useState, useEffect } from 'react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { 
  getFirstOrganizationId, 
  getOrganizationDetails, 
  updateOrganizationDetails,
  getStaff 
} from '../services/organizationService';
import { uploadImage } from '../services/storageService';
import { Store, User, Clock, Check, Loader2, Save, Link, Copy, ExternalLink, Download } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';

const daysTranslations = {
  mon: 'Lunes',
  tue: 'Martes',
  wed: 'Miércoles',
  thu: 'Jueves',
  fri: 'Viernes',
  sat: 'Sábado',
  sun: 'Domingo'
};

const defaultHours = {
  mon: { open: '09:00', close: '22:00', closed: false },
  tue: { open: '09:00', close: '22:00', closed: false },
  wed: { open: '09:00', close: '22:00', closed: false },
  thu: { open: '09:00', close: '22:00', closed: false },
  fri: { open: '09:00', close: '22:00', closed: false },
  sat: { open: '09:00', close: '22:00', closed: false },
  sun: { open: '09:00', close: '22:00', closed: true }
};

const SettingsView = () => {
  useDocumentTitle('Configuración');
  const [activeTab, setActiveTab] = useState('general');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [orgId, setOrgId] = useState(null);
  
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    description: '',
    logo_url: '',
    cover_url: '',
    phone: '',
    email: '',
    address: '',
    accepts_online_payments: true,
    online_payments_allowed: false
  });
  
  const [businessHours, setBusinessHours] = useState(defaultHours);
  const [staff, setStaff] = useState([]);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [currentUser, setCurrentUser] = useState({ role: 'cashier', email: '' });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const id = await getFirstOrganizationId();
      if (id) {
        setOrgId(id);
        const [orgData, staffData] = await Promise.all([
          getOrganizationDetails(id),
          getStaff(id)
        ]);
        
        setFormData({
          name: orgData.name || '',
          slug: orgData.slug || '',
          description: orgData.description || '',
          logo_url: orgData.logo_url || '',
          cover_url: orgData.cover_url || '',
          phone: orgData.phone || '',
          email: orgData.email || '',
          address: orgData.address || '',
          accepts_online_payments: orgData.accepts_online_payments !== false,
          online_payments_allowed: orgData.online_payments_allowed === true
        });
        
        if (orgData.business_hours && Object.keys(orgData.business_hours).length > 0) {
          setBusinessHours(orgData.business_hours);
        }
        setStaff(staffData);

        // Obtener el rol del usuario logueado actualmente
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: staffMember } = await supabase
            .from('staff')
            .select('role')
            .eq('id', user.id)
            .maybeSingle();
          setCurrentUser({
            role: staffMember?.role || 'cashier',
            email: user.email || ''
          });
        }
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleImageUpload = async (e, type) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      if (type === 'logo') {
        setIsUploadingLogo(true);
        const url = await uploadImage(file, 'logo');
        setFormData(prev => ({ ...prev, logo_url: url }));
      } else {
        setIsUploadingCover(true);
        const url = await uploadImage(file, 'cover');
        setFormData(prev => ({ ...prev, cover_url: url }));
      }
    } catch (error) {
      console.error('Error uploading:', error);
      alert('Error al subir la imagen');
    } finally {
      setIsUploadingLogo(false);
      setIsUploadingCover(false);
    }
  };

  const handleSaveGeneral = async () => {
    if (!orgId) return;
    setSaving(true);
    try {
      const formattedSlug = formData.slug.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
      await updateOrganizationDetails(orgId, {
        name: formData.name,
        slug: formattedSlug,
        description: formData.description,
        logo_url: formData.logo_url,
        cover_url: formData.cover_url,
        phone: formData.phone,
        email: formData.email,
        address: formData.address,
        accepts_online_payments: formData.accepts_online_payments
      });
      setFormData(prev => ({ ...prev, slug: formattedSlug }));
      alert('Configuración guardada exitosamente');
    } catch (error) {
      console.error(error);
      alert('Error al guardar configuración. Por favor, asegúrate de haber ejecutado la migración SQL 015 en el SQL Editor de tu consola Supabase.');
    } finally {
      setSaving(false);
    }
  };

  const handleDayClosedToggle = (dayKey, closedValue) => {
    setBusinessHours(prev => ({
      ...prev,
      [dayKey]: {
        ...prev[dayKey],
        closed: closedValue
      }
    }));
  };

  const handleDayTimeChange = (dayKey, field, value) => {
    setBusinessHours(prev => ({
      ...prev,
      [dayKey]: {
        ...prev[dayKey],
        [field]: value
      }
    }));
  };

  const handleSaveHours = async () => {
    if (!orgId) return;
    setSaving(true);
    try {
      await updateOrganizationDetails(orgId, {
        business_hours: businessHours
      });
      alert('Horarios comerciales guardados exitosamente');
    } catch (error) {
      console.error(error);
      alert('Error al guardar horarios. Por favor, asegúrate de haber ejecutado la migración SQL 015 en el SQL Editor de tu consola Supabase.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 p-6 md:p-8">
      <div className="max-w-7xl mx-auto">
        <PageHeader 
          title="Configuración del Negocio"
          subtitle="Gestiona la información pública de tu local y tu equipo."
        />

        <div className="flex flex-col md:flex-row gap-6">
          {/* Tabs Sidebar */}
          <div className="w-full md:w-64 shrink-0">
            <div className="bg-white rounded-2xl border border-gray-200 p-3 space-y-1">
              <button
                onClick={() => setActiveTab('general')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-[15px] font-semibold transition-colors cursor-pointer ${
                  activeTab === 'general' ? 'bg-gray-100 text-black' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Store className="h-5 w-5" />
                Información General
              </button>
              <button
                onClick={() => setActiveTab('hours')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-[15px] font-semibold transition-colors cursor-pointer ${
                  activeTab === 'hours' ? 'bg-gray-100 text-black' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Clock className="h-5 w-5" />
                Horarios
              </button>
              <button
                onClick={() => setActiveTab('staff')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-[15px] font-semibold transition-colors cursor-pointer ${
                  activeTab === 'staff' ? 'bg-gray-100 text-black' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <User className="h-5 w-5" />
                Equipo (Staff)
              </button>
            </div>
          </div>

          {/* Content Area */}
          <div className="flex-1 bg-white rounded-2xl border border-gray-200 overflow-hidden">
            {activeTab === 'general' && (
              <div className="p-6 md:p-8 space-y-6">
                
                {/* Logo & Cover Image Uploaders */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Logotipo */}
                  <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5 flex flex-col items-center">
                    <p className="font-semibold text-sm text-gray-700 mb-3 text-left w-full">Logotipo de la Empresa</p>
                    <div 
                      className="w-24 h-24 rounded-full bg-white border border-gray-200 flex items-center justify-center shrink-0 bg-cover bg-center overflow-hidden relative group"
                      style={formData.logo_url ? { backgroundImage: `url(${formData.logo_url})` } : {}}
                    >
                      {!formData.logo_url && <span className="text-3xl">🏬</span>}
                      {isUploadingLogo && (
                        <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
                          <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                        </div>
                      )}
                    </div>
                    <label className="mt-4 px-4 py-1.5 bg-white border border-gray-200 rounded-full text-xs font-bold text-gray-700 cursor-pointer hover:bg-gray-50 transition-colors">
                      {formData.logo_url ? 'Cambiar Logo' : 'Subir Logo'}
                      <input 
                        type="file" 
                        accept="image/*"
                        onChange={(e) => handleImageUpload(e, 'logo')}
                        disabled={isUploadingLogo}
                        className="hidden"
                      />
                    </label>
                  </div>

                  {/* Portada */}
                  <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5 flex flex-col items-center">
                    <p className="font-semibold text-sm text-gray-700 mb-3 text-left w-full">Imagen de Portada (Cover)</p>
                    <div 
                      className="w-full h-24 rounded-xl bg-white border border-gray-200 flex items-center justify-center shrink-0 bg-cover bg-center overflow-hidden relative"
                      style={formData.cover_url ? { backgroundImage: `url(${formData.cover_url})` } : {}}
                    >
                      {!formData.cover_url && <span className="text-3xl">🖼️</span>}
                      {isUploadingCover && (
                        <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
                          <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                        </div>
                      )}
                    </div>
                    <label className="mt-4 px-4 py-1.5 bg-white border border-gray-200 rounded-full text-xs font-bold text-gray-700 cursor-pointer hover:bg-gray-50 transition-colors">
                      {formData.cover_url ? 'Cambiar Portada' : 'Subir Portada'}
                      <input 
                        type="file" 
                        accept="image/*"
                        onChange={(e) => handleImageUpload(e, 'cover')}
                        disabled={isUploadingCover}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Nombre del Negocio</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      className="w-full h-11 px-4 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-[15px]"
                      placeholder="Ej: Pizza Nostra"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Slug de la Tienda (URL)</label>
                    <input
                      type="text"
                      value={formData.slug}
                      onChange={(e) => {
                        const val = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
                        setFormData({...formData, slug: val});
                      }}
                      className="w-full h-11 px-4 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-[15px]"
                      placeholder="ej: pizza-nostra"
                      required
                    />
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Descripción Corta</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                    className="w-full h-24 p-4 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-[15px] resize-none"
                    placeholder="Cuéntale a tus clientes de qué se trata tu negocio..."
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Teléfono</label>
                    <input
                      type="text"
                      value={formData.phone}
                      onChange={(e) => setFormData({...formData, phone: e.target.value})}
                      className="w-full h-11 px-4 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-[15px]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Email</label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({...formData, email: e.target.value})}
                      className="w-full h-11 px-4 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-[15px]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Dirección</label>
                  <input
                    type="text"
                    value={formData.address}
                    onChange={(e) => setFormData({...formData, address: e.target.value})}
                    className="w-full h-11 px-4 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-[15px]"
                  />
                </div>

                {/* Switch para habilitar/deshabilitar pago online */}
                <div className="flex items-center justify-between p-4 bg-gray-50 border border-gray-200 rounded-2xl">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-sm text-gray-800">Habilitar Pago en Línea (Klap)</p>
                      {!formData.online_payments_allowed && (
                        <span className="text-[10px] bg-gray-200 text-gray-600 font-bold px-2 py-0.5 rounded-md uppercase tracking-wider">
                          Pronto
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 max-w-sm mt-0.5">
                      {!formData.online_payments_allowed 
                        ? 'Esta característica estará disponible próximamente en tu cuenta.' 
                        : 'Permite que tus clientes paguen con tarjetas de crédito o débito a través de la web.'}
                    </p>
                  </div>
                  <label className={`relative inline-flex items-center select-none ${(!formData.online_payments_allowed || currentUser.role !== 'owner') ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                    <input 
                      type="checkbox" 
                      checked={formData.accepts_online_payments && formData.online_payments_allowed}
                      disabled={!formData.online_payments_allowed || currentUser.role !== 'owner'}
                      onChange={(e) => setFormData({...formData, accepts_online_payments: e.target.checked})}
                      className="sr-only peer"
                    />
                    <div className={`w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-black ${(!formData.online_payments_allowed || currentUser.role !== 'owner') ? 'opacity-40' : ''}`}></div>
                  </label>
                </div>

                {/* Public store link */}
                {formData.slug && (
                  <div className="bg-gray-50 rounded-2xl border border-gray-200 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Link className="h-4 w-4 text-gray-500" />
                      <p className="text-sm font-bold text-gray-700">Tu tienda pública</p>
                    </div>
                    <p className="text-xs text-gray-500 mb-3">Comparte este enlace con tus clientes para que puedan hacer pedidos en línea.</p>
                    <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2.5 mb-4">
                      <span className="text-sm text-gray-600 flex-1 truncate">
                        {window.location.origin}/order/{formData.slug}
                      </span>
                      <button
                        onClick={() => navigator.clipboard.writeText(`${window.location.origin}/order/${formData.slug}`)}
                        className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors shrink-0 cursor-pointer"
                        title="Copiar enlace"
                      >
                        <Copy className="h-4 w-4 text-gray-500" />
                      </button>
                      <a
                        href={`/order/${formData.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors shrink-0 cursor-pointer"
                        title="Abrir tienda"
                      >
                        <ExternalLink className="h-4 w-4 text-gray-500" />
                      </a>
                    </div>

                    {/* QR Code Section */}
                    <div className="border-t border-gray-200 pt-4 flex flex-col sm:flex-row items-center gap-4">
                      <div className="p-3 bg-white border border-gray-200 rounded-2xl shrink-0">
                        <img 
                          src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(`${window.location.origin}/order/${formData.slug}`)}`}
                          alt="Código QR de la tienda"
                          className="w-28 h-28 md:w-32 md:h-32 object-contain"
                        />
                      </div>
                      <div className="text-center sm:text-left space-y-2">
                        <p className="font-bold text-sm text-gray-800">Código QR de tu Menú</p>
                        <p className="text-xs text-gray-500 leading-relaxed max-w-sm">
                          Imprime este código y colócalo en las mesas o vitrina de tu local. Tus clientes podrán escanearlo para ver la carta y pedir directamente.
                        </p>
                        <button
                          onClick={async () => {
                            const url = `${window.location.origin}/order/${formData.slug}`;
                            const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(url)}`;
                            try {
                              const response = await fetch(qrApiUrl);
                              const blob = await response.blob();
                              const blobUrl = URL.createObjectURL(blob);
                              const link = document.createElement('a');
                              link.href = blobUrl;
                              link.download = `qr-${formData.slug}.png`;
                              document.body.appendChild(link);
                              link.click();
                              document.body.removeChild(link);
                              URL.revokeObjectURL(blobUrl);
                            } catch (e) {
                              window.open(qrApiUrl, '_blank');
                            }
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-2 bg-black hover:bg-gray-850 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
                        >
                          <Download className="h-3.5 w-3.5" />
                          Descargar código QR (PNG)
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <div className="pt-6 border-t border-gray-100 flex justify-end">
                  <button
                    onClick={handleSaveGeneral}
                    disabled={saving}
                    className="flex items-center gap-2 px-6 py-2.5 bg-black text-white rounded-lg font-bold hover:bg-gray-800 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
                    Guardar Cambios
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'hours' && (
              <div className="p-6 md:p-8 space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-gray-900 mb-1">Horario Comercial</h3>
                  <p className="text-sm text-gray-500">Configura los días y horas de apertura de tu local.</p>
                </div>

                <div className="space-y-4">
                  {Object.keys(daysTranslations).map((dayKey) => {
                    const dayData = businessHours[dayKey] || { open: '09:00', close: '22:00', closed: false };
                    return (
                      <div key={dayKey} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100 gap-4">
                        <div className="flex items-center gap-3 min-w-[120px]">
                          <input 
                            type="checkbox"
                            checked={!dayData.closed}
                            onChange={(e) => handleDayClosedToggle(dayKey, !e.target.checked)}
                            className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer"
                          />
                          <span className="font-semibold text-sm capitalize text-gray-800">{daysTranslations[dayKey]}</span>
                        </div>

                        {!dayData.closed ? (
                          <div className="flex items-center gap-2">
                            <input 
                              type="time"
                              value={dayData.open || '09:00'}
                              onChange={(e) => handleDayTimeChange(dayKey, 'open', e.target.value)}
                              className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <span className="text-gray-400 font-semibold text-xs">a</span>
                            <input 
                              type="time"
                              value={dayData.close || '22:00'}
                              onChange={(e) => handleDayTimeChange(dayKey, 'close', e.target.value)}
                              className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                        ) : (
                          <span className="text-xs font-bold text-red-500 uppercase bg-red-50 px-2.5 py-1 rounded">Cerrado</span>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="pt-6 border-t border-gray-100 flex justify-end">
                  <button
                    onClick={handleSaveHours}
                    disabled={saving}
                    className="flex items-center gap-2 px-6 py-2.5 bg-black text-white rounded-lg font-bold hover:bg-gray-800 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
                    Guardar Horarios
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'staff' && (
              <div className="p-6 md:p-8">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-lg font-semibold text-gray-900">Equipo</h3>
                  <button className="px-4 py-2 bg-blue-50 text-blue-600 rounded-lg font-bold text-sm hover:bg-blue-100 transition-colors cursor-pointer">
                    + Invitar miembro
                  </button>
                </div>

                {staff.length === 0 ? (
                  <div className="text-center py-10 text-gray-400">
                    <User className="h-10 w-10 mx-auto mb-2 text-gray-300" />
                    <p>No se encontraron miembros del staff.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {staff.map(member => (
                      <div key={member.id} className="flex items-center justify-between p-4 border border-gray-100 rounded-xl">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold text-lg">
                            {member.full_name?.charAt(0) || '?'}
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900">{member.full_name}</p>
                            <p className="text-sm text-gray-500 capitalize">{member.role || 'Staff'}</p>
                          </div>
                        </div>
                        {member.is_active ? (
                          <span className="px-2.5 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-full">Activo</span>
                        ) : (
                          <span className="px-2.5 py-1 bg-gray-100 text-gray-600 text-xs font-bold rounded-full">Inactivo</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsView;
