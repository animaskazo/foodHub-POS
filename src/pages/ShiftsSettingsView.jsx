import React, { useState, useEffect } from 'react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useAuth } from '../components/AuthContext';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';
import { Save, Loader2, Lock, DollarSign, Printer } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import PageHeader from '../components/ui/PageHeader';

const ShiftsSettingsView = () => {
  useDocumentTitle('Ajustes de Caja y Turnos');
  const { organization } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({
    shifts_enabled: false,
    block_pos_when_closed: true,
    require_starting_cash: true,
    require_ending_cash: true,
    auto_print_z_report: false,
  });

  useEffect(() => {
    if (organization?.id) {
      loadSettings();
    }
  }, [organization?.id]);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('organizations')
        .select('settings')
        .eq('id', organization.id)
        .single();
        
      if (error) throw error;
      
      if (data?.settings) {
        setSettings({
          ...settings,
          ...data.settings
        });
      }
    } catch (error) {
      console.error('Error cargando ajustes:', error);
      toast.error('Error al cargar la configuración de caja');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      
      // Update organization settings jsonb
      const { data: orgData } = await supabase
        .from('organizations')
        .select('settings')
        .eq('id', organization.id)
        .single();
        
      const newSettings = {
        ...(orgData?.settings || {}),
        ...settings
      };

      const { error } = await supabase
        .from('organizations')
        .update({ settings: newSettings })
        .eq('id', organization.id);

      if (error) throw error;
      toast.success('Configuración de caja guardada exitosamente');
    } catch (error) {
      console.error('Error guardando ajustes:', error);
      toast.error('Error al guardar la configuración');
    } finally {
      setSaving(false);
    }
  };

  const SettingRow = ({ icon: Icon, title, description, checked, onChange }) => (
    <div className="flex items-start justify-between p-4 bg-white rounded-xl border border-gray-100 hover:border-blue-100 transition-colors">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 p-2 bg-blue-50 text-blue-600 rounded-lg">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <p className="text-sm text-gray-500 mt-1 max-w-md">{description}</p>
        </div>
      </div>
      <Switch 
        checked={checked} 
        onCheckedChange={onChange} 
        className="mt-1"
      />
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 p-6 md:p-8">
      <div className="max-w-7xl mx-auto pb-24">
        <PageHeader 
          title="Caja y Turnos" 
          subtitle="Configura el comportamiento del sistema de control de caja y turnos para tus sucursales."
          actions={
            <Button 
              onClick={handleSave} 
              disabled={saving}
              className="bg-black hover:bg-gray-800 text-white gap-2 w-full sm:w-auto"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Guardar Cambios
            </Button>
          }
        />

        <div className="mt-8 space-y-6">
        
        {/* Main Enable Switch */}
        <div className="bg-white p-6 rounded-xl border border-gray-100">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Módulo de Turnos</h2>
              <p className="text-gray-500 mt-1">Activa el control de apertura y cierre de caja en el Dashboard.</p>
            </div>
            <Switch 
              checked={settings.shifts_enabled} 
              onCheckedChange={(c) => setSettings({...settings, shifts_enabled: c})} 
              className="scale-110"
            />
          </div>
        </div>

        {/* Dependent Settings */}
        {settings.shifts_enabled && (
          <div className="space-y-4 animate-in slide-in-from-top-4 duration-300">
            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider pl-1 mt-6 mb-2">Comportamiento del POS</h3>
            
            <SettingRow 
              icon={Lock}
              title="Bloquear POS si la caja está cerrada"
              description="Impide que los usuarios puedan registrar ventas si no hay un turno de caja abierto."
              checked={settings.block_pos_when_closed}
              onChange={(c) => setSettings({...settings, block_pos_when_closed: c})}
            />

            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider pl-1 mt-6 mb-2">Control de Efectivo</h3>

            <SettingRow 
              icon={DollarSign}
              title="Exigir ingreso de efectivo inicial"
              description="El cajero deberá registrar con cuánto dinero en efectivo (sencillo) abre el día."
              checked={settings.require_starting_cash}
              onChange={(c) => setSettings({...settings, require_starting_cash: c})}
            />

            <SettingRow 
              icon={DollarSign}
              title="Exigir ingreso de efectivo final"
              description="El cajero deberá registrar cuánto efectivo hay en caja antes de cerrarla."
              checked={settings.require_ending_cash}
              onChange={(c) => setSettings({...settings, require_ending_cash: c})}
            />

            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider pl-1 mt-6 mb-2">Impresión</h3>

            <SettingRow 
              icon={Printer}
              title="Impresión de Reporte Z"
              description="Imprimir automáticamente un resumen de las ventas del día al cerrar la caja."
              checked={settings.auto_print_z_report}
              onChange={(c) => setSettings({...settings, auto_print_z_report: c})}
            />
          </div>
        )}

        </div>
      </div>
    </div>
  );
};

export default ShiftsSettingsView;
