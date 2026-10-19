import React, { useEffect, useState } from 'react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { MessageCircle, Loader2, MessageSquareOff } from 'lucide-react';
import { supabase } from '../lib/supabase';

const ConversationsView = () => {
  useDocumentTitle('Conversaciones');
  const [inboxUrl, setInboxUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadInbox = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const { data: staff } = await supabase
          .from('staff')
          .select('organization_id')
          .eq('id', session.user.id)
          .single();

        if (!staff) return;

        const { data: org } = await supabase
          .from('organizations')
          .select('whatsapp_inbox_url, whatsapp_inbox_enabled')
          .eq('id', staff.organization_id)
          .single();

        if (org?.whatsapp_inbox_enabled && org?.whatsapp_inbox_url) {
          setInboxUrl(org.whatsapp_inbox_url);
        } else {
          setError('not_enabled');
        }
      } catch (err) {
        console.error('Error loading inbox:', err);
        setError('error');
      } finally {
        setLoading(false);
      }
    };

    loadInbox();
  }, []);

  if (loading) {
    return (
      <Loader2 className="h-8 w-8 animate-spin" />
    );
  }

  if (error || !inboxUrl) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-6">
        <MessageSquareOff className="mb-5 h-10 w-10" />
        <h2 className="text-xl font-bold text-gray-900 mb-2">
          Inbox de WhatsApp no disponible
        </h2>
        <p className="text-gray-500 max-w-md">
          El inbox de conversaciones de WhatsApp aún no ha sido habilitado para tu negocio.
          Contacta al administrador de la plataforma para activarlo.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <header className="border-b px-4 md:px-6 py-4 shrink-0 flex items-center gap-3">
        <MessageCircle className="h-5 w-5" />
        <div>
          <h1 className="text-lg font-bold text-gray-900">Conversaciones WhatsApp</h1>
          <p className="text-xs text-gray-500">Visualiza y responde los mensajes de tus clientes</p>
        </div>
      </header>

      {/* Iframe */}
      <div className="flex-1 min-h-0">
        <iframe
          src={inboxUrl}
          className="w-full h-full border-0"
          title="WhatsApp Inbox"
          allow="clipboard-write"
        />
      </div>
    </div>
  );
};

export default ConversationsView;
