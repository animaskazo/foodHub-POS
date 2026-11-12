import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CalendarDays, CalendarX2, Check, Clock3, CreditCard, Crown, Gift, History, Layers3, Loader2, LockKeyhole, Mail, RefreshCw, ShieldCheck, Store, Terminal } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../components/AuthContext';
import { supabase } from '../lib/supabase';
import { getSubscriptionStatus } from '../services/subscription';
import { toast } from 'sonner';
import PageHeader from '../components/ui/PageHeader';
import ConfirmModal from '../components/ui/ConfirmModal';

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

const complimentaryDateText = (value) => value
  ? new Intl.DateTimeFormat('es-CL', { dateStyle: 'long', timeZone: 'America/Santiago' }).format(new Date(value))
  : 'sin vencimiento';

const billingDateText = (value) => value
  ? new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Santiago' }).format(new Date(value))
  : 'Por confirmar';

const PLAN_DETAILS = {
  base: {
    icon: Terminal,
    description: 'Tarifa plana sin comisiones por venta.',
    features: ['POS terminal con arqueo de caja', 'Tienda online con dominio propio', 'Asistente de Inteligencia Artificial', 'Menú digital sincronizado', 'Comandas directas a cocina', 'Soporte técnico prioritario', 'Actualizaciones gratuitas'],
  },
  premium: {
    icon: Crown,
    description: 'Todo lo del Plan Base, más integración WhatsApp.',
    popular: true,
    features: ['Todo lo del Plan Base', 'Integración WhatsApp Business API', 'Integración con Uber Direct', 'Notificaciones automáticas a clientes', 'Recepción de pedidos por WhatsApp', 'Ventas directas sin comisiones por chat', 'Validación de delivery por conversación', 'Soporte técnico premium 24/7'],
  },
  pro: {
    icon: Store,
    description: 'Todo Premium, más gestión integral de salón presencial.',
    features: ['Todo lo del Plan Premium', 'Administración gráfica de mesas', 'Comandas especiales para salón', 'Control de cuentas divididas', 'Múltiples perfiles de vendedores', 'Control de propinas detallado'],
  },
};

const NOTICE_TONES = {
  info: {
    surface: 'bg-[#f5f5f7]',
    icon: 'text-[#0071e3]',
    label: 'text-[#6e6e73]',
  },
  warning: {
    surface: 'bg-[#f5f5f7]',
    icon: 'text-[#8a5a00]',
    label: 'text-[#6e6e73]',
  },
  neutral: {
    surface: 'bg-[#f5f5f7]',
    icon: 'text-[#1d1d1f]',
    label: 'text-[#6e6e73]',
  },
};

const PRIMARY_ACTION_CLASSES = 'inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-gray-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto';

function SubscriptionNotice({ tone = 'neutral', presentation = 'standard', icon: Icon, label, title, description, action }) {
  const styles = NOTICE_TONES[tone] || NOTICE_TONES.neutral;
  const isProminent = presentation === 'prominent';
  const isCompact = presentation === 'compact';
  return (
    <section className={`${styles.surface} ${isProminent ? 'rounded-[2rem]' : isCompact ? 'rounded-2xl' : 'rounded-[1.75rem]'}`}>
      <div className={`flex flex-col sm:flex-row sm:items-center sm:justify-between ${isProminent ? 'gap-6 px-6 py-7 sm:px-8 sm:py-8' : isCompact ? 'gap-4 px-5 py-4' : 'gap-5 px-6 py-6'}`}>
        <div className="flex min-w-0 items-start gap-4">
          <div className={`flex shrink-0 items-start justify-center pt-1 ${styles.icon} ${isProminent ? 'w-10' : 'w-8'}`}>
            <Icon aria-hidden="true" className={isProminent ? 'h-6 w-6' : 'h-5 w-5'} />
          </div>
          <div className="min-w-0">
            {label && <p className={`text-sm font-medium ${styles.label}`}>{label}</p>}
            <h2 className={`${label ? 'mt-1' : ''} font-semibold tracking-[-0.015em] text-[#1d1d1f] ${isProminent ? 'text-xl leading-7 sm:text-2xl sm:leading-8' : isCompact ? 'text-[15px] leading-6' : 'text-lg leading-7'}`}>{title}</h2>
            {description && <p className={`max-w-3xl text-[#6e6e73] ${isProminent ? 'mt-2 text-base leading-6' : 'mt-1 text-sm leading-6'}`}>{description}</p>}
          </div>
        </div>
        {action && <div className="shrink-0 pl-12 sm:pl-0">{action}</div>}
      </div>
    </section>
  );
}

function ExtensionRequestCard({ action }) {
  return (
    <section className="mb-6 rounded-2xl border border-gray-200 bg-white">
      <div className="flex flex-col gap-5 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex w-7 shrink-0 justify-center pt-1 text-amber-700"><Mail aria-hidden="true" className="h-5 w-5" /></div>
          <div><h2 className="text-base font-semibold text-gray-950">¿Necesitas más tiempo de prueba?</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-gray-600">Solicita una extensión y revisaremos tu caso.</p></div>
        </div>
        <div className="shrink-0 pl-10 sm:pl-0">{action}</div>
      </div>
    </section>
  );
}

const getPlanDetails = (plan) => {
  const identity = `${plan?.planId || ''} ${plan?.name || ''}`.toLocaleLowerCase('es');
  if (identity.includes('restaurant') || identity.includes('restaurante') || identity.includes('pro')) return PLAN_DETAILS.pro;
  if (identity.includes('premium')) return PLAN_DETAILS.premium;
  if (identity.includes('base')) return PLAN_DETAILS.base;
  return { icon: ShieldCheck, description: 'Plan de suscripción FoodHub.', features: ['Cobro recurrente seguro con Flow', 'Activación al confirmar el registro'] };
};

function PlanCard({ plan, processing, disabled, onSubscribe, actionLabel }) {
  const details = getPlanDetails(plan);
  const PlanIcon = details.icon;
  const isProcessing = processing === plan.planId;

  return <article className={`relative flex min-h-full flex-col rounded-2xl border p-5 ${details.popular ? 'border-gray-900 bg-gray-950 text-white shadow-lg' : 'border-gray-200 bg-white'}`}>
    {details.popular && <span className="absolute -top-3 right-5 rounded-full bg-red-500 px-3 py-1 text-xs font-semibold text-white">Más popular</span>}
    <div className="flex items-start gap-3">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${details.popular ? 'bg-white/10 text-emerald-400' : 'bg-gray-100 text-gray-900'}`}><PlanIcon aria-hidden="true" className="h-5 w-5" /></div>
      <div className="min-w-0"><h2 className="text-lg font-bold">{plan.name}</h2><p className={`mt-1 text-sm leading-5 ${details.popular ? 'text-gray-300' : 'text-gray-600'}`}>{details.description}</p></div>
    </div>

    <p className="mt-5 text-3xl font-bold tabular-nums">{flowAmountText(plan.amount, plan.currency)}<span className={`ml-1 text-sm font-normal ${details.popular ? 'text-gray-400' : 'text-gray-500'}`}>/ {flowIntervalText(plan).replace('por ', '')}</span></p>

    <ul className={`mt-5 flex-1 space-y-4 border-t pt-5 text-sm ${details.popular ? 'border-gray-700 text-gray-200' : 'border-gray-200 text-gray-700'}`}>
      {details.features.map((feature) => <li key={feature} className="flex gap-3 leading-5"><Check aria-hidden="true" className={`mt-0.5 h-4 w-4 shrink-0 ${details.popular ? 'text-emerald-400' : 'text-emerald-700'}`} /><span>{feature}</span></li>)}
    </ul>

    <button type="button" disabled={disabled || Boolean(processing)} aria-busy={isProcessing} onClick={() => onSubscribe(plan.planId)} className={`mt-7 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${details.popular ? 'bg-white text-gray-950 hover:bg-gray-100 focus-visible:ring-white focus-visible:ring-offset-gray-950' : 'bg-gray-950 text-white hover:bg-gray-800 focus-visible:ring-gray-950'}`}>
      {isProcessing ? 'Procesando…' : actionLabel || `Contratar ${plan.name}`}<ArrowRight aria-hidden="true" className="h-4 w-4" />
    </button>
  </article>;
}

export default function SubscriptionView() {
  const { organization, role, subscription: subscriptionRecord, refreshSubscription } = useAuth();
  const location = useLocation();
  const [plans, setPlans] = useState([]);
  const [processing, setProcessing] = useState(null);
  const [refreshingStatus, setRefreshingStatus] = useState(false);
  const [loading, setLoading] = useState(true);
  const [plansError, setPlansError] = useState(false);
  const [requestingExtension, setRequestingExtension] = useState(false);
  const [extensionRequested, setExtensionRequested] = useState(false);
  const [paymentHistory, setPaymentHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showOtherPlans, setShowOtherPlans] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [changingPlan, setChangingPlan] = useState(false);
  const [showCancellationConfirm, setShowCancellationConfirm] = useState(false);
  const [cancellingSubscription, setCancellingSubscription] = useState(false);
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

  useEffect(() => {
    if (!organization?.id || subscriptionRecord?.status !== 'active') {
      setPaymentHistory([]);
      return undefined;
    }
    let cancelled = false;
    const loadHistory = async () => {
      setHistoryLoading(true);
      const { data, error } = await supabase.from('subscription_payment_events')
        .select('id,flow_order,commerce_order,flow_status,amount,currency,paid_at,source,received_at')
        .eq('organization_id', organization.id)
        .order('paid_at', { ascending: false, nullsFirst: false })
        .limit(24);
      if (!cancelled) {
        if (error) {
          console.error('Error loading subscription payments:', error);
          toast.error('No se pudo cargar el historial de pagos.');
        } else {
          setPaymentHistory(data || []);
        }
        setHistoryLoading(false);
      }
    };
    loadHistory();
    return () => { cancelled = true; };
  }, [organization?.id, subscriptionRecord?.status, subscriptionRecord?.last_payment_at]);

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
    if (flowResult === 'payment_pending') toast.message('Tarjeta registrada. Estamos esperando la confirmación del primer cobro de Flow.');
    if (flowResult === 'card_failed') toast.error('No se pudo registrar la tarjeta en Flow. Puedes intentarlo otra vez.');
  }, [location.search]);

  const openFlowCheckout = async (planId) => {
    if (!planId || !organization?.id || processing) return;
    setProcessing(planId);
    try {
      const { data, error } = await supabase.functions.invoke('flow-subscription-start', {
        body: { planId },
      });
      if (error || data?.error) throw new Error(await readFunctionError(error, data));
      if (!data?.url) throw new Error('Flow no devolvió un enlace de checkout.');
      window.location.assign(data.url);
    } catch (error) {
      toast.error(error.message || 'No se pudo conectar con Flow.');
      setProcessing(null);
    }
  };

  const continuePendingCard = () => {
    if (!subscriptionRecord?.flow_plan_id) {
      toast.error('No se encontró el plan asociado. Selecciona un plan para intentarlo nuevamente.');
      return;
    }
    openFlowCheckout(subscriptionRecord.flow_plan_id);
  };

  const refreshPaymentStatus = async () => {
    if (!organization?.id || refreshingStatus) return;

    setRefreshingStatus(true);
    try {
      const { data: syncData, error: syncError } = await supabase.functions.invoke('reconcile-flow-subscriptions', { body: { source: 'manual' } });
      if (syncError || syncData?.error) throw new Error(await readFunctionError(syncError, syncData));
      const updatedSubscription = await refreshSubscription(organization.id);

      if (!updatedSubscription) {
        toast.error('No se pudo consultar el estado del pago. Intenta nuevamente.');
      } else if (updatedSubscription.status === 'active') {
        toast.success('Pago confirmado. Tu suscripción ya está activa.');
      } else if (updatedSubscription.status === 'pending_card') {
        toast.message('El registro de la tarjeta todavía está pendiente en Flow.');
      } else if (updatedSubscription.status === 'pending_payment') {
        toast.message('El pago todavía está pendiente de confirmación en Flow.');
      } else {
        toast.success('Estado de suscripción actualizado.');
      }
    } catch (error) {
      console.error('Error refreshing subscription status:', error);
      toast.error('No se pudo consultar el estado del pago. Intenta nuevamente.');
    } finally {
      setRefreshingStatus(false);
    }
  };

  const requestTrialExtension = async () => {
    if (requestingExtension || extensionRequested) return;
    setRequestingExtension(true);
    try {
      const { data, error } = await supabase.functions.invoke('request-trial-extension', { body: {} });
      if (error || data?.error) throw new Error(await readFunctionError(error, data));
      setExtensionRequested(true);
      toast.success(data?.alreadyRequested ? 'Tu solicitud ya había sido enviada.' : 'Solicitud enviada. Te contactaremos por correo.');
    } catch (error) {
      toast.error(error.message || 'No se pudo enviar la solicitud.');
    } finally {
      setRequestingExtension(false);
    }
  };

  const confirmPlanChange = async () => {
    if (!selectedPlan || changingPlan) return;
    setChangingPlan(true);
    try {
      const { data, error } = await supabase.functions.invoke('change-flow-subscription-plan', {
        body: { planId: selectedPlan.planId },
      });
      if (error || data?.error) throw new Error(await readFunctionError(error, data));
      await refreshSubscription(organization.id);
      setSelectedPlan(null);
      setShowOtherPlans(false);
      toast.success(`Cambio a ${data.planName} programado para el ${billingDateText(data.effectiveAt)}.`);
    } catch (error) {
      toast.error(error.message || 'No se pudo programar el cambio de plan.');
    } finally {
      setChangingPlan(false);
    }
  };

  const cancelSubscriptionAtPeriodEnd = async () => {
    if (cancellingSubscription || subscriptionRecord?.cancel_at_period_end) return;
    setCancellingSubscription(true);
    try {
      const { data, error } = await supabase.functions.invoke('cancel-flow-subscription', {
        body: { atPeriodEnd: true },
      });
      if (error || data?.error) throw new Error(await readFunctionError(error, data));
      await refreshSubscription(organization.id);
      setShowCancellationConfirm(false);
      setShowOtherPlans(false);
      setSelectedPlan(null);
      toast.success(`Tu suscripción finalizará el ${billingDateText(data.effectiveAt)}.`);
    } catch (error) {
      toast.error(error.message || 'No se pudo programar la cancelación.');
    } finally {
      setCancellingSubscription(false);
    }
  };

  const statusMessage = subscriptionRecord?.status === 'pending_card'
    ? 'El registro de tarjeta quedó pendiente. Continúa en Flow para completarlo.'
    : subscriptionRecord?.status === 'pending_payment'
      ? 'Flow recibió la suscripción. La activación queda pendiente de confirmación del cobro.'
      : null;

  const pendingAction = subscriptionRecord?.status === 'pending_card' ? (
    <button type="button" disabled={processing || !organization?.id} aria-busy={Boolean(processing)} onClick={continuePendingCard} className={PRIMARY_ACTION_CLASSES}>
      <CreditCard aria-hidden="true" className="h-4 w-4" />{processing ? 'Abriendo Flow…' : 'Continuar en Flow'}
    </button>
  ) : (
    <button type="button" disabled={refreshingStatus || !organization?.id} aria-busy={refreshingStatus} onClick={refreshPaymentStatus} className={PRIMARY_ACTION_CLASSES}>
      <RefreshCw aria-hidden="true" className={`h-4 w-4 ${refreshingStatus ? 'animate-spin' : ''}`} />{refreshingStatus ? 'Consultando…' : 'Verificar pago'}
    </button>
  );

  const pendingNotice = statusMessage ? (
    <SubscriptionNotice tone="warning" icon={Clock3} label="Proceso pendiente" title={subscriptionRecord?.status === 'pending_card' ? 'Completa el registro de tu tarjeta' : 'Estamos esperando la confirmación de Flow'} description={statusMessage} action={pendingAction} />
  ) : null;
  const canRequestMoreTime = subscription.status === 'expired' && ['owner', 'admin', 'manager'].includes(role);

  const pageDescription = subscription.isFree
    ? 'Revisa tu cortesía vigente o elige un plan pagado cuando lo necesites.'
    : subscriptionRecord?.status === 'active'
      ? 'Consulta el plan contratado y el estado de tu facturación.'
      : 'Compara los planes disponibles y administra el acceso de tu negocio.';

  return (
    <div className="min-h-full bg-gray-50 p-6 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <PageHeader title="Planes y facturación" subtitle={pageDescription} />

        <div>
        {subscription.isFree ? (
        <>
          {pendingNotice && <div className="mb-6">{pendingNotice}</div>}

          <article className="flex flex-col gap-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center text-emerald-700"><Gift aria-hidden="true" className="h-7 w-7" /></div>
              <div><div className="flex items-center gap-2"><h2 className="text-lg font-bold">Plan de cortesía</h2><span className="rounded-full bg-emerald-700 px-2 py-0.5 text-xs font-semibold text-white">Activo</span></div><p className="mt-1 text-sm text-emerald-900">Acceso completo otorgado por FoodHub</p></div>
            </div>
            <div className="grid gap-2 text-sm text-emerald-950 sm:grid-cols-2 md:text-right">
              <div><span className="font-semibold">Vigente hasta</span><br />{complimentaryDateText(subscriptionRecord?.free_access_ends_at)}</div>
              {subscription.daysLeft !== null && <div><span className="font-semibold">Tiempo restante</span><br />{subscription.daysLeft} {subscription.daysLeft === 1 ? 'día' : 'días'}</div>}
            </div>
          </article>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {loading ? <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-gray-400" /></div> : plansError ? (
              <div className="rounded-xl border bg-white p-8 text-center text-sm text-gray-600"><p>No se pudieron cargar los planes de Flow.</p><button type="button" onClick={retryLoadPlans} className={`${PRIMARY_ACTION_CLASSES} mt-4`}>Reintentar</button></div>
            ) : availablePlans.map((plan) => <PlanCard key={plan.planId} plan={plan} processing={processing} disabled={!organization?.id || ['pending_card', 'pending_payment', 'active'].includes(subscriptionRecord?.status)} onSubscribe={openFlowCheckout} />)}
          </div>
          {!loading && !plansError && availablePlans.length > 0 && !['pending_card', 'pending_payment', 'active'].includes(subscriptionRecord?.status) && <p className="mt-5 text-center text-sm text-gray-500">Al confirmar un plan pagado en Flow, tu cortesía finalizará inmediatamente.</p>}
        </>
      ) : subscriptionRecord?.status === 'active' ? (
        <div className="space-y-5">
          <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
            <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div className="flex min-w-0 items-start gap-3.5">
                <div className="pt-0.5 text-emerald-700"><Check aria-hidden="true" className="h-6 w-6" /></div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-gray-500">Plan contratado</p>
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">Activo</span>
                  </div>
                  <h2 className="mt-1.5 text-2xl font-bold tracking-tight text-gray-950">{subscriptionRecord?.flow_plan_name || (currentPlan ? currentPlan.name : 'FoodHub')}</h2>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    {subscriptionRecord?.flow_plan_amount && <p className="font-medium text-gray-600">{flowAmountText(subscriptionRecord.flow_plan_amount, subscriptionRecord.flow_plan_currency)} {flowIntervalText({ interval: subscriptionRecord.flow_plan_interval, interval_count: subscriptionRecord.flow_plan_interval_count })}</p>}
                    {['owner', 'admin'].includes(role) && !subscriptionRecord?.cancel_at_period_end && (
                      <>
                        {subscriptionRecord?.flow_plan_amount && <span aria-hidden="true" className="hidden h-4 w-px bg-gray-200 sm:block" />}
                        <button
                          type="button"
                          onClick={() => setShowCancellationConfirm(true)}
                          className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-gray-500 transition-colors hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700 focus-visible:ring-offset-2 sm:-my-3 sm:ml-0"
                        >
                          <CalendarX2 aria-hidden="true" className="h-3.5 w-3.5" />Cancelar suscripción
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex w-full lg:w-auto lg:justify-self-end">
                {['owner', 'admin', 'manager'].includes(role) && !subscriptionRecord?.cancel_at_period_end && (
                  <button type="button" onClick={() => setShowOtherPlans((value) => !value)} aria-expanded={showOtherPlans} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-900 transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950 focus-visible:ring-offset-2 sm:w-auto">
                    <Layers3 aria-hidden="true" className="h-4 w-4" />{showOtherPlans ? 'Ocultar planes' : 'Ver otros planes'}
                  </button>
                )}
              </div>
            </div>

            <div className="grid border-t border-gray-200 sm:grid-cols-3 sm:divide-x sm:divide-gray-200">
              <div className="flex gap-3 border-b border-gray-200 p-5 sm:border-b-0"><CalendarDays aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-gray-500" /><div><p className="text-xs font-medium uppercase tracking-wide text-gray-500">Suscrito desde</p><p className="mt-1 text-sm font-semibold text-gray-950">{billingDateText(subscriptionRecord?.subscribed_at || subscriptionRecord?.created_at)}</p></div></div>
              <div className="flex gap-3 border-b border-gray-200 p-5 sm:border-b-0"><Clock3 aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-gray-500" /><div><p className="text-xs font-medium uppercase tracking-wide text-gray-500">Próximo pago</p><p className="mt-1 text-sm font-semibold text-gray-950">{billingDateText(subscriptionRecord?.next_payment_at || subscriptionRecord?.current_period_end)}</p></div></div>
              <div className="flex gap-3 p-5"><CreditCard aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-gray-500" /><div><p className="text-xs font-medium uppercase tracking-wide text-gray-500">Medio de pago</p><p className="mt-1 text-sm font-semibold text-gray-950">{subscriptionRecord?.flow_card_last4 ? `${subscriptionRecord.flow_card_type || 'Tarjeta'} •••• ${subscriptionRecord.flow_card_last4}` : 'Registrado en Flow'}</p></div></div>
            </div>
          </section>

          {subscriptionRecord?.scheduled_plan_id && (
            <SubscriptionNotice tone="info" presentation="compact" icon={Clock3} label="Cambio programado" title={`${subscriptionRecord.scheduled_plan_name} comenzará el ${billingDateText(subscriptionRecord.scheduled_plan_change_at)}.`} />
          )}

          {subscriptionRecord?.cancel_at_period_end && (
            <SubscriptionNotice
              tone="warning"
              presentation="compact"
              icon={CalendarX2}
              label="Cancelación programada"
              title={`Tu suscripción finalizará el ${billingDateText(subscriptionRecord.cancellation_effective_at || subscriptionRecord.current_period_end)}.`}
              description="Mantendrás el acceso hasta esa fecha y no se realizarán nuevas renovaciones."
            />
          )}

          {showOtherPlans && (
            <section aria-labelledby="other-plans-title" className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
              <div className="mb-5">
                <h2 id="other-plans-title" className="text-xl font-bold text-gray-950">Otros planes</h2>
                <p className="mt-1 text-sm leading-6 text-gray-600">El cambio se aplicará en tu próximo ciclo. Hasta entonces conservarás el plan actual.</p>
              </div>
              {subscriptionRecord?.scheduled_plan_id ? (
                <p className="rounded-xl bg-gray-50 p-4 text-sm text-gray-600">Ya tienes un cambio programado. Cuando se aplique podrás seleccionar otro plan.</p>
              ) : (
                <div className="grid gap-4 md:grid-cols-3">
                  {availablePlans.filter((plan) => String(plan.planId) !== subscriptionRecord?.flow_plan_id).map((plan) => (
                    <PlanCard key={plan.planId} plan={plan} processing={changingPlan ? selectedPlan?.planId : null} disabled={changingPlan} onSubscribe={() => setSelectedPlan(plan)} actionLabel={`Cambiar a ${plan.name}`} />
                  ))}
                </div>
              )}
            </section>
          )}

          <section aria-labelledby="payment-history-title" className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
            <div className="flex items-center gap-3 border-b border-gray-200 px-5 py-5 sm:px-6">
              <History aria-hidden="true" className="h-5 w-5 text-gray-500" />
              <div><h2 id="payment-history-title" className="text-lg font-bold text-gray-950">Historial de pagos</h2><p className="mt-0.5 text-sm text-gray-500">Cobros confirmados y respaldados por Flow.</p></div>
            </div>
            {historyLoading ? (
              <div className="flex justify-center py-12"><Loader2 aria-label="Cargando pagos" className="h-6 w-6 animate-spin text-gray-400" /></div>
            ) : paymentHistory.length === 0 ? (
              <div className="px-5 py-10 text-center sm:px-6"><p className="text-sm font-medium text-gray-700">Aún no hay pagos registrados.</p><p className="mt-1 text-sm text-gray-500">Los cobros confirmados aparecerán aquí automáticamente.</p></div>
            ) : (
              <ul className="divide-y divide-gray-200">
                {paymentHistory.map((payment) => <li key={payment.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                  <div><p className="text-sm font-semibold text-gray-950">Pago de suscripción</p><p className="mt-0.5 text-sm text-gray-500">{billingDateText(payment.paid_at || payment.received_at)} · Orden #{payment.flow_order}</p></div>
                  <div className="flex items-center justify-between gap-4 sm:justify-end"><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">Pagado</span><span className="min-w-24 text-right text-sm font-bold tabular-nums text-gray-950">{flowAmountText(payment.amount, payment.currency)}</span></div>
                </li>)}
              </ul>
            )}
          </section>
        </div>
      ) : (
        <>
          <div className="mb-6">
            <h2 className="text-3xl font-semibold tracking-[-0.035em] text-[#1d1d1f]">Elige tu plan</h2>
            <p className="mt-2 text-gray-600">{subscription.isTrial ? `Tu prueba gratis termina en ${subscription.daysLeft} ${subscription.daysLeft === 1 ? 'día' : 'días'}.` : 'Tu prueba gratuita terminó. Elige un plan para continuar.'}</p>
          </div>

          {pendingNotice && <div className="mb-4">{pendingNotice}</div>}

          {canRequestMoreTime ? (
            <ExtensionRequestCard action={<button type="button" onClick={requestTrialExtension} disabled={requestingExtension || extensionRequested} aria-busy={requestingExtension} className={PRIMARY_ACTION_CLASSES}>{requestingExtension ? 'Enviando…' : extensionRequested ? 'Solicitud enviada' : 'Solicitar extensión de prueba'}</button>} />
          ) : (
            <div className="mb-6"><SubscriptionNotice tone="info" presentation="compact" icon={LockKeyhole} label="Pago seguro con Flow" title={subscription.isTrial ? 'El cobro comenzará cuando finalice tu período de prueba.' : 'Tu plan se activa solamente después de confirmar el registro.'} /></div>
          )}

          {loading ? <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-gray-400" /></div> : plansError ? (
            <div className="rounded-xl border bg-white p-8 text-center text-sm text-gray-600"><p>No se pudieron cargar los planes de Flow.</p><button type="button" onClick={retryLoadPlans} className={`${PRIMARY_ACTION_CLASSES} mt-4`}>Reintentar</button></div>
          ) : availablePlans.length === 0 ? (
            <div className="rounded-xl border bg-white p-8 text-center text-sm text-gray-600">No hay planes disponibles. Contacta al administrador de FoodHub.</div>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-3">
                {availablePlans.map((plan) => <PlanCard key={plan.planId} plan={plan} processing={processing} disabled={!organization?.id} onSubscribe={openFlowCheckout} />)}
              </div>
            </>
          )}
        </>
      )}
        </div>
      </div>
      <ConfirmModal
        isOpen={Boolean(selectedPlan)}
        onClose={() => !changingPlan && setSelectedPlan(null)}
        onConfirm={confirmPlanChange}
        loading={changingPlan}
        icon={Layers3}
        title={`Cambiar a ${selectedPlan?.name || 'este plan'}`}
        description={`El cambio se aplicará en el próximo ciclo de facturación (${billingDateText(subscriptionRecord?.next_payment_at || subscriptionRecord?.current_period_end)}). Hasta esa fecha mantendrás tu plan actual.`}
        confirmLabel="Programar cambio"
      />
      <ConfirmModal
        isOpen={showCancellationConfirm}
        onClose={() => !cancellingSubscription && setShowCancellationConfirm(false)}
        onConfirm={cancelSubscriptionAtPeriodEnd}
        loading={cancellingSubscription}
        icon={CalendarX2}
        title="Cancelar al finalizar el período"
        description={`Mantendrás el acceso hasta el ${billingDateText(subscriptionRecord?.next_payment_at || subscriptionRecord?.current_period_end)}. Después de esa fecha no se realizarán nuevas renovaciones.`}
        confirmLabel="Confirmar cancelación"
        confirmVariant="destructive"
      />
    </div>
  );
}
