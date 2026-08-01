import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { 
  getFirstOrganizationId, 
  getOrganizationDetails, 
  updateOrganizationDetails,
  getStaff 
} from '../services/organizationService';
import { uploadImage } from '../services/storageService';
import { Store, User, Clock, CalendarClock, Check, Loader2, Save, Link, Copy, ExternalLink, Download, MapPin, Truck, Search, Printer, Monitor, Info, CheckCircle2 } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
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
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const activeTab = searchParams.get('tab') || 'general';

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
    address: '',
    accepts_online_payments: true,
    online_payments_allowed: false
  });
  
  const [businessHours, setBusinessHours] = useState(defaultHours);
  const [pickupHours, setPickupHours] = useState(defaultHours);
  const [hoursTab, setHoursTab] = useState('comercial'); // 'comercial' | 'retiro'
  const [instantEnabled, setInstantEnabled] = useState(true);
  const [schedulingEnabled, setSchedulingEnabled] = useState(true);
  const [staff, setStaff] = useState([]);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [currentUser, setCurrentUser] = useState({ role: 'cashier', email: '' });
  const [autoPrintEnabled, setAutoPrintEnabled] = useState(
    localStorage.getItem('pos_auto_print_enabled') === 'true'
  );

  const handleAutoPrintToggle = (checked) => {
    setAutoPrintEnabled(checked);
    localStorage.setItem('pos_auto_print_enabled', checked.toString());
  };

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
          address: orgData.address || '',
          accepts_online_payments: orgData.accepts_online_payments !== false,
          online_payments_allowed: orgData.online_payments_allowed === true
        });
        
        if (orgData.business_hours && Object.keys(orgData.business_hours).length > 0) {
          setBusinessHours(orgData.business_hours);
        }
        if (orgData.pickup_hours && Object.keys(orgData.pickup_hours).length > 0) {
          setPickupHours(orgData.pickup_hours);
        }
        setInstantEnabled(orgData.instant_enabled !== false);
        setSchedulingEnabled(orgData.scheduling_enabled !== false);
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

  const handlePickupDayClosedToggle = (dayKey, closedValue) => {
    setPickupHours(prev => ({
      ...prev,
      [dayKey]: {
        ...prev[dayKey],
        closed: closedValue
      }
    }));
  };

  const handlePickupDayTimeChange = (dayKey, field, value) => {
    setPickupHours(prev => ({
      ...prev,
      [dayKey]: {
        ...prev[dayKey],
        [field]: value
      }
    }));
  };

  const handleSavePickupHours = async () => {
    if (!orgId) return;
    setSaving(true);
    try {
      await updateOrganizationDetails(orgId, {
        pickup_hours: pickupHours,
        instant_enabled: instantEnabled,
        scheduling_enabled: schedulingEnabled,
      });
      alert('Horarios de retiro guardados exitosamente');
    } catch (error) {
      console.error(error);
      alert('Error al guardar horarios de retiro. Por favor, asegúrate de haber ejecutado la migración SQL 041 en el SQL Editor de tu consola Supabase.');
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

  const renderDayRow = (dayKey, dayData, onToggle, onTimeChange) => (
    <div key={dayKey} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-white rounded-2xl border border-gray-200 gap-4">
      <div className="flex items-center gap-3 min-w-[130px]">
        <span className={`w-2 h-2 rounded-full shrink-0 ${dayData.closed ? 'bg-red-400' : 'bg-emerald-500'}`} />
        <span className="font-bold text-sm text-gray-800">{daysTranslations[dayKey]}</span>
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        {!dayData.closed && (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 h-11">
              <Clock className="h-4 w-4 text-gray-400 shrink-0" />
              <input
                type="time"
                value={dayData.open || '09:00'}
                onChange={(e) => onTimeChange(dayKey, 'open', e.target.value)}
                className="bg-transparent text-sm font-semibold outline-none w-[88px] text-gray-800"
              />
            </div>
            <span className="text-gray-400 font-semibold text-xs">a</span>
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 h-11">
              <Clock className="h-4 w-4 text-gray-400 shrink-0" />
              <input
                type="time"
                value={dayData.close || '22:00'}
                onChange={(e) => onTimeChange(dayKey, 'close', e.target.value)}
                className="bg-transparent text-sm font-semibold outline-none w-[88px] text-gray-800"
              />
            </div>
          </div>
        )}
        <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-xl w-fit">
          <button
            type="button"
            onClick={() => onToggle(dayKey, false)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${!dayData.closed ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
          >
            Abierto
          </button>
          <button
            type="button"
            onClick={() => onToggle(dayKey, true)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${dayData.closed ? 'bg-white text-red-500 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
          >
            Cerrado
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 p-6 md:p-8">
      <div className="max-w-7xl mx-auto">
        <PageHeader 
          title="Configuración del Negocio"
          subtitle="Gestiona la información pública de tu local y tu equipo."
        />

        <div className="pb-24">
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            {activeTab === 'general' && (
              <div className="p-6 md:p-8 space-y-6">
                
                {/* Logo & Cover Image Uploaders */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Logotipo */}
                  <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5 flex flex-col items-center">
                    <p className="font-semibold text-sm text-gray-700 mb-3 text-left w-full">Logotipo de la Empresa</p>
                    <div 
                      className="w-24 h-24 bg-white border border-gray-200 flex items-center justify-center shrink-0 bg-cover bg-center overflow-hidden relative group"
                      style={formData.logo_url ? { backgroundImage: `url(${formData.logo_url})` } : {}}
                    >
                      {!formData.logo_url && <span className="text-3xl">🏬</span>}
                      {isUploadingLogo && (
                        <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
                          <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                        </div>
                      )}
                    </div>
                    <label className="mt-4 px-4 py-1.5 bg-white border border-gray-200 text-xs font-bold text-gray-700 cursor-pointer hover:bg-gray-50 transition-colors">
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
                    <label className="mt-4 px-4 py-1.5 bg-white border border-gray-200 text-xs font-bold text-gray-700 cursor-pointer hover:bg-gray-50 transition-colors">
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
                    <div className="form-field flex items-center px-4">
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData({...formData, name: e.target.value})}
                        className="flex-1 h-12 bg-transparent outline-none text-[15px]"
                        placeholder="Ej: Pizza Nostra"
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Slug de la Tienda (URL)</label>
                    <div className="form-field flex items-center px-4">
                      <input
                        type="text"
                        value={formData.slug}
                        onChange={(e) => {
                          const val = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
                          setFormData({...formData, slug: val});
                        }}
                        className="flex-1 h-12 bg-transparent outline-none text-[15px]"
                        placeholder="ej: pizza-nostra"
                        required
                      />
                    </div>
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Descripción Corta</label>
                  <div className="form-field px-4 py-3">
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData({...formData, description: e.target.value})}
                      className="w-full h-20 bg-transparent outline-none text-[15px] resize-none"
                      placeholder="Cuéntale a tus clientes de qué se trata tu negocio..."
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Teléfono</label>
                    <div className="form-field flex items-center px-4">
                      <input
                        type="text"
                        value={formData.phone}
                        onChange={(e) => setFormData({...formData, phone: e.target.value})}
                        className="flex-1 h-12 bg-transparent outline-none text-[15px]"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Email</label>
                    <div className="form-field flex items-center px-4">
                      <input
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({...formData, email: e.target.value})}
                        className="flex-1 h-12 bg-transparent outline-none text-[15px]"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Dirección</label>
                  <div className="form-field flex items-center px-4">
                    <input
                      type="text"
                      value={formData.address}
                      onChange={(e) => setFormData({...formData, address: e.target.value})}
                      className="flex-1 h-12 bg-transparent outline-none text-[15px]"
                    />
                  </div>
                </div>

                {/* Switch para habilitar/deshabilitar pago online */}
                <div className="flex items-center justify-between p-4 bg-gray-50 border border-gray-200 rounded-2xl">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-sm text-gray-800">Habilitar Pago en Línea (Klap)</p>
                      {!formData.online_payments_allowed && (
                        <span className="text-[10px] bg-gray-200 text-gray-600 font-bold px-2 py-0.5   uppercase tracking-wider">
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
                  <Switch 
                    checked={formData.accepts_online_payments && formData.online_payments_allowed}
                    disabled={!formData.online_payments_allowed || currentUser.role !== 'owner'}
                    onCheckedChange={(checked) => setFormData({...formData, accepts_online_payments: checked})}
                  />
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
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => navigator.clipboard.writeText(`${window.location.origin}/order/${formData.slug}`)}
                        className="h-8 w-8 text-gray-500 hover:text-gray-900 shrink-0 cursor-pointer"
                        title="Copiar enlace"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <a
                        href={`/order/${formData.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors shrink-0 cursor-pointer"
                        title="Abrir tienda"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </div>

                    <div className="bg-blue-50 border border-blue-200 rounded-xl px-3 py-2.5 mb-4">
                      <p className="text-xs text-blue-700 font-medium mb-1">📱 Compartir en redes sociales</p>
                      <p className="text-xs text-blue-600">Al compartir este link en WhatsApp, Telegram, etc. se mostrará la foto y nombre de tu tienda automáticamente.</p>
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
                        <Button
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
                          className="inline-flex items-center gap-1.5 px-3 py-2 bg-black hover:bg-gray-850 text-white text-xs font-bold   transition-colors cursor-pointer"
                        >
                          <Download className="h-3.5 w-3.5" />
                          Descargar código QR (PNG)
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                <div className="pt-6 border-t border-gray-100 flex justify-end">
                  <Button
                    onClick={handleSaveGeneral}
                    disabled={saving}
                    className="flex items-center gap-2 px-6 py-2.5 bg-black text-white   font-bold hover:bg-gray-800 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
                    Guardar Cambios
                  </Button>
                </div>
              </div>
            )}

            {activeTab === 'hours' && (
              <div className="p-6 md:p-8 space-y-6">
                {/* Tab switcher */}
                <div className="grid grid-cols-2 gap-1 p-1 bg-gray-100 rounded-2xl">
                  <button
                    onClick={() => setHoursTab('comercial')}
                    className={`py-3 rounded-xl text-sm font-bold transition-all cursor-pointer ${
                      hoursTab === 'comercial' ? 'bg-white text-black shadow-sm' : 'text-gray-500 hover:text-black'
                    }`}
                  >
                    Horario Comercial
                  </button>
                  <button
                    onClick={() => setHoursTab('retiro')}
                    className={`py-3 rounded-xl text-sm font-bold transition-all cursor-pointer ${
                      hoursTab === 'retiro' ? 'bg-white text-black shadow-sm' : 'text-gray-500 hover:text-black'
                    }`}
                  >
                    Horario de Retiro
                  </button>
                </div>

                {hoursTab === 'comercial' && (
                  <>
                    <div>
                      <h3 className="text-lg font-bold text-gray-900 mb-1">Horario Comercial</h3>
                      <p className="text-sm text-gray-500">Días y horas en que tu local recibe pedidos.</p>
                    </div>

                    <div className="space-y-3">
                      {Object.keys(daysTranslations).map((dayKey) =>
                        renderDayRow(
                          dayKey,
                          businessHours[dayKey] || { open: '09:00', close: '22:00', closed: false },
                          handleDayClosedToggle,
                          handleDayTimeChange
                        )
                      )}
                    </div>

                    <div className="pt-6 border-t border-gray-100 flex justify-end">
                      <Button
                        onClick={handleSaveHours}
                        disabled={saving}
                        className="flex items-center gap-2 px-6 py-2.5 bg-black text-white   font-bold hover:bg-gray-800 transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
                        Guardar Horarios
                      </Button>
                    </div>
                  </>
                )}

                {hoursTab === 'retiro' && (
                  <>
                    <div>
                      <h3 className="text-lg font-bold text-gray-900 mb-1">Horarios de Retiro</h3>
                      <p className="text-sm text-gray-500">
                        Define en qué horarios tus clientes pueden retirar o agendar sus pedidos online. Fuera de estos horarios solo podrán agendar.
                      </p>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-4 p-5 bg-white border border-gray-200 rounded-2xl">
                        <div className="flex items-center gap-4">
                          <div className="h-11 w-11 rounded-2xl bg-black text-white flex items-center justify-center shrink-0">
                            <Clock className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="font-bold text-sm text-gray-800">Pedidos para Ahora</p>
                            <p className="text-xs text-gray-500 mt-0.5 max-w-sm">
                              Permite que tus clientes pidan con retiro inmediato mientras estés dentro del horario de retiro.
                            </p>
                          </div>
                        </div>
                        <Switch
                          checked={instantEnabled}
                          onCheckedChange={setInstantEnabled}
                        />
                      </div>

                      <div className="flex items-center justify-between gap-4 p-5 bg-white border border-gray-200 rounded-2xl">
                        <div className="flex items-center gap-4">
                          <div className="h-11 w-11 rounded-2xl bg-black text-white flex items-center justify-center shrink-0">
                            <CalendarClock className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="font-bold text-sm text-gray-800">Pedidos Programados</p>
                            <p className="text-xs text-gray-500 mt-0.5 max-w-sm">
                              Permite que tus clientes agenden su pedido para una hora futura dentro del horario de retiro.
                            </p>
                          </div>
                        </div>
                        <Switch
                          checked={schedulingEnabled}
                          onCheckedChange={setSchedulingEnabled}
                        />
                      </div>
                    </div>

                    <div className="space-y-3">
                      {Object.keys(daysTranslations).map((dayKey) =>
                        renderDayRow(
                          dayKey,
                          pickupHours[dayKey] || { open: '09:00', close: '22:00', closed: false },
                          handlePickupDayClosedToggle,
                          handlePickupDayTimeChange
                        )
                      )}
                    </div>

                    <div className="pt-6 border-t border-gray-100 flex justify-end">
                      <Button
                        onClick={handleSavePickupHours}
                        disabled={saving}
                        className="flex items-center gap-2 px-6 py-2.5 bg-black text-white   font-bold hover:bg-gray-800 transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
                        Guardar Horarios de Retiro
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}

            {activeTab === 'staff' && (
              <div className="p-6 md:p-8">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-lg font-semibold text-gray-900">Equipo</h3>
                  <Button className="bg-blue-50 text-blue-600   font-bold text-sm hover:bg-blue-100 transition-colors cursor-pointer">
                    + Invitar miembro
                  </Button>
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
                          <div className="w-10 h-10 bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-lg">
                            {member.full_name?.charAt(0) || '?'}
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900">{member.full_name}</p>
                            <p className="text-sm text-gray-500 capitalize">{member.role || 'Staff'}</p>
                          </div>
                        </div>
                        {member.is_active ? (
                          <span className="px-2.5 py-1 bg-green-100 text-green-700 text-xs font-bold ">Activo</span>
                        ) : (
                          <span className="px-2.5 py-1 bg-gray-100 text-gray-600 text-xs font-bold ">Inactivo</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Impresoras y Hardware Tab */}
            {activeTab === 'printers' && (
              <div className="p-6 md:p-8 space-y-8 animate-in fade-in">
                
                {/* Auto Print Setting */}
                <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6 flex items-start gap-4">
                  <div className="h-12 w-12 bg-white rounded-full border border-gray-200 flex items-center justify-center shrink-0">
                    <Printer className="h-6 w-6 text-gray-700" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-bold text-gray-900 text-lg">Impresión Automática de Tickets</h3>
                        <p className="text-gray-500 text-sm mt-1">Imprime automáticamente los nuevos pedidos que entren por Delivery o QR. <br/><span className="font-semibold text-blue-600">Nota:</span> Esta configuración se guarda solo en este dispositivo.</p>
                      </div>
                      <Switch 
                        checked={autoPrintEnabled}
                        onCheckedChange={handleAutoPrintToggle}
                      />
                    </div>
                  </div>
                </div>

                {/* Guía de Configuración */}
                <div>
                  <h3 className="font-bold text-gray-900 text-lg mb-4 flex items-center gap-2">
                    <Info className="h-5 w-5 text-blue-600" />
                    Guía de configuración para impresión térmica (80mm)
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Windows Guide */}
                    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                      <div className="bg-blue-50 border-b border-gray-200 px-5 py-3 flex items-center gap-2">
                        <Monitor className="h-5 w-5 text-blue-700" />
                        <h4 className="font-bold text-blue-900">Configuración en Windows (Chrome)</h4>
                      </div>
                      <div className="p-5 space-y-4 text-sm text-gray-700">
                        <p className="font-medium text-gray-900">Para una impresión rápida y sin cuadros de diálogo:</p>
                        <ol className="list-decimal pl-5 space-y-3">
                          <li>Instala los drivers oficiales de tu impresora (ej. Epson, Xprinter).</li>
                          <li>Ve a <span className="font-semibold bg-gray-100 px-1 rounded">Panel de Control &gt; Dispositivos e Impresoras</span> y asegúrate de que tu impresora térmica esté configurada como <strong>Predeterminada</strong>.</li>
                          <li>Abre FoodHub POS en <strong>Google Chrome</strong>.</li>
                          <li>Haz clic derecho en el ícono de Chrome en tu escritorio, selecciona <strong>Propiedades</strong> y en el campo <em>Destino</em> añade al final: <br/><code className="bg-gray-100 px-2 py-1 mt-1 inline-block rounded text-blue-600">--kiosk-printing</code></li>
                          <li>Abre un ticket de prueba. En el cuadro de diálogo de Chrome, haz clic en "Más ajustes" y:
                            <ul className="list-disc pl-5 mt-1 space-y-1 text-gray-600">
                              <li>Quita la opción "Encabezados y pies de página"</li>
                              <li>Establece los márgenes en "Ninguno" o "Mínimo"</li>
                              <li>El tamaño de papel debe ser "80(72) x 297 mm" o similar</li>
                            </ul>
                          </li>
                        </ol>
                        <div className="mt-4 p-3 bg-green-50 text-green-800 rounded-lg flex items-start gap-2">
                          <CheckCircle2 className="h-5 w-5 shrink-0" />
                          <p>Una vez apliques `--kiosk-printing`, los tickets se imprimirán automáticamente al hacer clic en Imprimir, sin pedir confirmación.</p>
                        </div>
                      </div>
                    </div>

                    {/* Mac Guide */}
                    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                      <div className="bg-gray-100 border-b border-gray-200 px-5 py-3 flex items-center gap-2">
                        <Monitor className="h-5 w-5 text-gray-700" />
                        <h4 className="font-bold text-gray-900">Configuración en macOS (Automator)</h4>
                      </div>
                      <div className="p-5 space-y-4 text-sm text-gray-700">
                        <p className="font-medium text-gray-900">Para usar la impresión silenciosa en Mac, necesitas crear un pequeño script con Automator:</p>
                        <ol className="list-decimal pl-5 space-y-3">
                          <li>Abre la aplicación <strong>Automator</strong> (búscala en Spotlight).</li>
                          <li>Crea un nuevo documento de tipo <strong>Aplicación</strong>.</li>
                          <li>En el buscador de acciones a la izquierda, busca "Ejecutar script de Shell" o "Run Shell Script" y arrástralo a la derecha.</li>
                          <li>Pega el siguiente código exacto en el cuadro de texto:<br/>
                            <code className="bg-gray-100 px-3 py-2 mt-2 block rounded text-blue-600 font-mono text-xs overflow-x-auto whitespace-pre">
                              open -a "Google Chrome" --args --kiosk-printing
                            </code>
                          </li>
                          <li>Guarda esta aplicación (por ejemplo en el Escritorio con el nombre "POS FoodHub").</li>
                          <li>Usa esta nueva aplicación para abrir Chrome. Cuando Chrome esté abierto de esta forma, ¡la impresión automática funcionará al instante!</li>
                        </ol>
                        <div className="mt-4 p-3 bg-gray-50 text-gray-600 rounded-lg text-xs flex gap-2 items-start">
                          <Info className="h-4 w-4 shrink-0 text-gray-400 mt-0.5" />
                          <p>
                            Recuerda que la primera vez que imprimas deberás verificar que los márgenes en Chrome estén en "Ninguno", quitar los encabezados, y seleccionar el papel 80mm de tu impresora predeterminada.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsView;
