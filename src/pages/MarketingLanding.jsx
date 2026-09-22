import React from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Utensils, Smartphone, BarChart3, Truck, Shield, Zap, ChevronRight } from 'lucide-react';

const features = [
  {
    icon: Smartphone,
    title: 'Pedidos Online',
    description: 'Tu tienda abierta 24/7. Los clientes piden desde su celular sin llamadas.',
  },
  {
    icon: Truck,
    title: 'Delivery Integrado',
    description: 'Delivery propio o directo con Uber. Todo desde un solo panel.',
  },
  {
    icon: BarChart3,
    title: 'Reportes en Tiempo Real',
    description: 'Ventas, pedidos y clientes al instante. Toma decisiones con datos.',
  },
  {
    icon: Zap,
    title: 'POS y Kitchen Display',
    description: 'Punto de venta e inteligencia de cocina para tu local.',
  },
  {
    icon: Shield,
    title: 'Pagos Seguros',
    description: 'Acepta tarjetas y pagos en línea de forma segura.',
  },
];

const steps = [
  { number: '1', title: 'Crea tu cuenta', description: 'Registra tu restaurante en minutos.' },
  { number: '2', title: 'Configura tu menú', description: 'Agrega categorías, productos y precios.' },
  { number: '3', title: 'Comparte tu enlace', description: 'Tus clientes piden desde tu tienda online.' },
];

export default function MarketingLanding() {
  return (
    <>
      <Helmet>
        <title>FoodHub - Plataforma de Pedidos Online para Restaurantes</title>
        <meta name="description" content="Crea tu tienda online. Pedidos por delivery, WhatsApp y más. POS, Kitchen Display y reportes en tiempo real." />
        <link rel="canonical" href="https://foodhub.work/" />
        <meta property="og:title" content="FoodHub - Pedidos Online para Restaurantes" />
        <meta property="og:description" content="Crea tu tienda online. Pedidos por delivery, WhatsApp y más." />
        <meta property="og:url" content="https://foodhub.work/" />
        <meta property="og:type" content="website" />
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebApplication",
            "name": "FoodHub",
            "url": "https://foodhub.work",
            "description": "Plataforma de pedidos online para restaurantes",
            "applicationCategory": "BusinessApplication",
            "operatingSystem": "Web"
          })}
        </script>
      </Helmet>

      <div className="min-h-screen bg-white">
        {/* Header */}
        <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
            <Link to="/" className="flex items-center gap-2 font-bold text-xl text-gray-900">
              <div className="flex size-8 items-center justify-center rounded-xl bg-blue-600 text-white">
                <Utensils className="size-4" />
              </div>
              FoodHub
            </Link>
            <div className="flex items-center gap-3">
              <Link to="/login" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
                Iniciar sesión
              </Link>
              <Link to="/signup" className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors">
                Comenzar gratis
              </Link>
            </div>
          </div>
        </header>

        {/* Hero */}
        <section className="relative overflow-hidden bg-gradient-to-b from-blue-50/50 to-white">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-20 pb-24 sm:pt-28 sm:pb-32">
            <div className="text-center max-w-3xl mx-auto">
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-gray-900 tracking-tight leading-tight">
                Tu restaurante{' '}
                <span className="text-blue-600">online</span>{' '}
                en minutos
              </h1>
              <p className="mt-6 text-lg sm:text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed">
                Acepta pedidos por tu tienda online, WhatsApp y delivery. POS, Kitchen Display y reportes incluidos.
              </p>
              <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link to="/signup" className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-8 py-3.5 text-base font-semibold text-white hover:bg-blue-700 transition-colors shadow-lg shadow-blue-600/20">
                  Crear mi tienda gratis
                  <ChevronRight className="ml-2 size-4" />
                </Link>
                <Link to="/login" className="inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white px-8 py-3.5 text-base font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
                  Ver demo
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="py-20 sm:py-28 bg-white">
          <div className="max-w-6xl mx-auto px-4 sm:px-6">
            <div className="text-center max-w-2xl mx-auto mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight">
                Todo lo que necesitas para vender más
              </h2>
              <p className="mt-4 text-lg text-gray-600">
                Una plataforma completa para gestionar tu restaurante y vender online.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
              {features.map((feature) => (
                <div key={feature.title} className="group relative p-6 rounded-2xl border border-gray-100 hover:border-blue-100 hover:shadow-lg hover:shadow-blue-50 transition-all">
                  <div className="flex size-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                    <feature.icon className="size-6" />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-gray-900">{feature.title}</h3>
                  <p className="mt-2 text-sm text-gray-600 leading-relaxed">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="py-20 sm:py-28 bg-gray-50">
          <div className="max-w-6xl mx-auto px-4 sm:px-6">
            <div className="text-center max-w-2xl mx-auto mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight">
                Comienza en 3 pasos
              </h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {steps.map((step) => (
                <div key={step.number} className="text-center">
                  <div className="inline-flex size-12 items-center justify-center rounded-full bg-blue-600 text-white text-lg font-bold mb-4">
                    {step.number}
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900">{step.title}</h3>
                  <p className="mt-2 text-sm text-gray-600">{step.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-20 sm:py-28 bg-white">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight">
              ¿Listo para vender más?
            </h2>
            <p className="mt-4 text-lg text-gray-600 max-w-xl mx-auto">
              Crea tu tienda online en minutos. Sin tarjeta de crédito. Cancela cuando quieras.
            </p>
            <div className="mt-10">
              <Link to="/signup" className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-8 py-3.5 text-base font-semibold text-white hover:bg-blue-700 transition-colors shadow-lg shadow-blue-600/20">
                Comenzar gratis
                <ChevronRight className="ml-2 size-4" />
              </Link>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-gray-100 py-8">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Utensils className="size-4" />
              © 2026 FoodHub. Todos los derechos reservados.
            </div>
            <div className="flex items-center gap-6 text-sm text-gray-500">
              <Link to="/login" className="hover:text-gray-900 transition-colors">Iniciar sesión</Link>
              <Link to="/signup" className="hover:text-gray-900 transition-colors">Crear cuenta</Link>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
