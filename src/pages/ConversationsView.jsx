import React, { useCallback, useEffect, useState } from 'react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Instagram, MessageCircle, RefreshCw, Settings2, Send, Bot, UserRound, AlertCircle, Loader2, ArrowLeft } from 'lucide-react';
import { supabase } from '../lib/supabase';

const fmt = (date) => date ? new Intl.DateTimeFormat('es-CL', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(date)) : '';
const button = 'rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50';
const InstagramInbox = () => {
  const [organizationId, setOrganizationId] = useState(null);
  const [connection, setConnection] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [mobileThread, setMobileThread] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) throw new Error('Inicia sesión para acceder a tus conversaciones.');
      const { data: staff, error: staffError } = await supabase.from('staff').select('organization_id').eq('id', user.id).single();
      if (staffError || !staff?.organization_id) throw new Error('No se encontró un negocio asociado a tu usuario.');
      setOrganizationId(staff.organization_id);
      const [connectionResult, conversationsResult] = await Promise.all([
        // Connection status is served by a privileged function, not a direct read of credentials.
        supabase.functions.invoke('instagram-connection-status'),
        supabase.from('channel_conversations').select('id,channel,customer_display_name,external_customer_id,last_message_preview,last_message_at,unread_count,mode').eq('organization_id', staff.organization_id).eq('channel', 'instagram').order('last_message_at', { ascending: false }).limit(100),
      ]);
      if (connectionResult.error) setConnection({ status: 'unavailable' });
      else setConnection(connectionResult.data ?? { status: 'disconnected' });
      if (conversationsResult.error) throw conversationsResult.error;
      setConversations(conversationsResult.data ?? []);
    } catch (err) {
      setError(err.message || 'No fue posible cargar Instagram.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!selected || !organizationId) { setMessages([]); return; }
    let active = true;
    const refresh = async () => {
      const { data, error: queryError } = await supabase.from('channel_messages')
        .select('id,direction,sender_type,body,created_at,delivery_status')
        .eq('organization_id', organizationId).eq('conversation_id', selected)
        .order('created_at', { ascending: true }).limit(200);
      if (active) {
        if (queryError) setError(queryError.message);
        else setMessages(data ?? []);
      }
    };
    refresh();
    const subscription = supabase.channel('instagram-inbox-' + selected)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'channel_messages', filter: 'conversation_id=eq.' + selected }, refresh)
      .subscribe();
    return () => { active = false; supabase.removeChannel(subscription); };
  }, [selected, organizationId]);

  const beginConnect = async () => {
    setBusy(true); setError('');
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('instagram-oauth-start');
      if (invokeError) throw invokeError;
      if (!data?.authorization_url) throw new Error('La conexión de Meta aún no está configurada.');
      const url = new URL(data.authorization_url);
      if (url.protocol !== 'https:' || !['www.instagram.com', 'instagram.com', 'www.facebook.com', 'facebook.com'].includes(url.hostname)) throw new Error('URL de autorización inválida.');
      window.location.assign(url.toString());
    } catch (err) { setError(err.message || 'No se pudo iniciar sesión con Instagram.'); setBusy(false); }
  };
  const send = async (event) => {
    event.preventDefault();
    if (!draft.trim() || !selected || busy) return;
    setBusy(true); setError('');
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('instagram-send-message', {
        body: { conversation_id: selected, text: draft.trim() },
      });
      if (invokeError) throw invokeError;
      if (!data?.sent) throw new Error(data?.error || 'No se confirmó el envío del mensaje.');
      setDraft('');
      const { data: latest } = await supabase.from('channel_messages').select('id,direction,sender_type,body,created_at,delivery_status')
        .eq('conversation_id', selected).eq('organization_id', organizationId).order('created_at', { ascending: true }).limit(200);
      if (latest) setMessages(latest);
    } catch (err) { setError(err.message || 'No se pudo enviar el mensaje.'); }
    finally { setBusy(false); }
  };
  const active = conversations.find(c => c.id === selected);
  return (
    <div className="flex h-full min-h-0 flex-col bg-white text-gray-950">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-4 md:px-6">
        <div className="flex items-center gap-3"><Instagram className="h-6 w-6" /><div><h1 className="text-xl font-semibold">Instagram</h1><p className="text-sm text-gray-500">Conexión y mensajes directos de tu negocio</p></div></div>
        <button className={button + ' flex items-center gap-2 border'} onClick={() => { setLoading(true); load(); }}><RefreshCw size={16} /> Actualizar</button>
      </header>
      {error && <div role="alert" className="mx-4 mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"><AlertCircle size={17} className="shrink-0" />{error}</div>}
      {loading ? <div className="flex flex-1 items-center justify-center"><Loader2 className="animate-spin" /></div> : (
        <>
          <section className="m-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-gray-50 p-4 md:mx-6">
            <div className="flex items-center gap-3"><Settings2 size={20}/><div><p className="font-medium">Conexión de Instagram</p><p className="text-sm text-gray-600">{connection?.status === 'connected' ? 'Conectado' + (connection.username ? ' · @' + connection.username : '') : connection?.status === 'unavailable' ? 'Servicio de conexión pendiente de configuración' : 'No conectado'}</p></div></div>
            {connection?.status !== 'connected' && <button disabled={busy} onClick={beginConnect} className={button + ' bg-black text-white'}>{busy ? 'Conectando…' : 'Conectar Instagram'}</button>}
          </section>
          <div className="flex min-h-0 flex-1 border-t">
            <aside className={(mobileThread ? 'hidden md:flex' : 'flex') + ' w-full flex-col border-r md:w-80 lg:w-96'}>
              <div className="border-b p-4 font-semibold">Mensajes <span className="text-sm font-normal text-gray-500">({conversations.length})</span></div>
              <div className="min-h-0 flex-1 overflow-auto">
                {conversations.length === 0 && <p className="p-6 text-center text-sm text-gray-500">Aún no hay mensajes de Instagram. Las conversaciones aparecerán aquí cuando esté activa la integración.</p>}
                {conversations.map(c => <button key={c.id} onClick={() => { setSelected(c.id); setMobileThread(true); }} className={'w-full border-b p-4 text-left hover:bg-gray-50 ' + (selected === c.id ? 'bg-gray-100' : '')}>
                  <div className="flex items-center justify-between gap-2"><span className="truncate font-medium">{c.customer_display_name || 'Cliente de Instagram'}</span><span className="text-xs text-gray-500">{fmt(c.last_message_at)}</span></div>
                  <p className="mt-1 truncate text-sm text-gray-500">{c.last_message_preview || 'Sin vista previa'}</p>
                  <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">{c.mode === 'human' ? <UserRound size={13}/> : <Bot size={13}/>} {c.mode === 'human' ? 'Atención humana' : 'Agente IA'}{c.unread_count > 0 && <span className="ml-auto rounded-full bg-black px-2 py-0.5 text-white">{c.unread_count}</span>}</div>
                </button>)}
              </div>
            </aside>
            <main className={(mobileThread ? 'flex' : 'hidden md:flex') + ' min-w-0 flex-1 flex-col'}>
              {!active ? <div className="flex flex-1 items-center justify-center p-8 text-center text-gray-500">Selecciona una conversación para ver sus mensajes.</div> : <>
                <div className="flex items-center gap-3 border-b p-4"><button aria-label="Volver a conversaciones" className="md:hidden" onClick={() => setMobileThread(false)}><ArrowLeft size={20}/></button><div className="min-w-0"><p className="truncate font-semibold">{active.customer_display_name || 'Cliente de Instagram'}</p><p className="text-xs text-gray-500">{active.mode === 'human' ? 'Atención humana' : 'Agente IA activo'}</p></div></div>
                <div className="flex-1 space-y-3 overflow-auto bg-gray-50 p-4">
                  {messages.length === 0 && <p className="text-center text-sm text-gray-500">Aún no hay mensajes en esta conversación.</p>}
                  {messages.map(m => <div key={m.id} className={'flex ' + (m.direction === 'outbound' ? 'justify-end' : 'justify-start')}><div className={'max-w-[85%] rounded-xl p-3 text-sm ' + (m.direction === 'outbound' ? 'bg-gray-900 text-white' : 'border bg-white')}><p className="whitespace-pre-wrap break-words">{m.body || 'Mensaje multimedia'}</p><p className={'mt-1 text-xs ' + (m.direction === 'outbound' ? 'text-gray-300' : 'text-gray-500')}>{fmt(m.created_at)} · {m.sender_type === 'agent' ? 'IA' : m.sender_type === 'staff' ? 'Equipo' : 'Cliente'}</p></div></div>)}
                </div>
                <form onSubmit={send} className="flex gap-2 border-t p-3"><input aria-label="Responder mensaje" value={draft} onChange={e => setDraft(e.target.value)} placeholder="Escribe una respuesta…" className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm" /><button disabled={!draft.trim() || busy || connection?.status !== 'connected'} className={button + ' flex items-center gap-2 bg-black text-white'}><Send size={16}/> Enviar</button></form>
                {active.mode !== 'human' && <p className="px-3 pb-2 text-xs text-amber-700">La atención automática está activa. El cambio a atención humana estará disponible cuando se habilite el servicio de control.</p>}
              </>}
            </main>
          </div>
        </>
      )}
    </div>
  );
};

const ConversationsView = () => {
  useDocumentTitle('Conversaciones');
  const [tab, setTab] = useState('instagram');
  const [inboxUrl, setInboxUrl] = useState(null);
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data: staff } = await supabase.from('staff').select('organization_id').eq('id', user.id).single();
      if (!staff) return;
      const { data: org } = await supabase.from('organizations').select('whatsapp_inbox_url,whatsapp_inbox_enabled').eq('id', staff.organization_id).single();
      if (org?.whatsapp_inbox_enabled && org.whatsapp_inbox_url) setInboxUrl(org.whatsapp_inbox_url);
    });
  }, []);
  return <div className="flex h-full min-h-0 flex-col bg-white">
    <nav aria-label="Canales" className="flex gap-2 border-b px-4 py-3 md:px-6">
      <button className={button + (tab === 'instagram' ? ' bg-black text-white' : ' border')} onClick={() => setTab('instagram')}><Instagram size={16} className="mr-2 inline"/>Instagram</button>
      <button className={button + (tab === 'whatsapp' ? ' bg-black text-white' : ' border')} onClick={() => setTab('whatsapp')}><MessageCircle size={16} className="mr-2 inline"/>WhatsApp</button>
    </nav>
    <div className="min-h-0 flex-1">{tab === 'instagram' ? <InstagramInbox/> : inboxUrl ? <iframe src={inboxUrl} className="h-full w-full border-0" title="WhatsApp Inbox" allow="clipboard-write"/> : <div className="flex h-full items-center justify-center p-8 text-center text-gray-500">El inbox de WhatsApp no está habilitado para tu negocio.</div>}</div>
  </div>;
};
export default ConversationsView;
