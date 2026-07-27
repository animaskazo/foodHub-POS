import React, { useState } from 'react';
import Modal from '../ui/Modal';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { openShift, closeShift } from '../../services/shiftService';
import { useAuth } from '../AuthContext';
import { toast } from 'sonner';
import { Loader2, DollarSign, Store } from 'lucide-react';

const ShiftModal = ({ isOpen, onClose, type = 'open', settings, organizationId, shiftId, totalSales = 0, onSuccess }) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [balance, setBalance] = useState('');

  const handleConfirm = async () => {
    if (!organizationId || !user?.id) return;
    try {
      setLoading(true);
      const numericBalance = Number(balance.replace(/\D/g, '')) || 0;

      if (type === 'open') {
        if (settings?.require_starting_cash && !balance) {
          toast.error('Debes ingresar el monto inicial');
          return;
        }
        await openShift(organizationId, numericBalance, user.id);
        toast.success('Caja abierta exitosamente');
      } else {
        if (settings?.require_ending_cash && !balance) {
          toast.error('Debes ingresar el monto final de caja');
          return;
        }
        // Ending balance logic: 
        // starting_balance (from DB, but we don't have it here directly unless we fetch it. We'll let the backend or next phase handle the exact calculation)
        // For now, we save the reported balance
        await closeShift(shiftId, numericBalance, numericBalance, totalSales, user.id);
        toast.success('Caja cerrada exitosamente');
        
        if (settings?.auto_print_z_report) {
          toast.info('Imprimiendo reporte Z...');
          // Logic for Z report auto print goes here if requested later
        }
      }
      onSuccess();
      setBalance('');
    } catch (err) {
      console.error(err);
      toast.error('Hubo un error al procesar la caja');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const title = type === 'open' ? 'Abrir Caja' : 'Cerrar Caja';
  const requireInput = type === 'open' ? settings?.require_starting_cash : settings?.require_ending_cash;

  const desc = type === 'open' 
    ? (requireInput 
        ? 'Ingresa el monto de dinero en efectivo con el que iniciarás el turno.' 
        : '¿Estás seguro que deseas iniciar un nuevo turno de caja?')
    : (requireInput 
        ? 'Ingresa el monto total de dinero en efectivo recaudado para finalizar el turno.' 
        : '¿Estás seguro que deseas finalizar el turno actual?');

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <div className="p-6">
        <div className="flex justify-center mb-6">
          <div className="bg-gray-100 p-4 rounded-full">
            {type === 'open' ? <Store className="h-8 w-8 text-black" /> : <Store className="h-8 w-8 text-red-600" />}
          </div>
        </div>
        
        <p className="text-gray-600 text-center mb-6">{desc}</p>
        
        {requireInput && (
          <div className="mb-6">
            <label className="block text-sm font-bold text-gray-700 mb-2">Monto en Efectivo ($)</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <DollarSign className="h-5 w-5 text-gray-400" />
              </div>
              <Input
                type="text"
                value={balance}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '');
                  setBalance(val ? Number(val).toLocaleString('es-CL') : '');
                }}
                className="pl-10 text-lg font-bold h-12"
                placeholder="0"
                autoFocus
              />
            </div>
          </div>
        )}

        <div className="flex justify-center gap-4 mt-6">
          <Button variant="outline" size="lg" onClick={onClose} disabled={loading} className="px-8">
            Cancelar
          </Button>
          <Button 
            size="lg"
            className={`px-8 ${type === 'open' ? 'bg-black hover:bg-gray-800' : 'bg-red-600 hover:bg-red-700 text-white'}`} 
            onClick={handleConfirm}
            disabled={loading}
          >
            {loading ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : null}
            {type === 'open' ? 'Confirmar Apertura' : 'Confirmar Cierre'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default ShiftModal;
