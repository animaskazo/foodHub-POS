-- Agrega el estado 'scheduled' (Programado) al enum de órdenes.
-- Los pedidos online agendados se crean con este estado y, al llegar su
-- scheduled_at, activateDueScheduledOrders los pasa a 'confirmed'.
alter type order_status add value if not exists 'scheduled';
