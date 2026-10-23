import React, { useEffect, useMemo, useState } from 'react';
import { Check, CreditCard, Loader2, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../components/AuthContext';
import { supabase } from '../lib/supabase';
import { getSubscriptionStatus } from '../services/subscription';
import { toast } from 'sonner';

const readFunctionError = async (error, data) => {
  if (data?.error) return data.error;
  const response = error?.context;
  if (response && typeof response.clone === 'function') {
    const body = await response.clone().json().catch(() => null);
    if (body?.error) return body.error;
  }
  return error?.message || 'No se pudo iniciar el checkout.';
};

const flowIntervalText = (plan) => {
  const unit = { 1: 'día', 2: 'semana', 3: 'mes', 4: 'año' }[Number(plan.interval)] || 'período';
  const count = Number(plan.interval_count) || 1;
  return count === 1 ? `por ${unit}` : `cada ${count} ${unit}s`;
};

const flowAmountText = (amount, currency = 'CLP') => {
  try {
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(amount) || 0);
  } catch {
    return `${Number(amount) || 0} ${currency}`;
  }
};

export default function SubscriptionView() {
  const { organization, subscription: subscriptionRecord, refreshSubscription } = useAuth();
  const location = useLocation();
  const [plans, setPlans] = useState([]);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [plansError, setPlansError] = useState(false);
  const subscription = useMemo(() => getSubscriptionStatus(subscriptionRecord), [subscriptionRecord]);
  const currentPlan = plans.find((plan) => String(plan.planId) === subscriptionRecord?.flow_plan_id);
  const availablePlans = plans.filter((plan) => Number(plan.status) === 1);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke('flow-subscription-plans', { body: {} });
      if (!cancelled) {
        if (error || data?.error) {
          setPlansError(true);
          toast.error(data?.error || 'No se pudieron cargar los planes de Flow.');
        } else {
          setPlans(data?.plans || []);
          setPlansError(false);
        }
        setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const retryLoadPlans = async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke('flow-subscription-plans', { body: {} });
    if (error || data?.error) {
      setPlansError(true);
      toast.error(data?.error || 'No se pudieron cargar los planes de Flow.');
    } else {
      setPlans(data?.plans || []);
      setPlansError(false);
    }
    setLoading(false);
  };

  useEffect(() => {
    const flowResult = new URLSearchParams(location.search).get('flow');
    if (flowResult === 'active') toast.success('Flow confirmó la suscripción.');
    if (flowResult === 'pending') toast.message('Flow recibió la solicitud; la suscripción está pendiente de confirmación.');
    if (flowResult === 'card_failed') toast.error('No se pudo registrar la tarjeta en Flow. Puedes intentarlo otra vez.');
  }, [location.search]);

  const continueToFlow = async () => {
    if (!selectedPlan || !organization?.id) return;
    setProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke('flow-subscription-start', {
        body: { planId: selectedPlan },
      });
      if (error || data?.error) throw new Error(await readFunctionError(error, data));
      if (!data?.url) throw new Error('Flow no devolvió un enlace de checkout.');
      window.location.assign(data.url);
    } catch (error) {
      toast.error(error.message || 'No se pudo conectar con Flow.');
      setProcessing(false);
    }
  };

  const statusMessage = subscriptionRecord?.status === 'pending_card'
    ? 'El registro de tarjeta quedó pendiente. Continúa en Flow para completarlo.'
    : subscriptionRecord?.status === 'pending_payment'
      ? 'Flow recibió la suscripción. La activación queda pendiente de confirmación del cobro.'
      : null;

  return (
    <div className="mx-auto w-full max-w-6xl px-5 pb-12 pt-6 md:px-8">
      {subscriptionRecord?.status === 'legacy_active' && <div className="mb-6 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">Esta cuenta ya existía antes de activar suscripciones y conserva su acceso.</div>}

      {subscriptionRecord?.status === 'active' || subscriptionRecord?.status === 'legacy_active' ? (
        <section className="mx-auto max-w-2xl rounded-2xl border bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-700"><Check /></div>
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Suscripción activa</p>
          <h1 className="mt-2 text-3xl font-bold">{subscriptionRecord?.flow_plan_name || (currentPlan ? `Plan ${currentPlan.name}` : 'FoodHub activo')}</h1>
          {subscriptionRecord?.flow_plan_amount && <p className="mt-2 text-gray-600">{flowAmountText(subscriptionRecord.flow_plan_amount, subscriptionRecord.flow_plan_currency)} {flowIntervalText({ interval: subscriptionRecord.flow_plan_interval, interval_count: subscriptionRecord.flow_plan_interval_count })}</p>}
          {subscriptionRecord?.flow_card_last4 && <p className="mt-3 text-sm text-gray-500">{subscriptionRecord.flow_card_type || 'Tarjeta'} terminada en {subscriptionRecord.flow_card_last4}</p>}
          <p className="mt-5 text-sm text-gray-500">La suscripción y sus pagos recurrentes se administran mediante Flow.</p>
        </section>
      ) : (
        <>
          <div className="mb-6 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
            <strong>Pago seguro con Flow.</strong> El checkout registra la tarjeta y configura la frecuencia indicada en el plan. {subscription.isTrial ? 'Si te suscribes durante la prueba, el cobro comenzará después de que termine.' : 'Tu suscripción quedará activa cuando Flow confirme el registro.'}
          </div>
          {statusMessage && <div className="mb-6 flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between"><span>{statusMessage}</span><button type="button" onClick={() => refreshSubscription(organization?.id)} className="inline-flex items-center gap-1 rounded-lg border border-amber-300 px-3 py-2 text-xs font-semibold"><RefreshCw className="h-3.5 w-3.5" />Actualizar</button></div>}

          <div className="mb-8">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-500"><Sparkles className="h-4 w-4" /> FOODHUB PARA TU NEGOCIO</div>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-950">Elige tu plan</h1>
            <p className="mt-2 text-gray-600">{subscription.isTrial ? `Tu prueba gratis termina en ${subscription.daysLeft} ${subscription.daysLeft === 1 ? 'día' : 'días'}.` : 'Tu prueba gratuita terminó. Elige un plan para continuar.'}</p>
          </div>

          {loading ? <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-gray-400" /></div> : plansError ? (
            <div className="rounded-xl border bg-white p-8 text-center text-sm text-gray-600"><p>No se pudieron cargar los planes de Flow.</p><button type="button" onClick={retryLoadPlans} className="mt-3 rounded-lg border px-4 py-2 font-semibold text-gray-900">Reintentar</button></div>
          ) : availablePlans.length === 0 ? (
            <div className="rounded-xl border bg-white p-8 text-center text-sm text-gray-600">No hay planes disponibles. Contacta al administrador de FoodHub.</div>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-3">
                {availablePlans.map((plan) => (
                  <button key={plan.planId} type="button" onClick={() => setSelectedPlan(plan.planId)} className={`relative rounded-2xl border bg-white p-6 text-left transition hover:border-gray-500 hover:shadow-md ${selectedPlan === plan.planId ? 'border-black ring-2 ring-black' : 'border-gray-200'}`}>
                    <h2 className="text-xl font-bold">{plan.name}</h2>
                    <p className="mt-2 min-h-10 text-sm text-gray-600">Suscripción de Flow · CLP</p>
                    <p className="mt-5 text-3xl font-bold">{flowAmountText(plan.amount, plan.currency)}<span className="text-sm font-normal text-gray-500"> / {flowIntervalText(plan).replace('por ', '')}</span></p>
                    <div className="mt-6 border-t pt-4 text-sm text-gray-600"><Check className="mr-2 inline h-4 w-4" /> Cobro recurrente con Flow</div>
                    <div className="mt-2 text-sm text-gray-600"><Check className="mr-2 inline h-4 w-4" /> Precio y frecuencia definidos en Flow</div>
                  </button>
                ))}
              </div>

              <section className="mt-6 flex flex-col gap-4 rounded-2xl border bg-white p-5 md:flex-row md:items-center md:justify-between">
                <div className="flex gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100"><CreditCard className="h-5 w-5" /></div><div><h3 className="font-semibold">Resumen de suscripción</h3><p className="mt-1 text-sm text-gray-500">{selectedPlan ? `${availablePlans.find((plan) => plan.planId === selectedPlan)?.name} · ${flowAmountText(availablePlans.find((plan) => plan.planId === selectedPlan)?.amount, availablePlans.find((plan) => plan.planId === selectedPlan)?.currency)} ${flowIntervalText(availablePlans.find((plan) => plan.planId === selectedPlan) || {})}` : 'Selecciona un plan para continuar.'}</p></div></div>
                <button type="button" disabled={!selectedPlan || processing} onClick={continueToFlow} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-black px-5 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-300"><ShieldCheck className="h-4 w-4" />{processing ? 'Conectando con Flow…' : 'Continuar con Flow'}</button>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
