import React, { useState, useEffect } from 'react';
import { Banknote, CreditCard, CheckCircle2 } from 'lucide-react';
import Modal from '../ui/Modal';

const PaymentModal = ({ isOpen, onClose, cartItems, onConfirm }) => {
  const [status, setStatus] = useState('idle'); // 'idle' | 'success'

  // Restablecer el estado cada vez que se abre el modal
  useEffect(() => {
    if (isOpen) {
      setStatus('idle');
    }
  }, [isOpen]);

  const subtotal = cartItems.reduce((acc, i) => acc + (i.price * i.quantity), 0);
  const tax = Math.round(subtotal * 0.19);
  const total = subtotal + tax;

  const fmt = (n) => n.toLocaleString('es-CL');

  const paymentMethods = [
    { id: 'cash', name: 'Efectivo', icon: Banknote, color: 'bg-green-100 text-green-600' },
    { id: 'debit', name: 'Débito', icon: CreditCard, color: 'bg-blue-100 text-blue-600' },
    { id: 'credit', name: 'Crédito', icon: CreditCard, color: 'bg-purple-100 text-purple-600' },
  ];

  const handlePayment = (methodId) => {
    setStatus('success');
    setTimeout(() => {
      onConfirm(methodId);
    }, 2000); // 2 seconds animation before closing
  };

  if (status === 'success') {
    return (
      <Modal 
        isOpen={isOpen} 
        onClose={onClose} 
        hideHeader={true} 
        customAnimation="popIn 0.5s cubic-bezier(0.16, 1, 0.3, 1)"
        maxWidth="max-w-sm"
        className="rounded-[2rem] p-10 items-center justify-center text-center"
      >
        <div className="relative mb-6 mx-auto w-max">
          <div className="absolute inset-0 bg-green-400 rounded-full animate-ping opacity-20"></div>
          <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center relative z-10 shadow-inner"
               style={{ animation: 'scaleUp 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) 0.1s both' }}>
            <CheckCircle2 className="h-12 w-12 text-green-500" strokeWidth={2.5} />
          </div>
        </div>
        
        <h2 className="text-3xl font-black text-gray-900 mb-2 tracking-tight" style={{ animation: 'slideUp 0.5s ease-out 0.2s both' }}>
          ¡Pago Exitoso!
        </h2>
        <p className="text-gray-500 font-medium text-center text-lg" style={{ animation: 'slideUp 0.5s ease-out 0.3s both' }}>
          Orden procesada correctamente
        </p>

        <style>{`
          @keyframes popIn {
            0% { opacity: 0; transform: scale(0.95) translateY(10px); }
            100% { opacity: 1; transform: scale(1) translateY(0); }
          }
          @keyframes scaleUp {
            0% { opacity: 0; transform: scale(0.5) rotate(-10deg); }
            50% { transform: scale(1.1) rotate(5deg); }
            100% { opacity: 1; transform: scale(1) rotate(0); }
          }
          @keyframes slideUp {
            0% { opacity: 0; transform: translateY(15px); }
            100% { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </Modal>
    );
  }

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      title="Confirmar Pago" 
      maxWidth="max-w-md"
    >
      <div className="p-6 flex flex-col gap-6">
        <div className="flex flex-col items-center justify-center p-4 bg-gray-50 rounded-2xl border border-gray-100">
          <span className="text-sm text-gray-500 font-medium mb-1">Total a Pagar</span>
          <span className="text-4xl font-black text-gray-900">${fmt(total)}</span>
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider ml-1">Método de Pago</h3>
          <div className="grid grid-cols-1 gap-3">
            {paymentMethods.map((method) => (
              <button
                key={method.id}
                onClick={() => handlePayment(method.id)}
                className="flex items-center p-4 bg-white border-2 border-gray-100 rounded-2xl hover:border-blue-500 hover:bg-blue-50/50 transition-all group text-left active:scale-[0.98]"
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mr-4 ${method.color}`}>
                  <method.icon className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <span className="font-bold text-lg text-gray-800 group-hover:text-blue-700">{method.name}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default PaymentModal;
