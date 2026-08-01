import React from 'react';
import { Timer, CheckCircle2, Utensils, CheckCheck, XCircle, RefreshCcw, Filter, CalendarClock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import Tooltip from '@/components/ui/tooltip';

export const fmt = (n) => Number(n).toLocaleString('es-CL');

export const getKitchenTime = (order) => {
  if (!order.ready_at) return '-';
  const start = new Date(order.created_at);
  const end = new Date(order.ready_at);
  const diffMins = Math.floor((end - start) / 60000);
  return diffMins < 1 ? '< 1 min' : `${diffMins} min`;
};

export const getPaymentMethod = (order) => {
  const payment = order.payments?.[0];
  if (!payment) return '-';
  const methodMap = {
    cash: 'Efectivo',
    card: 'Tarjeta',
    transfer: 'Transferencia',
    online_gateway: 'Online - Klap',
    whatsapp_pay: 'WhatsApp Pay'
  };
  return methodMap[payment.method] || payment.method;
};

export const getStatusTag = (statusOrOrder) => {
  let status = statusOrOrder;
  let scheduledLabel = null;
  if (statusOrOrder && typeof statusOrOrder === 'object') {
    const now = Date.now();
    const hasFutureSchedule = statusOrOrder.scheduled_at && new Date(statusOrOrder.scheduled_at).getTime() > now;
    status = (hasFutureSchedule && (statusOrOrder.status === 'scheduled' || statusOrOrder.status === 'pending'))
      ? 'scheduled'
      : statusOrOrder.status;
    if (hasFutureSchedule && statusOrOrder.scheduled_at) {
      scheduledLabel = new Date(statusOrOrder.scheduled_at).toLocaleString('es-CL', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
  }

  const statusMap = {
    scheduled: { label: 'Programado', variant: 'purple', icon: CalendarClock },
    pending: { label: 'Pendiente', variant: 'grayOutline', icon: Timer },
    confirmed: { label: 'Confirmado', variant: 'info', icon: CheckCircle2 },
    preparing: { label: 'Preparando', variant: 'warning', icon: Utensils },
    ready: { label: 'Listo', variant: 'success', icon: CheckCheck },
    delivered: { label: 'Entregado', variant: 'purple', icon: CheckCheck },
    cancelled: { label: 'Cancelado', variant: 'error', icon: XCircle },
    refunded: { label: 'Reembolsado', variant: 'error', icon: RefreshCcw },
  };

  const mapped = statusMap[status] || { label: status, variant: 'grayOutline', icon: Filter };

  const badge = (
    <Badge variant={mapped.variant}>
      {mapped.icon && <mapped.icon className="w-3.5 h-3.5" />}
      {mapped.label}
    </Badge>
  );

  if (scheduledLabel) {
    return <Tooltip text={`Programado · ${scheduledLabel}`}>{badge}</Tooltip>;
  }
  return badge;
};
