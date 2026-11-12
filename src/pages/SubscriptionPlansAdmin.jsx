import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowLeft, Check, Clipboard, Loader2, Mail, RefreshCw, Send, Users, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { formatClp } from '../services/subscription';
import { toast } from 'sonner';

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
  const [sendingPreview, setSendingPreview] = useState(false);
  const [audience, setAudience] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [campaignBusy, setCampaignBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const invokeAnnouncement = async (action, extra = {}) => {
    const { data, error: invokeError } = await supabase.functions.invoke('send-subscription-announcement', { body: { action, ...extra } });
    if (invokeError || data?.error) throw new Error(data?.error || invokeError?.message || 'No se pudo administrar la campaña.');
    return data;
  };

  const readCampaigns = useCallback(async () => {
    try {
      const data = await invokeAnnouncement('status');
      setCampaigns(data.campaigns || []);
    } catch (campaignError) {
      console.error('Error reading announcement campaigns:', campaignError);
    }
  }, []);

  const previewAudience = async () => {
    setCampaignBusy(true);
    try {
      const data = await invokeAnnouncement('preview');
      setAudience(data);
      setConfirmOpen(true);
    } catch (previewError) {
      toast.error(previewError.message || 'No se pudo preparar la audiencia.');
    } finally {
      setCampaignBusy(false);
    }
  };

  const continueCampaign = async (campaignId, action = 'process') => {
    setCampaignBusy(true);
    try {
      let progress = await invokeAnnouncement(action, { campaignId });
      while (progress.remaining > 0) progress = await invokeAnnouncement('process', { campaignId });
      await readCampaigns();
      toast.success(progress.failed ? `Campaña finalizada con ${progress.failed} envío(s) fallido(s).` : 'Campaña enviada a todos los destinatarios.');
    } catch (campaignError) {
      toast.error(campaignError.message || 'La campaña se interrumpió. Puedes continuarla desde el historial.');
      await readCampaigns();
    } finally {
      setCampaignBusy(false);
    }
  };

  const startCampaign = async () => {
    setConfirmOpen(false);
    setCampaignBusy(true);
    const toastId = toast.loading('Creando campaña y congelando destinatarios…');
    try {
      const progress = await invokeAnnouncement('start');
      toast.loading(`Enviados ${progress.sent} de ${audience?.recipientCount || 0}…`, { id: toastId });
      let current = progress;
      while (current.remaining > 0) {
        current = await invokeAnnouncement('process', { campaignId: progress.campaignId });
        toast.loading(`Enviados ${current.sent} de ${audience?.recipientCount || 0}…`, { id: toastId });
      }
      await readCampaigns();
      if (current.failed) toast.warning(`Campaña finalizada: ${current.sent} enviados y ${current.failed} fallidos.`, { id: toastId });
      else toast.success(`Campaña enviada a ${current.sent} clientes.`, { id: toastId });
    } catch (campaignError) {
      toast.error(campaignError.message || 'No se pudo iniciar la campaña.', { id: toastId });
      await readCampaigns();
    } finally {
      setCampaignBusy(false);
    }
  };

  const sendAnnouncementPreview = async () => {
    if (sendingPreview) return;
    setSendingPreview(true);
    const toastId = toast.loading('Enviando prueba del anuncio…');
    try {
      const data = await invokeAnnouncement('test');
      toast.success(`Prueba enviada a ${data.recipient}`, { id: toastId });
    } catch (sendError) {
      toast.error(sendError.message || 'No se pudo enviar la prueba.', { id: toastId });
    } finally {
      setSendingPreview(false);
    }
  };

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

  useEffect(() => { readPlans(); readCampaigns(); }, [readPlans, readCampaigns]);

  const statusLabel = { queued: 'En espera', running: 'En curso', completed: 'Completada', partial_failed: 'Con errores', failed: 'Fallida' };

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

        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
          <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-4"><Mail className="mt-0.5 h-6 w-6 shrink-0 text-gray-900" aria-hidden="true" /><div><p className="font-semibold text-gray-950">Anuncio del sistema de suscripciones</p><p className="mt-1 max-w-2xl text-sm leading-6 text-gray-500">Primero prueba el contenido. Cuando esté aprobado, prepara la lista y confirma el envío a un contacto principal por negocio.</p></div></div>
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
              <button type="button" onClick={sendAnnouncementPreview} disabled={sendingPreview || campaignBusy} aria-busy={sendingPreview} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:cursor-wait disabled:opacity-50">{sendingPreview ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}{sendingPreview ? 'Enviando…' : 'Enviar prueba'}</button>
              <button type="button" onClick={previewAudience} disabled={campaignBusy || campaigns.some((item) => ['queued', 'running'].includes(item.status))} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gray-950 px-4 text-sm font-semibold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50">{campaignBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}Preparar envío</button>
            </div>
          </div>
          {campaigns.length > 0 && <div className="border-t border-gray-100 bg-gray-50/70 px-5 py-4"><div className="mb-3 flex items-center justify-between"><p className="text-sm font-semibold text-gray-900">Historial de campañas</p><button type="button" onClick={readCampaigns} className="text-xs font-semibold text-gray-500 hover:text-gray-900">Actualizar</button></div><div className="space-y-2">{campaigns.slice(0, 4).map((campaign) => {
            const processed = campaign.sent_count + campaign.failed_count;
            const progress = campaign.total_recipients ? Math.round((processed / campaign.total_recipients) * 100) : 0;
            return <div key={campaign.id} className="rounded-xl border border-gray-200 bg-white p-3"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-semibold text-gray-900">{statusLabel[campaign.status] || campaign.status} · {campaign.sent_count} de {campaign.total_recipients} enviados</p><p className="mt-0.5 text-xs text-gray-500">{new Date(campaign.created_at).toLocaleString('es-CL')}{campaign.failed_count ? ` · ${campaign.failed_count} fallidos` : ''}</p></div><div className="flex gap-2">{campaign.status === 'running' && <button type="button" onClick={() => continueCampaign(campaign.id)} disabled={campaignBusy} className="rounded-lg border px-3 py-2 text-xs font-semibold hover:bg-gray-50">Continuar</button>}{['partial_failed', 'failed'].includes(campaign.status) && <button type="button" onClick={() => continueCampaign(campaign.id, 'retry')} disabled={campaignBusy} className="rounded-lg border px-3 py-2 text-xs font-semibold hover:bg-gray-50">Reintentar fallidos</button>}</div></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${progress}%` }} /></div></div>;
          })}</div></div>}
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

      {confirmOpen && audience && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirmOpen(false); }}><div role="dialog" aria-modal="true" aria-labelledby="campaign-confirm-title" className="w-full max-w-lg rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-medium text-gray-500">Confirmar campaña</p><h2 id="campaign-confirm-title" className="mt-1 text-2xl font-bold tracking-tight text-gray-950">Enviar a {audience.recipientCount} clientes</h2></div><button type="button" onClick={() => setConfirmOpen(false)} className="grid h-11 w-11 place-items-center rounded-full text-gray-500 hover:bg-gray-100" aria-label="Cerrar confirmación"><X className="h-5 w-5" /></button></div><p className="mt-4 text-sm leading-6 text-gray-600">Se enviará un correo al dueño o administrador principal de cada negocio activo. La lista quedará guardada para auditoría antes de comenzar.</p><dl className="mt-5 grid grid-cols-3 gap-2 rounded-2xl bg-gray-50 p-4 text-center"><div><dt className="text-xs text-gray-500">Negocios</dt><dd className="mt-1 text-xl font-bold">{audience.activeBusinesses}</dd></div><div><dt className="text-xs text-gray-500">Destinatarios</dt><dd className="mt-1 text-xl font-bold">{audience.recipientCount}</dd></div><div><dt className="text-xs text-gray-500">Excluidos</dt><dd className="mt-1 text-xl font-bold">{audience.missingContact + audience.duplicateEmails}</dd></div></dl>{audience.sample?.length > 0 && <div className="mt-5"><p className="text-xs font-semibold text-gray-500">Muestra de destinatarios</p><ul className="mt-2 divide-y rounded-xl border px-3">{audience.sample.map((item) => <li key={`${item.organization_name}-${item.email}`} className="flex items-center justify-between gap-3 py-2 text-xs"><span className="font-medium text-gray-800">{item.organization_name}</span><span className="truncate text-gray-500">{item.email}</span></li>)}</ul></div>}<div className="mt-5 flex gap-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" /><p>Esta acción enviará correos reales. Los fallidos podrán reintentarse sin duplicar los ya enviados.</p></div><div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={() => setConfirmOpen(false)} className="min-h-11 rounded-xl border px-5 text-sm font-semibold text-gray-700 hover:bg-gray-50">Cancelar</button><button type="button" onClick={startCampaign} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gray-950 px-5 text-sm font-semibold text-white hover:bg-gray-800"><Send className="h-4 w-4" />Enviar a {audience.recipientCount} clientes</button></div></div></div>}
    </div>
  );
}
