import React, { useState, useEffect } from 'react';
import { Banknote, CreditCard, CheckCircle2, Coffee, Package, Loader2 } from 'lucide-react';
import Modal from '../ui/Modal';
import { Button } from '../ui/button';

const PaymentModal = ({ isOpen, onClose, cartItems, onConfirm, onSaveCustomer, confirmOnly = false, confirmTotal = null }) => {
  const [status, setStatus] = useState('idle'); // 'idle' | 'success'
  const [orderNumber, setOrderNumber] = useState(null);
  const [orderId, setOrderId] = useState(null);
  const [orderType, setOrderType] = useState('table'); // 'table' | 'pickup'
  const [processingMethod, setProcessingMethod] = useState(null);

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [isSavingCustomer, setIsSavingCustomer] = useState(false);

  // Restablecer el estado cada vez que se abre el modal
  useEffect(() => {
    if (isOpen) {
      setStatus('idle');
      setOrderNumber(null);
      setOrderId(null);
      setOrderType('table');
      setProcessingMethod(null);
      setCustomerName('');
      setCustomerPhone('');
      setIsSavingCustomer(false);
    }
  }, [isOpen]);

  const total = cartItems.reduce((acc, i) => acc + (Math.round(i.price) * i.quantity), 0);
  const subtotal = Math.round(total / 1.19);
  const tax = total - subtotal;

  const fmt = (n) => n.toLocaleString('es-CL');

  const paymentMethods = [
    { id: 'cash', name: 'Efectivo', icon: Banknote },
    { id: 'card', name: 'Tarjeta (Déb/Créd)', icon: CreditCard },
    { id: 'transfer', name: 'Transferencia', icon: CreditCard },
  ];

  const handlePayment = async (methodId) => {
    if (processingMethod) return;
    setProcessingMethod(methodId);
    try {
      if (confirmOnly) {
        // Dashboard mode: just confirm the payment method, no order creation
        await onConfirm(methodId);
        onClose();
      } else {
        const order = await onConfirm(methodId, orderType);
        if (order) {
          setOrderNumber(order.order_number);
          setOrderId(order.id);
          setStatus('success');
        } else {
          setProcessingMethod(null);
        }
      }
    } catch (e) {
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
        maxWidth="max-w-xl"
        className="rounded-[2rem] p-8 pt-12 pb-10 items-center justify-center text-center flex flex-col"
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

        <div className="w-full text-left mt-6" style={{ animation: 'fadeUp 0.5s ease-out 0.7s both' }}>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Guardar datos del cliente (Opcional)</h3>
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <input 
              type="text" 
              placeholder="Nombre del cliente" 
              className="w-full sm:w-1/2 px-4 py-3 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-blue-500 focus:outline-none transition-colors"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
            />
            <input 
              type="tel" 
              placeholder="Teléfono" 
              className="w-full sm:w-1/2 px-4 py-3 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-blue-500 focus:outline-none transition-colors"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
            />
          </div>

          <div className="flex gap-3">
            <Button 
              variant="outline"
              size="lg"
              onClick={() => onClose()}
              className="flex-1"
            >
              Omitir
            </Button>
            <Button 
              variant="default"
              size="lg"
              onClick={async () => {
                if (!customerName && !customerPhone) {
                  onClose();
                  return;
                }
                setIsSavingCustomer(true);
                try {
                  if (onSaveCustomer) await onSaveCustomer(orderId, customerName, customerPhone);
                  onClose();
                } catch(e) {
                  alert("Error al guardar datos del cliente");
                  setIsSavingCustomer(false);
                }
              }}
              disabled={isSavingCustomer}
              className="flex-1"
            >
              {isSavingCustomer ? <Loader2 className="w-5 h-5 animate-spin" /> : "Guardar y Cerrar"}
            </Button>
          </div>
        </div>

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
      title={confirmOnly ? 'Confirmar Pago en Caja' : 'Confirmar Pago'}
      maxWidth="max-w-md"
    >
      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
        <div className="flex flex-col items-center justify-center p-4 bg-gray-50 rounded-2xl border border-gray-100">
          <span className="text-sm text-gray-500 font-medium mb-1">
            {confirmOnly ? 'Total del Pedido Online' : 'Total a Pagar'}
          </span>
          <span className="text-4xl font-black text-gray-900">${fmt(confirmOnly ? (confirmTotal ?? 0) : total)}</span>
          {confirmOnly && (
            <span className="text-xs text-amber-600 font-semibold mt-1.5 bg-amber-50 px-3 py-1 rounded-full border border-amber-200">
              Selecciona el método recibido en caja
            </span>
          )}
        </div>

        <div className="space-y-3">
          {!confirmOnly && (
            <>
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider ml-1">Tipo de Pedido</h3>
              <div className="grid grid-cols-2 gap-2 md:gap-3 mb-6">
                <button
                  onClick={() => setOrderType('table')}
                  className={`flex items-center justify-center p-2.5 md:p-3.5 rounded-full border-2 transition-all ${
                    orderType === 'table'
                      ? 'border-black bg-black text-white shadow-md'
                      : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <Coffee className={`h-4 w-4 md:h-5 md:w-5 mr-1.5 md:mr-2 ${orderType === 'table' ? 'text-white' : 'text-gray-500'}`} />
                  <span className="font-bold text-sm md:text-base whitespace-nowrap">Para Servir</span>
                </button>
                <button
                  onClick={() => setOrderType('pickup')}
                  className={`flex items-center justify-center p-2.5 md:p-3.5 rounded-full border-2 transition-all ${
                    orderType === 'pickup'
                      ? 'border-black bg-black text-white shadow-md'
                      : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <Package className={`h-4 w-4 md:h-5 md:w-5 mr-1.5 md:mr-2 ${orderType === 'pickup' ? 'text-white' : 'text-gray-500'}`} />
                  <span className="font-bold text-sm md:text-base whitespace-nowrap">Para Llevar</span>
                </button>
              </div>
            </>
          )}

          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider ml-1">Método de Pago</h3>
          <div className="grid grid-cols-1 gap-3">
            {paymentMethods.map((method) => (
              <button
                key={method.id}
                onClick={() => handlePayment(method.id)}
                disabled={processingMethod !== null}
                className={`flex items-center p-4 border-2 rounded-full transition-all text-left ${
                  processingMethod && processingMethod !== method.id
                    ? 'border-gray-100 bg-white opacity-50 cursor-not-allowed grayscale'
                    : processingMethod === method.id
                    ? 'border-black bg-black shadow-md'
                    : 'border-gray-200 bg-white hover:border-black hover:bg-gray-50 active:scale-[0.98] group'
                }`}
              >
                {processingMethod === method.id ? (
                  <Loader2 className="h-6 w-6 text-white mr-4 animate-spin" />
                ) : (
                  <method.icon className={`h-6 w-6 mr-4 ${processingMethod ? 'text-gray-400' : 'text-gray-700 group-hover:text-black'}`} />
                )}
                <div className="flex-1">
                  <span className={`font-bold text-lg ${
                    processingMethod === method.id 
                      ? 'text-white' 
                      : processingMethod 
                        ? 'text-gray-400' 
                        : 'text-gray-800 group-hover:text-black'
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
