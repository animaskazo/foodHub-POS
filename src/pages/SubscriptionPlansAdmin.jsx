import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Check, Clipboard, Loader2, RefreshCw, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { formatClp } from '../services/subscription';

const cycleLabel = (plan) => {
  const unit = { 1: 'día', 2: 'semana', 3: 'mes', 4: 'año' }[Number(plan.interval)] || 'período';
  const count = Number(plan.interval_count) || 1;
  return count === 1 ? `Cada ${unit}` : `Cada ${count} ${unit}s`;
};

const amountLabel = (plan) => plan.currency === 'CLP'
  ? formatClp(plan.amount)
  : `${Number(plan.amount || 0).toLocaleString('es-CL')} ${plan.currency || ''}`;

export default function SubscriptionPlansAdmin() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState([]);
  const [callbackUrl, setCallbackUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const readPlans = useCallback(async () => {
    setLoading(true);
    setError('');
    const { data, error: invokeError } = await supabase.functions.invoke('flow-subscription-plans', { body: {} });
    if (invokeError || data?.error) {
      setError(data?.error || invokeError?.message || 'No se pudieron leer los planes de Flow.');
      setPlans([]);
    } else {
      setPlans(data?.plans || []);
      setCallbackUrl(data?.callbackUrl || '');
    }
    setLoading(false);
  }, []);

  useEffect(() => { readPlans(); }, [readPlans]);

  return (
    <div className="min-h-full bg-gray-50">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-4 py-4 md:px-8">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => navigate('/superadmin')} className="rounded-full p-2 text-gray-500 hover:bg-gray-100" aria-label="Volver al super-admin"><ArrowLeft className="h-5 w-5" /></button>
          <div><h1 className="text-lg font-bold text-gray-900 md:text-2xl">Planes de Flow</h1><p className="mt-0.5 text-xs text-gray-500 md:text-sm">Lista de planes y precios activos en la cuenta Flow</p></div>
        </div>
        <button type="button" onClick={readPlans} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}<span className="hidden sm:inline">Actualizar desde Flow</span><span className="sm:hidden">Actualizar</span>
        </button>
      </header>

      <main className="mx-auto max-w-5xl space-y-5 p-4 md:p-8">
        <section className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">
          <p className="font-semibold">Flow es la fuente de nombres, precios y frecuencias.</p>
          <p className="mt-1 text-sky-900">Esta pantalla solo consulta los planes activos con la API de Flow. Para crear o cambiar planes, hazlo en Flow; FoodHub tomará los cambios al actualizar esta lista.</p>
        </section>

        {error && <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><p className="font-semibold">No se pudieron leer los planes</p><p className="mt-1">{error}</p><p className="mt-2 text-xs">Configura en Supabase los secretos FLOW_API_KEY y FLOW_SECRET_KEY. Para pruebas usa FLOW_API_BASE_URL=https://sandbox.flow.cl/api.</p></section>}

        {callbackUrl && <section className="rounded-xl border bg-white p-4 text-sm"><p className="font-semibold text-gray-900">URL de notificación para pagos recurrentes</p><p className="mt-1 break-all font-mono text-xs text-gray-600">{callbackUrl}</p><p className="mt-2 text-xs text-gray-500">Configura esta URL como callback en cada plan dentro de Flow para recibir y validar los cobros recurrentes.</p><button type="button" onClick={() => navigator.clipboard.writeText(callbackUrl)} className="mt-3 inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"><Clipboard className="h-3.5 w-3.5" />Copiar URL</button></section>}

        <section className="overflow-hidden rounded-xl border bg-white">
          {loading ? <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div> : plans.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[650px] text-left text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr><th className="px-5 py-3">Nombre del plan</th><th className="px-5 py-3">Precio</th><th className="px-5 py-3">Frecuencia</th><th className="px-5 py-3">Trial Flow</th><th className="px-5 py-3">Notificación recurrente</th><th className="px-5 py-3">Identificador Flow</th></tr></thead>
                <tbody className="divide-y">{plans.map((plan) => <tr key={plan.planId}>
                  <td className="px-5 py-4 font-semibold text-gray-900">{plan.name}</td>
                  <td className="px-5 py-4 tabular-nums">{amountLabel(plan)}</td>
                  <td className="px-5 py-4">{cycleLabel(plan)}</td>
                  <td className="px-5 py-4">{Number(plan.trial_period_days) || 0} días</td>
                  <td className="px-5 py-4">{plan.urlCallback === callbackUrl ? <span className="inline-flex items-center gap-1 text-emerald-700"><Check className="h-4 w-4" />Configurada</span> : <span className="inline-flex items-center gap-1 text-amber-700"><X className="h-4 w-4" />Revisar en Flow</span>}</td>
                  <td className="px-5 py-4 font-mono text-xs text-gray-500">{plan.planId}</td>
                </tr>)}</tbody>
              </table>
            </div>
          ) : <div className="p-10 text-center text-sm text-gray-500">No hay planes activos en Flow.</div>}
        </section>
      </main>
    </div>
  );
}
