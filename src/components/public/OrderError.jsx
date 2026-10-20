import React from 'react';

const OrderError = ({ onRetry }) => {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 bg-white min-h-[60vh]">
      <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center mb-6">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-10 h-10 text-red-600">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>
      <h2 className="text-2xl font-bold text-gray-900 mb-2">Pago rechazado</h2>
      <p className="text-gray-500 text-center max-w-md mb-8">
        No se pudo completar el pago en línea o fue cancelado. Tu pedido no ha sido enviado a la cocina.
      </p>
      <button
        onClick={onRetry}
        className="w-full max-w-xs bg-black text-white rounded-xl py-4 font-semibold hover:bg-gray-800 transition-colors"
      >
        Volver al carrito e intentar de nuevo
      </button>
    </div>
  );
};

export default OrderError;
