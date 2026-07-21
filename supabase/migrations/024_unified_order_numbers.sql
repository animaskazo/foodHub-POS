-- Crear tabla para almacenar la secuencia por sucursal
create table if not exists branch_order_sequences (
  branch_id uuid primary key references branches(id) on delete cascade,
  last_order_number integer not null default 0
);

-- Inicializar la tabla con el valor máximo actual (ignorando los que tienen prefijo WEB-)
-- Para asegurarnos de no duplicar llaves con pedidos pasados.
insert into branch_order_sequences (branch_id, last_order_number)
select 
  branch_id, 
  coalesce(max(nullif(regexp_replace(order_number, '\D', '', 'g'), '')), '0')::integer
from orders
group by branch_id
on conflict (branch_id) do update 
set last_order_number = excluded.last_order_number;

-- Función que obtiene y aumenta la secuencia, bloqueando la fila para evitar condiciones de carrera
create or replace function get_next_order_number(p_branch_id uuid, p_order_type order_type)
returns text as $$
declare
  v_next integer;
  v_prefix text;
begin
  -- Definir prefijo según el tipo
  case p_order_type
    when 'table' then v_prefix := 'local#';
    when 'pickup' then v_prefix := 'retiro#';
    when 'online' then v_prefix := 'online#';
    when 'whatsapp' then v_prefix := 'wsp#';
    else v_prefix := 'gen#';
  end case;

  -- Aumentar contador y retornar
  insert into branch_order_sequences (branch_id, last_order_number)
  values (p_branch_id, 1)
  on conflict (branch_id)
  do update set last_order_number = branch_order_sequences.last_order_number + 1
  returning last_order_number into v_next;

  return v_prefix || lpad(v_next::text, 4, '0');
end;
$$ language plpgsql;

-- Trigger para invocar la función automáticamente antes de insertar en 'orders'
create or replace function set_order_number()
returns trigger as $$
begin
  -- Siempre generamos y forzamos el nuevo número para garantizar el consecutivo
  NEW.order_number := get_next_order_number(NEW.branch_id, NEW.order_type);
  return NEW;
end;
$$ language plpgsql;

create trigger trigger_set_order_number
before insert on orders
for each row
execute function set_order_number();
