import React, { useState, useEffect } from 'react';
import { Banknote, CreditCard, CheckCircle2, Store, ShoppingBag, Package, Loader2, Truck, MapPin, AlertTriangle } from 'lucide-react';
import Modal from '../ui/Modal';
import { Button } from '../ui/button';
import { useAuth } from '../AuthContext';
import { geocodeAddress, findDeliveryZoneForLocation } from '../../utils/geo';
import AddressAutocomplete from '../ui/AddressAutocomplete';
import AddressMap from './AddressMap';
import { getCartTotal } from '../../utils/cartTotals';
import { supabase } from '../../lib/supabase';

const PaymentModal = ({ isOpen, onClose, cartItems, onConfirm, onSaveCustomer, onGenerateTicket, confirmOnly = false, confirmTotal = null }) => {
  const { organization } = useAuth();
  const [status, setStatus] = useState('idle'); // 'idle' | 'success'
  const [orderNumber, setOrderNumber] = useState(null);
  const [orderId, setOrderId] = useState(null);
  const [orderType, setOrderType] = useState('table'); // 'table' | 'pickup'
  const [processingMethod, setProcessingMethod] = useState(null);

  const [orderNotes, setOrderNotes] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryFee, setDeliveryFee] = useState(0);
  const [deliveryCoords, setDeliveryCoords] = useState(null);
  const [matchedZone, setMatchedZone] = useState(null);
  const [addressError, setAddressError] = useState(null);
  const [isAddressValid, setIsAddressValid] = useState(false);
  const [isValidatingAddress, setIsValidatingAddress] = useState(false);
  const [isSavingCustomer, setIsSavingCustomer] = useState(false);
  // Config de delivery del negocio (zonas, coords del local, tarifa base).
  // El organization del AuthContext NO trae delivery_zones ni settings, así
  // que sin esto la validación contra zonas corría siempre sin datos.
  const [deliveryConfig, setDeliveryConfig] = useState(null);
  const [isLoadingZones, setIsLoadingZones] = useState(false);

  // Restablecer el estado cada vez que se abre el modal
  useEffect(() => {
    if (isOpen) {
      setStatus('idle');
      setOrderNumber(null);
      setOrderId(null);
      setOrderType('table');
      setProcessingMethod(null);
      setOrderNotes('');
      setCustomerName('');
      setCustomerPhone('');
      setCustomerPhone('');
      setDeliveryAddress('');
      setDeliveryFee(0);
      setDeliveryCoords(null);
      setMatchedZone(null);
      setAddressError(null);
      setIsAddressValid(false);
      setIsValidatingAddress(false);
      setIsSavingCustomer(false);
    }
  }, [isOpen]);

  // Cargar zonas y ubicación del local al abrir: es lo que permite validar la
  // dirección contra las zonas del negocio (igual que el ecommerce).
  useEffect(() => {
    if (!isOpen || !organization?.id) return;
    let alive = true;
    setIsLoadingZones(true);
    (async () => {
      try {
        const { data, error } = await supabase
          .from('organizations')
          .select('delivery_zones, settings, store_lat, store_lng, delivery_fee, delivery_min_order, delivery_radius_km, delivery_polygon')
          .eq('id', organization.id)
          .maybeSingle();
        if (error) throw error;
        let zones = (data?.delivery_zones?.length ? data.delivery_zones : data?.settings?.delivery_zones) || [];
        // Migración legacy igual que DeliverySettingsView: polígono/tarifa
        // antiguos se tratan como Zona 1.
        if (zones.length === 0 && (data?.delivery_polygon?.length > 0 || (data?.delivery_fee || 0) > 0)) {
          zones = [{
            id: 'zone-legacy-1',
            name: 'Zona 1 - Principal',
            fee: data.delivery_fee || 0,
            min_order: data.delivery_min_order || 0,
            type: data.delivery_polygon?.length >= 3 ? 'polygon' : 'radius',
            radius_km: data.delivery_radius_km || 5,
            polygon: data.delivery_polygon || [],
            is_active: true,
          }];
        }
        if (!alive) return;
        setDeliveryConfig({
          zones,
          storeLat: data?.store_lat ?? organization?.store_lat ?? null,
          storeLng: data?.store_lng ?? organization?.store_lng ?? null,
          defaultFee: data?.delivery_fee ?? organization?.delivery_fee ?? 0,
        });
      } catch (e) {
        console.error('Error cargando zonas de delivery:', e);
        // Fallback: seguir con lo que traiga el contexto para no bloquear la venta.
        if (alive) {
          setDeliveryConfig({
            zones: [],
            storeLat: organization?.store_lat ?? null,
            storeLng: organization?.store_lng ?? null,
            defaultFee: organization?.delivery_fee ?? 0,
          });
        }
      } finally {
        if (alive) setIsLoadingZones(false);
      }
    })();
    return () => { alive = false; };
  }, [isOpen, organization?.id, organization?.store_lat, organization?.store_lng, organization?.delivery_fee]);

  const cartTotal = getCartTotal(cartItems);
  const total = cartTotal + deliveryFee;
  const subtotal = Math.round(cartTotal / 1.19);
  const tax = cartTotal - subtotal;

  const fmt = (n) => n.toLocaleString('es-CL');

  // ── Misma lógica que el ecommerce (CheckoutForm): zonas desde
  // delivery_zones o settings.delivery_zones, match por polígono/radio
  // y precio según el sector emparejado ──
  const getActiveZones = () => {
    const all = deliveryConfig
      ? (deliveryConfig.zones || [])
      : ((organization?.delivery_zones?.length
        ? organization.delivery_zones
        : organization?.settings?.delivery_zones) || []);
    return all.filter(z => z.is_active !== false);
  };

  const getStoreCoords = () => {
    const lat = deliveryConfig?.storeLat ?? organization?.store_lat;
    const lng = deliveryConfig?.storeLng ?? organization?.store_lng;
    return (lat && lng) ? { lat, lng } : null;
  };

  const getDefaultFee = () => deliveryConfig?.defaultFee ?? organization?.delivery_fee ?? 0;

  const applyMatchedZone = (coords) => {
    const activeZones = getActiveZones();
    const storeCoords = getStoreCoords();
    const hasPolygonZone = activeZones.some(z => z.type === 'polygon' && z.polygon?.length >= 3);

    // Fallback: sin zonas y sin coords del local → tarifa por defecto
    if (activeZones.length === 0 && !storeCoords) {
      setIsAddressValid(true);
      setDeliveryFee(getDefaultFee());
      setMatchedZone(null);
      setAddressError(null);
      return true;
    }

    // Las zonas por radio se miden desde el local: sin su ubicación no se
    // puede validar (los polígonos sí se pueden evaluar sin ella).
    if (!storeCoords && !hasPolygonZone && activeZones.length > 0) {
      setIsAddressValid(false);
      setDeliveryFee(0);
      setMatchedZone(null);
      setAddressError('No se puede validar la cobertura: configura la ubicación del local en Delivery.');
      return false;
    }

    const zone = findDeliveryZoneForLocation(
      coords,
      storeCoords,
      activeZones
    );

    if (!zone) {
      setIsAddressValid(false);
      setDeliveryFee(0);
      setMatchedZone(null);
      setAddressError('La dirección ingresada está fuera de la zona de cobertura.');
      return false;
    }

    setIsAddressValid(true);
    setDeliveryFee(zone.fee || 0);
    setMatchedZone(zone);
    setAddressError(null);
    return true;
  };

  const handleValidateAddress = async (preFetchedCoords = null) => {
    if (!deliveryAddress?.trim() && !preFetchedCoords) {
      setAddressError('Por favor ingresa una dirección primero.');
      return;
    }
    // Si ya está validada y no vienen coords nuevas, no re-validar
    if (isAddressValid && !preFetchedCoords) return;
    // Esperar a que carguen las zonas del negocio antes de validar
    if (isLoadingZones) {
      setAddressError('Cargando zonas de reparto… inténtalo de nuevo en un momento.');
      return;
    }
    setIsValidatingAddress(true);
    setAddressError(null);
    try {
      const coords = preFetchedCoords || await geocodeAddress(deliveryAddress);
      if (!coords) {
        setIsAddressValid(false);
        setDeliveryFee(0);
        setMatchedZone(null);
        setAddressError('No pudimos encontrar la dirección. Asegúrate de incluir comuna o ciudad.');
        return;
      }
      setDeliveryCoords({ lat: coords.lat, lng: coords.lng });
      applyMatchedZone(coords);
    } catch (error) {
      setAddressError('Error al verificar la dirección.');
    } finally {
      setIsValidatingAddress(false);
    }
  };

  const handleAddressChange = (val) => {
    setDeliveryAddress(val);
    setIsAddressValid(false);
    setDeliveryFee(0);
    setDeliveryCoords(null);
    setMatchedZone(null);
    setAddressError(null);
  };

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
        const deliveryInfo = orderType === 'delivery' ? {
          customerName,
          customerPhone,
          deliveryAddress,
          deliveryFee,
          deliveryZone: matchedZone?.name || null,
          deliveryCoords
        } : null;

        const order = await onConfirm(methodId, orderType, deliveryInfo, orderNotes);
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
  };  if (!isOpen) return null;

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
            Orden {orderNumber?.includes('#') ? '' : '#'}{orderNumber}
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
              onClick={async () => {
                // Omitir los datos no exime de imprimir: el ticket se genera en
                // cualquiera de los dos botones, ya con el paso del cliente
                // cerrado. Por eso no puede generarse al cobrar.
                if (onGenerateTicket) await onGenerateTicket(orderId);
                onClose();
              }}
              className="flex-1"
            >
              Omitir
            </Button>
            <Button 
              variant="default"
              size="lg"
              onClick={async () => {
                // Primero el cliente, después el ticket. Si se invirtiera, el
                // ticket se armaría con la orden todavía sin nombre ni teléfono.
                if (!customerName && !customerPhone) {
                  if (onGenerateTicket) await onGenerateTicket(orderId);
                  onClose();
                  return;
                }
                setIsSavingCustomer(true);
                try {
                  if (onSaveCustomer) await onSaveCustomer(orderId, customerName, customerPhone);
                  if (onGenerateTicket) await onGenerateTicket(orderId);
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
      maxWidth="max-w-2xl"
      fullScreenOnMobile={true}
    >
      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
        {/* Total a Pagar centrado verticalmente entre header y tipo de pedido */}
        <div className="py-6 md:py-8 my-auto flex flex-col items-center justify-center text-center border-b border-gray-100 shrink-0">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
            {confirmOnly ? 'Total Pedido Online' : 'Total a Pagar'}
          </span>
          <span className="text-4xl md:text-5xl font-black text-gray-900 tracking-tight">
            ${fmt(confirmOnly ? (confirmTotal ?? 0) : total)}
          </span>
          {confirmOnly && (
            <span className="text-[11px] text-amber-600 font-semibold mt-1.5">
              Selecciona el método recibido en caja
            </span>
          )}
          {!confirmOnly && orderType === 'delivery' && deliveryFee > 0 && (
            <span className="text-xs font-medium text-blue-600 mt-1.5">
              Incluye despacho ${fmt(deliveryFee)}
            </span>
          )}
        </div>

        <div className="space-y-4">
          {!confirmOnly && (
            <>
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Tipo de Pedido</h3>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setOrderType('table')}
                    className={`flex items-center justify-center py-2.5 px-3 rounded-xl border transition-all cursor-pointer font-bold text-xs ${
                      orderType === 'table'
                        ? 'border-black bg-black text-white shadow-sm'
                        : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <Store className="h-4 w-4 mr-1.5 shrink-0" />
                    <span>Local</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setOrderType('pickup')}
                    className={`flex items-center justify-center py-2.5 px-3 rounded-xl border transition-all cursor-pointer font-bold text-xs ${
                      orderType === 'pickup'
                        ? 'border-black bg-black text-white shadow-sm'
                        : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <ShoppingBag className="h-4 w-4 mr-1.5 shrink-0" />
                    <span>Pickup</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setOrderType('delivery')}
                    className={`flex items-center justify-center py-2.5 px-3 rounded-xl border transition-all cursor-pointer font-bold text-xs ${
                      orderType === 'delivery'
                        ? 'border-black bg-black text-white shadow-sm'
                        : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <Truck className="h-4 w-4 mr-1.5 shrink-0" />
                    <span>Delivery</span>
                  </button>
                </div>
              </div>

              {orderType === 'delivery' && (
                <div className="mb-6 rounded-2xl border-2 border-gray-900 bg-white animate-in fade-in slide-in-from-top-2">
                  <div className="p-4 space-y-4">
                    <h4 className="font-extrabold text-gray-900 text-[15px] flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gray-900 text-white">
                        <Truck className="h-4 w-4" />
                      </span>
                      Despacho a domicilio
                    </h4>
                    {isLoadingZones && !isAddressValid && !addressError && (
                      <p className="text-xs font-semibold text-gray-500 flex items-center gap-2">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Localizando zonas de reparto…
                      </p>
                    )}
                  <div className="space-y-3">
                    <div className="flex gap-2 items-start">
                      <div className="flex-1 min-w-0">
                        <AddressAutocomplete
                          value={deliveryAddress}
                          onChange={handleAddressChange}
                          onSelectAddress={async (sugg) => {
                            handleAddressChange(sugg.display);
                            if (isLoadingZones) {
                              setAddressError('Cargando zonas de reparto… inténtalo de nuevo en un momento.');
                              return;
                            }
                            const mappedCoords = {
                              lat: sugg.lat,
                              lng: sugg.lng,
                              displayName: sugg.display,
                              address: sugg.addressData
                            };
                            setDeliveryCoords({ lat: sugg.lat, lng: sugg.lng });
                            setIsValidatingAddress(true);
                            try {
                              // Las coords ya vienen de la API (Photon): match directo.
                              if (applyMatchedZone(mappedCoords)) return;
                              // Fallback: Photon ubica a nivel de calle y el punto puede
                              // caer fuera del polígono; re-geocodificar el texto
                              // completo (Nominatim resuelve mejor el número) y
                              // reintentar antes de declarar fuera de cobertura.
                              const geo = await geocodeAddress(sugg.display);
                              if (geo) {
                                setDeliveryCoords({ lat: geo.lat, lng: geo.lng });
                                applyMatchedZone(geo);
                              }
                            } finally {
                              setIsValidatingAddress(false);
                            }
                          }}
                          onBlur={() => handleValidateAddress()}
                          error={addressError}
                          required
                        />
                      </div>
                      <button
                        type="button"
                        disabled={isValidatingAddress || isAddressValid}
                        onClick={() => handleValidateAddress()}
                        className={`mt-7 px-4 py-3.5 font-bold text-sm rounded-xl transition-all shrink-0 flex items-center justify-center min-w-[90px] ${
                          isAddressValid
                            ? 'bg-emerald-100 text-emerald-700'
                            : isValidatingAddress
                              ? 'bg-gray-100 text-gray-400'
                              : 'bg-gray-900 text-white hover:bg-black active:scale-[0.98]'
                        }`}
                      >
                        {isValidatingAddress ? <Loader2 className="w-4 h-4 animate-spin" /> : isAddressValid ? <CheckCircle2 className="w-5 h-5" /> : 'Validar'}
                      </button>
                    </div>
                    {addressError && (
                      <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3">
                        <AlertTriangle className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
                        <div className="min-w-0">
                          <p className="text-[13px] font-bold text-red-700 leading-snug">{addressError}</p>
                          <p className="text-xs font-medium text-red-500 mt-0.5">Revisa calle, número y comuna e intenta de nuevo.</p>
                        </div>
                      </div>
                    )}
                    {isAddressValid && (
                      <div className="flex items-center gap-3 rounded-xl bg-emerald-700 px-4 py-3 text-white">
                        <CheckCircle2 className="h-5 w-5 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-extrabold leading-tight">Cobertura confirmada</p>
                          <p className="text-xs font-medium text-emerald-100 truncate">
                            {matchedZone?.name ? `Sector ${matchedZone.name}` : 'Zona de reparto'}
                          </p>
                        </div>
                        <span className="tabular-nums text-sm font-extrabold shrink-0">
                          {deliveryFee > 0 ? `$${fmt(deliveryFee)}` : 'Gratis'}
                        </span>
                      </div>
                    )}
                    {deliveryCoords && (
                      <div className="relative h-44 w-full rounded-xl overflow-hidden border border-gray-200 shadow-inner z-0">
                        <AddressMap coords={deliveryCoords} />
                        {matchedZone?.name && (
                          <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-bold text-gray-900 shadow">
                            <MapPin className="h-3 w-3" />
                            {matchedZone.name}
                          </span>
                        )}
                      </div>
                    )}
                    <div className="flex gap-3">
                      <input 
                        type="text" 
                        placeholder="Nombre *" 
                        className="w-1/2 px-4 py-2.5 rounded-xl border border-gray-200 focus:border-black focus:ring-black focus:outline-none text-sm transition-colors bg-white"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                      />
                      <input 
                        type="tel" 
                        placeholder="Teléfono *" 
                        className="w-1/2 px-4 py-2.5 rounded-xl border border-gray-200 focus:border-black focus:ring-black focus:outline-none text-sm transition-colors bg-white"
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                      />
                    </div>
                  </div>
                  </div>
                </div>
              )}

              <div className="mb-4">
                <input 
                  type="text"
                  placeholder="Comentarios (Opcional)" 
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-black focus:ring-black focus:outline-none text-sm transition-colors bg-white"
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                />
              </div>
            </>
          )}

          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Método de Pago</h3>
          <div className="grid grid-cols-1 gap-3">
            {paymentMethods.map((method) => {
              const isDeliveryFormIncomplete = orderType === 'delivery' && (!customerName || !customerPhone || !deliveryAddress || !isAddressValid);
              // Button is disabled if we are processing ANY method, or if the delivery form is incomplete (only applies if we are not processing)
              const isDisabled = processingMethod !== null || isDeliveryFormIncomplete;
              const isProcessingThis = processingMethod === method.id;

              return (
              <button
                key={method.id}
                onClick={() => handlePayment(method.id)}
                disabled={isDisabled}
                className={`flex items-center p-4 border-2 rounded-2xl md:rounded-full transition-all text-left cursor-pointer ${
                  isProcessingThis
                    ? 'border-black bg-black shadow-md opacity-100 cursor-wait'
                    : isDisabled
                    ? 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed grayscale'
                    : 'border-gray-200 bg-white hover:border-black hover:bg-gray-50 active:scale-[0.98] group'
                }`}
              >
                <method.icon className={`h-6 w-6 mr-4 shrink-0 transition-colors ${
                  isProcessingThis 
                    ? 'text-white' 
                    : processingMethod 
                      ? 'text-gray-400' 
                      : 'text-gray-700 group-hover:text-black'
                }`} />
                <div className="flex-1 min-w-0">
                  <span className={`font-bold text-base md:text-lg truncate block transition-colors ${
                    isProcessingThis 
                      ? 'text-white' 
                      : processingMethod 
                        ? 'text-gray-400' 
                        : 'text-gray-800 group-hover:text-black'
                  }`}>
                    {method.name}
                  </span>
                </div>
                {isProcessingThis && (
                  <Loader2 className="h-5 w-5 text-white ml-3 shrink-0 animate-spin" />
                )}
              </button>
            )})}
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default PaymentModal;
