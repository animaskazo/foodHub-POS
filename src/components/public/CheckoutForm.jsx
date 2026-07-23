import React, { useState, useEffect } from 'react';
import { User, Phone, Mail, MessageSquare, Store, Loader2, Banknote, CreditCard } from 'lucide-react';
import { getCustomerByPhone } from '../../services/publicOrderService';
import { geocodeAddress, calculateDistance, isPointInPolygon } from '../../utils/geo';
import { MapPin, Info } from 'lucide-react';

const InputField = ({ icon: Icon, label, isLoading, rightElement, ...props }) => (
  <div className="relative">
    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">{label}</label>
    <div className="relative">
      <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none z-10">
        {isLoading ? (
          <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />
        ) : (
          <Icon className="h-4 w-4 text-gray-400" />
        )}
      </div>
      <input
        className={`w-full pl-11 py-3.5 bg-white border-2 border-gray-200 rounded-2xl text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-black transition-colors ${rightElement ? 'pr-24' : 'pr-4'}`}
        {...props}
      />
      {rightElement && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 z-10">
          {rightElement}
        </div>
      )}
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

const CheckoutForm = ({ onSubmit, isSubmitting, totalAmount, acceptsOnlinePayments = true, organizationId, isOpen = true, org }) => {
  const [form, setForm] = useState(() => {
    try {
      const saved = localStorage.getItem('checkout_customer_form');
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          name: parsed.name || '',
          phone: parsed.phone || '',
          email: parsed.email || '',
          notes: '',
          paymentMethod: 'local',
          deliveryType: 'pickup',
          deliveryAddress: '',
          deliveryFee: 0,
        };
      }
    } catch (e) {}
    return {
      name: '',
      phone: '',
      email: '',
      notes: '',
      paymentMethod: 'local', // local or online
      deliveryType: 'pickup', // pickup or delivery
      deliveryAddress: '',
      deliveryFee: 0,
    };
  });
  const [errors, setErrors] = useState({});
  const [isSearchingCustomer, setIsSearchingCustomer] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [distanceError, setDistanceError] = useState(null);
  const [isValidatedAddress, setIsValidatedAddress] = useState(false);

  useEffect(() => {
    if (!organizationId) return;

    const cleanDigits = form.phone.replace(/\D/g, '');
    // Trigger online search once they have typed at least a full phone number (9 digits)
    if (cleanDigits.length < 9) return;

    const timer = setTimeout(async () => {
      setIsSearchingCustomer(true);
      try {
        const customer = await getCustomerByPhone(organizationId, form.phone);
        if (customer) {
          setForm(f => ({
            ...f,
            name: customer.full_name || f.name,
            email: customer.email || f.email
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
    setForm(f => ({ ...f, [field]: value }));
    if (errors[field]) setErrors(e => ({ ...e, [field]: null }));
    if (field === 'deliveryAddress') {
      setIsValidatedAddress(false);
    }
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
    
    try {
      localStorage.setItem('checkout_customer_form', JSON.stringify({
        name: form.name,
        phone: form.phone,
        email: form.email
      }));
    } catch (e) {}

    onSubmit(form);
  };

  const handleAddressBlur = async () => {
    if (!form.deliveryAddress?.trim() || !org?.store_lat || !org?.store_lng) return;
    
    setIsGeocoding(true);
    setDistanceError(null);
    try {
      const coords = await geocodeAddress(form.deliveryAddress);
      if (coords) {
        let isInside = false;
        
        // Use polygon if available, else fallback to old radius
        if (org.delivery_polygon && org.delivery_polygon.length > 0) {
          isInside = isPointInPolygon(coords, org.delivery_polygon);
        } else {
          // Fallback just in case
          const distance = calculateDistance(org.store_lat, org.store_lng, coords.lat, coords.lng);
          isInside = distance <= (org.delivery_radius_km || 5);
        }

        if (!isInside) {
          setDistanceError('Tu dirección está fuera de nuestra zona de cobertura.');
          setIsValidatedAddress(false);
          update('deliveryFee', 0);
        } else {
          setDistanceError(null);
          setIsValidatedAddress(true);
          update('deliveryFee', org.delivery_fee || 0);
        }
      } else {
        setDistanceError('No pudimos encontrar la dirección. Asegúrate de incluir tu comuna o ciudad.');
        setIsValidatedAddress(false);
        update('deliveryFee', 0);
      }
    } catch (error) {
      setDistanceError('Error al verificar la dirección.');
    } finally {
      setIsGeocoding(false);
    }
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
                onBlur={e => {
                  const formatted = formatChileanPhone(e.target.value);
                  update('phone', formatted);
                }}
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

            {org?.delivery_enabled ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <label 
                    onClick={() => {
                      update('deliveryType', 'pickup');
                      update('deliveryFee', 0);
                      setDistanceError(null);
                      setIsValidatedAddress(false);
                    }}
                    className={`flex flex-col items-center justify-center p-3 rounded-2xl border-2 transition-all cursor-pointer text-center ${
                      form.deliveryType === 'pickup' 
                        ? 'bg-white border-black shadow-sm text-black' 
                        : 'bg-gray-50/50 border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}
                  >
                    <Store className={`h-5 w-5 mb-1.5 ${form.deliveryType === 'pickup' ? 'text-black' : 'text-gray-400'}`} />
                    <span className="text-sm font-bold">Retiro en Local</span>
                  </label>

                  <label 
                    onClick={() => update('deliveryType', 'delivery')}
                    className={`flex flex-col items-center justify-center p-3 rounded-2xl border-2 transition-all cursor-pointer text-center ${
                      form.deliveryType === 'delivery' 
                        ? 'bg-white border-black shadow-sm text-black' 
                        : 'bg-gray-50/50 border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}
                  >
                    <MapPin className={`h-5 w-5 mb-1.5 ${form.deliveryType === 'delivery' ? 'text-black' : 'text-gray-400'}`} />
                    <span className="text-sm font-bold">Delivery</span>
                  </label>
                </div>

                {form.deliveryType === 'delivery' && (
                  <div className="space-y-3">
                    <InputField
                      icon={MapPin}
                      label="Dirección de entrega *"
                      type="text"
                      placeholder="Ej: Av. Providencia 1234, Depto 45"
                      value={form.deliveryAddress}
                      onChange={e => update('deliveryAddress', e.target.value)}
                      onBlur={handleAddressBlur}
                      isLoading={isGeocoding}
                      rightElement={
                        <button
                          type="button"
                          onMouseDown={(e) => {
                            // Prevent focus loss before click registers
                            e.preventDefault();
                          }}
                          onClick={(e) => {
                            e.preventDefault();
                            handleAddressBlur();
                          }}
                          disabled={!form.deliveryAddress?.trim() || isGeocoding}
                          className="bg-black text-white text-[11px] font-bold px-3 py-1.5 rounded-xl hover:bg-gray-800 disabled:opacity-50 transition-colors"
                        >
                          Validar
                        </button>
                      }
                    />
                    
                    {distanceError && (
                      <div className="flex items-start gap-2 bg-red-50 text-red-600 p-3 rounded-xl border border-red-100">
                        <Info className="h-4 w-4 shrink-0 mt-0.5" />
                        <p className="text-xs font-semibold leading-relaxed">{distanceError}</p>
                      </div>
                    )}
                    
                    {!distanceError && isValidatedAddress && (
                      <div className="flex items-center justify-between bg-green-50 text-green-700 px-3 py-2.5 rounded-xl border border-green-100">
                        <span className="font-semibold text-xs pr-2">Super, nuestro delivery llega a tu dirección.</span>
                        <span className="font-bold text-[13px] shrink-0">Valor ${fmt(form.deliveryFee)}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between p-3.5 bg-gray-50 border border-gray-200 rounded-2xl">
                <div className="flex items-center gap-2.5">
                  <Store className="h-4 w-4 text-gray-500" />
                  <span className="text-sm font-semibold text-gray-600">Método de retiro</span>
                </div>
                <span className="text-sm font-bold text-gray-900 bg-gray-200/50 px-2.5 py-1 rounded-lg">Retiro en local</span>
              </div>
            )}
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

          <div className="h-40" />
        </div>
      </div>

      {/* Submit CTA */}
      <div className="fixed bottom-0 left-0 right-0 z-20 p-4 bg-gradient-to-t from-gray-50 via-gray-50/90 to-transparent pt-8 pointer-events-none">
        <div className="max-w-3xl mx-auto flex flex-col items-center pointer-events-auto space-y-3">
          
          {form.deliveryFee > 0 && form.deliveryType === 'delivery' && (
            <div className="w-full flex flex-col gap-2 px-4 bg-white/80 backdrop-blur-md py-3 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-gray-100">
              <div className="flex justify-between items-center text-sm font-bold text-gray-700">
                <span>Subtotal (Productos)</span>
                <span>${fmt(totalAmount)}</span>
              </div>
              <div className="flex justify-between items-center text-sm font-bold text-gray-700">
                <span>Costo de envío</span>
                <span>${fmt(form.deliveryFee)}</span>
              </div>
            </div>
          )}

          {form.deliveryType === 'delivery' && totalAmount < (org?.delivery_min_order || 0) && (
            <div className="bg-red-50 text-red-600 px-4 py-2 rounded-xl border border-red-100 w-full text-center text-xs font-bold shadow-sm">
              El pedido mínimo para delivery es de ${fmt(org.delivery_min_order)}.
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={
              isSubmitting || 
              !isOpen || 
              (form.deliveryType === 'delivery' && (!!distanceError || !form.deliveryAddress.trim())) ||
              (form.deliveryType === 'delivery' && (totalAmount < (org?.delivery_min_order || 0)))
            }
            className={`w-full h-16 text-white font-bold rounded-full flex items-center justify-center gap-2 shadow-2xl transition-all px-8 text-[17px] tracking-wide ${(!isOpen || isSubmitting || (form.deliveryType === 'delivery' && (!!distanceError || !form.deliveryAddress.trim() || totalAmount < (org?.delivery_min_order || 0)))) ? 'bg-gray-400 cursor-not-allowed opacity-90' : 'bg-black hover:bg-gray-900 active:scale-[0.98]'}`}
          >
            {isSubmitting ? (
              <><Loader2 className="h-5 w-5 animate-spin" /> Enviando pedido…</>
            ) : !isOpen ? (
              <span>Local Cerrado</span>
            ) : (
              <div className="flex items-center justify-center w-full">
                <span>Confirmar Pedido</span>
                {totalAmount != null && (
                  <>
                    <div className="w-1.5 h-1.5 rounded-full bg-white/40 mx-3"></div>
                    <span>${fmt(totalAmount + (form.deliveryType === 'delivery' ? form.deliveryFee : 0))}</span>
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
