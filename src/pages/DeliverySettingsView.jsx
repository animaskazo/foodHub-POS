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

        setDeliveryData({
          delivery_enabled: orgData.delivery_enabled || false,
          store_lat: orgData.store_lat || null,
          store_lng: orgData.store_lng || null,
          delivery_polygon: orgData.delivery_polygon || [],
          delivery_fee: orgData.delivery_fee || 0,
          delivery_min_order: orgData.delivery_min_order || 0
        });
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
      alert('Configuración de delivery guardada exitosamente');
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
      <div className="max-w-4xl mx-auto space-y-6">
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
                onChange={(e) => setDeliveryData({...deliveryData, delivery_enabled: e.target.checked})}
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
                    onChange={(e) => setDeliveryData({...deliveryData, delivery_fee: Number(e.target.value)})}
                    className="w-full h-11 px-4 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-[15px]"
                    placeholder="Ej: 2000"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Pedido Mínimo para Delivery ($)</label>
                  <input
                    type="number"
                    value={deliveryData.delivery_min_order}
                    onChange={(e) => setDeliveryData({...deliveryData, delivery_min_order: Number(e.target.value)})}
                    className="w-full h-11 px-4 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-[15px]"
                    placeholder="Ej: 5000"
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-end mb-2">
                  <label className="block text-sm font-semibold text-gray-700">
                    Zona de Reparto (Puntos del polígono: {deliveryData.delivery_polygon?.length || 0})
                  </label>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Dibuja un polígono en el mapa. Los clientes fuera del área dibujada no podrán hacer pedidos.
                </p>
              </div>

              <div className="pt-2">
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-sm font-semibold text-gray-700">Zona de Cobertura en el Mapa</label>
                  {generalAddress && (
                    <button
                      onClick={async () => {
                        const coords = await geocodeAddress(generalAddress);
                        if (coords) {
                          setDeliveryData({...deliveryData, store_lat: coords.lat, store_lng: coords.lng});
                        } else {
                          alert('No se pudo encontrar la dirección general en el mapa. Por favor, haz clic manualmente.');
                        }
                      }}
                      className="flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors"
                    >
                      <Search className="h-3.5 w-3.5" />
                      Buscar mi dirección general
                    </button>
                  )}
                </div>
                <p className="text-xs text-gray-500 mb-3 -mt-2">
                  Haz clic en "Dibujar Zona" y marca los puntos alrededor de tu local.
                </p>
                <DeliveryMap 
                  lat={deliveryData.store_lat} 
                  lng={deliveryData.store_lng} 
                  polygon={deliveryData.delivery_polygon}
                  onLocationChange={(lat, lng) => setDeliveryData({...deliveryData, store_lat: lat, store_lng: lng})}
                  onPolygonChange={(polygon) => setDeliveryData({...deliveryData, delivery_polygon: polygon})}
                />
              </div>
            </>
          )}

          <div className="pt-6 border-t border-gray-100 flex justify-end">
            <button
              onClick={handleSaveDelivery}
              disabled={saving}
              className="flex items-center gap-2 px-6 py-2.5 bg-black text-white rounded-lg font-bold hover:bg-gray-800 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
              Guardar Delivery
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeliverySettingsView;
