import React, { useState, useEffect } from 'react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import {
  getFirstOrganizationId,
  getOrganizationDetails,
  updateOrganizationDetails
} from '../services/organizationService';
import { getAccessToken, createQuote, createDelivery, getDelivery, cancelDelivery, checkMode, TEST_LOCATIONS } from '../services/uberDirectService';
import { Loader2, Save, Search, Truck, Globe, CheckCircle2, XCircle, ExternalLink } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import DeliveryMap from '../components/admin/DeliveryMap';
import { geocodeAddress } from '../utils/geo';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';

const MODES = [
  { value: 'own', label: 'Delivery Propio', icon: Truck, desc: 'Tus propios repartidores gestionan las entregas.' },
  { value: 'uber_direct', label: 'Uber Direct', icon: Globe, desc: 'Usa la red de repartidores de Uber para las entregas.' },
];

const DeliverySettingsView = () => {
  useDocumentTitle('Configuración de Delivery');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [orgId, setOrgId] = useState(null);
  const [hasChanges, setHasChanges] = useState(false);

  const [generalAddress, setGeneralAddress] = useState('');

  const [uberEnabled, setUberEnabled] = useState(true);

  const [deliveryData, setDeliveryData] = useState({
    delivery_enabled: false,
    delivery_mode: 'own',
    store_lat: null,
    store_lng: null,
    delivery_polygon: [],
    delivery_fee: 0,
    delivery_min_order: 0,
    uber_client_id: '',
    uber_client_secret: '',
    uber_customer_id: '',
  });

  const [deliveryZones, setDeliveryZones] = useState([]);
  const [showZoneModal, setShowZoneModal] = useState(false);
  const [editingZone, setEditingZone] = useState(null);
  const [drawingZoneId, setDrawingZoneId] = useState(null);

  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);

  const [modeInfo, setModeInfo] = useState(null);
  const [modeChecking, setModeChecking] = useState(false);

  const [deliveryResult, setDeliveryResult] = useState(null);
  const [creatingDelivery, setCreatingDelivery] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const id = await getFirstOrganizationId();
      if (id) {
        setOrgId(id);
        const orgData = await getOrganizationDetails(id);

        setGeneralAddress(orgData.address || '');

        let initialLat = orgData.store_lat || null;
        let initialLng = orgData.store_lng || null;
        let didAutoCenter = false;

        if (!initialLat && orgData.address) {
          const coords = await geocodeAddress(orgData.address);
          if (coords) {
            initialLat = coords.lat;
            initialLng = coords.lng;
            didAutoCenter = true;
          }
        }

        const rawSettings = orgData.settings || {};
        const uberAllowed = orgData.uber_enabled !== false;
        setUberEnabled(uberAllowed);

        setDeliveryData({
          delivery_enabled: orgData.delivery_enabled || false,
          delivery_mode: !uberAllowed && orgData.delivery_mode === 'uber_direct' ? 'own' : (orgData.delivery_mode || 'own'),
          store_lat: initialLat,
          store_lng: initialLng,
          delivery_polygon: orgData.delivery_polygon || [],
          delivery_fee: orgData.delivery_fee || 0,
          delivery_min_order: orgData.delivery_min_order || 0,
          raw_settings: rawSettings,
          uber_client_id: orgData.uber_client_id || '',
          uber_client_secret: orgData.uber_client_secret || '',
          uber_customer_id: orgData.uber_customer_id || '',
        });

        let loadedZones = orgData.delivery_zones || rawSettings.delivery_zones || [];
        // Si el usuario ya tenía una zona/polígono o tarifa configurada previamente, migrarlo como Zona 1
        if (loadedZones.length === 0 && (orgData.delivery_polygon?.length > 0 || orgData.delivery_fee > 0)) {
          loadedZones = [{
            id: 'zone-legacy-1',
            name: 'Zona 1 - Principal',
            fee: orgData.delivery_fee || 0,
            min_order: orgData.delivery_min_order || 0,
            color: '#10B981',
            type: orgData.delivery_polygon?.length >= 3 ? 'polygon' : 'radius',
            radius_km: 5,
            polygon: orgData.delivery_polygon || [],
            is_active: true
          }];
        }
        setDeliveryZones(loadedZones);

        setHasChanges(didAutoCenter);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveDelivery = async () => {
    if (!orgId) return;
    setSaving(true);
    try {
      const updatedSettings = {
        ...(deliveryData.raw_settings || {}),
        delivery_zones: deliveryZones,
      };

      const basePayload = {
        delivery_enabled: deliveryData.delivery_enabled,
        delivery_mode: deliveryData.delivery_mode,
        store_lat: deliveryData.store_lat,
        store_lng: deliveryData.store_lng,
        delivery_polygon: deliveryData.delivery_polygon,
        delivery_fee: deliveryData.delivery_fee,
        delivery_min_order: deliveryData.delivery_min_order,
        settings: updatedSettings,
        uber_client_id: deliveryData.uber_client_id,
        uber_client_secret: deliveryData.uber_client_secret,
        uber_customer_id: deliveryData.uber_customer_id,
      };

      try {
        await updateOrganizationDetails(orgId, { ...basePayload, delivery_zones: deliveryZones });
      } catch (colErr) {
        // Fallback: Si la columna delivery_zones aún no existe en DB, guardar en la columna settings
        await updateOrganizationDetails(orgId, basePayload);
      }

      alert('Configuración de delivery guardada exitosamente.');
      setHasChanges(false);
      setTestResult(null);
    } catch (error) {
      console.error('Error al guardar:', error);
      alert(`Error al guardar: ${error.message || error}`);
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    setModeInfo(null);
    try {
      const tokenRes = await getAccessToken(deliveryData.uber_client_id, deliveryData.uber_client_secret);
      const token = tokenRes.access_token;
      const cid = deliveryData.uber_customer_id;

      const quoteRes = await createQuote(cid, token, {
        pickup_address: JSON.stringify(TEST_LOCATIONS.pickup.address),
        dropoff_address: JSON.stringify(TEST_LOCATIONS.dropoff.address),
        pickup_latitude: TEST_LOCATIONS.pickup.lat,
        pickup_longitude: TEST_LOCATIONS.pickup.lng,
        dropoff_latitude: TEST_LOCATIONS.dropoff.lat,
        dropoff_longitude: TEST_LOCATIONS.dropoff.lng,
        pickup_phone_number: TEST_LOCATIONS.pickup.phone,
        dropoff_phone_number: TEST_LOCATIONS.dropoff.phone,
      });

      setTestResult({ success: true, fee: quoteRes.fee, currency: quoteRes.currency, token, cid });
    } catch (err) {
      setTestResult({ success: false, error: err.message });
    } finally {
      setTesting(false);
    }
  };

  const handleCheckMode = async () => {
    if (!testResult?.token) return;
    setModeChecking(true);
    setModeInfo(null);
    try {
      const result = await checkMode(testResult.cid, testResult.token);
      setModeInfo(result);
    } catch (err) {
      setModeInfo({ error: err.message });
    } finally {
      setModeChecking(false);
    }
  };

  const handleCreateTestDelivery = async () => {
    setCreatingDelivery(true);
    setDeliveryResult(null);
    try {
      const tokenRes = await getAccessToken(deliveryData.uber_client_id, deliveryData.uber_client_secret);
      const token = tokenRes.access_token;
      const cid = deliveryData.uber_customer_id;

      const p = TEST_LOCATIONS.pickup;
      const d = TEST_LOCATIONS.dropoff;

      const quoteRes = await createQuote(cid, token, {
        pickup_address: JSON.stringify(p.address),
        dropoff_address: JSON.stringify(d.address),
        pickup_latitude: p.lat,
        pickup_longitude: p.lng,
        dropoff_latitude: d.lat,
        dropoff_longitude: d.lng,
        pickup_phone_number: p.phone,
        dropoff_phone_number: d.phone,
      });

      const deliveryRes = await createDelivery(cid, token, {
        quote_id: quoteRes.id,
        pickup_address: JSON.stringify(p.address),
        pickup_name: p.name,
        pickup_phone_number: p.phone,
        pickup_latitude: p.lat,
        pickup_longitude: p.lng,
        dropoff_address: JSON.stringify(d.address),
        dropoff_name: d.name,
        dropoff_phone_number: d.phone,
        dropoff_latitude: d.lat,
        dropoff_longitude: d.lng,
        manifest_items: [
          { name: 'Caja de prueba', quantity: 1, weight: 10 },
        ],
      });

      setDeliveryResult({ delivery: deliveryRes, token, cid });
    } catch (err) {
      setDeliveryResult({ error: err.message });
    } finally {
      setCreatingDelivery(false);
    }
  };

  const handleCheckStatus = async () => {
    if (!deliveryResult?.delivery?.id) return;
    setCheckingStatus(true);
    try {
      const res = await getDelivery(deliveryResult.cid, deliveryResult.token, deliveryResult.delivery.id);
      setDeliveryResult(prev => ({ ...prev, delivery: res }));
    } catch (err) {
      alert('Error al obtener estado: ' + err.message);
    } finally {
      setCheckingStatus(false);
    }
  };

  const handleCancelDelivery = async () => {
    if (!deliveryResult?.delivery?.id) return;
    setCancelling(true);
    try {
      await cancelDelivery(deliveryResult.cid, deliveryResult.token, deliveryResult.delivery.id);
      const res = await getDelivery(deliveryResult.cid, deliveryResult.token, deliveryResult.delivery.id);
      setDeliveryResult(prev => ({ ...prev, delivery: res }));
    } catch (err) {
      alert('Error al cancelar: ' + err.message);
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-full bg-gray-50 p-6 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4">
          <PageHeader
            title="Configuración de Delivery"
            subtitle="Elige cómo gestionarás las entregas a domicilio"
          />
          <div className="flex items-center gap-4 shrink-0 pt-1">
            {hasChanges && (
              <span className="text-xs text-amber-600 font-bold animate-pulse select-none">
                Tienes cambios sin guardar
              </span>
            )}
            <Button
              onClick={handleSaveDelivery}
              disabled={saving || !hasChanges}
              className="flex items-center gap-2 px-6 py-2.5 bg-black text-white font-bold hover:bg-gray-800 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
              Guardar cambios
            </Button>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-6 md:p-8 space-y-6">

          <div className="flex items-center justify-between p-4 bg-gray-50 border border-gray-200 rounded-2xl">
            <div>
              <h4 className="font-bold text-sm text-gray-800">Habilitar Delivery</h4>
              <p className="text-xs text-gray-500 mt-0.5 max-w-sm">
                Activa o desactiva la opción de entregas a domicilio para tus clientes.
              </p>
            </div>
            <Switch
              checked={deliveryData.delivery_enabled}
              onCheckedChange={(checked) => {
                setDeliveryData({ ...deliveryData, delivery_enabled: checked });
                setHasChanges(true);
              }}
            />
          </div>

          {deliveryData.delivery_enabled && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {MODES.map((mode) => {
                  const Icon = mode.icon;
                  const isActive = deliveryData.delivery_mode === mode.value;
                  const isUber = mode.value === 'uber_direct';
                  const locked = isUber && !uberEnabled;
                  return (
                    <button
                      key={mode.value}
                      disabled={locked}
                      onClick={() => {
                        if (locked) return;
                        setDeliveryData({ ...deliveryData, delivery_mode: mode.value });
                        setHasChanges(true);
                        setTestResult(null);
                      }}
                      className={`flex items-start gap-4 p-5 rounded-2xl border-2 text-left transition-all cursor-pointer ${
                        locked
                          ? 'border-gray-100 bg-gray-50 opacity-60 cursor-not-allowed'
                          : isActive
                            ? 'border-blue-500 bg-blue-50/50'
                            : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}
                    >
                      <div className={`p-2.5 rounded-xl ${isActive ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`font-bold text-sm ${isActive ? 'text-blue-800' : 'text-gray-800'}`}>
                          {mode.label}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {locked ? 'Disponible solo con permiso del super admin' : mode.desc}
                        </p>
                      </div>
                      {isActive && !locked && (
                        <div className="h-5 w-5 rounded-full bg-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                          <CheckCircle2 className="h-3 w-3 text-white" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

                           {deliveryData.delivery_mode === 'own' && (
                <div className="pt-4 border-t border-gray-100">
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                    
                    {/* Columna Izquierda: Listado de Zonas y Controles (col-span-5) */}
                    <div className="lg:col-span-5 space-y-4">
                      <div className="flex items-center justify-between gap-3 pb-3 border-b border-gray-100">
                        <div>
                          <h4 className="text-base font-bold text-gray-900">Zonas de Delivery</h4>
                          <p className="text-xs text-gray-500 mt-0.5">
                            Configura tus tarifas por radio (km) o trazado.
                          </p>
                        </div>
                        <Button
                          type="button"
                          onClick={() => {
                            const colors = ['#10B981', '#3B82F6', '#F59E0B', '#8B5CF6', '#EC4899', '#EF4444'];
                            const nextColor = colors[deliveryZones.length % colors.length];
                            setEditingZone({
                              id: 'zone-' + Date.now(),
                              name: `Zona ${deliveryZones.length + 1}`,
                              fee: 1500,
                              min_order: 0,
                              color: nextColor,
                              type: 'radius',
                              radius_km: 3,
                              polygon: [],
                              is_active: true
                            });
                            setShowZoneModal(true);
                          }}
                          className="bg-black text-white font-bold text-xs px-3.5 py-2 rounded-xl flex items-center gap-1.5 shrink-0"
                        >
                          + Nueva Zona
                        </Button>
                      </div>

                      {/* Tarjetas de Zonas */}
                      {deliveryZones.length === 0 ? (
                        <div className="p-6 text-center bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                          <p className="text-sm font-semibold text-gray-600">Sin zonas de envío creadas.</p>
                          <p className="text-xs text-gray-400 mt-1">Presiona "+ Nueva Zona" para agregar tu primer sector de reparto.</p>
                        </div>
                      ) : (
                        <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                          {deliveryZones.map((zone) => (
                            <div
                              key={zone.id}
                              className={`p-4 rounded-2xl border transition-all flex flex-col justify-between ${
                                zone.is_active ? 'bg-white border-gray-200 shadow-sm' : 'bg-gray-50 border-gray-200 opacity-60'
                              }`}
                            >
                              <div>
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-2">
                                    <span
                                      className="w-3.5 h-3.5 rounded-full shrink-0 shadow-sm"
                                      style={{ backgroundColor: zone.color || '#3b82f6' }}
                                    />
                                    <h5 className="font-extrabold text-sm text-gray-900">{zone.name}</h5>
                                  </div>
                                  <Switch
                                    checked={zone.is_active !== false}
                                    onCheckedChange={(checked) => {
                                      setDeliveryZones(deliveryZones.map(z => z.id === zone.id ? { ...z, is_active: checked } : z));
                                      setHasChanges(true);
                                    }}
                                  />
                                </div>

                                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold mt-3">
                                  <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-lg border border-emerald-200/80">
                                    Envío: ${Number(zone.fee || 0).toLocaleString('es-CL')}
                                  </span>
                                  {zone.min_order > 0 && (
                                    <span className="px-2.5 py-1 bg-amber-50 text-amber-700 rounded-lg border border-amber-200/80">
                                      Min: ${Number(zone.min_order).toLocaleString('es-CL')}
                                    </span>
                                  )}
                                  <span className="px-2.5 py-1 bg-gray-100 text-gray-700 rounded-lg">
                                    {zone.type === 'radius' ? `📏 Radio ${zone.radius_km || 0} km` : `🗺️ Polígono (${zone.polygon?.length || 0} ptos)`}
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center justify-between gap-2 mt-4 pt-3 border-t border-gray-100">
                                {zone.type === 'polygon' && (
                                  <Button
                                    type="button"
                                    onClick={() => setDrawingZoneId(zone.id)}
                                    className={`text-xs font-bold px-3 py-1.5 h-auto rounded-lg flex items-center gap-1 ${
                                      drawingZoneId === zone.id ? 'bg-amber-500 text-black font-extrabold' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                                    }`}
                                  >
                                    🖊️ {drawingZoneId === zone.id ? 'Dibujando...' : 'Dibujar en mapa'}
                                  </Button>
                                )}
                                <div className="flex items-center gap-2 ml-auto">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => {
                                      setEditingZone({ ...zone });
                                      setShowZoneModal(true);
                                    }}
                                    className="text-xs font-bold px-3 py-1.5 h-auto rounded-lg"
                                  >
                                    Editar
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => {
                                      if (drawingZoneId === zone.id) setDrawingZoneId(null);
                                      setDeliveryZones(deliveryZones.filter(z => z.id !== zone.id));
                                      setHasChanges(true);
                                    }}
                                    className="text-xs font-bold px-3 py-1.5 h-auto rounded-lg text-red-600 border-red-100 hover:bg-red-50"
                                  >
                                    Eliminar
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Columna Derecha: Mapa Interactivo (col-span-7) */}
                    <div id="delivery-map-section" className="lg:col-span-7 space-y-3 sticky top-6">
                      <div>
                        <h4 className="text-base font-bold text-gray-900">Mapa de Cobertura</h4>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Visualización interactiva de las zonas y trazado de polígonos.
                        </p>
                      </div>

                      {/* Banner de dibujo interactivo */}
                      {drawingZoneId && (() => {
                        const activeZone = deliveryZones.find(z => z.id === drawingZoneId);
                        if (!activeZone) return null;
                        return (
                          <div className="p-3.5 bg-amber-400 text-black rounded-2xl shadow-md flex flex-wrap items-center justify-between gap-3 animate-in fade-in">
                            <div className="flex items-center gap-2 font-black text-sm">
                              <span className="w-3.5 h-3.5 rounded-full border border-black/30 shrink-0" style={{ backgroundColor: activeZone.color || '#3b82f6' }} />
                              <span>Dibujando: "{activeZone.name}" ({activeZone.polygon?.length || 0} ptos)</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                type="button"
                                onClick={() => {
                                  setDeliveryZones(deliveryZones.map(z => z.id === drawingZoneId ? { ...z, polygon: [] } : z));
                                  setHasChanges(true);
                                }}
                                className="bg-white/80 text-black hover:bg-white text-xs font-bold px-3 py-1.5 rounded-xl border border-black/10"
                              >
                                🗑️ Limpiar
                              </Button>
                              <Button
                                type="button"
                                onClick={() => setDrawingZoneId(null)}
                                className="bg-black text-white hover:bg-gray-900 text-xs font-bold px-4 py-1.5 rounded-xl shadow-sm"
                              >
                                ✅ Listo
                              </Button>
                            </div>
                          </div>
                        );
                      })()}

                      <DeliveryMap
                        lat={deliveryData.store_lat}
                        lng={deliveryData.store_lng}
                        polygon={drawingZoneId ? (deliveryZones.find(z => z.id === drawingZoneId)?.polygon || []) : (editingZone?.type === 'polygon' ? editingZone.polygon : [])}
                        zones={deliveryZones}
                        activeZoneId={drawingZoneId || editingZone?.id}
                        activeZoneColor={drawingZoneId ? deliveryZones.find(z => z.id === drawingZoneId)?.color : (editingZone?.color || null)}
                        isDrawingMode={!!drawingZoneId}
                        onLocationChange={(lat, lng) => {
                          setDeliveryData({ ...deliveryData, store_lat: lat, store_lng: lng });
                          setHasChanges(true);
                        }}
                        onPolygonChange={(polygon) => {
                          if (drawingZoneId) {
                            setDeliveryZones(deliveryZones.map(z => z.id === drawingZoneId ? { ...z, polygon } : z));
                            setHasChanges(true);
                          } else if (editingZone && editingZone.type === 'polygon') {
                            setEditingZone({ ...editingZone, polygon });
                            setHasChanges(true);
                          }
                        }}
                      />
                    </div>

                  </div>
                
                {/* Modal de Creación / Edición de Zona */}
                {showZoneModal && editingZone && (
                  <div className="fixed inset-0 z-[2000] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
                    <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in duration-200">
                      <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                        <h3 className="font-extrabold text-lg text-gray-900">
                          {editingZone.id?.startsWith('zone-') ? 'Nueva Zona de Delivery' : 'Editar Zona de Delivery'}
                        </h3>
                        <button
                          type="button"
                          onClick={() => {
                            setShowZoneModal(false);
                            setEditingZone(null);
                          }}
                          className="text-gray-400 hover:text-gray-600 font-bold text-lg px-2"
                        >
                          ✕
                        </button>
                      </div>

                      <div className="space-y-4">
                        <div>
                          <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Nombre de la Zona</label>
                          <input
                            type="text"
                            value={editingZone.name}
                            onChange={(e) => setEditingZone({ ...editingZone, name: e.target.value })}
                            className="w-full h-11 px-3.5 rounded-xl border border-gray-200 font-semibold text-sm outline-none focus:border-black"
                            placeholder="Ej: Zona 1 - Centro / Cercana"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Costo Envío ($)</label>
                            <input
                              type="number"
                              min="0"
                              value={editingZone.fee}
                              onChange={(e) => setEditingZone({ ...editingZone, fee: Number(e.target.value) })}
                              className="w-full h-11 px-3.5 rounded-xl border border-gray-200 font-semibold text-sm outline-none focus:border-black"
                              placeholder="Ej: 1500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Monto Mínimo ($)</label>
                            <input
                              type="number"
                              min="0"
                              value={editingZone.min_order}
                              onChange={(e) => setEditingZone({ ...editingZone, min_order: Number(e.target.value) })}
                              className="w-full h-11 px-3.5 rounded-xl border border-gray-200 font-semibold text-sm outline-none focus:border-black"
                              placeholder="Ej: 5000"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Tipo de Cobertura</label>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => setEditingZone({ ...editingZone, type: 'radius' })}
                              className={`p-3 rounded-xl border font-bold text-xs flex items-center justify-center gap-2 ${
                                editingZone.type === 'radius' ? 'bg-black text-white border-black' : 'bg-gray-50 border-gray-200 text-gray-700'
                              }`}
                            >
                              📏 Radio en KM
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingZone({ ...editingZone, type: 'polygon' })}
                              className={`p-3 rounded-xl border font-bold text-xs flex items-center justify-center gap-2 ${
                                editingZone.type === 'polygon' ? 'bg-black text-white border-black' : 'bg-gray-50 border-gray-200 text-gray-700'
                              }`}
                            >
                              🗺️ Polígono Dibujado
                            </button>
                          </div>
                        </div>

                        {editingZone.type === 'radius' && (
                          <div>
                            <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Distancia Máxima (Kilómetros)</label>
                            <input
                              type="number"
                              step="0.5"
                              min="0.5"
                              value={editingZone.radius_km}
                              onChange={(e) => setEditingZone({ ...editingZone, radius_km: Number(e.target.value) })}
                              className="w-full h-11 px-3.5 rounded-xl border border-gray-200 font-semibold text-sm outline-none focus:border-black"
                              placeholder="Ej: 3.5"
                            />
                            <span className="text-[11px] text-gray-400 mt-1 block">Aplica a cualquier dirección dentro de este radio desde tu local.</span>
                          </div>
                        )}

                        {editingZone.type === 'polygon' && (
                          <div className="p-4 bg-blue-50 border border-blue-100 rounded-2xl space-y-2">
                            <p className="text-xs font-bold text-blue-900">🗺️ Trazado de Polígono en el Mapa</p>
                            <p className="text-xs text-blue-700 leading-relaxed">
                              Puntos marcados actualmente: <strong>{editingZone.polygon?.length || 0}</strong>.
                            </p>
                            <Button
                              type="button"
                              onClick={() => {
                                const exists = deliveryZones.some(z => z.id === editingZone.id);
                                if (exists) {
                                  setDeliveryZones(deliveryZones.map(z => z.id === editingZone.id ? editingZone : z));
                                } else {
                                  setDeliveryZones([...deliveryZones, editingZone]);
                                }
                                setDrawingZoneId(editingZone.id);
                                setShowZoneModal(false);
                                document.getElementById('delivery-map-section')?.scrollIntoView({ behavior: 'smooth' });
                              }}
                              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-2.5 rounded-xl flex items-center justify-center gap-2 mt-1"
                            >
                              🖊️ Ir al Mapa para Dibujar Puntos
                            </Button>
                          </div>
                        )}

                        <div>
                          <label className="block text-xs font-bold text-gray-700 uppercase mb-1.5">Color Identificador</label>
                          <div className="flex items-center gap-2">
                            {['#10B981', '#3B82F6', '#F59E0B', '#8B5CF6', '#EC4899', '#EF4444', '#6366F1'].map((c) => (
                              <button
                                key={c}
                                type="button"
                                onClick={() => setEditingZone({ ...editingZone, color: c })}
                                className={`w-7 h-7 rounded-full transition-transform ${editingZone.color === c ? 'ring-2 ring-black scale-110' : 'hover:scale-105'}`}
                                style={{ backgroundColor: c }}
                              />
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-4">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setShowZoneModal(false);
                            setEditingZone(null);
                          }}
                          className="font-bold text-xs px-4 py-2 rounded-xl"
                        >
                          Cancelar
                        </Button>
                        <Button
                          type="button"
                          onClick={() => {
                            if (!editingZone.name) {
                              alert('Por favor ingresa un nombre para la zona.');
                              return;
                            }
                            const exists = deliveryZones.some(z => z.id === editingZone.id);
                            if (exists) {
                              setDeliveryZones(deliveryZones.map(z => z.id === editingZone.id ? editingZone : z));
                            } else {
                              setDeliveryZones([...deliveryZones, editingZone]);
                            }
                            setHasChanges(true);
                            setShowZoneModal(false);
                            setEditingZone(null);
                          }}
                          className="bg-black text-white font-bold text-xs px-5 py-2 rounded-xl"
                        >
                          Guardar Zona
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
                </div>
              )}


              {deliveryData.delivery_mode === 'uber_direct' && (
                <div className="space-y-5">
                  <div>
                    <h4 className="text-sm font-semibold text-gray-800 mb-1">Credenciales de Uber Direct</h4>
                    <p className="text-xs text-gray-500 mb-4">
                      Ingresa las credenciales de tu aplicación Uber Direct desde el{' '}
                      <a href="https://direct.uber.com" target="_blank" rel="noopener noreferrer"
                        className="text-blue-600 underline">Dashboard de Uber Direct</a>.
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Client ID</label>
                    <div className="form-field flex items-center px-4">
                      <input
                        type="text"
                        value={deliveryData.uber_client_id}
                        onChange={(e) => {
                          setDeliveryData({ ...deliveryData, uber_client_id: e.target.value });
                          setHasChanges(true);
                        }}
                        className="flex-1 h-12 bg-transparent outline-none text-[15px] font-mono"
                        placeholder="Tu Client ID de Uber"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Client Secret</label>
                    <div className="form-field flex items-center px-4">
                      <input
                        type="password"
                        value={deliveryData.uber_client_secret}
                        onChange={(e) => {
                          setDeliveryData({ ...deliveryData, uber_client_secret: e.target.value });
                          setHasChanges(true);
                        }}
                        className="flex-1 h-12 bg-transparent outline-none text-[15px] font-mono"
                        placeholder="Tu Client Secret de Uber"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Customer ID</label>
                    <div className="form-field flex items-center px-4">
                      <input
                        type="text"
                        value={deliveryData.uber_customer_id}
                        onChange={(e) => {
                          setDeliveryData({ ...deliveryData, uber_customer_id: e.target.value });
                          setHasChanges(true);
                        }}
                        className="flex-1 h-12 bg-transparent outline-none text-[15px] font-mono"
                        placeholder="Tu Customer ID de Uber"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <Button
                      onClick={handleTestConnection}
                      disabled={testing || !deliveryData.uber_client_id || !deliveryData.uber_client_secret || !deliveryData.uber_customer_id}
                      className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white font-bold hover:bg-blue-700 transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
                      {testing ? 'Probando...' : 'Probar Conexión'}
                    </Button>

                    {testResult && (
                      <div className={`flex items-center gap-2 text-sm font-semibold ${
                        testResult.success ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {testResult.success ? (
                          <>
                            <CheckCircle2 className="h-4 w-4" />
                            Conexión exitosa — Cotización: {testResult.fee / 100} {testResult.currency?.toUpperCase()}
                          </>
                        ) : (
                          <>
                            <XCircle className="h-4 w-4" />
                            Error: {testResult.error}
                          </>
                        )}
                      </div>
                    )}

                    {testResult?.success && !modeInfo && (
                      <div className="flex items-center gap-3">
                        <Button
                          onClick={handleCheckMode}
                          disabled={modeChecking}
                          className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-xs font-bold hover:bg-purple-700 transition-colors disabled:opacity-50 cursor-pointer"
                        >
                          {modeChecking ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                          {modeChecking ? 'Verificando...' : 'Verificar modo (Sandbox / Producción)'}
                        </Button>
                        <span className="text-xs text-gray-500">
                          Crea y cancela un delivery automáticamente para detectar el modo.
                        </span>
                      </div>
                    )}

                    {modeInfo && (
                      <div className={`flex items-start gap-3 p-4 rounded-2xl border ${
                        modeInfo.live_mode
                          ? 'bg-red-50 border-red-200'
                          : 'bg-green-50 border-green-200'
                      }`}>
                        {modeInfo.live_mode
                          ? <XCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                          : <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
                        }
                        <div className="flex-1 min-w-0">
                          <h4 className={`text-sm font-bold ${
                            modeInfo.live_mode ? 'text-red-800' : 'text-green-800'
                          }`}>
                            {modeInfo.live_mode
                              ? '⚠️ MODO PRODUCCIÓN — Las credenciales son reales'
                              : '✅ MODO SANDBOX — Ambiente de pruebas seguro'
                            }
                          </h4>
                          <p className={`text-xs mt-0.5 ${
                            modeInfo.live_mode ? 'text-red-600' : 'text-green-600'
                          }`}>
                            {modeInfo.live_mode
                              ? 'Estas credenciales generan cobros reales. No puedes crear deliveries de prueba desde aquí. Usa las credenciales de test mode (banner azul) en el dashboard de Uber Direct.'
                              : 'Puedes crear deliveries de prueba sin riesgo de cargos reales.'
                            }
                          </p>
                          {modeInfo.delivery_id && (
                            <div className="mt-2 text-xs text-gray-500 flex items-center gap-3 flex-wrap">
                              <span>Delivery: <span className="font-mono">{modeInfo.delivery_id}</span></span>
                              <span>Estado: <span className={`font-semibold ${
                                modeInfo.status === 'canceled' ? 'text-red-500' :
                                modeInfo.status === 'dropoff' ? 'text-green-500' : 'text-blue-500'
                              }`}>{modeInfo.status}</span></span>
                              <span>{modeInfo.cancelled ? '✓ Cancelado' : 'Auto-completado (no requiere cancelación)'}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {testResult?.success && modeInfo && !modeInfo.live_mode && (
                    <div className="pt-4 border-t border-gray-100 space-y-4">
                      <div>
                        <h4 className="text-sm font-semibold text-gray-800">Probar Delivery Completo</h4>
                        <p className="text-xs text-gray-500">Crea un delivery de prueba con datos fijos de Nueva York y cancélalo.</p>
                      </div>

                      <Button
                        onClick={handleCreateTestDelivery}
                        disabled={creatingDelivery}
                        className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white font-bold hover:bg-green-700 transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        {creatingDelivery ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
                        {creatingDelivery ? 'Creando...' : 'Crear Delivery de Prueba'}
                      </Button>

                      {deliveryResult?.error && (
                        <div className="flex items-center gap-2 text-sm font-semibold text-red-600">
                          <XCircle className="h-4 w-4" />
                          Error: {deliveryResult.error}
                        </div>
                      )}

                      {deliveryResult?.delivery && (
                        <div className="bg-gray-50 rounded-2xl border border-gray-200 p-5 space-y-3">
                          <div className={`px-3 py-2 rounded-lg text-xs font-bold text-center mb-2 ${
                            deliveryResult.delivery.live_mode
                              ? 'bg-red-100 text-red-700 border border-red-300'
                              : 'bg-green-100 text-green-700 border border-green-300'
                          }`}>
                            {deliveryResult.delivery.live_mode ? '⚠️ MODO PRODUCCIÓN — Cargo real' : '✅ MODO SANDBOX — Solo prueba'}
                          </div>

                          <div className="grid grid-cols-2 gap-3 text-sm">
                            <div>
                              <span className="text-gray-500">ID:</span>
                              <p className="font-mono text-xs mt-0.5 break-all">{deliveryResult.delivery.id}</p>
                            </div>
                            <div>
                              <span className="text-gray-500">Estado:</span>
                              <p className={`font-bold mt-0.5 ${
                                deliveryResult.delivery.status === 'canceled' ? 'text-red-600' :
                                deliveryResult.delivery.status === 'dropoff' ? 'text-green-600' :
                                'text-blue-600'
                              }`}>
                                {deliveryResult.delivery.status}
                              </p>
                            </div>
                            <div>
                              <span className="text-gray-500">Fee:</span>
                              <p className="font-bold mt-0.5">${(deliveryResult.delivery.fee / 100).toFixed(2)} {deliveryResult.delivery.currency}</p>
                            </div>
                            <div>
                              <span className="text-gray-500">Completado:</span>
                              <p className="mt-0.5">{deliveryResult.delivery.complete ? 'Sí' : 'No'}</p>
                            </div>
                          </div>

                          {deliveryResult.delivery.tracking_url && (
                            <div>
                              <span className="text-sm text-gray-500">Tracking URL:</span>
                              <a
                                href={deliveryResult.delivery.tracking_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 text-sm text-blue-600 underline mt-0.5 break-all"
                              >
                                {deliveryResult.delivery.tracking_url}
                                <ExternalLink className="h-3 w-3 shrink-0" />
                              </a>
                            </div>
                          )}

                          <div className="flex items-center gap-2 pt-2">
                            <Button
                              onClick={handleCheckStatus}
                              disabled={checkingStatus}
                              className="flex items-center gap-1.5 px-4 py-2 bg-gray-800 text-white text-xs font-bold hover:bg-gray-700 transition-colors disabled:opacity-50 cursor-pointer"
                            >
                              {checkingStatus ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                              Ver Estado
                            </Button>
                            <Button
                              onClick={handleCancelDelivery}
                              disabled={cancelling || deliveryResult.delivery.status === 'canceled'}
                              className="flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white text-xs font-bold hover:bg-red-700 transition-colors disabled:opacity-50 cursor-pointer"
                            >
                              {cancelling ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                              Cancelar Delivery
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          <div className="pt-6 border-t border-gray-100"></div>
        </div>
      </div>
    </div>
  );
};

export default DeliverySettingsView;
