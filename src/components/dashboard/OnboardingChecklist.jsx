import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronDown, X } from 'lucide-react';
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
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
            aria-controls="onboarding-steps"
            aria-label={collapsed ? 'Expandir pasos de configuración' : 'Contraer pasos de configuración'}
            title={collapsed ? 'Expandir' : 'Contraer'}
            className="rounded-full p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300"
          >
            <ChevronDown
              className={`h-4 w-4 motion-safe:transition-transform motion-safe:duration-200 ${collapsed ? '' : 'rotate-180'}`}
            />
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Cerrar y no volver a mostrar"
            title="Cerrar y no volver a mostrar"
            className="rounded-full p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300"
          >
            <X className="h-4 w-4" />
          </button>
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
                  ? 'bg-emerald-500 text-white'
                  : i === firstPending
                    ? 'bg-gray-900 text-white'
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
          <svg viewBox="0 0 24 24" className="h-4 w-4 fill-[#25D366]" aria-hidden="true">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
          </svg>
          ¿Necesitas ayuda? Escríbenos por WhatsApp</a>
      </div>
    </section>
  );
};

export default OnboardingChecklist;
