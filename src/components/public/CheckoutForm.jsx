import React, { useState } from 'react';
import { User, Phone, Mail, MessageSquare, Store, Loader2 } from 'lucide-react';

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

const CheckoutForm = ({ onSubmit, isSubmitting }) => {
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    notes: '',
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
      return;
    }
    onSubmit(form);
  };

  return (
    <div className="flex flex-col min-h-0">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">

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

          {/* Section: Pickup method */}
          <div className="space-y-3">
            <h2 className="text-base font-bold text-gray-900">Método de retiro</h2>
            <div className="flex items-center gap-4 p-4 bg-white rounded-2xl border-2 border-black shadow-sm">
              <div className="w-10 h-10 bg-black rounded-full flex items-center justify-center shrink-0">
                <Store className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="font-bold text-gray-900 text-sm">Retiro en Local</p>
                <p className="text-xs text-gray-500 mt-0.5">Te avisaremos cuando esté listo · Pago al retirar</p>
              </div>
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
        <div className="max-w-2xl mx-auto">
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="w-full h-16 bg-black text-white font-bold rounded-full flex items-center justify-center gap-2 shadow-2xl hover:bg-gray-900 transition-colors active:scale-[0.98] disabled:opacity-60 disabled:pointer-events-none px-8 text-[17px] tracking-wide"
          >
            {isSubmitting ? (
              <><Loader2 className="h-5 w-5 animate-spin" /> Enviando pedido…</>
            ) : (
              'Confirmar Pedido'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CheckoutForm;
