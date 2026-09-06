-- =============================================================
-- Dominios .uy: fecha de alta y vencimiento derivado
--
-- El WHOIS público de nic.com.uy expone la fecha de ALTA, no la de
-- vencimiento, y pide captcha tras unas pocas consultas seguidas.
-- Pero los .uy renuevan en el aniversario del alta: validado contra
-- 4 dominios reales, coincidencia exacta con el panel de ANTEL.
--
-- Por eso se consulta UNA vez por dominio y se guarda registered_at.
-- De ahí en más el vencimiento se recalcula solo, sin volver a la API.
-- =============================================================

alter table public.assets
  add column registered_at date,
  add column auto_renew boolean;

comment on column public.assets.registered_at is
  'Fecha de alta del dominio. Para .uy permite derivar el vencimiento como el próximo aniversario, sin depender del WHOIS.';
comment on column public.assets.auto_renew is
  'Si el proveedor renueva automáticamente. Cuando es true, al pasar el vencimiento la fecha avanza sola un ciclo.';

-- -------------------------------------------------------------
-- Próximo aniversario de una fecha, a partir de hoy
-- -------------------------------------------------------------

create or replace function public.next_anniversary(d date)
returns date
language sql
stable
as $$
  select case
    when d is null then null
    when make_date(extract(year from current_date)::int,
                   extract(month from d)::int,
                   extract(day from d)::int) >= current_date
      then make_date(extract(year from current_date)::int,
                     extract(month from d)::int,
                     extract(day from d)::int)
    else make_date(extract(year from current_date)::int + 1,
                   extract(month from d)::int,
                   extract(day from d)::int)
  end;
$$;

-- -------------------------------------------------------------
-- Mantener los vencimientos al día, sin consultar a nadie:
--   1. Dominios con fecha de alta conocida -> próximo aniversario
--   2. Activos con autorrenovación ya vencidos -> avanzar un ciclo
-- Deja constancia en el historial de los proyectos afectados.
-- -------------------------------------------------------------

create or replace function public.roll_expirations()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
  total int := 0;
begin
  -- Dominios con alta conocida: el vencimiento es el aniversario
  update public.assets a
  set expires_at = public.next_anniversary(a.registered_at)
  where a.deleted_at is null
    and a.registered_at is not null
    and (a.expires_at is null or a.expires_at < current_date
         or a.expires_at is distinct from public.next_anniversary(a.registered_at));
  get diagnostics n = row_count;
  total := total + n;

  -- Activos con autorrenovación que ya pasaron su vencimiento
  update public.assets a
  set expires_at = (a.expires_at + (public.cycle_months(a.billing_cycle) || ' months')::interval)::date
  where a.deleted_at is null
    and a.auto_renew is true
    and a.registered_at is null
    and a.expires_at is not null
    and a.expires_at < current_date
    and public.cycle_months(a.billing_cycle) > 0;
  get diagnostics n = row_count;
  total := total + n;

  return total;
end;
$$;

-- Se ejecuta antes del barrido de alertas, para que las alertas
-- se generen sobre fechas ya actualizadas.
select cron.schedule(
  'nova-roll-expirations',
  '30 8 * * *',
  'select public.roll_expirations();'
);
