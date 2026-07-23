import React from 'react';
import { Link } from 'react-router-dom';
import { Utensils } from 'lucide-react';

export default function AuthLayout({ children }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <div className="flex justify-center gap-2 md:justify-start">
          <Link to="/" className="flex items-center gap-2 font-medium">
            <div className="flex size-8 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Utensils className="size-4" />
            </div>
            FoodHub
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-xs">
            {children}
          </div>
        </div>
      </div>
      <div className="relative hidden bg-muted lg:flex overflow-hidden">
        <img
          src="https://images.unsplash.com/photo-1601914511505-b7be18cd88fa?q=100&w=2000&auto=format&fit=crop"
          alt="FoodHub background"
          className="absolute inset-0 h-full w-[125%] max-w-none object-cover dark:brightness-[0.2] dark:grayscale animate-zoom animate-pan"
        />
        {/* Dark overlay for text readability */}
        <div className="absolute inset-0 bg-black/30" />
        {/* Testimonial */}
        <div className="relative z-10 flex flex-col justify-end h-full w-full p-10 text-white">
          <blockquote className="space-y-4 max-w-lg">
            <p className="text-xl leading-relaxed font-medium">
              "Desde que usamos FoodHub en la cafetería, los errores en los pedidos desaparecieron y el equipo trabaja mucho más feliz. Ha sido un cambio increíble."
            </p>
            <footer className="text-sm font-normal opacity-90 tracking-wide">
              — Carlos M., Dueño de Cafetería
            </footer>
          </blockquote>
        </div>
      </div>
    </div>
  );
}
