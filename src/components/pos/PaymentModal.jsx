import React, { useState, useEffect } from 'react';
import { Banknote, CreditCard, CheckCircle2, Coffee, Package, Loader2 } from 'lucide-react';
import Modal from '../ui/Modal';

const PaymentModal = ({ isOpen, onClose, cartItems, onConfirm }) => {
  const [status, setStatus] = useState('idle'); // 'idle' | 'success'
  const [orderNumber, setOrderNumber] = useState(null);
  const [orderType, setOrderType] = useState('table'); // 'table' | 'takeaway'
  const [processingMethod, setProcessingMethod] = useState(null);

  // Restablecer el estado cada vez que se abre el modal
  useEffect(() => {
    if (isOpen) {
      setStatus('idle');
      setOrderNumber(null);
      setOrderType('table');
      setProcessingMethod(null);
    }
  }, [isOpen]);

  const total = cartItems.reduce((acc, i) => acc + (Math.round(i.price * 1.19) * i.quantity), 0);
  const subtotal = Math.round(total / 1.19);
  const tax = total - subtotal;

  const fmt = (n) => n.toLocaleString('es-CL');

  const paymentMethods = [
    { id: 'cash', name: 'Efectivo', icon: Banknote },
    { id: 'debit', name: 'Débito', icon: CreditCard },
    { id: 'credit', name: 'Crédito', icon: CreditCard },
  ];

  const handlePayment = async (methodId) => {
    if (processingMethod) return; // Evitar multiples clicks
    setProcessingMethod(methodId);
    try {
      const order = await onConfirm(methodId, orderType);
      if (order) {
        setOrderNumber(order.order_number);
        setStatus('success');
        setTimeout(() => {
          onClose();
        }, 3000); // 3 seconds animation before closing
      } else {
        setProcessingMethod(null);
      }
    } catch (e) {
      // error handled by parent
      setProcessingMethod(null);
    }
  };

  if (status === 'success') {
    return (
      <Modal 
        isOpen={isOpen} 
        onClose={onClose} 
        hideHeader={true} 
        customAnimation="slideUpReceipt 0.6s cubic-bezier(0.16, 1, 0.3, 1)"
        maxWidth="max-w-sm"
        className="rounded-[2rem] p-10 pt-16 pb-12 items-center justify-center text-center flex flex-col"
      >
        <div className="relative mb-6 mx-auto w-max" style={{ animation: 'bounceIn 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) 0.2s both' }}>
          <div className="absolute inset-0 bg-blue-400 rounded-full animate-ping opacity-20"></div>
          <div className="w-24 h-24 bg-blue-500 rounded-full flex items-center justify-center relative z-10 shadow-lg">
            <CheckCircle2 className="h-12 w-12 text-white" strokeWidth={2.5} />
          </div>
        </div>
        
        <h2 className="text-3xl font-black text-gray-900 mb-2 tracking-tight" style={{ animation: 'fadeUp 0.5s ease-out 0.4s both' }}>
          ¡Pago Exitoso!
        </h2>
        {orderNumber && (
          <p className="text-blue-600 font-bold text-xl mb-1" style={{ animation: 'fadeUp 0.5s ease-out 0.5s both' }}>
            Orden #{orderNumber}
          </p>
        )}
        <p className="text-gray-500 font-medium text-center text-lg" style={{ animation: 'fadeUp 0.5s ease-out 0.6s both' }}>
          Enviada a preparación
        </p>

        <style>{`
          @keyframes slideUpReceipt {
            0% { opacity: 0; transform: translateY(40px) scale(0.95); }
            100% { opacity: 1; transform: translateY(0) scale(1); }
          }
          @keyframes bounceIn {
            0% { opacity: 0; transform: scale(0.3); }
            50% { transform: scale(1.1); }
            70% { transform: scale(0.9); }
            100% { opacity: 1; transform: scale(1); }
          }
          @keyframes fadeUp {
            0% { opacity: 0; transform: translateY(10px); }
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
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider ml-1">Tipo de Pedido</h3>
          <div className="grid grid-cols-2 gap-3 mb-6">
            <button
              onClick={() => setOrderType('table')}
              className={`flex items-center justify-center p-4 rounded-2xl border-2 transition-all ${
                orderType === 'table'
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-100 bg-white text-gray-500 hover:border-gray-200'
              }`}
            >
              <Coffee className={`h-5 w-5 mr-2 ${orderType === 'table' ? 'text-blue-600' : 'text-gray-400'}`} />
              <span className="font-bold">Para Servir</span>
            </button>
            <button
              onClick={() => setOrderType('takeaway')}
              className={`flex items-center justify-center p-4 rounded-2xl border-2 transition-all ${
                orderType === 'takeaway'
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-100 bg-white text-gray-500 hover:border-gray-200'
              }`}
            >
              <Package className={`h-5 w-5 mr-2 ${orderType === 'takeaway' ? 'text-blue-600' : 'text-gray-400'}`} />
              <span className="font-bold">Para Llevar</span>
            </button>
          </div>

          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider ml-1">Método de Pago</h3>
          <div className="grid grid-cols-1 gap-3">
            {paymentMethods.map((method) => (
              <button
                key={method.id}
                onClick={() => handlePayment(method.id)}
                disabled={processingMethod !== null}
                className={`flex items-center p-4 bg-white border-2 rounded-2xl transition-all text-left ${
                  processingMethod && processingMethod !== method.id
                    ? 'border-gray-100 opacity-50 cursor-not-allowed grayscale'
                    : processingMethod === method.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-100 hover:border-blue-500 hover:bg-blue-50/50 active:scale-[0.98] group'
                }`}
              >
                {processingMethod === method.id ? (
                  <Loader2 className="h-6 w-6 text-blue-600 mr-4 animate-spin" />
                ) : (
                  <method.icon className={`h-6 w-6 mr-4 ${processingMethod ? 'text-gray-400' : 'text-gray-900'}`} />
                )}
                <div className="flex-1">
                  <span className={`font-bold text-lg ${
                    processingMethod === method.id 
                      ? 'text-blue-700' 
                      : processingMethod 
                        ? 'text-gray-400' 
                        : 'text-gray-800 group-hover:text-blue-700'
                  }`}>
                    {method.name}
                  </span>
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
