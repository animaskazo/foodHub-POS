import React, { useEffect, useMemo, useState } from 'react';
import { Ban, CalendarDays, CalendarX2, Gift, History, ShieldCheck, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../AuthContext';
import { Button } from '../ui/button';
import { isComplimentaryAccessActive } from '../../services/subscription';
import { toast } from 'sonner';

const BILLING_STATES = ['active', 'pending_card', 'pending_payment', 'past_due'];
const QUICK_DURATIONS = [7, 30, 90, 365];

const formatDate = (value) => value
  ? new Intl.DateTimeFormat('es-CL', { dateStyle: 'long', timeZone: 'America/Santiago' }).format(new Date(value))
  : 'Sin vencimiento';

const readFunctionError = async (error, data) => {
  if (data?.error) return data.error;
  const response = error?.context;
  if (response && typeof response.clone === 'function') {
    const body = await response.clone().json().catch(() => null);
    if (body?.error) return body.error;
  }
  return error?.message || 'No se pudo gestionar la cortesía.';
};

export default function OrgFreeAccess({ organizationId }) {
  const { organization, refreshSubscription } = useAuth();
  const [record, setRecord] = useState(null);
  const [history, setHistory] = useState([]);
  const [durationDays, setDurationDays] = useState(30);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmRemoval, setConfirmRemoval] = useState(false);
  const [confirmCancellation, setConfirmCancellation] = useState(false);
  const [activeCancellationMode, setActiveCancellationMode] = useState(null);
  const [attempt, setAttempt] = useState(0);

  const complimentaryActive = isComplimentaryAccessActive(record);
  const complimentaryExpired = Boolean(record?.free_access && record?.free_access_ends_at && !complimentaryActive);
  const billingInProgress = BILLING_STATES.includes(record?.status);
  const daysRemaining = useMemo(() => {
    if (!complimentaryActive || !record?.free_access_ends_at) return null;
    return Math.max(0, Math.ceil((new Date(record.free_access_ends_at).getTime() - Date.now()) / 86400000));
  }, [complimentaryActive, record?.free_access_ends_at]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const [subscriptionResult, historyResult] = await Promise.all([
        supabase.from('organization_subscriptions')
          .select('organization_id, status, free_access, free_access_starts_at, free_access_ends_at, free_access_note, flow_plan_name, flow_plan_amount, flow_plan_currency, cancel_at_period_end, cancellation_effective_at, current_period_end')
          .eq('organization_id', organizationId).maybeSingle(),
        supabase.from('complimentary_access_events')
          .select('id, action, starts_at, ends_at, note, created_at')
          .eq('organization_id', organizationId)
          .order('created_at', { ascending: false })
          .limit(5),
      ]);
      if (cancelled) return;
      setRecord(subscriptionResult.data);
      setHistory(historyResult.data || []);
      const loadError = subscriptionResult.error || historyResult.error;
      setError(loadError || !subscriptionResult.data ? 'No se pudo cargar la configuración de cortesía.' : '');
      setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [organizationId, attempt]);

  const manageComplimentaryAccess = async (action) => {
    const days = Number(durationDays);
    if (action === 'grant' && (!Number.isInteger(days) || days < 1 || days > 3650)) {
      toast.error('La duración debe ser de 1 a 3650 días.');
      return;
    }

    setSaving(true);
    try {
      const baseTime = complimentaryActive && record?.free_access_ends_at
        ? new Date(record.free_access_ends_at).getTime()
        : Date.now();
      const endsAt = action === 'grant'
        ? new Date(baseTime + days * 86400000).toISOString()
        : null;
      const { data, error: invokeError } = await supabase.functions.invoke('manage-complimentary-access', {
        body: { organizationId, action, endsAt, note },
      });
      if (invokeError || data?.error) throw new Error(await readFunctionError(invokeError, data));

      setRecord(data.subscription);
      setNote('');
      setConfirmRemoval(false);
      setAttempt((value) => value + 1);
      if (organization?.id === organizationId) await refreshSubscription(organizationId);
      toast.success(action === 'grant'
        ? complimentaryActive ? 'Cortesía extendida correctamente.' : 'Plan de cortesía activado.'
        : 'Plan de cortesía revocado.');
    } catch (manageError) {
      toast.error(manageError.message || 'No se pudo gestionar la cortesía.');
    } finally {
      setSaving(false);
    }
  };

  const cancelIncompleteSubscription = async () => {
    setSaving(true);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('cancel-incomplete-subscription', {
        body: { organizationId },
      });
      if (invokeError || data?.error) throw new Error(await readFunctionError(invokeError, data));
      setRecord(data.subscription);
      setConfirmCancellation(false);
      setAttempt((value) => value + 1);
      if (organization?.id === organizationId) await refreshSubscription(organizationId);
      toast.success(data.cancelledInFlow
        ? 'La suscripción pendiente fue cancelada en Flow y eliminada.'
        : 'La solicitud inconclusa fue eliminada.');
    } catch (cancelError) {
      toast.error(cancelError.message || 'No se pudo eliminar la solicitud inconclusa.');
    } finally {
      setSaving(false);
    }
  };

  const cancelActiveSubscription = async () => {
    if (!activeCancellationMode) return;
    const atPeriodEnd = activeCancellationMode === 'period_end';
    setSaving(true);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('cancel-flow-subscription', {
        body: { organizationId, atPeriodEnd },
      });
      if (invokeError || data?.error) throw new Error(await readFunctionError(invokeError, data));
      setActiveCancellationMode(null);
      setAttempt((value) => value + 1);
      if (organization?.id === organizationId) await refreshSubscription(organizationId);
      toast.success(atPeriodEnd
        ? `Cancelación programada para el ${formatDate(data.effectiveAt)}.`
        : 'La suscripción fue cancelada inmediatamente en Flow.');
    } catch (cancelError) {
      toast.error(cancelError.message || 'No se pudo cancelar la suscripción.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-xl border bg-gray-50 p-4 md:col-span-3" aria-busy={loading || saving}>
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700"><Gift className="h-5 w-5" /></div>
        <div>
          <h3 className="font-semibold text-gray-950">Plan de cortesía</h3>
          <p className="mt-1 text-sm text-gray-600">Otorga acceso temporal sin registrar una tarjeta ni iniciar cobros en Flow.</p>
        </div>
      </div>

      {loading && <p className="mt-4 text-sm text-gray-500">Cargando cortesía…</p>}
      {error && <div className="mt-4 text-sm text-red-700">{error} <Button variant="outline" onClick={() => setAttempt((value) => value + 1)}>Reintentar</Button></div>}

      {!loading && !error && complimentaryActive && (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950">
          <div className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4" />Cortesía activa</div>
          <p className="mt-2 text-sm">Vigente hasta el {formatDate(record.free_access_ends_at)}.</p>
          {daysRemaining !== null && <p className="mt-1 text-sm">Quedan {daysRemaining} {daysRemaining === 1 ? 'día' : 'días'}.</p>}
          {record.free_access_note && <p className="mt-2 text-xs text-emerald-800">Nota: {record.free_access_note}</p>}
        </div>
      )}

      {!loading && !error && complimentaryExpired && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          La cortesía venció el {formatDate(record.free_access_ends_at)}. Puedes otorgar una nueva.
        </div>
      )}

      {!loading && !error && billingInProgress && !complimentaryActive ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          {['active', 'past_due'].includes(record?.status) ? (
            <>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-semibold text-gray-950">{record.flow_plan_name || 'Suscripción pagada activa'}</p>
                  <p className="mt-1 text-gray-700">Esta suscripción debe finalizar en Flow antes de otorgar una cortesía.</p>
                  {record.cancel_at_period_end && <p className="mt-2 font-medium text-amber-900">Cancelación programada para el {formatDate(record.cancellation_effective_at || record.current_period_end)}.</p>}
                </div>
                {!record.cancel_at_period_end && (
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button variant="outline" disabled={saving} onClick={() => setActiveCancellationMode('period_end')}><CalendarX2 className="h-4 w-4" />Cancelar al vencimiento</Button>
                    <Button variant="destructive" disabled={saving} onClick={() => setActiveCancellationMode('immediate')}><Ban className="h-4 w-4" />Cancelar ahora</Button>
                  </div>
                )}
              </div>
            </>
          ) : <p>Hay un registro de tarjeta o pago en curso. Debe resolverse o eliminarse antes de otorgar una cortesía.</p>}
          {['pending_card', 'pending_payment'].includes(record?.status) && <Button className="mt-3" variant="outline" disabled={saving} onClick={() => setConfirmCancellation(true)}><Trash2 className="h-4 w-4" />Eliminar solicitud inconclusa</Button>}
        </div>
      ) : !loading && !error && (
        <div className="mt-4 space-y-4 border-t pt-4">
          <div>
            <label htmlFor={`complimentary-days-${organizationId}`} className="text-sm font-medium text-gray-900">{complimentaryActive ? 'Días adicionales' : 'Duración'}</label>
            <div className="mt-2 flex flex-wrap gap-2">
              {QUICK_DURATIONS.map((days) => <Button key={days} type="button" variant={durationDays === days ? 'default' : 'outline'} onClick={() => setDurationDays(days)}>{days} días</Button>)}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <input id={`complimentary-days-${organizationId}`} type="number" min="1" max="3650" value={durationDays} onChange={(event) => setDurationDays(Number(event.target.value))} className="h-10 w-28 rounded-lg border border-gray-300 bg-white px-3 text-sm" />
              <span className="text-sm text-gray-500">Vencerá el {formatDate(new Date((complimentaryActive && record?.free_access_ends_at ? new Date(record.free_access_ends_at).getTime() : Date.now()) + (Number(durationDays) || 0) * 86400000))}</span>
            </div>
          </div>
          <div>
            <label htmlFor={`complimentary-note-${organizationId}`} className="text-sm font-medium text-gray-900">Nota interna (opcional)</label>
            <textarea id={`complimentary-note-${organizationId}`} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} rows={2} className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" placeholder="Ej.: cortesía comercial por apertura" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button disabled={saving} onClick={() => manageComplimentaryAccess('grant')}><CalendarDays className="h-4 w-4" />{saving ? 'Guardando…' : complimentaryActive ? 'Extender cortesía' : 'Activar cortesía'}</Button>
            {complimentaryActive && <Button variant="outline" disabled={saving} onClick={() => setConfirmRemoval(true)}>Revocar</Button>}
          </div>
        </div>
      )}

      {confirmRemoval && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4">
        <p className="text-sm text-red-900">La cuenta volverá inmediatamente a su estado de prueba o facturación anterior.</p>
        <div className="mt-3 flex gap-2"><Button disabled={saving} onClick={() => manageComplimentaryAccess('revoke')}>{saving ? 'Revocando…' : 'Confirmar revocación'}</Button><Button variant="outline" disabled={saving} onClick={() => setConfirmRemoval(false)}>Cancelar</Button></div>
      </div>}

      {confirmCancellation && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4">
        <p className="font-semibold text-red-950">¿Eliminar la solicitud inconclusa?</p>
        <p className="mt-1 text-sm text-red-900">Se invalidará el registro pendiente. Si Flow alcanzó a crear una suscripción, se cancelará inmediatamente para impedir cobros futuros.</p>
        <div className="mt-3 flex gap-2"><Button disabled={saving} onClick={cancelIncompleteSubscription}>{saving ? 'Eliminando…' : 'Sí, eliminar solicitud'}</Button><Button variant="outline" disabled={saving} onClick={() => setConfirmCancellation(false)}>Volver</Button></div>
      </div>}

      {activeCancellationMode && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4">
        <p className="font-semibold text-red-950">{activeCancellationMode === 'immediate' ? '¿Cancelar inmediatamente?' : '¿Cancelar al finalizar el período?'}</p>
        <p className="mt-1 text-sm text-red-900">{activeCancellationMode === 'immediate'
          ? 'Flow detendrá la suscripción ahora y el cliente perderá el acceso pagado. Los pagos y la auditoría se conservarán.'
          : `El cliente mantendrá el acceso hasta el ${formatDate(record?.current_period_end)} y no se realizarán nuevas renovaciones.`}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="destructive" disabled={saving} onClick={cancelActiveSubscription}>{saving ? 'Cancelando…' : activeCancellationMode === 'immediate' ? 'Sí, cancelar ahora' : 'Confirmar cancelación'}</Button>
          <Button variant="outline" disabled={saving} onClick={() => setActiveCancellationMode(null)}>Volver</Button>
        </div>
      </div>}

      {!loading && !error && history.length > 0 && <div className="mt-5 border-t pt-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-700"><History className="h-4 w-4" />Historial reciente</div>
        <div className="mt-2 space-y-2">
          {history.map((event) => <div key={event.id} className="flex flex-col justify-between gap-1 rounded-lg bg-white px-3 py-2 text-xs text-gray-600 sm:flex-row"><span><strong className="text-gray-800">{event.action === 'grant' ? 'Otorgada' : event.action === 'extend' ? 'Extendida' : 'Revocada'}</strong>{event.ends_at ? ` · hasta ${formatDate(event.ends_at)}` : ''}</span><span>{formatDate(event.created_at)}</span></div>)}
        </div>
      </div>}
    </section>
  );
}
