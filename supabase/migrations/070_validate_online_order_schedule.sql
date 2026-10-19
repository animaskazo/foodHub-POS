-- Immediate orders are accepted during business hours OR pickup hours.
-- Scheduled orders use pickup_hours (legacy fallback to business_hours when NULL).
create or replace function public.validate_online_order_schedule()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_timezone text;
  v_business_hours jsonb;
  v_pickup_hours jsonb;
  v_instant_enabled boolean;
  v_scheduling_enabled boolean;
  v_force_closed boolean;
  v_prep_time integer;
  v_schedule jsonb;
  v_candidate jsonb;
  v_day_key text;
  v_day jsonb;
  v_target_local timestamp without time zone;
  v_open time without time zone;
  v_close time without time zone;
  v_within_candidate boolean;
begin
  if new.order_type is distinct from 'online' then
    return new;
  end if;

  select
    coalesce(o.timezone, 'America/Santiago'),
    o.business_hours,
    o.pickup_hours,
    coalesce(o.instant_enabled, true),
    coalesce(o.scheduling_enabled, false),
    coalesce(o.force_closed, false),
    coalesce(o.prep_time, 0)
  into
    v_timezone,
    v_business_hours,
    v_pickup_hours,
    v_instant_enabled,
    v_scheduling_enabled,
    v_force_closed,
    v_prep_time
  from public.organizations o
  where o.id = new.organization_id;

  if not found then
    raise exception 'No se encontró la configuración del negocio.';
  end if;

  if v_force_closed then
    raise exception 'El negocio está cerrado temporalmente y no puede recibir pedidos.';
  end if;

  if new.scheduled_at is null then
    if not v_instant_enabled then
      raise exception 'El negocio no está aceptando pedidos inmediatos.';
    end if;

    v_target_local := timezone(v_timezone, now());

    -- Preserve legacy behavior when neither schedule has been configured.
    if (v_business_hours is null or v_business_hours = '{}'::jsonb)
       and (v_pickup_hours is null or v_pickup_hours = '{}'::jsonb) then
      return new;
    end if;

    -- Immediate ordering is permitted by either configured schedule.
    for v_candidate in
      select schedule.value
      from (values (v_business_hours), (v_pickup_hours)) as schedule(value)
      where schedule.value is not null
        and schedule.value <> '{}'::jsonb
    loop
      v_day_key := case extract(dow from v_target_local)::integer
        when 0 then 'sun'
        when 1 then 'mon'
        when 2 then 'tue'
        when 3 then 'wed'
        when 4 then 'thu'
        when 5 then 'fri'
        when 6 then 'sat'
      end;
      v_day := v_candidate -> v_day_key;

      if v_day is null or coalesce((v_day ->> 'closed')::boolean, false) then
        continue;
      end if;
      if nullif(v_day ->> 'open', '') is null or nullif(v_day ->> 'close', '') is null then
        continue;
      end if;

      v_open := (v_day ->> 'open')::time;
      v_close := (v_day ->> 'close')::time;
      v_within_candidate := case
        when v_close >= v_open then
          v_target_local::time >= v_open and v_target_local::time <= v_close
        else
          v_target_local::time >= v_open or v_target_local::time <= v_close
      end;

      if v_within_candidate then
        return new;
      end if;
    end loop;

    raise exception 'El pedido inmediato está fuera del horario del negocio y del horario de retiro.';
  end if;

  if not v_scheduling_enabled then
    raise exception 'La programación de pedidos no está habilitada.';
  end if;

  if new.scheduled_at < now() + make_interval(mins => greatest(v_prep_time, 10)) then
    raise exception 'El horario elegido debe respetar el tiempo mínimo de preparación.';
  end if;

  v_schedule := coalesce(v_pickup_hours, v_business_hours);
  v_target_local := timezone(v_timezone, new.scheduled_at);

  if v_schedule is null or v_schedule = '{}'::jsonb then
    raise exception 'No hay horarios disponibles para programar retiros.';
  end if;

  v_day_key := case extract(dow from v_target_local)::integer
    when 0 then 'sun'
    when 1 then 'mon'
    when 2 then 'tue'
    when 3 then 'wed'
    when 4 then 'thu'
    when 5 then 'fri'
    when 6 then 'sat'
  end;
  v_day := v_schedule -> v_day_key;

  if v_day is null or coalesce((v_day ->> 'closed')::boolean, false) then
    raise exception 'No hay horario de retiro disponible para la hora elegida.';
  end if;

  if nullif(v_day ->> 'open', '') is null or nullif(v_day ->> 'close', '') is null then
    raise exception 'El horario configurado para este día está incompleto.';
  end if;

  v_open := (v_day ->> 'open')::time;
  v_close := (v_day ->> 'close')::time;

  if v_close >= v_open then
    if v_target_local::time < v_open or v_target_local::time > v_close then
      raise exception 'La hora elegida está fuera del horario de retiro.';
    end if;
  elsif v_target_local::time < v_open and v_target_local::time > v_close then
    raise exception 'La hora elegida está fuera del horario de retiro.';
  end if;

  return new;
end;
$function$;

drop trigger if exists validate_online_order_schedule on public.orders;

create trigger validate_online_order_schedule
before insert on public.orders
for each row
execute function public.validate_online_order_schedule();
