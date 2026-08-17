import React, { useState, useEffect, useRef } from 'react';
import { User, Phone, Mail, MessageSquare, Store, Loader2, Banknote, CreditCard, PaperBag, Info, CalendarClock, Clock, ChefHat } from 'lucide-react';
import { getCustomerByPhone } from '../../services/publicOrderService';
import { geocodeAddress, calculateDistance, isPointInPolygon } from '../../utils/geo';
import { getAccessToken, createQuote } from '../../services/uberDirectService';
import { MapPin } from 'lucide-react';
import { X } from 'lucide-react';
import AddressAutocomplete from '../ui/AddressAutocomplete';
import AddressMap from '../pos/AddressMap';
import Modal from '../ui/Modal';

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

const fmt = (n, decimals) => n.toLocaleString('es-CL', decimals != null ? { minimumFractionDigits: decimals, maximumFractionDigits: decimals } : {});
const fmtPrice = (amount, currency) => {
  if (!amount) return '$0';
  if (currency === 'CLP') return `$${Math.round(amount).toLocaleString('es-CL')}`;
  return `$${amount.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// ── Disponibilidad y horarios de retiro ─────────────────────
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const pad2 = (n) => String(n).padStart(2, '0');

const toMinutes = (t) => {
  if (!t) return 0;
  const [h, m] = String(t).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};
const toTime = (mins) => `${pad2(Math.floor(mins / 60))}:${pad2(mins % 60)}`;
const dateInput = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

// pickup_hours si está activo/abierto, si no usa business_hours como disponibilidad
const getAvailability = (org) => {
  const ph = org?.pickup_hours;
  const bh = org?.business_hours;
  if (ph && Object.keys(ph).length > 0) {
    const hasAnyOpen = Object.values(ph).some(d => d && !d.closed);
    if (hasAnyOpen) return ph;
  }
  return bh || null;
};

// ¿Un momento dado cae dentro del horario de disponibilidad del día? (soporta cruce de medianoche)
const isWithinDay = (availability, date) => {
  const day = availability?.[DAY_KEYS[date.getDay()]];
  if (!day || day.closed) return false;
  const open = toMinutes(day.open);
  const close = toMinutes(day.close);
  const now = date.getHours() * 60 + date.getMinutes();
  if (close < open) return now >= open || now <= close;
  return now >= open && now <= close;
};

// ¿Se puede pedir "ahora"?
const canOrderNow = (org) => {
  if (org?.instant_enabled === false) return false;
  const ph = org?.pickup_hours;
  const bh = org?.business_hours;
  const now = new Date();

  if (ph && Object.keys(ph).length > 0 && isWithinDay(ph, now)) {
    return true;
  }
  if (bh && Object.keys(bh).length > 0 && isWithinDay(bh, now)) {
    return true;
  }
  if (!ph && !bh) return true;

  return false;
};

// Slots de 30 min para una fecha (yyyy-mm-dd), excluyendo pasados y los próximos 10 min
const getSlots = (org, dateStr) => {
  const availability = getAvailability(org);
  if (!availability) return [];
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const day = availability[DAY_KEYS[date.getDay()]];
  if (!day || day.closed) return [];
  const open = toMinutes(day.open);
  const close = toMinutes(day.close);
  const end = close < open ? 24 * 60 : close; // cruce de medianoche
  const prep = (org?.prep_time && org.prep_time > 0) ? org.prep_time : 10;
  const minFuture = Date.now() + prep * 60000;
  const slots = [];
  for (let t = open; t < end; t += 30) {
    const slotDate = new Date(y, m - 1, d, Math.floor(t / 60), t % 60);
    if (slotDate.getTime() >= minFuture) slots.push(toTime(t));
  }
  return slots;
};

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

const CheckoutForm = ({ onSubmit, isSubmitting, totalAmount, acceptsOnlinePayments = true, acceptsLocalPayments = true, organizationId, org, cartItems = [], isOpen = true }) => {
  const uberEnabled = org?.uber_enabled !== false;
  const deliveryMode = !uberEnabled && (org?.delivery_mode === 'uber_direct' || org?.delivery_mode === 'uber_with_fallback') ? 'own' : org?.delivery_mode;
  const instantAvailable = canOrderNow(org);
  const schedulingEnabled = org?.scheduling_enabled === true;
  const showScheduleSection = schedulingEnabled;
  const initScheduleType = instantAvailable ? 'now' : (schedulingEnabled ? 'scheduled' : 'now');
  const kitchenPrepMinutes = (org?.prep_time && org.prep_time > 0) ? org.prep_time : 10;

  const isClosed = !isOpen;

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
          deliveryNotes: '',
          deliveryFee: 0,
          deliveryCoords: null,
          quoteId: null,
          quotePrice: null,
          quoteCurrency: 'USD',
          deliveryCurrency: 'CLP',
          deliveryService: parsed.deliveryService || 'own',
          scheduleType: parsed.scheduleType && (parsed.scheduleType === 'now' || parsed.scheduleType === 'scheduled') ? parsed.scheduleType : initScheduleType,
          scheduledAt: '',
        };
      }
    } catch (e) { }
    return {
      name: '',
      phone: '',
      email: '',
      notes: '',
      paymentMethod: 'local',
      deliveryType: 'pickup',
      deliveryAddress: '',
      deliveryNotes: '',
      deliveryFee: 0,
      deliveryCoords: null,
      quoteId: null,
      quotePrice: null,
      quoteCurrency: 'USD',
      deliveryCurrency: 'CLP',
      deliveryService: 'own',
      scheduleType: initScheduleType,
      scheduledAt: '',
    };
  });
  const nowBlocked = form.scheduleType === 'now' && (isClosed || !instantAvailable);
  const scheduledBlocked = showScheduleSection && form.scheduleType === 'scheduled' && !form.scheduledAt;
  const isUberDelivery = form.deliveryType === 'delivery' && deliveryMode === 'uber_direct';
  const uberOnlineBlocked = isUberDelivery && acceptsOnlinePayments !== true;
  const [scheduleDate, setScheduleDate] = useState(() => dateInput(new Date()));
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const scheduleSlots = getSlots(org, scheduleDate);
  const scheduleDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return {
      iso: dateInput(d),
      label: i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : d.toLocaleDateString('es-CL', { weekday: 'short' }),
      day: d.getDate(),
    };
  });
  const scheduleDayLabel = scheduleDays.find(x => x.iso === scheduleDate)?.label || '';
  const scheduleEmptyText = scheduleSlots.length === 0
    ? (scheduleDayLabel ? `No hay horarios disponibles para ${scheduleDayLabel.toLowerCase()}.` : 'No hay horarios disponibles.')
    : '';
  const [errors, setErrors] = useState({});
  const touchedRef = useRef({ name: false, email: false });
  const [isSearchingCustomer, setIsSearchingCustomer] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [isQuoting, setIsQuoting] = useState(false);
  const [distanceError, setDistanceError] = useState(null);
  const [isValidatedAddress, setIsValidatedAddress] = useState(false);

  useEffect(() => {
    const onlineEnabled = acceptsOnlinePayments === true;
    const localEnabled = acceptsLocalPayments !== false && !isUberDelivery;
    if (!onlineEnabled && !localEnabled) return;
    if (!localEnabled && form.paymentMethod === 'local') {
      setForm(f => ({ ...f, paymentMethod: 'online' }));
    } else if (!onlineEnabled && form.paymentMethod === 'online') {
      setForm(f => ({ ...f, paymentMethod: 'local' }));
    }
  }, [acceptsOnlinePayments, acceptsLocalPayments, form.paymentMethod, isUberDelivery]);

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
          setForm(f => {
            const next = { ...f };
            if (!touchedRef.current.name) next.name = customer.full_name || f.name;
            if (!touchedRef.current.email) next.email = customer.email || f.email;
            return next;
          });
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
    if (field === 'name' || field === 'email') touchedRef.current[field] = true;
    setForm(f => ({ ...f, [field]: value }));
    if (errors[field]) setErrors(e => ({ ...e, [field]: null }));
    if (field === 'deliveryAddress') {
      setIsValidatedAddress(false);
    }
  };

  const validate = () => {
    const errs = {};
    if (!form.name.trim()) errs.name = 'El nombre es requerido';
    if (!form.phone.trim()) {
      errs.phone = 'El teléfono es requerido';
    } else {
      const phoneDigits = form.phone.replace(/\D/g, '');
      const isValidPhone = phoneDigits.length === 9
        ? /^9\d{8}$/.test(phoneDigits)
        : /^569\d{8}$/.test(phoneDigits);
      if (!isValidPhone) errs.phone = 'Ingresa un teléfono válido (ej: +56 9 1234 5678)';
    }
    if (!form.email.trim()) {
      errs.email = 'El email es requerido';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      errs.email = 'Ingresa un email válido';
    }
    if (form.deliveryType === 'delivery') {
      if (!form.deliveryAddress?.trim()) {
        errs.deliveryAddress = 'La dirección de entrega es requerida';
      } else if (!isValidatedAddress) {
        if (deliveryMode === 'uber_direct') {
          errs.deliveryAddress = 'Por favor presiona "Validar" para verificar tu dirección';
        } else if (org?.store_lat && org?.store_lng) {
          errs.deliveryAddress = 'Por favor selecciona o valida una dirección válida en el mapa (presiona enter)';
        }
      }
    }
    if (form.scheduleType === 'scheduled') {
      if (!form.scheduledAt) {
        errs.scheduledAt = 'Selecciona una fecha y hora';
      } else if (new Date(form.scheduledAt) <= new Date()) {
        errs.scheduledAt = 'La hora debe ser futura';
      }
    }
    return errs;
  };

  const handlePickSlot = (slot) => {
    const [y, m, d] = scheduleDate.split('-').map(Number);
    const dt = new Date(y, m - 1, d, Number(slot.split(':')[0]), Number(slot.split(':')[1]));
    setForm(prev => ({ ...prev, scheduledAt: dt.toISOString() }));
    setErrors(e => ({ ...e, scheduledAt: null }));
  };

  const handleOpenScheduler = () => {
    update('scheduleType', 'scheduled');
    setScheduleModalOpen(true);
    setErrors(e => ({ ...e, scheduledAt: null }));
  };

  const handleConfirmSchedule = () => {
    if (!form.scheduledAt) return;
    const [y, m, d] = scheduleDate.split('-').map(Number);
    const selectedSlot = new Date(form.scheduledAt);
    const belongsToDate = selectedSlot.getFullYear() === y && selectedSlot.getMonth() === m - 1 && selectedSlot.getDate() === d;
    if (!belongsToDate) {
      setForm(prev => ({ ...prev, scheduledAt: '' }));
      return;
    }
    update('scheduleType', 'scheduled');
    setScheduleModalOpen(false);
    setErrors(e => ({ ...e, scheduledAt: null }));
  };

  const handleChooseNow = () => {
    update('scheduleType', 'now');
    setForm(prev => ({ ...prev, scheduledAt: '' }));
    setScheduleModalOpen(false);
    setErrors(e => ({ ...e, scheduledAt: null }));
  };

  const selectedScheduleLabel = form.scheduledAt ? (() => {
    const d = new Date(form.scheduledAt);
    const dayInfo = scheduleDays.find(x => x.iso === dateInput(d));
    const dayLabel = dayInfo ? dayInfo.label : d.toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' });
    return `${dayLabel} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  })() : null;

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
        email: form.email,
        deliveryService: form.deliveryService
      }));
    } catch (e) { }

    onSubmit(form);
  };

  const handleAddressBlur = async (preFetchedCoords = null) => {
    if (!form.deliveryAddress?.trim() && !preFetchedCoords) return;
    if (isValidatedAddress && !preFetchedCoords) return;
    if (deliveryMode !== 'uber_direct' && (!org?.store_lat || !org?.store_lng)) return;

    setIsGeocoding(true);
    setDistanceError(null);
    try {
      const coords = preFetchedCoords || await geocodeAddress(form.deliveryAddress);
      if (coords) {
        if (deliveryMode === 'uber_direct' || deliveryMode === 'uber_with_fallback') {
          setDistanceError(null);
          setForm(f => ({ ...f, deliveryCoords: coords, deliveryFee: 0, quoteId: null, deliveryService: 'uber' }));
          setIsQuoting(true);
          try {
            const city = coords.address?.city || coords.address?.town || coords.address?.village || coords.address?.county || 'Santiago';
            const zip = coords.address?.postcode || '';

            const cleanAddr = (org.address || '')
              .replace(/\s+(LOCAL|DEPTO|OF|DPTO|CASA|PISO)\s*\d+/gi, '')
              .replace(/^(Calle|Av\.?|Avda\.?|Pasaje|Pje\.?|Camino)\s+/i, '')
              .replace(/,?\s*\d{5,}\s*/g, ',')
              .replace(/\s*,\s*CL$/i, '')
              .replace(/,+/g, ',')
              .split(',').map(s => s.trim()).filter(Boolean).slice(0, 2).join(', ')
              .trim();
            const pickupStreet = cleanAddr || org.address || 'Dirección del local';

            const pickupAddr = {
              street_address: [pickupStreet],
              state: coords.address?.state || 'RM',
              city,
              zip_code: zip,
              country: 'CL',
            };
            const dropoffAddr = {
              street_address: [form.deliveryAddress],
              state: coords.address?.state || 'RM',
              city,
              zip_code: zip,
              country: 'CL',
            };

            console.log('[Uber Quote pickup]', pickupAddr);
            console.log('[Uber Quote dropoff]', dropoffAddr);

            const tokenRes = await getAccessToken(org.uber_client_id, org.uber_client_secret);
            console.log('[Uber Token] obtained');

            const geocodeQuery = cleanAddr ? cleanAddr + ', Chile' : 'Villa Alemana, Chile';
            console.log('[Uber Quote] clean address for geocode:', geocodeQuery);
            const orgCoordsRes = await geocodeAddress(geocodeQuery);
            console.log('[Uber Quote] geocode org.address result:', orgCoordsRes);
            const pickupLat = org.store_lat || orgCoordsRes?.lat || null;
            const pickupLng = org.store_lng || orgCoordsRes?.lng || null;
            console.log('[Uber Quote] pickupLat/Lng:', pickupLat, pickupLng);
            if (!pickupLat || !pickupLng) {
              throw new Error('No se pudo determinar la ubicación del local. Configura las coordenadas en Configuración > Delivery.');
            }
            if (orgCoordsRes) {
              pickupAddr.city = orgCoordsRes.address?.city || orgCoordsRes.address?.town || orgCoordsRes.address?.village || orgCoordsRes.address?.county || city;
              pickupAddr.state = orgCoordsRes.address?.state || 'RM';
              pickupAddr.zip_code = orgCoordsRes.address?.postcode || '';
            }

            const normalizePhone = (phone) => {
              if (!phone) return ''
              let n = phone.replace(/^0+/, '').replace(/[^\d+]/g, '')
              if (n.startsWith('+')) return n
              if (n.startsWith('56')) return `+${n}`
              return `+56${n}`
            }
            const normalizedPickupPhone = normalizePhone(org.phone)
            const normalizedDropoffPhone = normalizePhone(form.phone || '+56911111111')
            if (!normalizedDropoffPhone || normalizedDropoffPhone.replace(/\D/g, '').length < 9) {
              throw new Error('El teléfono ingresado no es válido para cotizar.')
            }

            const quoteWindow = (() => {
              const sm = form.scheduleType === 'scheduled' && form.scheduledAt ? new Date(form.scheduledAt).getTime() : null;
              if (!sm) return {};
              const now = Date.now();
              const pickupReady = Math.max(sm - 30 * 60000, now + 15 * 60000);
              const pickupDeadline = Math.max(sm, pickupReady + 30 * 60000);
              return {
                pickup_ready_dt: new Date(pickupReady).toISOString(),
                pickup_deadline_dt: new Date(pickupDeadline).toISOString(),
                dropoff_ready_dt: new Date(sm).toISOString(),
                dropoff_deadline_dt: new Date(Math.max(sm + 60 * 60000, pickupReady + 90 * 60000)).toISOString(),
              };
            })();

            const quoteRes = await createQuote(org.uber_customer_id, tokenRes.access_token, {
              external_store_id: org.id,
              pickup_address: JSON.stringify(pickupAddr),
              dropoff_address: JSON.stringify(dropoffAddr),
              pickup_latitude: pickupLat,
              pickup_longitude: pickupLng,
              dropoff_latitude: coords.lat,
              dropoff_longitude: coords.lng,
              pickup_phone_number: normalizedPickupPhone,
              dropoff_phone_number: normalizedDropoffPhone,
              manifest_items: cartItems.map(item => ({
                name: item.product_name || item.name || 'Producto',
                quantity: item.quantity || 1,
                value: item.price || 0,
              })),
              ...quoteWindow,
            });

            console.log('[Uber Quote]', quoteRes);

            const rawFee = quoteRes.fee || 0;
            const currency = (quoteRes.currency_type || quoteRes.currency || 'USD').toUpperCase();
            const price = currency === 'CLP' ? Math.round(rawFee / 100) : rawFee / 100;

            setForm(f => {
              if (f.deliveryType === 'pickup') return f;
              return {
                ...f,
                quoteId: quoteRes.id,
                quotePrice: price,
                quoteCurrency: currency,
                deliveryFee: price,
                deliveryCurrency: currency,
                deliveryService: 'uber'
              };
            });
            setIsValidatedAddress(true);
          } catch (quoteError) {
            console.error('[Uber Quote Error]', quoteError.message || quoteError);
            console.error('[Uber Quote Error stack]', quoteError.stack);
            let errMsg = 'No pudimos cotizar el envío con Uber. Intenta de nuevo.';
            let rawError = quoteError.message;
            
            if (quoteError.message) {
              try {
                // Check if it's a JSON error from the proxy
                const parsed = JSON.parse(quoteError.message);
                if (parsed && (parsed.message || parsed.code)) {
                  rawError = parsed.message || parsed.code;
                } else if (parsed && parsed.error && parsed.error.message) {
                  rawError = parsed.error.message;
                }
              } catch (e) {
                // Not JSON, keep original string
                rawError = quoteError.message;
              }
            } else if (typeof quoteError === 'string') {
               rawError = quoteError;
            }

            // Translate common Uber errors to Spanish
            const translations = {
              'The specified location is not in a deliverable area.': 'La dirección está fuera del área de cobertura de reparto de Uber.',
              'out_of_coverage': 'La dirección está fuera del área de cobertura de Uber.',
              'distance_too_long': 'La distancia supera el máximo permitido por Uber.',
              'dropoff_address is invalid': 'La dirección de entrega no es válida o está incompleta.',
              'pickup_address is invalid': 'La dirección del local no es válida (revisa la configuración).',
              'invalid_phone_number': 'El teléfono ingresado no es válido para Uber.',
              'El teléfono ingresado no es válido para cotizar.': 'El teléfono ingresado no es válido para cotizar.',
              'Ingresa un teléfono válido antes de validar la dirección.': 'Ingresa un teléfono válido antes de validar la dirección.',
            };

            // Find exact match or partial match
            if (translations[rawError]) {
              errMsg = translations[rawError];
            } else {
              // Try partial matching for dynamic Uber messages
              const matchedKey = Object.keys(translations).find(k => rawError.includes(k));
              if (matchedKey) {
                errMsg = translations[matchedKey];
              } else if (rawError) {
                // Fallback to the raw error if it's not a generic object string
                errMsg = rawError.includes('[object') ? errMsg : rawError;
              }
            }
            if (deliveryMode === 'uber_with_fallback') {
              console.warn('[Uber Fallback] Uber failed, trying own delivery', quoteError.message);
              let isInside = false;
              if (org.delivery_polygon && org.delivery_polygon.length > 0) {
                isInside = isPointInPolygon(coords, org.delivery_polygon);
              } else {
                const distance = calculateDistance(org.store_lat, org.store_lng, coords.lat, coords.lng);
                isInside = distance <= (org.delivery_radius_km || 5);
              }
              if (!isInside) {
                setDistanceError('Uber no tiene cobertura y tu dirección está fuera de nuestra zona de reparto propio.');
                setIsValidatedAddress(false);
                setForm(f => f.deliveryType === 'pickup' ? f : { ...f, deliveryFee: 0, deliveryService: 'own', quoteId: null });
              } else {
                setDistanceError(null);
                setIsValidatedAddress(true);
                setForm(f => f.deliveryType === 'pickup' ? f : { ...f, deliveryFee: org.delivery_fee || 0, deliveryService: 'own', quoteId: null });
              }
            } else {
              setDistanceError(errMsg);
              setIsValidatedAddress(false);
              setForm(f => f.deliveryType === 'pickup' ? f : { ...f, deliveryFee: 0, quoteId: null });
            }
          } finally {
            setIsQuoting(false);
          }
        } else {
          let isInside = false;

          if (org.delivery_polygon && org.delivery_polygon.length > 0) {
            isInside = isPointInPolygon(coords, org.delivery_polygon);
          } else {
            const distance = calculateDistance(org.store_lat, org.store_lng, coords.lat, coords.lng);
            isInside = distance <= (org.delivery_radius_km || 5);
          }

          if (!isInside) {
            setDistanceError('Tu dirección está fuera de nuestra zona de cobertura.');
            setIsValidatedAddress(false);
            setForm(f => f.deliveryType === 'pickup' ? f : { ...f, deliveryFee: 0, deliveryService: 'own', quoteId: null });
          } else {
            setDistanceError(null);
            setIsValidatedAddress(true);
            setForm(f => f.deliveryType === 'pickup' ? f : { ...f, deliveryFee: org.delivery_fee || 0, deliveryService: 'own', quoteId: null });
          }
        }
      } else {
        setDistanceError('No pudimos encontrar la dirección. Asegúrate de incluir tu comuna o ciudad.');
        setIsValidatedAddress(false);
        setForm(f => f.deliveryType === 'pickup' ? f : { ...f, deliveryFee: 0, quoteId: null });
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
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="space-y-5">

          {/* Banner: Tiempo estimado de preparación (cocina) */}
          {org?.prep_time > 0 && !isClosed && (
            <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-amber-50 border border-amber-200">
              <ChefHat className="h-4 w-4 shrink-0 text-amber-600" />
              <p className="text-xs font-semibold text-amber-800">
                Tu pedido estará listo en <span className="font-bold">{kitchenPrepMinutes} minutos</span>.
              </p>
            </div>
          )}

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

            <div>
              <InputField
                icon={Mail}
                label="Email *"
                type="email"
                placeholder="tu@email.com"
                value={form.email}
                onChange={e => update('email', e.target.value)}
              />
              {errors.email && <p className="text-xs text-red-500 mt-1 ml-1">{errors.email}</p>}
            </div>
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
                      update('quoteId', null);
                      update('quotePrice', null);
                      setDistanceError(null);
                      setIsValidatedAddress(false);
                    }}
                    className={`flex flex-col items-center justify-center p-3 rounded-2xl border-2 transition-all cursor-pointer text-center ${form.deliveryType === 'pickup'
                        ? 'bg-white border-black shadow-sm text-black'
                        : 'bg-gray-50/50 border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}
                  >
                    <Store className={`h-5 w-5 mb-1.5 ${form.deliveryType === 'pickup' ? 'text-black' : 'text-gray-400'}`} />
                    <span className="text-sm font-bold">Retiro en Local</span>
                  </label>

                  <label
                    onClick={() => {
                      update('deliveryType', 'delivery');
                      if (!isValidatedAddress || distanceError) {
                        update('deliveryFee', org?.delivery_fee || 0);
                      }
                    }}
                    className={`flex flex-col items-center justify-center p-3 rounded-2xl border-2 transition-all cursor-pointer text-center ${form.deliveryType === 'delivery'
                        ? 'bg-white border-black shadow-sm text-black'
                        : 'bg-gray-50/50 border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}
                  >
                    {deliveryMode === 'uber_direct' ? (
                      <PaperBag className={`h-5 w-5 mb-1.5 ${form.deliveryType === 'delivery' ? 'text-black' : 'text-gray-400'}`} />
                    ) : (
                      <MapPin className={`h-5 w-5 mb-1.5 ${form.deliveryType === 'delivery' ? 'text-black' : 'text-gray-400'}`} />
                    )}
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold">Delivery</span>
                      {deliveryMode === 'uber_direct' && (
                        <span className="text-[10px] bg-green-600 text-white font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wider leading-none">
                          Uber Direct
                        </span>
                      )}
                    </div>
                  </label>
                </div>

                {form.deliveryType === 'delivery' && (
                  <div className="space-y-3">
                    <AddressAutocomplete
                      value={form.deliveryAddress}
                      onChange={val => {
                         update('deliveryAddress', val);
                         setIsValidatedAddress(false);
                      }}
                      onSelectAddress={(sugg) => {
                        update('deliveryAddress', sugg.display);
                        setIsValidatedAddress(false);
                        const mappedCoords = {
                           lat: sugg.lat,
                           lng: sugg.lng,
                           displayName: sugg.display,
                           address: sugg.addressData
                        };
                        handleAddressBlur(mappedCoords);
                      }}
                      error={distanceError}
                      required={true}
                    />

                    {distanceError && (
                      <div className="flex items-start gap-2 bg-red-50 text-red-600 p-3 rounded-xl border border-red-100">
                        <Info className="h-4 w-4 shrink-0 mt-0.5" />
                        <p className="text-xs font-semibold leading-relaxed">{distanceError}</p>
                      </div>
                    )}

                    {form.deliveryCoords && (
                      <div className="h-48 w-full rounded-xl overflow-hidden border border-gray-200 my-2 shadow-inner relative z-0">
                        <AddressMap coords={form.deliveryCoords} />
                      </div>
                    )}

                    {!distanceError && isValidatedAddress && (
                      <InputField
                        icon={MapPin}
                        label="Nº Depto / Referencias (Opcional)"
                        type="text"
                        placeholder="Ej: Depto 402, Condominio Los Aromos"
                        value={form.deliveryNotes}
                        onChange={e => update('deliveryNotes', e.target.value)}
                      />
                    )}

                    {!distanceError && isValidatedAddress && (
                      <div className={`flex items-center justify-between px-4 py-3.5 rounded-xl ${deliveryMode === 'uber_direct' ? 'bg-green-700 text-white border border-green-800' : 'bg-green-50 text-green-700 border border-green-100'}`}>
                        {deliveryMode === 'uber_direct' && isQuoting ? (
                          <>
                            <span className="font-semibold text-xs text-green-100 pr-2">Cotizando envío con Uber…</span>
                            <Loader2 className="h-4 w-4 animate-spin shrink-0 text-white" />
                          </>
                        ) : deliveryMode === 'uber_direct' && form.quotePrice > 0 ? (
                          <>
                            <div className="flex items-center gap-2.5">
                              <span className="bg-white text-green-800 text-[10px] font-black uppercase px-2 py-0.5 rounded">Uber</span>
                              <span className="font-bold text-[13px] text-white">Tarifa de envío</span>
                            </div>
                            <span className="font-black text-base text-white shrink-0">{fmtPrice(form.quotePrice, form.quoteCurrency)}</span>
                          </>
                        ) : deliveryMode === 'uber_direct' ? (
                          <>
                            <div className="flex items-center gap-2.5">
                              <span className="bg-white text-green-800 text-[10px] font-black uppercase px-2 py-0.5 rounded">Uber</span>
                              <span className="font-bold text-[13px] text-white">Tarifa de envío</span>
                            </div>
                            <span className="font-black text-base text-white shrink-0">Gratis</span>
                          </>
                        ) : (
                          <>
                            <span className="font-semibold text-xs pr-2">Super, nuestro delivery llega a tu dirección.</span>
                            <span className="font-bold text-[13px] shrink-0">Valor ${fmt(form.deliveryFee)}</span>
                          </>
                        )}
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

          {/* Section: Para cuando */}
          {showScheduleSection && (
            <div className="space-y-3">
              <h2 className="text-base font-bold text-gray-900">¿Para cuándo?</h2>

              {instantAvailable && schedulingEnabled ? (
                <div className="grid grid-cols-2 gap-3">
                  <label
                    onClick={() => {
                      update('scheduleType', 'now');
                      setErrors(e => ({ ...e, scheduledAt: null }));
                    }}
                    className={`flex flex-col items-center justify-center p-3 rounded-2xl border-2 transition-all cursor-pointer text-center ${form.scheduleType === 'now'
                        ? 'bg-white border-black shadow-sm text-black'
                        : 'bg-gray-50/50 border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}
                  >
                    <Clock className={`h-5 w-5 mb-1.5 ${form.scheduleType === 'now' ? 'text-black' : 'text-gray-400'}`} />
                    <span className="text-sm font-bold">Ahora</span>
                  </label>

                  <label
                    onClick={handleOpenScheduler}
                    className={`flex flex-col items-center justify-center p-3 rounded-2xl border-2 transition-all cursor-pointer text-center ${form.scheduleType === 'scheduled'
                        ? 'bg-white border-black shadow-sm text-black'
                        : 'bg-gray-50/50 border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}
                  >
                    <CalendarClock className={`h-5 w-5 mb-1.5 ${form.scheduleType === 'scheduled' ? 'text-black' : 'text-gray-400'}`} />
                    <span className="text-sm font-bold">Programar</span>
                    {selectedScheduleLabel && form.scheduleType === 'scheduled' && (
                      <span className="text-[11px] text-gray-400 mt-0.5 font-semibold">{selectedScheduleLabel}</span>
                    )}
                  </label>
                </div>
              ) : instantAvailable ? (
                <div className="flex flex-col items-center justify-center p-3 rounded-2xl border-2 border-black bg-white shadow-sm text-center">
                  <Clock className="h-5 w-5 mb-1.5 text-black" />
                  <span className="text-sm font-bold text-black">Ahora</span>
                  <span className="text-[11px] text-gray-400 mt-0.5">Retiro inmediato</span>
                </div>
              ) : (
                <label
                  onClick={handleOpenScheduler}
                  className={`flex flex-col items-center justify-center p-3 rounded-2xl border-2 cursor-pointer text-center ${form.scheduleType === 'scheduled'
                      ? 'bg-white border-black shadow-sm text-black'
                      : 'bg-gray-50/50 border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}
                >
                  <CalendarClock className={`h-5 w-5 mb-1.5 ${form.scheduleType === 'scheduled' ? 'text-black' : 'text-gray-400'}`} />
                  <span className="text-sm font-bold">Programar</span>
                  <span className="text-[11px] text-gray-400 mt-0.5">Estamos cerrados ahora, agenda tu pedido</span>
                  {selectedScheduleLabel && form.scheduleType === 'scheduled' && (
                    <span className="text-[11px] text-black mt-0.5 font-semibold">{selectedScheduleLabel}</span>
                  )}
                </label>
              )}

              {form.scheduleType === 'scheduled' && errors.scheduledAt && (
                <p className="text-xs text-red-500 ml-1">{errors.scheduledAt}</p>
              )}
            </div>
          )}

          {/* Section: Pago */}
          <div className="space-y-3">
            <h2 className="text-base font-bold text-gray-900">Método de pago</h2>

            {isUberDelivery && (
              <p className="text-xs text-gray-400 font-medium leading-relaxed">
                Al usar Uber Direct debes realizar el pago online
              </p>
            )}

            {uberOnlineBlocked && (
              <div className="flex items-start gap-2 bg-red-50 text-red-600 p-3 rounded-xl border border-red-100">
                <Info className="h-4 w-4 shrink-0 mt-0.5" />
                <p className="text-xs font-semibold leading-relaxed">
                  Uber Direct requiere pago online, pero no hay pagos online habilitados. Contacta al local para completar tu pedido.
                </p>
              </div>
            )}

            {/* Payment Methods as radio rows */}
            <div className="space-y-2">
              {acceptsLocalPayments !== false && !isUberDelivery && (
                <label
                  onClick={() => update('paymentMethod', 'local')}
                  className={`flex items-center justify-between p-3.5 rounded-2xl border-2 transition-all cursor-pointer ${form.paymentMethod === 'local'
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
                    onChange={() => { }} // Handled by container click
                    className="h-4 w-4 accent-black text-black border-gray-300 focus:ring-black"
                  />
                </label>
              )}

              {acceptsOnlinePayments && (
                <label
                  onClick={() => update('paymentMethod', 'online')}
                  className={`flex items-center justify-between p-3.5 rounded-2xl border-2 transition-all cursor-pointer ${form.paymentMethod === 'online'
                      ? 'bg-white border-black shadow-sm'
                      : 'bg-gray-50/50 border-gray-200 hover:border-gray-300'
                    }`}
                >
                  <div className="flex items-center gap-2.5">
                    <CreditCard className={`h-4.5 w-4.5 transition-colors ${form.paymentMethod === 'online' ? 'text-gray-900' : 'text-gray-400'}`} />
                    <div className="flex items-center gap-1.5">
                      <span className={`text-sm font-bold ${form.paymentMethod === 'online' ? 'text-gray-900' : 'text-gray-500'}`}>
                        Pagar Online - Puedes usar Apple Pay o Google Pay
                      </span>
                    </div>
                  </div>
                  <input
                    type="radio"
                    name="paymentMethod"
                    checked={form.paymentMethod === 'online'}
                    onChange={() => { }} // Handled by container click
                    className="h-4 w-4 accent-black text-black border-gray-300 focus:ring-black"
                  />
                </label>
              )}
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
                placeholder="Agrega alguna petición especial"
                value={form.notes}
                onChange={e => update('notes', e.target.value)}
                className="w-full pl-11 pr-4 py-3.5 bg-white border-2 border-gray-200 rounded-2xl text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-black transition-colors resize-none"
              />
            </div>
          </div>

          <div className="h-40" />
          </div>
        </div>
      </div>

      {/* Submit CTA */}
      <div className="fixed bottom-0 left-0 right-0 z-20 p-4 bg-gradient-to-t from-gray-50 via-gray-50/90 to-transparent pt-8 pointer-events-none">
        <div className="max-w-3xl mx-auto flex flex-col items-center pointer-events-auto space-y-3">

          {form.deliveryType === 'delivery' && (form.deliveryFee > 0 || deliveryMode === 'uber_direct' || deliveryMode === 'uber_with_fallback') && (
            <div className="w-full flex flex-col gap-2 px-4 bg-white/80 backdrop-blur-md py-3 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-gray-100">
              <div className="flex justify-between items-center text-sm font-bold text-gray-700">
                <span>Subtotal (Productos)</span>
                <span>${fmt(totalAmount)}</span>
              </div>
              <div className="flex justify-between items-center text-sm font-bold text-gray-700">
                <span>
                  Costo de envío
                  {(deliveryMode === 'uber_direct' || deliveryMode === 'uber_with_fallback') && form.deliveryAddress && isValidatedAddress && !isQuoting && (
                    <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider bg-gray-100 text-gray-600">
                      {form.deliveryService === 'uber' ? 'Por Uber' : 'Reparto Propio'}
                    </span>
                  )}
                </span>
                {(deliveryMode === 'uber_direct' || deliveryMode === 'uber_with_fallback') && isQuoting ? (
                  <span className="text-gray-400 text-xs">Cotizando…</span>
                ) : form.deliveryService === 'uber' && form.quotePrice > 0 ? (
                  <span>{fmtPrice(form.quotePrice, form.quoteCurrency)}</span>
                ) : form.deliveryService === 'uber' ? (
                  <span>Gratis</span>
                ) : (
                  <span>${fmt(form.deliveryFee)}</span>
                )}
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
              nowBlocked ||
              scheduledBlocked ||
              uberOnlineBlocked ||
              totalAmount <= 0 ||
              (form.deliveryType === 'delivery' && (!!distanceError || !form.deliveryAddress.trim())) ||
              (form.deliveryType === 'delivery' && (totalAmount < (org?.delivery_min_order || 0))) ||
              (form.deliveryType === 'delivery' && form.deliveryService === 'uber' && !form.quoteId)
            }
            className={`w-full h-16 text-white font-bold rounded-full flex items-center justify-center gap-2 shadow-2xl transition-all px-8 text-[17px] tracking-wide ${(isSubmitting || nowBlocked || scheduledBlocked || uberOnlineBlocked || totalAmount <= 0 || (form.deliveryType === 'delivery' && (!!distanceError || !form.deliveryAddress.trim() || totalAmount < (org?.delivery_min_order || 0) || (form.deliveryService === 'uber' && !form.quoteId)))) ? 'bg-gray-400 cursor-not-allowed opacity-90' : 'bg-black hover:bg-gray-900 active:scale-[0.98]'}`}
          >
            {isSubmitting ? (
              <><Loader2 className="h-5 w-5 animate-spin" /> Enviando pedido…</>
            ) : scheduledBlocked ? (
              <span>Elige una hora para agendar</span>
            ) : form.scheduleType === 'now' && isClosed ? (
              <span>El local está cerrado</span>
            ) : nowBlocked ? (
              <span>No estamos aceptando pedidos en este momento</span>
            ) : totalAmount <= 0 ? (
              <span>Agrega productos a tu pedido</span>
            ) : (
              <div className="flex items-center justify-center w-full">
                <span>Confirmar y pagar</span>
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

      {/* Scheduler Modal */}
      <Modal
        isOpen={scheduleModalOpen}
        onClose={() => setScheduleModalOpen(false)}
        hideHeader
        fullScreenOnMobile
        alignEnd
        maxWidth="max-w-2xl"
      >
        <div className="flex flex-col h-full">
          {/* Header + date strip */}
          <div className="px-5 pt-6 pb-5 border-b border-gray-100 shrink-0 bg-gradient-to-b from-gray-50/80 to-transparent">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-2xl bg-black text-white flex items-center justify-center shrink-0 shadow-sm">
                  <CalendarClock className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900 leading-tight">¿Cuándo quieres retirar?</h2>
                  <p className="text-sm text-gray-500 mt-0.5">Elige la hora disponible</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setScheduleModalOpen(false)}
                className="p-2 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors text-gray-500 shrink-0 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Date strip */}
          <div className="flex gap-2 px-5 py-3 border-b border-gray-100 bg-gray-50/60 overflow-x-auto shrink-0">
            {scheduleDays.map(day => (
              <button
                key={day.iso}
                type="button"
                onClick={() => {
                  setScheduleDate(day.iso);
                  setForm(prev => ({ ...prev, scheduledAt: '' }));
                  setErrors(e => ({ ...e, scheduledAt: null }));
                }}
                className={`flex flex-col items-center gap-0.5 px-3.5 py-2 rounded-xl border transition-all shrink-0 cursor-pointer ${scheduleDate === day.iso ? 'border-black bg-white shadow-sm' : 'border-gray-200 bg-white hover:border-gray-300'}`}
              >
                <span className={`text-[10px] uppercase tracking-wider font-bold ${scheduleDate === day.iso ? 'text-black' : 'text-gray-400'}`}>{day.label}</span>
                <span className={`text-sm font-extrabold leading-none ${scheduleDate === day.iso ? 'text-black' : 'text-gray-700'}`}>{day.day}</span>
              </button>
            ))}
          </div>

          {/* Slot list with radios */}
          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
            {scheduleSlots.length === 0 ? (
              <div className="text-center py-12">
                <div className="h-16 w-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                  <CalendarClock className="h-7 w-7 text-gray-300" />
                </div>
                <p className="text-base font-bold text-gray-700">No hay horarios disponibles</p>
                <p className="text-sm text-gray-400 mt-1.5">{scheduleEmptyText}</p>
              </div>
            ) : (
              (() => {
                const grouped = {};
                scheduleSlots.forEach(slot => {
                  const h = Number(slot.split(':')[0]);
                  const period = h < 12 ? 'Mañana' : h < 19 ? 'Tarde' : 'Noche';
                  (grouped[period] = grouped[period] || []).push(slot);
                });
                const order = ['Mañana', 'Tarde', 'Noche'];
                return order.filter(p => grouped[p]).map(period => (
                  <div key={period}>
                    <h3 className="text-xs font-extrabold uppercase tracking-wider text-gray-400 mb-3">{period}</h3>
                    <div className="space-y-2.5">
                      {grouped[period].map(slot => {
                        const [sy, sm, sd] = scheduleDate.split('-').map(Number);
                        const slotIso = new Date(sy, sm - 1, sd, Number(slot.split(':')[0]), Number(slot.split(':')[1])).toISOString();
                        const selected = form.scheduledAt === slotIso;
                        return (
                          <label
                            key={slot}
                            onClick={() => handlePickSlot(slot)}
                            className={`flex items-center justify-between px-4 py-4 rounded-2xl border-2 transition-all cursor-pointer ${selected
                                ? 'border-black bg-white shadow-lg shadow-black/10'
                                : 'border-gray-200 bg-white hover:border-gray-300'
                              }`}
                          >
                            <div className="flex items-center gap-3.5">
                              <Clock className={`h-4 w-4 ${selected ? 'text-black' : 'text-gray-400'}`} />
                              <span className={`text-base font-bold ${selected ? 'text-black' : 'text-gray-800'}`}>{slot}</span>
                            </div>
                            <div className="flex items-center gap-2.5">
                              {selected && (
                                <span className="text-[11px] font-bold text-white bg-black px-2.5 py-1 rounded-full">Seleccionado</span>
                              )}
                              <span className={`h-5 w-5 rounded-full border-2 flex items-center justify-center transition-all shrink-0 ${selected ? 'border-black' : 'border-gray-300'
                                }`}>
                                {selected && <span className="w-2.5 h-2.5 rounded-full bg-black" />}
                              </span>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ));
              })()
            )}
          </div>

          {/* Fixed footer with 2 actions */}
          <div className="px-5 py-4 border-t border-gray-100 bg-white shrink-0 space-y-2.5 shadow-[0_-8px_24px_rgba(0,0,0,0.04)]">
            <button
              type="button"
              onClick={handleConfirmSchedule}
              disabled={!form.scheduledAt}
              className="w-full h-14 rounded-2xl bg-black text-white font-bold text-[16px] flex items-center justify-center gap-2 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed cursor-pointer transition-all active:scale-[0.98] shadow-lg shadow-black/20 disabled:shadow-none"
            >
              {form.scheduledAt && selectedScheduleLabel ? (
                <>
                  <CalendarClock className="h-5 w-5" />
                  Programar · {selectedScheduleLabel}
                </>
              ) : (
                <>
                  <CalendarClock className="h-5 w-5" />
                  Programar
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleChooseNow}
              className="w-full h-13 py-3.5 rounded-2xl border-2 border-gray-200 bg-white text-gray-700 font-bold text-[16px] flex items-center justify-center gap-2 hover:border-gray-400 hover:bg-gray-50 cursor-pointer transition-all active:scale-[0.98]"
            >
              <Clock className="h-5 w-5" />
              Entregar ahora
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default CheckoutForm;
