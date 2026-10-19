import { Minus, Plus, Trash2 } from 'lucide-react';
import { IconButton } from './IconButton';
import { cn } from '@/lib/utils';

export function QuantityStepper({ value, onDecrease, onIncrease, label, disabled = false,
  decreaseDisabled = false, increaseDisabled = false, removeOnDecrease = false,
  children, className, compact = false }) {
  return (
    <div role="group" aria-label={`Cantidad de ${label}`} className={cn(
      'inline-flex shrink-0 items-center gap-1 rounded-full bg-gray-100 text-gray-900', className
    )}>
      <IconButton size={compact ? 'icon-sm' : 'icon'}
        label={`${removeOnDecrease ? 'Eliminar' : 'Reducir cantidad de'} ${label}`}
        disabled={disabled || decreaseDisabled} onClick={onDecrease}>
        {removeOnDecrease ? <Trash2 className="size-4" aria-hidden="true" /> : <Minus className="size-4" aria-hidden="true" />}
      </IconButton>
      <span className="min-w-6 text-center text-sm font-semibold tabular-nums" aria-live="polite" aria-atomic="true">
        {children ?? value}
      </span>
      <IconButton size={compact ? 'icon-sm' : 'icon'} label={`Aumentar cantidad de ${label}`}
        disabled={disabled || increaseDisabled} onClick={onIncrease}>
        <Plus className="size-4" aria-hidden="true" />
      </IconButton>
    </div>
  );
}
