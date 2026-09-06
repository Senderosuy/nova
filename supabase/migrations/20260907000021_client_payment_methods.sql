-- =============================================================
-- Medios de pago propios del cliente
--
-- Un cliente puede pagar sus servicios con su propia tarjeta.
-- Ese gasto no es costo de Nova ni aporte de un socio: Nova solo
-- lo administra, igual que con los activos de ownership 'cliente'.
--
-- Titularidad de un medio de pago, tres casos:
--   owner_partner_id -> personal de un socio: aporte a Nova
--   owner_client_id  -> del cliente: ni costo ni aporte
--   ninguno          -> de la propia empresa
-- =============================================================

alter table public.payment_methods
  add column owner_client_id uuid references public.clients (id);

comment on column public.payment_methods.owner_client_id is
  'Si el medio pertenece a un cliente, lo que se paga con él no computa como costo de Nova ni como aporte de socio.';

alter table public.payment_methods
  add constraint payment_methods_owner_chk check (
    owner_partner_id is null or owner_client_id is null
  );

-- -------------------------------------------------------------
-- El flujo de caja ignora los egresos pagados por el cliente
-- -------------------------------------------------------------

create or replace view public.cash_movements as
with rate as (
  select value as usd_uyu from public.app_settings where key = 'usd_uyu_rate'
),
-- Medios que pertenecen a un cliente: lo que sale por ahí no es de Nova
client_methods as (
  select id from public.payment_methods where owner_client_id is not null
),
horizon as (
  select generate_series(
    date_trunc('year', current_date - interval '1 year')::date,
    date_trunc('year', current_date + interval '3 years')::date,
    interval '1 month'
  )::date as month_start
),
one_off as (
  select
    c.id::text as source_id,
    'unico' as source_kind,
    c.direction,
    c.scope,
    c.project_id,
    c.category_id,
    c.payment_method_id,
    c.concept,
    c.charge_date as occurred_on,
    case when c.currency = 'UYU' then c.amount / r.usd_uyu else c.amount end as usd,
    c.billing_status as status
  from public.project_charges c
  cross join rate r
  where c.direction = 'ingreso'
     or c.payment_method_id is null
     or c.payment_method_id not in (select id from client_methods)
),
recurring as (
  select
    s.id::text,
    'recurrente',
    s.direction,
    s.scope,
    s.project_id,
    s.category_id,
    s.payment_method_id,
    s.concept,
    h.month_start,
    case
      when s.direction = 'ingreso'
        then case when s.currency = 'UYU' then s.amount / r.usd_uyu else s.amount end
      else case when s.net_currency = 'UYU' then coalesce(s.net_cost, 0) / r.usd_uyu
                else coalesce(s.net_cost, 0) end
    end,
    case when s.direction = 'ingreso' then s.billing_status else s.payment_status end
  from public.recurring_services s
  cross join rate r
  cross join horizon h
  left join public.service_schedule sc on sc.service_id = s.id
  where s.active
    and s.confirmation_status <> 'rechazada'
    and (s.direction = 'ingreso'
         or s.payment_method_id is null
         or s.payment_method_id not in (select id from client_methods))
    and public.cycle_months(s.frequency) > 0
    and mod(
      abs(
        (extract(year from h.month_start)::int * 12 + extract(month from h.month_start)::int)
        - (extract(year from coalesce(sc.renewal_date, s.next_billing_date, current_date))::int * 12
           + extract(month from coalesce(sc.renewal_date, s.next_billing_date, current_date))::int)
      ),
      public.cycle_months(s.frequency)
    ) = 0
    and (sc.effective_first_charge is null
         or h.month_start >= date_trunc('month', sc.effective_first_charge)::date)
),
asset_assigned as (
  select
    a.id::text,
    'activo',
    'egreso',
    'proyecto',
    aa.project_id,
    null::uuid,
    a.payment_method_id,
    a.name,
    h.month_start,
    case when a.currency = 'UYU' then a.cost / r.usd_uyu else a.cost end,
    'pendiente'
  from public.assets a
  join public.asset_assignments aa on aa.asset_id = a.id and aa.assigned_until is null
  cross join rate r
  cross join horizon h
  where a.deleted_at is null
    and a.cost is not null
    and a.ownership = 'nova'
    and (a.payment_method_id is null
         or a.payment_method_id not in (select id from client_methods))
    and (
      (a.billing_cycle = 'unico' and a.paid_at is not null
       and date_trunc('month', a.paid_at)::date = h.month_start)
      or (
        public.cycle_months(a.billing_cycle) > 0
        and a.expires_at is not null
        and mod(
          abs(
            (extract(year from h.month_start)::int * 12 + extract(month from h.month_start)::int)
            - (extract(year from a.expires_at)::int * 12 + extract(month from a.expires_at)::int)
          ),
          public.cycle_months(a.billing_cycle)
        ) = 0
      )
    )
),
asset_unassigned as (
  select
    a.id::text,
    'activo',
    'egreso',
    'empresa',
    null::uuid,
    null::uuid,
    a.payment_method_id,
    a.name,
    h.month_start,
    case when a.currency = 'UYU' then a.cost / r.usd_uyu else a.cost end,
    'pendiente'
  from public.assets a
  left join public.asset_assignments aa on aa.asset_id = a.id and aa.assigned_until is null
  cross join rate r
  cross join horizon h
  where a.deleted_at is null
    and aa.id is null
    and a.cost is not null
    and a.ownership = 'nova'
    and (a.payment_method_id is null
         or a.payment_method_id not in (select id from client_methods))
    and (
      (a.billing_cycle = 'unico' and a.paid_at is not null
       and date_trunc('month', a.paid_at)::date = h.month_start)
      or (
        public.cycle_months(a.billing_cycle) > 0
        and a.expires_at is not null
        and mod(
          abs(
            (extract(year from h.month_start)::int * 12 + extract(month from h.month_start)::int)
            - (extract(year from a.expires_at)::int * 12 + extract(month from a.expires_at)::int)
          ),
          public.cycle_months(a.billing_cycle)
        ) = 0
      )
    )
)
select * from one_off
union all select * from recurring
union all select * from asset_assigned
union all select * from asset_unassigned;

-- -------------------------------------------------------------
-- El desglose por proyecto tampoco carga lo que paga el cliente
-- -------------------------------------------------------------

create or replace view public.project_line_items as
with rate as (
  select value as usd_uyu from public.app_settings where key = 'usd_uyu_rate'
),
client_methods as (
  select id from public.payment_methods where owner_client_id is not null
),
factor as (
  select 'mensual' as cycle, 12 as per_year union all
  select 'trimestral', 4 union all
  select 'semestral', 2 union all
  select 'anual', 1 union all
  select 'unico', 0 union all
  select 'gratis', 0
),
asset_lines as (
  select
    aa.project_id,
    'activo' as kind,
    a.type as subkind,
    a.name as concept,
    a.expires_at,
    round(
      (case when a.currency = 'UYU' then a.cost / r.usd_uyu else a.cost end
       * coalesce(f.per_year, 1))::numeric, 2
    ) as cost_usd_year,
    0::numeric as price_usd_year,
    a.billing_cycle as cycle,
    coalesce(pm.label, prov.name) as paid_with
  from public.asset_assignments aa
  join public.assets a on a.id = aa.asset_id
  cross join rate r
  left join factor f on f.cycle = a.billing_cycle
  left join public.payment_methods pm on pm.id = a.payment_method_id
  left join public.providers prov on prov.id = a.provider_id
  where aa.assigned_until is null
    and a.deleted_at is null
    and a.cost is not null
    and a.ownership = 'nova'
    and (a.payment_method_id is null
         or a.payment_method_id not in (select id from client_methods))
),
service_lines as (
  select
    s.project_id,
    'servicio',
    s.frequency,
    s.concept,
    sc.renewal_date,
    case when s.payment_method_id in (select id from client_methods) then 0
    else round(
      (case when s.net_currency = 'UYU' then coalesce(s.net_cost, 0) / r.usd_uyu
            else coalesce(s.net_cost, 0) end
       * coalesce(f.per_year, 1))::numeric, 2
    ) end,
    round(
      (case when s.currency = 'UYU' then coalesce(s.amount, 0) / r.usd_uyu
            else coalesce(s.amount, 0) end
       * coalesce(f.per_year, 1))::numeric, 2
    ),
    s.frequency,
    pm.label
  from public.recurring_services s
  cross join rate r
  left join factor f on f.cycle = s.frequency
  left join public.service_schedule sc on sc.service_id = s.id
  left join public.payment_methods pm on pm.id = s.payment_method_id
  where s.active and s.project_id is not null and s.scope = 'proyecto'
),
charge_lines as (
  select
    c.project_id,
    'cargo',
    c.direction,
    c.concept,
    c.charge_date,
    case when c.direction = 'egreso'
          and (c.payment_method_id is null
               or c.payment_method_id not in (select id from client_methods))
      then round((case when c.currency = 'UYU' then c.amount / r.usd_uyu else c.amount end)::numeric, 2)
      else 0 end,
    case when c.direction = 'ingreso'
      then round((case when c.currency = 'UYU' then c.amount / r.usd_uyu else c.amount end)::numeric, 2)
      else 0 end,
    'unico',
    pm.label
  from public.project_charges c
  cross join rate r
  left join public.payment_methods pm on pm.id = c.payment_method_id
  where c.project_id is not null
    and c.scope = 'proyecto'
    and extract(year from c.charge_date)::int = extract(year from current_date)::int
)
select
  project_id, kind, subkind, concept, expires_at, cycle, paid_with,
  cost_usd_year,
  price_usd_year,
  round((price_usd_year - cost_usd_year)::numeric, 2) as margin_usd_year
from (
  select * from asset_lines
  union all select * from service_lines
  union all select * from charge_lines
) t;

-- -------------------------------------------------------------
-- Titularidad de cada medio, para mostrarla en la interfaz
-- -------------------------------------------------------------

create or replace view public.payment_method_owner as
select
  pm.id as payment_method_id,
  pm.label,
  case
    when pm.owner_client_id is not null then 'cliente'
    when pm.owner_partner_id is not null then 'socio'
    else 'nova'
  end as owner_kind,
  coalesce(c.name, pt.name, 'Nova') as owner_name
from public.payment_methods pm
left join public.clients c on c.id = pm.owner_client_id
left join public.partners pt on pt.id = pm.owner_partner_id;
