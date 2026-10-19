import { MessageCircle, Check, ChevronDown, X } from 'lucide-react';
import { IconButton } from '@/components/ui/IconButton';
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

import { supabase } from '../../lib/supabase';
import { useAuth } from '../AuthContext';

// business_hours tiene forma { mon: { open, close, closed }, ... }.
// Basta con que exista al menos un día con horario: si la columna nunca se
// guardó viene null y el paso queda pendiente.
const hasHours = (bh) => {
  if (!bh || typeof bh !== 'object') return false;
  const days = Object.values(bh);
  if (days.length === 0) return false;
  return days.some((d) => d && (d.open || d.close));
};

// Panel de primera vez en el dashboard: barra de progreso + 3 pasos para
// dejar la tienda vendiendo (marca, ubicación/horarios, primer producto).
// Solo se muestra mientras falte algo; con 3/3 desaparece solo.
// Avisa al padre con onStatusChange(true) mientras esté pendiente para que
// pueda blurear el resto del dashboard.
const OnboardingChecklist = ({ onStatusChange }) => {
  const { organization } = useAuth();
  const [status, setStatus] = useState(null); // null = cargando
  const [collapsed, setCollapsed] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!organization?.id) return;
    // Si el usuario lo cerró definitivamente, no vuelve a aparecer.
    // Recupera si el usuario lo había contraído.
    try {
      if (localStorage.getItem(`onboarding_dismissed_${organization.id}`) === '1') {
        setDismissed(true);
      }
      if (localStorage.getItem(`onboarding_collapsed_${organization.id}`) === '1') {
        setCollapsed(true);
      }
    } catch { /* almacenamiento no disponible */ }
    let alive = true;
    const load = async () => {
      // Se leen los errores: antes se ignoraban y cualquier fallo del conteo
      // (RLS, red, count null) dejaba el paso 3 como pendiente aunque hubiera
      // productos. Si el conteo exacto falla, se usa fallback con limit(1).
      const [{ data: org, error: orgError }, countRes] = await Promise.all([
        supabase
          .from('organizations')
          .select('logo_url, description, address, business_hours')
          .eq('id', organization.id)
          .maybeSingle(),
        supabase
          .from('products')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', organization.id),
      ]);
      if (orgError) console.error('Onboarding: error leyendo organización:', orgError.message);
      let productCount = typeof countRes?.count === 'number' ? countRes.count : null;
      if (countRes?.error) console.error('Onboarding: error contando productos:', countRes.error.message);
      if (productCount === null) {
        const fallback = await supabase
          .from('products')
          .select('id')
          .eq('organization_id', organization.id)
          .limit(1);
        if (fallback?.error) {
          console.error('Onboarding: error en fallback de productos:', fallback.error.message);
        } else {
          productCount = (fallback?.data?.length || 0) > 0 ? 1 : 0;
        }
      }
      if (!alive) return;
      setStatus({
        brand: !!(org?.logo_url && org?.description?.trim()),
        place: !!(org?.address?.trim() && hasHours(org?.business_hours)),
        product: (productCount || 0) > 0,
        missingAddress: !org?.address?.trim(),
      });
    };
    load();
    // Revalidar al volver a la pestaña: antes el estado se calculaba una sola
    // vez al montar y si el producto se creaba después quedaba pendiente.
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    window.addEventListener('focus', load);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      window.removeEventListener('focus', load);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [organization?.id]);

  const s = status;

  // Solo local (npm run dev): ?onboarding=demo fuerza el panel como si la
  // tienda estuviera vacía, para probar el blur, "Ver dashboard" y la X.
  // En prod (build) import.meta.env.DEV es false y esto nunca se activa.
  const demo = import.meta.env.DEV
    && new URLSearchParams(window.location.search).get('onboarding') === 'demo';
  const shown = demo
    ? { brand: false, place: false, product: false, missingAddress: true }
    : s;

  const steps = [
    {
      key: 'brand',
      n: 1,
      title: 'Logo y descripción',
      desc: 'Sube el logo y cuenta qué vende tu negocio.',
      done: !!shown?.brand,
      href: '/settings?tab=general',
      cta: 'Subir logo',
    },
    {
      key: 'place',
      n: 2,
      title: 'Dirección y horarios',
      desc: 'Indica dónde estás y cuándo atiendes.',
      done: !!shown?.place,
      // La dirección vive en la pestaña General y los horarios en la de
      // Horarios: el botón lleva directo a lo que falte.
      href: shown?.missingAddress ? '/settings?tab=general' : '/settings?tab=hours',
      cta: 'Agregar dirección y horarios',
    },
    {
      key: 'product',
      n: 3,
      title: 'Tu primer producto',
      desc: 'Crea el primer plato o producto de tu carta.',
      done: !!shown?.product,
      href: '/products/new?type=physical',
      cta: 'Crear producto',
    },
  ];

  const done = steps.filter((s) => s.done).length;

  useEffect(() => {
    if (dismissed) {
      onStatusChange?.(false);
      return;
    }
    if (!shown) return;
    onStatusChange?.(done < steps.length);
  }, [shown, done, dismissed, onStatusChange]);

  if (dismissed) return null;
  if (!shown) return null;
  if (done === steps.length) return null;

  const firstPending = steps.findIndex((s) => !s.done);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(`onboarding_collapsed_${organization.id}`, next ? '1' : '0');
      } catch { /* almacenamiento no disponible */ }
      return next;
    });
  };

  // Cierre definitivo: no vuelve a aparecer para esta tienda.
  const handleDismiss = () => {
    try {
      localStorage.setItem(`onboarding_dismissed_${organization.id}`, '1');
    } catch { /* almacenamiento no disponible */ }
    setDismissed(true);
  };

  return (
    <section
      aria-label="Configuración inicial de la tienda"
      className="bg-white rounded-2xl border border-gray-200 p-5 md:p-6"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base md:text-lg font-bold text-gray-900">
            Pon tu tienda en marcha
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Tres pasos para empezar a vender.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="text-sm font-bold text-gray-900 tabular-nums whitespace-nowrap">
            {done} de 3
          </div>
          <IconButton
            type="button"
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
            aria-controls="onboarding-steps"
            label={collapsed ? 'Expandir pasos de configuración' : 'Contraer pasos de configuración'}
            title={collapsed ? 'Expandir' : 'Contraer'}
            className="text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300"
           variant="ghost">
            <ChevronDown
              className={`h-4 w-4 motion-safe:transition-transform motion-safe:duration-200 ${collapsed ? "" : "rotate-180"}`}
             aria-hidden="true" />
          </IconButton>
          <IconButton
            type="button"
            onClick={handleDismiss}
            label="Cerrar y no volver a mostrar"
            title="Cerrar y no volver a mostrar"
            className="text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300"
           variant="ghost">
            <X className="h-4 w-4" aria-hidden="true" />
          </IconButton>
        </div>
      </div>

      <div
        className="mt-3 h-2.5 rounded-full bg-gray-100 overflow-hidden"
        role="progressbar"
        aria-valuenow={done}
        aria-valuemin={0}
        aria-valuemax={3}
        aria-label="Progreso de configuración de la tienda"
      >
        <div
          className="h-full rounded-full bg-emerald-500 motion-safe:transition-all motion-safe:duration-500"
          style={{ width: `${(done / 3) * 100}%` }}
        />
      </div>

      {!collapsed && (
        <ol id="onboarding-steps" className="mt-2 grid gap-1 md:gap-0 md:grid-cols-3 md:divide-x md:divide-gray-100">
        {steps.map((s, i) => (
          <li
            key={s.key}
            className="flex gap-3 rounded-xl p-3 md:rounded-none md:px-5 md:py-2 md:first:pl-0 md:last:pr-0"
          >
            <span
              aria-hidden="true"
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                s.done
                  ? 'bg-emerald-500 text-black'
                  : i === firstPending
                    ? 'bg-gray-100 text-black'
                    : 'bg-gray-100 text-gray-400'
              }`}
            >
              {s.done ? <Check className="h-4 w-4" /> : s.n}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-900">
                {s.title}{' '}
                {s.done && (
                  <span className="text-xs font-semibold text-emerald-700">Listo</span>
                )}
              </p>
              <p className="text-sm text-gray-500 mt-0.5">{s.desc}</p>
              {!s.done && (
                <Link
                  to={s.href}
                  className={`mt-2.5 inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                    i === firstPending
                      ? 'bg-gray-900 text-white hover:bg-gray-700'
                      : 'border border-gray-200 bg-white text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  {s.cta}
                </Link>
              )}
            </div>
          </li>
        ))}
        </ol>
      )}

      <div className="mt-3 flex justify-end border-t border-gray-100 pt-3">
        <a
          href="https://wa.me/56995355996?text=Hola%2C%20necesito%20ayuda%20para%20configurar%20mi%20tienda"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-normal text-gray-500 transition-colors hover:text-gray-900"
        >
          <MessageCircle className="h-4 w-4" aria-hidden="true" />
          ¿Necesitas ayuda? Escríbenos por WhatsApp</a>
      </div>
    </section>
  );
};

export default OnboardingChecklist;
