import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, FileText } from 'lucide-react';
import { useAuth } from '../AuthContext';

export default function IntegrationsSection() {
  const { role } = useAuth();
  const canManage = ['owner', 'admin', 'manager'].includes(role);
  return (
    <section aria-labelledby="integrations-title" className="space-y-4">
      <div>
        <h2 id="integrations-title" className="text-xl font-semibold text-gray-900">Integraciones</h2>
        <p className="mt-1 text-sm text-gray-500">Configura los servicios conectados a tu negocio.</p>
      </div>
      <article className="max-w-xl rounded-2xl border border-gray-200 bg-white p-5 md:p-6">
        <div className="flex items-center justify-between gap-3">
          <FileText className="size-6" aria-hidden="true" />
          <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">Pruebas internas</span>
        </div>
        <h3 className="mt-4 text-base font-semibold">SII · Boletas electrónicas</h3>
        <p className="mt-2 text-sm leading-relaxed text-gray-500">Configura los datos tributarios y los pedidos para emitir boletas. Prueba los montos antes de habilitar la conexión con el SII.</p>
        {canManage ? <Link to="/settings/integrations/sii" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-black px-5 py-2 text-sm font-medium text-white hover:bg-black/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black">
          Configurar SII <ArrowUpRight className="size-4" aria-hidden="true" />
        </Link> : <p className="mt-4 text-sm text-gray-500">Un administrador del negocio puede configurar esta integración.</p>}
      </article>
    </section>
  );
}
