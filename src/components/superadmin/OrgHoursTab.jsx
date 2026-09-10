import React, { useEffect, useState } from 'react';
import { Loader2, Save, Clock, CalendarClock, Timer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { getOrganizationDetails, updateOrganizationDetails } from '../../services/organizationService';

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

/**
 * Permite al super-admin ver y editar los horarios de cualquier negocio:
 * horario comercial, horario de retiro, pedidos inmediatos/programados
 * y tiempo de preparación.
 */
const OrgHoursTab = ({ organizationId }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hoursTab, setHoursTab] = useState('comercial'); // 'comercial' | 'retiro'
  const [businessHours, setBusinessHours] = useState(defaultHours);
  const [pickupHours, setPickupHours] = useState(defaultHours);
  const [instantEnabled, setInstantEnabled] = useState(true);
  const [schedulingEnabled, setSchedulingEnabled] = useState(false);
  const [prepTime, setPrepTime] = useState(0);

  useEffect(() => {
    const load = async () => {
      if (!organizationId) return;
      setLoading(true);
      try {
        const data = await getOrganizationDetails(organizationId);
        if (data.business_hours && Object.keys(data.business_hours).length > 0) {
          setBusinessHours(data.business_hours);
        }
        if (data.pickup_hours && Object.keys(data.pickup_hours).length > 0) {
          setPickupHours(data.pickup_hours);
        }
        setInstantEnabled(data.instant_enabled !== false);
        setSchedulingEnabled(data.scheduling_enabled === true);
        setPrepTime(data.prep_time != null ? data.prep_time : 0);
      } catch (err) {
        console.error('Error loading org hours:', err);
        toast.error('No se pudieron cargar los horarios del negocio');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [organizationId]);

  const handleSaveHours = async () => {
    if (!organizationId) return;
    setSaving(true);
    const toastId = toast.loading('Guardando horarios...');
    try {
      await updateOrganizationDetails(organizationId, { business_hours: businessHours });
      toast.success('Horarios comerciales guardados', { id: toastId });
    } catch (err) {
      console.error('Error saving business hours:', err);
      toast.error('Error al guardar. Revisa los permisos RLS de organizations.', { id: toastId });
    } finally {
      setSaving(false);
    }
  };

  const handleSavePickupHours = async () => {
    if (!organizationId) return;
    setSaving(true);
    const toastId = toast.loading('Guardando horarios de retiro...');
    try {
      await updateOrganizationDetails(organizationId, {
        pickup_hours: pickupHours,
        instant_enabled: instantEnabled,
        scheduling_enabled: schedulingEnabled,
        prep_time: prepTime,
      });
      toast.success('Horarios de retiro guardados', { id: toastId });
    } catch (err) {
      console.error('Error saving pickup hours:', err);
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

  return (
    <div className="space-y-6">
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
            <p className="text-sm text-gray-500">Días y horas en que el local recibe pedidos.</p>
          </div>
          <div className="space-y-3">
            {Object.keys(daysTranslations).map((dayKey) =>
              renderDayRow(
                dayKey,
                businessHours[dayKey] || { open: '09:00', close: '22:00', closed: false },
                (day, closed) => setBusinessHours((prev) => ({ ...prev, [day]: { ...prev[day], closed } })),
                (day, field, value) => setBusinessHours((prev) => ({ ...prev, [day]: { ...prev[day], [field]: value } }))
              )
            )}
          </div>
          <div className="pt-2 flex justify-end">
            <Button onClick={handleSaveHours} disabled={saving} className="flex items-center gap-2 px-6 bg-black text-white font-bold hover:bg-gray-800 disabled:opacity-50">
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
              Horarios en que los clientes pueden retirar o agendar pedidos online. Fuera de estos horarios solo podrán agendar.
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
                    Permite pedir con retiro inmediato dentro del horario de retiro.
                  </p>
                </div>
              </div>
              <Switch checked={instantEnabled} onCheckedChange={setInstantEnabled} />
            </div>
            <div className="flex items-center justify-between gap-4 p-5 bg-white border border-gray-200 rounded-2xl">
              <div className="flex items-center gap-4">
                <div className="h-11 w-11 rounded-2xl bg-black text-white flex items-center justify-center shrink-0">
                  <CalendarClock className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-bold text-sm text-gray-800">Pedidos Programados</p>
                  <p className="text-xs text-gray-500 mt-0.5 max-w-sm">
                    Permite agendar el pedido para una hora futura dentro del horario de retiro.
                  </p>
                </div>
              </div>
              <Switch checked={schedulingEnabled} onCheckedChange={setSchedulingEnabled} />
            </div>
            <div className="flex items-center justify-between gap-4 p-5 bg-white border border-gray-200 rounded-2xl">
              <div className="flex items-center gap-4">
                <div className="h-11 w-11 rounded-2xl bg-black text-white flex items-center justify-center shrink-0">
                  <Timer className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-bold text-sm text-gray-800">Tiempo de preparación</p>
                  <p className="text-xs text-gray-500 mt-0.5 max-w-sm">
                    Minutos de anticipación que necesita el local antes de agendar o retirar.
                  </p>
                </div>
              </div>
              <select
                value={prepTime}
                onChange={(e) => setPrepTime(Number(e.target.value))}
                className="px-3 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-black"
              >
                {[5, 10, 15, 20, 25, 30, 40, 60].map((m) => (
                  <option key={m} value={m}>{m} min</option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-3">
            {Object.keys(daysTranslations).map((dayKey) =>
              renderDayRow(
                dayKey,
                pickupHours[dayKey] || { open: '09:00', close: '22:00', closed: false },
                (day, closed) => setPickupHours((prev) => ({ ...prev, [day]: { ...prev[day], closed } })),
                (day, field, value) => setPickupHours((prev) => ({ ...prev, [day]: { ...prev[day], [field]: value } }))
              )
            )}
          </div>
          <div className="pt-2 flex justify-end">
            <Button onClick={handleSavePickupHours} disabled={saving} className="flex items-center gap-2 px-6 bg-black text-white font-bold hover:bg-gray-800 disabled:opacity-50">
              {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
              Guardar Horarios de Retiro
            </Button>
          </div>
        </>
      )}
    </div>
  );
};

export default OrgHoursTab;
