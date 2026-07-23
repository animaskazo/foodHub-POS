import React, { useState, useEffect } from 'react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import {
  getFirstOrganizationId,
  getOrganizationDetails,
  updateOrganizationDetails
} from '../services/organizationService';
import { Loader2, Save, MapPin, Search } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import DeliveryMap from '../components/admin/DeliveryMap';
import { geocodeAddress } from '../utils/geo';

const DeliverySettingsView = () => {
  useDocumentTitle('Delivery Propio');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [orgId, setOrgId] = useState(null);
  const [hasChanges, setHasChanges] = useState(false);

  const [generalAddress, setGeneralAddress] = useState('');

  const [deliveryData, setDeliveryData] = useState({
    delivery_enabled: false,
    store_lat: null,
    store_lng: null,
    delivery_polygon: [],
    delivery_fee: 0,
    delivery_min_order: 0
  });

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

        setDeliveryData({
          delivery_enabled: orgData.delivery_enabled || false,
          store_lat: initialLat,
          store_lng: initialLng,
          delivery_polygon: orgData.delivery_polygon || [],
          delivery_fee: orgData.delivery_fee || 0,
          delivery_min_order: orgData.delivery_min_order || 0
        });

        // Si lo centramos automáticamente, marcamos como cambio pendiente
        // para que el usuario pueda guardarlo
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
      await updateOrganizationDetails(orgId, {
        delivery_enabled: deliveryData.delivery_enabled,
        store_lat: deliveryData.store_lat,
        store_lng: deliveryData.store_lng,
        delivery_polygon: deliveryData.delivery_polygon,
        delivery_fee: deliveryData.delivery_fee,
        delivery_min_order: deliveryData.delivery_min_order
      });
      alert('Configuración de delivery guardada exitosamente.');
      setHasChanges(false);
    } catch (error) {
      console.error(error);
      alert('Error al guardar delivery. Asegúrate de ejecutar la migración SQL 026.');
    } finally {
      setSaving(false);
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
    <div className="flex-1 overflow-y-auto bg-gray-50 p-6 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <PageHeader
          title="Delivery Propio"
          subtitle="Configuración y zona de cobertura"
        />

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 md:p-8 space-y-6">
          <div className="flex items-center justify-between p-4 bg-gray-50 border border-gray-200 rounded-2xl">
            <div>
              <h4 className="font-bold text-sm text-gray-800">Habilitar Delivery Propio</h4>
              <p className="text-xs text-gray-500 mt-0.5 max-w-sm">
                Permite que tus clientes pidan a domicilio. Se validará que estén dentro del radio configurado.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer select-none">
              <input
                type="checkbox"
                checked={deliveryData.delivery_enabled}
                onChange={(e) => {
                  setDeliveryData({ ...deliveryData, delivery_enabled: e.target.checked });
                  setHasChanges(true);
                }}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-black"></div>
            </label>
          </div>

          {deliveryData.delivery_enabled && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Costo de Envío Fijo ($)</label>
                  <input
                    type="number"
                    value={deliveryData.delivery_fee}
                    onChange={(e) => {
                      setDeliveryData({ ...deliveryData, delivery_fee: Number(e.target.value) });
                      setHasChanges(true);
                    }}
                    className="w-full h-11 px-4 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-[15px]"
                    placeholder="Ej: 2000"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Pedido Mínimo para Delivery ($)</label>
                  <input
                    type="number"
                    value={deliveryData.delivery_min_order}
                    onChange={(e) => {
                      setDeliveryData({ ...deliveryData, delivery_min_order: Number(e.target.value) });
                      setHasChanges(true);
                    }}
                    className="w-full h-11 px-4 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-[15px]"
                    placeholder="Ej: 5000"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-gray-100">
                <div className="mb-4">
                  <h4 className="text-sm font-semibold text-gray-800">Zona de Cobertura en el Mapa</h4>
                  <div className="text-xs text-gray-500 mt-2 max-w-2xl leading-relaxed space-y-2">
                    <p>Sigue estos pasos:</p>
                    <div className="flex items-center gap-3">
                      <span><strong>1.</strong> Fija la ubicación de tu local en el centro del mapa.</span>
                      {generalAddress && (
                        <button
                          onClick={async () => {
                            const coords = await geocodeAddress(generalAddress);
                            if (coords) {
                              setDeliveryData({ ...deliveryData, store_lat: coords.lat, store_lng: coords.lng });
                              setHasChanges(true);
                            } else {
                              alert('No se pudo encontrar la dirección general en el mapa. Por favor, haz clic manualmente.');
                            }
                          }}
                          className="flex items-center gap-1.5 px-2 py-1 bg-blue-50 text-[11px] font-bold text-blue-600 rounded-md hover:bg-blue-100 transition-colors"
                        >
                          <Search className="h-3 w-3" />
                          Buscar mi local
                        </button>
                      )}
                    </div>
                    <p><strong>2.</strong> Haz clic en <strong>"Dibujar Zona"</strong> y marca punto por punto el área donde realizas entregas.</p>
                    <p className="text-blue-600 font-medium">Vértices actuales del polígono: {deliveryData.delivery_polygon?.length || 0}</p>
                  </div>
                </div>
                <DeliveryMap
                  lat={deliveryData.store_lat}
                  lng={deliveryData.store_lng}
                  polygon={deliveryData.delivery_polygon}
                  onLocationChange={(lat, lng) => {
                    setDeliveryData({ ...deliveryData, store_lat: lat, store_lng: lng });
                    setHasChanges(true);
                  }}
                  onPolygonChange={(polygon) => {
                    setDeliveryData({ ...deliveryData, delivery_polygon: polygon });
                    setHasChanges(true);
                  }}
                />
              </div>
            </>
          )}

          <div className="pt-6 border-t border-gray-100 flex items-center justify-end gap-4">
            {hasChanges && (
              <span className="text-xs text-amber-600 font-bold animate-pulse select-none">
                Tienes cambios sin guardar
              </span>
            )}
            <button
              onClick={handleSaveDelivery}
              disabled={saving || !hasChanges}
              className="flex items-center gap-2 px-6 py-2.5 bg-black text-white rounded-lg font-bold hover:bg-gray-800 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
              Guardar cambios
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeliverySettingsView;
