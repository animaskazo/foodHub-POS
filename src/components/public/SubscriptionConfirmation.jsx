import { Button } from '@/components/ui/button';
import React from 'react';
import { CheckCircle2 } from 'lucide-react';

const SubscriptionConfirmation = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[100dvh] bg-violet-50 px-6 text-center">
      <CheckCircle2 className="mb-5 h-8 w-8" strokeWidth={2} />
      <h1 className="text-2xl font-black text-gray-900 leading-snug">
        ¡Gracias por suscribirte a FoodHub!
      </h1>
      <p className="text-base text-gray-600 font-medium mt-3">
        Inicia sesión ahora para comenzar.
      </p>
      <Button
        onClick={() => (window.location.href = '/login')}
        className="mt-8 w-full max-w-xs bg-black text-white hover:bg-gray-800 transition-colors active:scale-[0.98]"
       variant="default" size="default">
        Iniciar sesión
      </Button>
    </div>
  );
};

export default SubscriptionConfirmation;
