import React, { useState } from 'react';
import { User, Phone, Mail, MessageSquare, Store, Loader2, Banknote, CreditCard } from 'lucide-react';

const InputField = ({ icon: Icon, label, ...props }) => (
  <div className="relative">
    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">{label}</label>
    <div className="relative">
      <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none">
        <Icon className="h-4 w-4 text-gray-400" />
      </div>
      <input
        className="w-full pl-11 pr-4 py-3.5 bg-white border-2 border-gray-200 rounded-2xl text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-black transition-colors"
        {...props}
      />
    </div>
  </div>
);

const fmt = (n) => n.toLocaleString('es-CL');

const CheckoutForm = ({ onSubmit, isSubmitting, totalAmount }) => {
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    notes: '',
    paymentMethod: 'local', // local or online
  });
  const [errors, setErrors] = useState({});

  const update = (field, value) => {
    setForm(f => ({ ...f, [field]: value }));
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
            <h2 className="text-base font-bold text-gray-900">Tus datos</h2>

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

            <div>
              <InputField
                icon={Phone}
                label="Teléfono *"
                type="tel"
                placeholder="+56 9 1234 5678"
                value={form.phone}
                onChange={e => update('phone', e.target.value)}
              />
              {errors.phone && <p className="text-xs text-red-500 mt-1 ml-1">{errors.phone}</p>}
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

          {/* Section: Delivery and Payment */}
          <div className="space-y-3">
            <h2 className="text-base font-bold text-gray-900">Entrega y pago</h2>

            {/* Pickup method */}
            <div className="flex items-center justify-between p-3.5 bg-gray-50 border border-gray-200 rounded-2xl">
              <div className="flex items-center gap-2.5">
                <Store className="h-4 w-4 text-gray-500" />
                <span className="text-sm font-semibold text-gray-600">Método de retiro</span>
              </div>
              <span className="text-sm font-bold text-gray-900 bg-gray-200/50 px-2.5 py-1 rounded-lg">Retiro en local</span>
            </div>

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
                onClick={() => update('paymentMethod', 'online')}
                className={`flex items-center justify-between p-3.5 rounded-2xl border-2 transition-all cursor-pointer ${
                  form.paymentMethod === 'online' 
                    ? 'bg-white border-black shadow-sm' 
                    : 'bg-gray-50/50 border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <CreditCard className={`h-4.5 w-4.5 transition-colors ${form.paymentMethod === 'online' ? 'text-gray-900' : 'text-gray-400'}`} />
                  <span className={`text-sm font-bold ${form.paymentMethod === 'online' ? 'text-gray-900' : 'text-gray-500'}`}>En Línea (Webpay / Tarjetas)</span>
                </div>
                <input 
                  type="radio" 
                  name="paymentMethod"
                  checked={form.paymentMethod === 'online'}
                  onChange={() => {}} // Handled by container click
                  className="h-4 w-4 accent-black text-black border-gray-300 focus:ring-black"
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
