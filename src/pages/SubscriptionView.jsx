import React, { useMemo, useState } from 'react';
import { Check, CreditCard, ShieldCheck, Sparkles } from 'lucide-react';
import { useAuth } from '../components/AuthContext';
import { getSubscriptionStatus, saveMockSubscription, SUBSCRIPTION_PLANS, formatClp } from '../services/subscriptionDemo';

export default function SubscriptionView() {
  const { organization } = useAuth();
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [completed, setCompleted] = useState(false);
  const subscription = useMemo(() => getSubscriptionStatus(organization?.id), [organization?.id, completed]);
  const currentPlan = SUBSCRIPTION_PLANS.find((plan) => plan.id === subscription.state?.planId);

  const simulatePayment = async () => {
    if (!selectedPlan || !organization?.id) return;
    setProcessing(true);
    await new Promise((resolve) => setTimeout(resolve, 900));
    saveMockSubscription(organization.id, selectedPlan);
    setCompleted(true);
    setProcessing(false);
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-5 pb-12 pt-6 md:px-8">
      <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        <strong>Modo de demostración:</strong> el pago se simula en este navegador. Flow aún no está conectado.
      </div>

      {completed || currentPlan ? (
        <section className="mx-auto max-w-2xl rounded-2xl border bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-700"><Check /></div>
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Suscripción activa</p>
          <h1 className="mt-2 text-3xl font-bold">Plan {currentPlan?.name || SUBSCRIPTION_PLANS.find((plan) => plan.id === selectedPlan)?.name}</h1>
          <p className="mt-2 text-gray-600">{formatClp(currentPlan?.price || SUBSCRIPTION_PLANS.find((plan) => plan.id === selectedPlan)?.price)} al mes</p>
          <p className="mt-5 text-sm text-gray-500">Estado simulado para probar el flujo. La activación real dependerá de la confirmación de Flow.</p>
        </section>
      ) : (
        <>
          <div className="mb-8">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-500"><Sparkles className="h-4 w-4" /> FOODHUB PARA TU NEGOCIO</div>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-950">Elige tu plan</h1>
            <p className="mt-2 text-gray-600">{subscription.isActive ? `Tu prueba gratis termina en ${subscription.daysLeft} ${subscription.daysLeft === 1 ? 'día' : 'días'}.` : 'Tu prueba gratuita terminó. Elige un plan para continuar.'} Sin ingresar una tarjeta durante la prueba.</p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {SUBSCRIPTION_PLANS.map((plan) => (
              <button
                key={plan.id}
                type="button"
                onClick={() => setSelectedPlan(plan.id)}
                className={`relative rounded-2xl border bg-white p-6 text-left transition hover:border-gray-500 hover:shadow-md ${selectedPlan === plan.id ? 'border-black ring-2 ring-black' : 'border-gray-200'} ${plan.featured ? 'md:-translate-y-1' : ''}`}
              >
                {plan.featured && <span className="absolute right-4 top-4 rounded-full bg-black px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white">Más elegido</span>}
                <h2 className="text-xl font-bold">{plan.name}</h2>
                <p className="mt-2 min-h-10 text-sm text-gray-600">{plan.description}</p>
                <p className="mt-5 text-3xl font-bold">{formatClp(plan.price)}<span className="text-sm font-normal text-gray-500"> / mes</span></p>
                <div className="mt-6 border-t pt-4 text-sm text-gray-600"><Check className="mr-2 inline h-4 w-4" /> Sin comisión por venta</div>
                <div className="mt-2 text-sm text-gray-600"><Check className="mr-2 inline h-4 w-4" /> Cancela cuando quieras</div>
              </button>
            ))}
          </div>

          <section className="mt-6 flex flex-col gap-4 rounded-2xl border bg-white p-5 md:flex-row md:items-center md:justify-between">
            <div className="flex gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100"><CreditCard className="h-5 w-5" /></div>
              <div><h3 className="font-semibold">Resumen de suscripción</h3><p className="mt-1 text-sm text-gray-500">{selectedPlan ? `${SUBSCRIPTION_PLANS.find((plan) => plan.id === selectedPlan)?.name} · ${formatClp(SUBSCRIPTION_PLANS.find((plan) => plan.id === selectedPlan)?.price)} mensual` : 'Selecciona un plan para continuar.'}</p></div>
            </div>
            <button type="button" disabled={!selectedPlan || processing} onClick={simulatePayment} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-black px-5 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-300">
              <ShieldCheck className="h-4 w-4" /> {processing ? 'Procesando pago de prueba…' : 'Continuar al pago'}
            </button>
          </section>
        </>
      )}
    </div>
  );
}
