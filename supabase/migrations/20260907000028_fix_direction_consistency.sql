-- =============================================================
-- Un servicio con costo y sin precio es un egreso
--
-- Los servicios creados antes de que existiera direction quedaron
-- como 'ingreso' por defecto. En un ingreso el sistema toma amount,
-- así que el Google Workspace de Fotolink aparecía en el libro todos
-- los meses con USD 0,00 pese a costar 12,60: el gasto era invisible.
-- =============================================================

update public.recurring_services
set direction = 'egreso'
where direction = 'ingreso'
  and coalesce(amount, 0) = 0
  and coalesce(net_cost, 0) > 0;

-- Defensa: un ingreso sin importe pero con costo es una contradicción.
-- Se corrige al vuelo en vez de dejar que el movimiento valga cero.
create or replace function public.normalize_service_direction()
returns trigger
language plpgsql
as $$
begin
  if new.direction = 'ingreso'
     and coalesce(new.amount, 0) = 0
     and coalesce(new.net_cost, 0) > 0 then
    new.direction := 'egreso';
  end if;
  return new;
end;
$$;

drop trigger if exists recurring_services_normalize_direction on public.recurring_services;
create trigger recurring_services_normalize_direction
  before insert or update on public.recurring_services
  for each row execute function public.normalize_service_direction();
