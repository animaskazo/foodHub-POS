import React, { useState, useEffect } from 'react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { 
  getFirstOrganizationId, 
  getOrganizationDetails, 
  updateOrganizationDetails,
  getStaff 
} from '../services/organizationService';
import { Store, User, Clock, Check, Loader2, Save } from 'lucide-react';

const SettingsView = () => {
  useDocumentTitle('Configuración');
  const [activeTab, setActiveTab] = useState('general');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [orgId, setOrgId] = useState(null);
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    logo_url: '',
    phone: '',
    email: '',
    address: ''
  });
  
  const [businessHours, setBusinessHours] = useState({});
  const [staff, setStaff] = useState([]);

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
          description: orgData.description || '',
          logo_url: orgData.logo_url || '',
          phone: orgData.phone || '',
          email: orgData.email || '',
          address: orgData.address || ''
        });
        
        if (orgData.business_hours) {
          setBusinessHours(orgData.business_hours);
        }
        setStaff(staffData);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveGeneral = async () => {
    if (!orgId) return;
    setSaving(true);
    try {
      // First try to save everything
      await updateOrganizationDetails(orgId, {
        name: formData.name,
        description: formData.description,
        logo_url: formData.logo_url,
        phone: formData.phone,
        email: formData.email,
        address: formData.address
      });
      alert('Configuración guardada exitosamente');
    } catch (error) {
      // If error is about 'description' column missing (migration not run yet), save without it
      if (error?.message?.includes('description')) {
        try {
           await updateOrganizationDetails(orgId, {
            name: formData.name,
            logo_url: formData.logo_url,
            phone: formData.phone,
            email: formData.email,
            address: formData.address
          });
          alert('Configuración guardada (nota: la descripción requiere actualización de base de datos)');
        } catch (innerErr) {
          alert('Error al guardar configuración');
        }
      } else {
        alert('Error al guardar configuración');
      }
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
    <div className="flex-1 overflow-y-auto bg-gray-50/50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Configuración del Negocio</h1>
          <p className="text-gray-500 mt-1">Gestiona la información pública de tu local y tu equipo.</p>
        </div>

        <div className="flex flex-col md:flex-row gap-6">
          {/* Tabs Sidebar */}
          <div className="w-full md:w-64 shrink-0">
            <div className="bg-white rounded-xl border border-gray-100 p-2 space-y-1">
              <button
                onClick={() => setActiveTab('general')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-[15px] font-semibold transition-colors ${
                  activeTab === 'general' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Store className="h-5 w-5" />
                Información General
              </button>
              <button
                onClick={() => setActiveTab('hours')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-[15px] font-semibold transition-colors ${
                  activeTab === 'hours' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Clock className="h-5 w-5" />
                Horarios
              </button>
              <button
                onClick={() => setActiveTab('staff')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-[15px] font-semibold transition-colors ${
                  activeTab === 'staff' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <User className="h-5 w-5" />
                Equipo (Staff)
              </button>
            </div>
          </div>

          {/* Content Area */}
          <div className="flex-1 bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
            {activeTab === 'general' && (
              <div className="p-6 md:p-8 space-y-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Nombre del Negocio</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    className="w-full h-11 px-4 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-[15px]"
                    placeholder="Ej: Pizza Nostra"
                  />
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

                <div className="pt-6 border-t border-gray-100 flex justify-end">
                  <button
                    onClick={handleSaveGeneral}
                    disabled={saving}
                    className="flex items-center gap-2 px-6 py-2.5 bg-black text-white rounded-lg font-bold hover:bg-gray-800 transition-colors disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
                    Guardar Cambios
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'hours' && (
              <div className="p-6 md:p-8 flex flex-col items-center justify-center text-center h-64 text-gray-400">
                <Clock className="h-12 w-12 mb-3 text-gray-300" />
                <h3 className="text-lg font-semibold text-gray-600 mb-1">Horarios</h3>
                <p>La configuración detallada de horarios estará disponible pronto.</p>
              </div>
            )}

            {activeTab === 'staff' && (
              <div className="p-6 md:p-8">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-lg font-semibold text-gray-900">Equipo</h3>
                  <button className="px-4 py-2 bg-blue-50 text-blue-600 rounded-lg font-bold text-sm hover:bg-blue-100 transition-colors">
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
