import React from 'react';
import { CheckCircle2 } from 'lucide-react';

const SubscriptionConfirmation = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[100dvh] bg-violet-50 px-6 text-center">
      <div className="w-16 h-16 bg-violet-600 rounded-full flex items-center justify-center mb-5 shadow-lg shadow-violet-200">
        <CheckCircle2 className="h-8 w-8 text-white" strokeWidth={2.5} />
      </div>
      <h1 className="text-2xl font-black text-gray-900 leading-snug">
        ¡Gracias por suscribirte a FoodHub!
      </h1>
      <p className="text-base text-gray-600 font-medium mt-3">
        Inicia sesión ahora para comenzar.
      </p>
      <button
        onClick={() => (window.location.href = '/login')}
        className="mt-8 w-full max-w-xs bg-black text-white font-bold py-4 rounded-full hover:bg-gray-800 transition-colors active:scale-[0.98]"
      >
        Iniciar sesión
      </button>
    </div>
  );
};

export default SubscriptionConfirmation;