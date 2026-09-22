-- 065_seed_expense_categories.sql
-- Inserta las categorías de ejemplo del rubro comida en las organizaciones
-- existentes que aún no las tengan (por nombre). Idempotente.

insert into expense_categories (organization_id, name, type, color)
select o.id, c.name, c.type, c.color
from organizations o
cross join (values
  ('Arriendo', 'fijo', '#8b5cf6'),
  ('Sueldos base', 'fijo', '#3b82f6'),
  ('Luz', 'fijo', '#f59e0b'),
  ('Agua', 'fijo', '#06b6d4'),
  ('Gas', 'fijo', '#f97316'),
  ('Internet / Teléfono', 'fijo', '#6366f1'),
  ('Contador / Patente', 'fijo', '#64748b'),
  ('Patente municipal', 'fijo', '#475569'),
  ('Seguro del local', 'fijo', '#0ea5e9'),
  ('Alarma / Monitoreo', 'fijo', '#7c3aed'),
  ('Software / Suscripciones', 'fijo', '#a855f7'),
  ('Insumos / Mercadería', 'variable', '#10b981'),
  ('Carnes y pollo', 'variable', '#dc2626'),
  ('Pescados y mariscos', 'variable', '#0284c7'),
  ('Frutas y verduras', 'variable', '#16a34a'),
  ('Lácteos y huevos', 'variable', '#eab308'),
  ('Pan y masas', 'variable', '#d97706'),
  ('Bebidas y jugos', 'variable', '#0891b2'),
  ('Cervezas y licores', 'variable', '#b45309'),
  ('Café y té', 'variable', '#78350f'),
  ('Aceite y abarrotes', 'variable', '#65a30d'),
  ('Especias y salsas', 'variable', '#c2410c'),
  ('Hielo y carbón', 'variable', '#67e8f9'),
  ('Packaging / Desechables', 'variable', '#84cc16'),
  ('Comisiones delivery', 'variable', '#ec4899'),
  ('Flete y combustible', 'variable', '#57534e'),
  ('Horas extra', 'variable', '#eab308'),
  ('Mantención equipos', 'variable', '#78716c'),
  ('Control de plagas', 'variable', '#4d7c0f'),
  ('Uniformes personal', 'variable', '#334155'),
  ('Lavandería / Manteles', 'variable', '#0d9488'),
  ('Marketing', 'variable', '#ef4444'),
  ('Limpieza', 'variable', '#14b8a6'),
  ('Otros', 'variable', '#6b7280')
) as c(name, type, color)
where not exists (
  select 1 from expense_categories ec
  where ec.organization_id = o.id
    and ec.name = c.name
);
