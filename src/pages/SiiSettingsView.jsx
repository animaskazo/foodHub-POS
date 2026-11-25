import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, FileText, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../components/AuthContext';
import PageHeader from '../components/ui/PageHeader';
import { Button } from '../components/ui/button';
import { getSiiWorkspace, saveSiiProfile, simulateSiiReceipt } from '../services/siiService';
import { calculateSimulation, decideReceiptEmission, SII_CHANNELS } from '../utils/sii';

const emptyProfile = {
  rut: '', legal_name: '', business_activity: '', address: '', commune: '',
  emission_channels: [], emission_model: 'unconfirmed', terminal_document: 'unconfirmed', online_document: 'unconfirmed',
};
const newItem = () => ({ name: '', quantity: 1, unit_price: 1000 });
const money = value => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(value);
const inputClass = 'mt-2 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-base outline-none focus:ring-2 focus:ring-black';

export default function SiiSettingsView() {
  const { organization, role } = useAuth();
  const orgId = organization?.id;
  const canManage = ['owner', 'admin', 'manager'].includes(role);
  const [profile, setProfile] = useState(emptyProfile);
  const [savedProfile, setSavedProfile] = useState(null);
  const [simulations, setSimulations] = useState([]);
  const [items, setItems] = useState([newItem()]);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [selected, setSelected] = useState(null);
  const [previewChannel, setPreviewChannel] = useState('online');
  const [previewMethod, setPreviewMethod] = useState('online_gateway');
  const [previewPaid, setPreviewPaid] = useState(true);
  const activeOrg = useRef(orgId);
  activeOrg.current = orgId;
  const submitting = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setProfile(emptyProfile);
    setSavedProfile(null);
    setSimulations([]);
    setSelected(null);
    setItems([newItem()]);
    setRequestId(crypto.randomUUID());
    if (!orgId || !canManage) { setLoading(false); return; }
    getSiiWorkspace(orgId).then(data => {
      if (cancelled) return;
      setProfile({ ...emptyProfile, ...data.profile });
      setSavedProfile(data.profile);
      setSimulations(data.simulations);
    }).catch(err => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [orgId, canManage]);

  let totals = null;
  try { totals = calculateSimulation(items); } catch { /* Form explains required values. */ }
  const profileDirty = Object.keys(emptyProfile).some(key => JSON.stringify(profile[key]) !== JSON.stringify(savedProfile?.[key]));
  const decision = decideReceiptEmission(profile, {
    order_type: previewChannel === 'pos' ? 'pickup' : previewChannel,
    status: 'confirmed', total: 10000,
    payments: [{ method: previewMethod, amount: 10000, status: previewPaid ? 'paid' : 'pending' }],
  });

  const updateItem = (index, key, value) => {
    setItems(current => current.map((item, i) => i === index ? { ...item, [key]: value } : item));
    setRequestId(crypto.randomUUID());
  };

  const save = async event => {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setBusy('save');
    try {
      const result = await saveSiiProfile(orgId, profile);
      if (activeOrg.current !== orgId) return;
      setProfile(result);
      setSavedProfile(result);
      toast.success('Datos del emisor guardados');
    } catch (err) { if (activeOrg.current === orgId) toast.error(err.message); }
    finally { submitting.current = false; setBusy(''); }
  };

  const simulate = async event => {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setBusy('simulate');
    try {
      const result = await simulateSiiReceipt(orgId, requestId, items);
      if (activeOrg.current !== orgId) return;
      setSimulations(current => [result, ...current.filter(row => row.id !== result.id)].slice(0, 20));
      setSelected(result);
      toast.success('Simulación guardada. Sin envío al SII.');
    } catch (err) { if (activeOrg.current === orgId) toast.error(err.message); }
    finally { submitting.current = false; setBusy(''); }
  };

  if (!orgId || !canManage) return <p className="p-6">Selecciona un negocio con permisos de administración para configurar su emisor.</p>;

  return (
    <div className="mx-auto w-full max-w-5xl p-4 md:p-8">
      <Link to="/settings?tab=integrations" className="mb-4 inline-flex min-h-11 items-center text-sm text-gray-600 underline underline-offset-4 hover:text-black">Volver a Integraciones</Link>
      <PageHeader title="Boletas electrónicas" subtitle="Prepara los datos de tu negocio y prueba los montos antes de conectar con el SII." />
      <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-5">
        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold">Pruebas internas</span>
        <p className="mt-3 text-sm text-gray-600">Las simulaciones no tienen validez tributaria, no consumen folios y no se envían al SII.</p>
        <ol className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <li className="flex items-center gap-2">{savedProfile ? <Check className="size-4" aria-hidden="true" /> : '1.'} Configurar emisor</li>
          <li className="text-gray-500">2. Obtener set y CAF de certificación</li>
          <li className="text-gray-500">3. Validar firma y envío al SII</li>
        </ol>
        <a className="mt-4 inline-block text-sm underline underline-offset-4" href="https://www.sii.cl/servicios_online/1039-guia_emitir_boleta_servicio-1184.html" target="_blank" rel="noreferrer">Solicitar set de pruebas en el SII</a>
      </div>
      {loading ? <p role="status">Cargando configuración…</p> : error ? <p role="alert" className="rounded-xl border border-red-200 p-4 text-sm text-red-700">{error}</p> : (
        <div className="space-y-8">
          <section>
            <h2 className="text-lg font-semibold">Datos del emisor</h2>
            <p className="mt-1 text-sm text-gray-500">Configuración exclusiva de {organization.name}. Certificado digital y CAF se incorporarán en la siguiente etapa.</p>
            <form onSubmit={save} className="mt-4 rounded-2xl border border-gray-200 bg-white p-5">
              <fieldset disabled={!!busy} className="grid gap-4 sm:grid-cols-2">
                {Object.entries({ rut: 'RUT de la empresa', legal_name: 'Razón social', business_activity: 'Giro', address: 'Dirección', commune: 'Comuna' }).map(([key, label]) => (
                  <label key={key} className="text-sm font-medium">{label}
                    <input className={inputClass} value={profile[key]} required maxLength={key === 'rut' ? 12 : 100}
                      placeholder={key === 'rut' ? '76.123.456-0' : undefined}
                      onChange={event => setProfile(current => ({ ...current, [key]: event.target.value }))} />
                  </label>
                ))}
              </fieldset>
              <fieldset disabled={!!busy} className="mt-6 space-y-5 border-t border-gray-100 pt-6">
                <legend className="float-left mb-4 w-full text-base font-semibold">Cuándo emitir boletas</legend>
                <p className="clear-both text-sm text-gray-500">Selecciona los canales que gestionará FoodHub. La emisión se evaluará al confirmar el pago completo, según el medio de pago y el modelo del negocio.</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  {SII_CHANNELS.map(channel => <label key={channel.value} className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 p-4">
                    <input type="checkbox" className="mt-1 size-4 accent-black" checked={profile.emission_channels.includes(channel.value)} onChange={e => {
                      const checked = e.target.checked;
                      setProfile(current => ({ ...current, emission_channels: checked ? [...current.emission_channels, channel.value].sort() : current.emission_channels.filter(value => value !== channel.value) }));
                    }} />
                    <span><span className="block text-sm font-medium">{channel.label}</span><span className="mt-1 block text-xs leading-relaxed text-gray-500">{channel.description}</span></span>
                  </label>)}
                </div>
                <p className="text-xs text-gray-500">Desactivar un canal solo desactiva la emisión automática de FoodHub; sus ventas deben documentarse por el sistema que corresponda.</p>
                <label className="block text-sm font-medium">Modelo registrado en el SII
                  <select className={inputClass} value={profile.emission_model} onChange={e => setProfile(current => ({ ...current, emission_model: e.target.value }))}>
                    <option value="unconfirmed">Pendiente de confirmar</option>
                    <option value="voucher_replaces_receipt">El voucher reemplaza la boleta en pagos electrónicos</option>
                    <option value="always_receipt">Siempre emito boleta, incluso con pago electrónico</option>
                  </select>
                </label>
                <p className="text-xs text-gray-500">Esta selección debe coincidir con la declaración de tu negocio en el SII. Guardarla aquí no modifica esa declaración.</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  {Object.entries({ terminal_document: 'Pagos con tarjeta en máquina de venta', online_document: 'Pagos por pasarela online' }).map(([key, label]) => <label key={key} className="block text-sm font-medium">{label}
                    <select className={inputClass} value={profile[key]} disabled={profile.emission_model === 'always_receipt'} onChange={e => setProfile(current => ({ ...current, [key]: e.target.value }))}>
                      <option value="unconfirmed">Pendiente de confirmar con el operador</option>
                      <option value="voucher">El operador entrega voucher válido como boleta</option>
                      <option value="foodhub">El operador no cubre la boleta; la emitirá FoodHub</option>
                    </select>
                  </label>)}
                </div>
                <p className="text-sm text-gray-600">Efectivo y transferencia: FoodHub emitiría boleta en los canales seleccionados. Los pagos electrónicos pueden estar cubiertos por un voucher, también en ventas online. Los pagos mixtos con cobertura parcial requieren revisión.</p>
                {profile.emission_model === 'always_receipt' && <p className="text-sm text-gray-600">Con el modelo “Siempre emito boleta”, FoodHub emitiría en todos los medios de pago de los canales seleccionados, aunque exista voucher.</p>}
                <a className="inline-block text-sm underline underline-offset-4" href="https://www.sii.cl/destacados/boleta_electronica_voucher/" target="_blank" rel="noreferrer">Revisar boletas, voucher y modelo de emisión en el SII</a>
              </fieldset>
              <Button type="submit" className="mt-5" loading={busy === 'save'} disabled={!!busy || !profileDirty}>Guardar datos</Button>
            </form>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-5" aria-labelledby="sii-policy-preview">
            <h2 id="sii-policy-preview" className="text-lg font-semibold">Probar regla de emisión</h2>
            <p className="mt-1 text-sm text-gray-500">Ejemplo de un pedido por $10.000 usando la configuración del formulario. Es una vista previa; no emite documentos.</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <label className="text-sm font-medium">Canal
                <select className={inputClass} value={previewChannel} onChange={e => setPreviewChannel(e.target.value)}>{SII_CHANNELS.map(channel => <option key={channel.value} value={channel.value}>{channel.label}</option>)}</select>
              </label>
              <label className="text-sm font-medium">Medio de pago
                <select className={inputClass} value={previewMethod} onChange={e => setPreviewMethod(e.target.value)}>
                  <option value="online_gateway">Pasarela online</option><option value="card">Tarjeta en máquina de venta</option><option value="cash">Efectivo</option><option value="transfer">Transferencia</option>
                </select>
              </label>
              <label className="text-sm font-medium">Estado del pago
                <select className={inputClass} value={String(previewPaid)} onChange={e => setPreviewPaid(e.target.value === 'true')}><option value="true">Confirmado</option><option value="false">Pendiente</option></select>
              </label>
            </div>
            <p role="status" className="mt-4 rounded-xl bg-gray-50 p-4 text-sm text-gray-700">{decision.message}</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Simular boleta afecta</h2>
            <p className="mt-1 text-sm text-gray-500">Precios con IVA incluido (19%). Cantidades y precios enteros en pesos chilenos.</p>
            {!savedProfile && <p className="mt-3 text-sm text-gray-600">Guarda los datos del emisor para habilitar la simulación.</p>}
            {savedProfile && profileDirty && <p className="mt-3 text-sm text-gray-600">Guarda los cambios del emisor antes de simular.</p>}
            <form onSubmit={simulate} className="mt-4 rounded-2xl border border-gray-200 bg-white p-5">
              <fieldset disabled={!!busy || !savedProfile || profileDirty} className="space-y-4">
                {items.map((item, index) => (
                  <div key={index} className="grid grid-cols-2 items-end gap-3 border-b border-gray-100 pb-4 sm:grid-cols-[1fr_90px_140px_44px]">
                    <label className="col-span-2 text-sm font-medium sm:col-span-1">Producto {index + 1}
                      <input className={inputClass} value={item.name} required maxLength={80} onChange={e => updateItem(index, 'name', e.target.value)} />
                    </label>
                    <label className="text-sm font-medium">Cantidad
                      <input className={inputClass} type="number" inputMode="numeric" min={1} max={10000} step={1} required value={item.quantity} onChange={e => updateItem(index, 'quantity', e.target.value === '' ? '' : Number(e.target.value))} />
                    </label>
                    <label className="text-sm font-medium">Precio con IVA
                      <input className={inputClass} type="number" inputMode="numeric" min={1} max={100000000} step={1} required value={item.unit_price} onChange={e => updateItem(index, 'unit_price', e.target.value === '' ? '' : Number(e.target.value))} />
                    </label>
                    <Button variant="ghost" size="icon" aria-label={`Quitar producto ${index + 1}`} disabled={items.length === 1} onClick={() => { setItems(current => current.filter((_, i) => i !== index)); setRequestId(crypto.randomUUID()); }}><Trash2 className="size-4" /></Button>
                  </div>
                ))}
                <Button variant="outline" disabled={items.length >= 50} onClick={() => { setItems(current => [...current, newItem()]); setRequestId(crypto.randomUUID()); }}><Plus className="size-4" /> Agregar producto</Button>
                {totals && <dl className="ml-auto max-w-xs space-y-2 text-sm">
                  {[['Neto', totals.net], ['IVA (19%)', totals.vat], ['Total', totals.total]].map(([label, value]) => <div className="flex justify-between gap-5" key={label}><dt>{label}</dt><dd className="font-semibold">{money(value)}</dd></div>)}
                </dl>}
                <Button type="submit" loading={busy === 'simulate'} disabled={!totals || !!busy}><FileText className="size-4" /> Guardar simulación</Button>
              </fieldset>
            </form>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Últimas simulaciones</h2>
            <p className="mt-1 text-sm text-gray-500">Una misma prueba se guarda una sola vez. Cambia los productos para crear otra.</p>
            {simulations.length === 0 ? <p className="mt-4 text-sm text-gray-500">Aún no hay simulaciones.</p> : <ul className="mt-4 divide-y divide-gray-100 rounded-2xl border border-gray-200 bg-white">
              {simulations.map(row => <li key={row.id}><button type="button" onClick={() => setSelected(row)} className="flex w-full items-center justify-between gap-3 rounded-xl p-4 text-left hover:bg-gray-50 focus-visible:outline-2">
                <span><span className="block text-sm font-medium">Simulación · {row.id.slice(0, 8)}</span><span className="text-xs text-gray-500">{new Date(row.created_at).toLocaleString('es-CL', { timeZone: 'America/Santiago' })} · Sin envío al SII</span></span><span className="shrink-0 text-sm font-semibold">{money(row.total)}</span>
              </button></li>)}
            </ul>}
            {selected && <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-5" role="region" aria-label="Detalle de simulación">
              <h3 className="font-semibold">Prueba interna · Sin validez tributaria</h3>
              <p className="mt-2 text-sm">{selected.issuer_snapshot.legal_name} · {selected.issuer_snapshot.rut}</p>
              <p className="mt-1 text-xs text-gray-500">{selected.issuer_snapshot.address}, {selected.issuer_snapshot.commune} · Sin folio tributario</p>
              <ul className="my-4 space-y-2 text-sm">{selected.items.map((item, index) => <li className="flex justify-between gap-4" key={index}><span>{item.quantity} × {item.name}</span><span>{money(item.quantity * item.unit_price)}</span></li>)}</ul>
              <p className="text-sm">Neto {money(selected.net)} · IVA {money(selected.vat)}</p>
              <p className="mt-2 font-semibold">Total {money(selected.total)}</p>
            </div>}
          </section>
        </div>
      )}
    </div>
  );
}
