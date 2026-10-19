import { TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import React from 'react';

const OrderError = ({ onRetry }) => {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 bg-white min-h-[60vh]">
      <TriangleAlert className="mb-6 w-10 h-10" aria-hidden="true" />
      <h2 className="text-2xl font-bold text-gray-900 mb-2">Pago rechazado</h2>
      <p className="text-gray-500 text-center max-w-md mb-8">
        No se pudo completar el pago en línea o fue cancelado. Tu pedido no ha sido enviado a la cocina.
      </p>
      <Button
        onClick={onRetry}
        className="w-full max-w-xs bg-black text-white hover:bg-gray-800 transition-colors"
       variant="default" size="default">
        Volver al carrito e intentar de nuevo
      </Button>
    </div>
  );
};

export default OrderError;
