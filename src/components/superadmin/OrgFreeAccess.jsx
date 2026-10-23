import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../AuthContext';
import { SettingsOptionRow } from '../ui/SettingsOptionRow';
import { Switch } from '../ui/switch';
import { Button } from '../ui/button';
import { toast } from 'sonner';

export default function OrgFreeAccess({ organizationId }) {
  const { organization, refreshSubscription } = useAuth();
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmRemoval, setConfirmRemoval] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    supabase.from('organization_subscriptions').select('organization_id, status, free_access')
      .eq('organization_id', organizationId).maybeSingle().then(({ data, error: loadError }) => {
        if (cancelled) return;
        setRecord(data);
        setError(loadError || !data ? 'No se pudo cargar la configuración de acceso.' : '');
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [organizationId, attempt]);

  const billingInProgress = ['active', 'pending_card', 'pending_payment', 'past_due'].includes(record?.status);
  const save = async (enabled) => {
    setSaving(true);
    try {
      const { data, error: saveError } = await supabase.from('organization_subscriptions')
        .update({ free_access: enabled }).eq('organization_id', organizationId)
        .select('organization_id, status, free_access').single();
      if (saveError) throw saveError;
      setRecord(data);
      setConfirmRemoval(false);
      if (organization?.id === organizationId) await refreshSubscription(organizationId);
      toast.success(enabled ? 'Acceso gratuito activado.' : 'Acceso gratuito retirado.');
    } catch (saveError) {
      toast.error(saveError.code === '23514'
        ? 'Primero debe resolverse o cancelarse la suscripción de Flow de este negocio.'
        : 'No se pudo guardar el acceso gratuito. Inténtalo de nuevo.');
    } finally { setSaving(false); }
  };

  return (
    <section className="rounded-xl border bg-gray-50 p-4 md:col-span-3" aria-busy={loading || saving}>
      <SettingsOptionRow title="Acceso gratuito" description="Permite usar FoodHub sin pagar un plan y sin vencimiento. Se aplica a todas las cuentas de este negocio."
        control={(a11y) => <Switch {...a11y} checked={Boolean(record?.free_access)} disabled={loading || saving || Boolean(error) || (!record?.free_access && billingInProgress)}
          onCheckedChange={(enabled) => enabled ? save(true) : setConfirmRemoval(true)} />} />
      {loading && <p className="mt-3 text-xs text-gray-500">Cargando acceso…</p>}
      {error && <div className="mt-3 text-sm text-red-700">{error} <Button variant="outline" onClick={() => setAttempt((value) => value + 1)}>Reintentar</Button></div>}
      {!loading && billingInProgress && !record?.free_access && <p className="mt-3 text-xs text-amber-800">Hay una suscripción o registro de tarjeta en curso. Debe resolverse o cancelarse antes de otorgar acceso gratuito. Esta opción no cancela cobros en Flow.</p>}
      {confirmRemoval && <div className="mt-4 border-t pt-4">
        <p className="text-sm text-gray-700">Al retirar el acceso gratuito se aplicará el estado anterior de la cuenta. Si la prueba venció, el negocio deberá contratar un plan para continuar.</p>
        <div className="mt-3 flex gap-2"><Button disabled={saving} onClick={() => save(false)}>{saving ? 'Guardando…' : 'Retirar acceso gratuito'}</Button><Button variant="outline" disabled={saving} onClick={() => setConfirmRemoval(false)}>Volver</Button></div>
      </div>}
    </section>
  );
}
