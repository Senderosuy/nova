-- =============================================================
-- Vencimiento de tarjetas
-- Cuando una tarjeta vence, todas las suscripciones automáticas
-- que dependen de ella fallan a la vez. Merece alerta propia.
--
-- Se guarda SOLO mes y año de vencimiento junto a los últimos
-- cuatro dígitos. Nunca el número completo ni el CVV: con estos
-- datos no se puede realizar un cargo.
-- =============================================================

alter table public.payment_methods
  add column expires_on date,
  add column holder text;

comment on column public.payment_methods.expires_on is
  'Vencimiento de la tarjeta, normalizado al primer día del mes. Sirve para alertar antes de que fallen los débitos automáticos.';
comment on column public.payment_methods.holder is
  'Titular del medio de pago.';

-- -------------------------------------------------------------
-- Alertas de vencimiento de tarjeta, con el impacto real:
-- cuántos activos y servicios dependen de ella.
-- -------------------------------------------------------------

alter table public.alerts
  add column payment_method_id uuid references public.payment_methods (id);

alter table public.alerts drop constraint if exists alerts_source_chk;
alter table public.alerts
  drop constraint if exists alerts_source_type_check;

alter table public.alerts
  add constraint alerts_source_type_check
    check (source_type in ('asset', 'service', 'payment_method'));

alter table public.alerts
  add constraint alerts_source_chk check (
    (source_type = 'asset' and asset_id is not null and service_id is null) or
    (source_type = 'service' and service_id is not null and asset_id is null) or
    (source_type = 'payment_method' and payment_method_id is not null
     and asset_id is null and service_id is null)
  );

create unique index alerts_method_dedupe_idx
  on public.alerts (payment_method_id, threshold_days, due_date)
  where payment_method_id is not null;

-- Cuánto depende de cada medio de pago
create or replace view public.payment_method_usage as
select
  pm.id as payment_method_id,
  pm.label,
  pm.expires_on,
  (select count(*) from public.assets a
    where a.payment_method_id = pm.id and a.deleted_at is null) as assets_count,
  (select count(*) from public.recurring_services s
    where s.payment_method_id = pm.id and s.active) as services_count
from public.payment_methods pm
where pm.active;
