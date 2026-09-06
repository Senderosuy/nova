-- =============================================================
-- Los activos del cliente se administran, no se costean
--
-- La misma cuenta Antel paga dominios de Nova y de otras empresas
-- del titular. El medio de pago no puede decidir de quién es el
-- gasto: lo decide ownership.
--
--   ownership = 'nova'    -> costo de Nova, aporte del socio si lo
--                            paga con un medio personal
--   ownership = 'cliente' -> Nova solo administra. No es costo, no
--                            es aporte, pero SÍ genera alertas: si
--                            el dominio se cae, el problema es de Nova
-- =============================================================

comment on column public.assets.ownership is
  'nova: el activo es de Nova y su costo pesa sobre la empresa. cliente: pertenece al cliente, Nova lo administra pero no lo costea ni computa como aporte.';

-- -------------------------------------------------------------
-- Flujo de caja: los activos del cliente quedan fuera
-- -------------------------------------------------------------

create or replace view public.cash_movements as
with rate as (
  select value as usd_uyu from public.app_settings where key = 'usd_uyu_rate'
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
-- El desglose por proyecto tampoco carga los activos del cliente
-- -------------------------------------------------------------

create or replace view public.project_line_items as
with rate as (
  select value as usd_uyu from public.app_settings where key = 'usd_uyu_rate'
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
),
service_lines as (
  select
    s.project_id,
    'servicio',
    s.frequency,
    s.concept,
    sc.renewal_date,
    round(
      (case when s.net_currency = 'UYU' then coalesce(s.net_cost, 0) / r.usd_uyu
            else coalesce(s.net_cost, 0) end
       * coalesce(f.per_year, 1))::numeric, 2
    ),
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
-- Run rate: idem
-- -------------------------------------------------------------

create or replace view public.project_costs as
with asset_costs as (
  select
    aa.project_id,
    a.currency,
    public.to_monthly(a.cost, a.billing_cycle) as monthly
  from public.asset_assignments aa
  join public.assets a on a.id = aa.asset_id
  where aa.assigned_until is null
    and a.deleted_at is null
    and a.ownership = 'nova'
),
service_costs as (
  select
    s.project_id,
    s.net_currency as currency,
    public.to_monthly(s.net_cost, s.frequency) as monthly
  from public.recurring_services s
  where s.active and s.project_id is not null
)
select
  project_id,
  currency,
  round(sum(monthly), 2) as net_monthly,
  round(sum(monthly) * 12, 2) as net_yearly
from (select * from asset_costs union all select * from service_costs) t
where project_id is not null
group by project_id, currency;

-- -------------------------------------------------------------
-- Sólo los activos de Nova sin proyecto necesitan declarar causa
-- -------------------------------------------------------------

create or replace view public.unassigned_assets as
select
  a.id,
  a.name,
  a.type,
  a.provider,
  a.cost,
  a.currency,
  a.billing_cycle,
  a.expires_at,
  a.cost_reason,
  pm.label as paid_with,
  pt.name as funded_by,
  round(
    (case when a.currency = 'UYU'
      then a.cost / (select value from public.app_settings where key = 'usd_uyu_rate')
      else a.cost end) * coalesce(
        case a.billing_cycle
          when 'mensual' then 12 when 'trimestral' then 4
          when 'semestral' then 2 when 'anual' then 1
          else 0 end, 0)
  , 2) as usd_year
from public.assets a
left join public.asset_assignments aa
  on aa.asset_id = a.id and aa.assigned_until is null
left join public.payment_methods pm on pm.id = a.payment_method_id
left join public.partners pt on pt.id = pm.owner_partner_id
where a.deleted_at is null
  and aa.id is null
  and a.ownership = 'nova';
