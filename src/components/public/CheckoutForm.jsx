import React, { useState, useEffect } from 'react';
import { User, Phone, Mail, MessageSquare, Store, Loader2, Banknote, CreditCard } from 'lucide-react';
import { getCustomerByPhone } from '../../services/publicOrderService';

const InputField = ({ icon: Icon, label, isLoading, ...props }) => (
  <div className="relative">
    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">{label}</label>
    <div className="relative">
      <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none">
        {isLoading ? (
          <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />
        ) : (
          <Icon className="h-4 w-4 text-gray-400" />
        )}
      </div>
      <input
        className="w-full pl-11 pr-4 py-3.5 bg-white border-2 border-gray-200 rounded-2xl text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-black transition-colors"
        {...props}
      />
    </div>
  </div>
);

const fmt = (n) => n.toLocaleString('es-CL');

export const formatChileanPhone = (value) => {
  if (!value) return '';
  let digits = value.replace(/\D/g, '');
  const hasPlus = value.startsWith('+');

  if (digits.startsWith('56') || (hasPlus && digits.length > 0)) {
    if (!digits.startsWith('56')) {
      digits = '56' + digits;
    }
    
    let formatted = '+56';
    if (digits.length > 2) {
      const remaining = digits.slice(2);
      if (remaining.length > 0) {
        formatted += ' ' + remaining.slice(0, 1);
      }
      if (remaining.length > 1) {
        formatted += ' ' + remaining.slice(1, 5);
      }
      if (remaining.length > 5) {
        formatted += ' ' + remaining.slice(5, 9);
      }
    }
    return formatted;
  } else {
    if (digits.length === 0) return hasPlus ? '+' : '';
    
    let formatted = digits.slice(0, 1);
    if (digits.length > 1) {
      formatted += ' ' + digits.slice(1, 5);
    }
    if (digits.length > 5) {
      formatted += ' ' + digits.slice(5, 9);
    }
    return formatted;
  }
};

const CheckoutForm = ({ onSubmit, isSubmitting, totalAmount, acceptsOnlinePayments = true, organizationId }) => {
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    notes: '',
    paymentMethod: 'local', // local or online
  });
  const [errors, setErrors] = useState({});
  const [isSearchingCustomer, setIsSearchingCustomer] = useState(false);

  useEffect(() => {
    if (!organizationId) return;

    const cleanDigits = form.phone.replace(/\D/g, '');
    // Trigger online search only if the user typed 9 digits (local) or 11 digits (with country code 56)
    if (cleanDigits.length !== 9 && cleanDigits.length !== 11) return;

    const timer = setTimeout(async () => {
      setIsSearchingCustomer(true);
      try {
        const customer = await getCustomerByPhone(organizationId, form.phone);
        if (customer) {
          setForm(f => ({
            ...f,
            name: f.name.trim() === '' ? (customer.full_name || '') : f.name,
            email: f.email.trim() === '' ? (customer.email || '') : f.email
          }));
        }
      } catch (e) {
        console.error('Error fetching customer by phone:', e);
      } finally {
        setIsSearchingCustomer(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [form.phone, organizationId]);

  const update = (field, value) => {
    let finalValue = value;
    if (field === 'phone') {
      finalValue = formatChileanPhone(value);
    }
    setForm(f => ({ ...f, [field]: finalValue }));
    if (errors[field]) setErrors(e => ({ ...e, [field]: null }));
  };

  const validate = () => {
    const errs = {};
    if (!form.name.trim()) errs.name = 'El nombre es requerido';
    if (!form.phone.trim()) errs.phone = 'El teléfono es requerido';
    return errs;
  };

  const handleSubmit = () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      // scroll to top to show errors
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    onSubmit(form);
  };

  return (
    <div className="flex flex-col min-h-0">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">

          {/* Section: Personal data */}
          <div className="space-y-4">
            <div>
              <h2 className="text-base font-bold text-gray-900">Tus datos</h2>
              <p className="text-xs text-gray-500 mt-1">
                Ingresa tu teléfono primero. Si ya has comprado antes, completaremos tus datos automáticamente.
              </p>
            </div>

            <div>
              <InputField
                icon={Phone}
                label="Teléfono *"
                type="tel"
                placeholder="+56 9 1234 5678"
                value={form.phone}
                isLoading={isSearchingCustomer}
                onChange={e => update('phone', e.target.value)}
              />
              {errors.phone && <p className="text-xs text-red-500 mt-1 ml-1">{errors.phone}</p>}
            </div>

            <div>
              <InputField
                icon={User}
                label="Nombre completo *"
                type="text"
                placeholder="Ej: Juan Pérez"
                value={form.name}
                onChange={e => update('name', e.target.value)}
              />
              {errors.name && <p className="text-xs text-red-500 mt-1 ml-1">{errors.name}</p>}
            </div>

            <InputField
              icon={Mail}
              label="Email (opcional)"
              type="email"
              placeholder="tu@email.com"
              value={form.email}
              onChange={e => update('email', e.target.value)}
            />
          </div>

          {/* Divider */}
          <div className="h-px bg-gray-100" />

          {/* Section: Entrega */}
          <div className="space-y-3">
            <h2 className="text-base font-bold text-gray-900">Entrega</h2>

            {/* Pickup method */}
            <div className="flex items-center justify-between p-3.5 bg-gray-50 border border-gray-200 rounded-2xl">
              <div className="flex items-center gap-2.5">
                <Store className="h-4 w-4 text-gray-500" />
                <span className="text-sm font-semibold text-gray-600">Método de retiro</span>
              </div>
              <span className="text-sm font-bold text-gray-900 bg-gray-200/50 px-2.5 py-1 rounded-lg">Retiro en local</span>
            </div>
          </div>

          {/* Divider */}
          <div className="h-px bg-gray-100" />

          {/* Section: Pago */}
          <div className="space-y-3">
            <h2 className="text-base font-bold text-gray-900">Método de pago</h2>

            {/* Payment Methods as radio rows */}
            <div className="space-y-2">
              <label 
                onClick={() => update('paymentMethod', 'local')}
                className={`flex items-center justify-between p-3.5 rounded-2xl border-2 transition-all cursor-pointer ${
                  form.paymentMethod === 'local' 
                    ? 'bg-white border-black shadow-sm' 
                    : 'bg-gray-50/50 border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Banknote className={`h-4.5 w-4.5 transition-colors ${form.paymentMethod === 'local' ? 'text-gray-900' : 'text-gray-400'}`} />
                  <span className={`text-sm font-bold ${form.paymentMethod === 'local' ? 'text-gray-900' : 'text-gray-500'}`}>En Caja (Efectivo / Tarjeta)</span>
                </div>
                <input 
                  type="radio" 
                  name="paymentMethod"
                  checked={form.paymentMethod === 'local'}
                  onChange={() => {}} // Handled by container click
                  className="h-4 w-4 accent-black text-black border-gray-300 focus:ring-black"
                />
              </label>

              <label 
                onClick={() => acceptsOnlinePayments && update('paymentMethod', 'online')}
                className={`flex items-center justify-between p-3.5 rounded-2xl border-2 transition-all ${
                  !acceptsOnlinePayments 
                    ? 'bg-gray-50/30 border-gray-100 opacity-60 cursor-not-allowed' 
                    : form.paymentMethod === 'online' 
                      ? 'bg-white border-black shadow-sm cursor-pointer' 
                      : 'bg-gray-50/50 border-gray-200 hover:border-gray-300 cursor-pointer'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <CreditCard className={`h-4.5 w-4.5 transition-colors ${form.paymentMethod === 'online' && acceptsOnlinePayments ? 'text-gray-900' : 'text-gray-400'}`} />
                  <div className="flex items-center gap-1.5">
                    <span className={`text-sm font-bold ${form.paymentMethod === 'online' && acceptsOnlinePayments ? 'text-gray-900' : 'text-gray-500'}`}>
                      En Línea (Webpay / Tarjetas)
                    </span>
                    {!acceptsOnlinePayments && (
                      <span className="text-[10px] bg-gray-200 text-gray-600 font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wider">
                        Pronto
                      </span>
                    )}
                  </div>
                </div>
                <input 
                  type="radio" 
                  name="paymentMethod"
                  disabled={!acceptsOnlinePayments}
                  checked={form.paymentMethod === 'online' && acceptsOnlinePayments}
                  onChange={() => {}} // Handled by container click
                  className="h-4 w-4 accent-black text-black border-gray-300 focus:ring-black cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                />
              </label>
            </div>
          </div>

          {/* Section: Notes */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">
              Notas adicionales (opcional)
            </label>
            <div className="relative">
              <MessageSquare className="absolute left-4 top-3.5 h-4 w-4 text-gray-400 pointer-events-none" />
              <textarea
                rows={3}
                placeholder="Ej: Sin cebolla, pedir bien cocido…"
                value={form.notes}
                onChange={e => update('notes', e.target.value)}
                className="w-full pl-11 pr-4 py-3.5 bg-white border-2 border-gray-200 rounded-2xl text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-black transition-colors resize-none"
              />
            </div>
          </div>

          <div className="h-24" />
        </div>
      </div>

      {/* Submit CTA */}
      <div className="fixed bottom-0 left-0 right-0 z-20 p-4 bg-gradient-to-t from-gray-50 via-gray-50/90 to-transparent pt-8">
        <div className="max-w-3xl mx-auto">
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="w-full h-16 bg-black text-white font-bold rounded-full flex items-center justify-center gap-2 shadow-2xl hover:bg-gray-900 transition-colors active:scale-[0.98] disabled:opacity-60 disabled:pointer-events-none px-8 text-[17px] tracking-wide"
          >
            {isSubmitting ? (
              <><Loader2 className="h-5 w-5 animate-spin" /> Enviando pedido…</>
            ) : (
              <div className="flex items-center justify-center w-full">
                <span>Confirmar Pedido</span>
                {totalAmount != null && (
                  <>
                    <div className="w-1.5 h-1.5 rounded-full bg-white/40 mx-3"></div>
                    <span>${fmt(totalAmount)}</span>
                  </>
                )}
              </div>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CheckoutForm;
