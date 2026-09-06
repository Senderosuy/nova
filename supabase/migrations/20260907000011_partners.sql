-- =============================================================
-- SOCIOS, APORTES Y AUTOSUSTENTABILIDAD
--
-- Los gastos de Nova se pagan hoy con medios personales de un socio.
-- Eso no es solo un gasto: es un aporte que la empresa le debe.
-- El aporte NO se carga a mano: se deriva de los egresos pagados
-- con medios marcados como personales de ese socio.
--
-- Cascada de asignación de utilidades, en orden de prioridad:
--   1. Reserva de caja  — hasta cubrir N meses de gastos fijos
--   2. Amortización     — X% del excedente al socio aportante
--   3. Reparto          — el resto según participación
-- =============================================================

create table public.partners (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  share_pct numeric(5, 2) not null default 50
    check (share_pct >= 0 and share_pct <= 100),
  contribution_kind text not null default 'capital'
    check (contribution_kind in ('capital', 'trabajo', 'capital_y_trabajo')),
  is_admin boolean not null default false,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger partners_set_updated_at
  before update on public.partners
  for each row execute function public.set_updated_at();

insert into public.partners (name, share_pct, contribution_kind, is_admin, notes) values
  ('Cristian Safie', 50, 'capital_y_trabajo', true,
   'Administrador. Aporta capital: los gastos de Nova se pagan con sus medios personales.'),
  ('Never Navarro', 50, 'trabajo', false,
   'Aporte estructural de trabajo como desarrollador. Sin aporte económico.');

-- -------------------------------------------------------------
-- Un medio de pago puede pertenecer a un socio: lo que se paga
-- con él es aporte, no dinero de la empresa.
-- -------------------------------------------------------------

alter table public.payment_methods
  add column owner_partner_id uuid references public.partners (id);

comment on column public.payment_methods.owner_partner_id is
  'Si el medio es personal de un socio, todo egreso pagado con él cuenta como aporte suyo. Null = medio de la propia empresa.';

update public.payment_methods
set owner_partner_id = (select id from public.partners where name = 'Cristian Safie')
where label in (
  'Transferencia BBVA',
  'Santander Visa ····8029',
  'Mastercard ····2301',
  'Visa ····9766',
  'Cuenta Antel ····0220'
);

-- -------------------------------------------------------------
-- Amortizaciones: devoluciones al socio
-- -------------------------------------------------------------

create table public.partner_repayments (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners (id),
  amount numeric(12, 2) not null check (amount > 0),
  currency text not null default 'USD' check (currency in ('USD', 'UYU')),
  paid_on date not null default current_date,
  notes text,
  created_at timestamptz not null default now()
);

create index partner_repayments_partner_idx on public.partner_repayments (partner_id, paid_on);

-- -------------------------------------------------------------
-- Parámetros de la cascada
-- -------------------------------------------------------------

insert into public.app_settings (key, value, label) values
  ('reserve_months', 2, 'Meses de gastos fijos que Nova retiene como reserva antes de amortizar'),
  ('amortization_pct', 30, 'Porcentaje del excedente destinado a amortizar el aporte del socio')
on conflict (key) do nothing;

-- -------------------------------------------------------------
-- Cuenta corriente del socio: aportado, devuelto, saldo
-- -------------------------------------------------------------

create or replace view public.partner_account as
with rate as (
  select value as usd_uyu from public.app_settings where key = 'usd_uyu_rate'
),
contributed as (
  select
    pm.owner_partner_id as partner_id,
    round(sum(m.usd)::numeric, 2) as usd
  from public.cash_movements m
  join public.payment_methods pm on pm.id = m.payment_method_id
  where m.direction = 'egreso'
    and pm.owner_partner_id is not null
    and m.occurred_on <= current_date
  group by pm.owner_partner_id
),
repaid as (
  select
    r.partner_id,
    round(sum(
      case when r.currency = 'UYU' then r.amount / rt.usd_uyu else r.amount end
    )::numeric, 2) as usd
  from public.partner_repayments r
  cross join rate rt
  group by r.partner_id
)
select
  p.id as partner_id,
  p.name,
  p.share_pct,
  p.contribution_kind,
  p.is_admin,
  coalesce(c.usd, 0) as contributed_usd,
  coalesce(r.usd, 0) as repaid_usd,
  round((coalesce(c.usd, 0) - coalesce(r.usd, 0))::numeric, 2) as balance_usd
from public.partners p
left join contributed c on c.partner_id = p.id
left join repaid r on r.partner_id = p.id
where p.active;

-- -------------------------------------------------------------
-- Autosustentabilidad: ¿los ingresos recurrentes cubren los
-- egresos recurrentes? Mide el objetivo declarado de Nova.
-- Sólo cuenta lo recurrente: los gastos únicos no se repiten y
-- distorsionarían el punto de equilibrio.
-- -------------------------------------------------------------

create or replace view public.sustainability as
with rate as (
  select value as usd_uyu from public.app_settings where key = 'usd_uyu_rate'
),
-- Egresos recurrentes: servicios activos + activos con ciclo
recurring_out as (
  select coalesce(sum(
    public.to_monthly(
      case when s.net_currency = 'UYU' then s.net_cost / r.usd_uyu else s.net_cost end,
      s.frequency
    )
  ), 0) as monthly
  from public.recurring_services s
  cross join rate r
  where s.active and s.direction = 'egreso' and s.net_cost is not null
),
asset_out as (
  select coalesce(sum(
    public.to_monthly(
      case when a.currency = 'UYU' then a.cost / r.usd_uyu else a.cost end,
      a.billing_cycle
    )
  ), 0) as monthly
  from public.assets a
  cross join rate r
  where a.deleted_at is null and a.cost is not null
),
-- Ingresos recurrentes confirmados
recurring_in as (
  select coalesce(sum(
    public.to_monthly(
      case when s.currency = 'UYU' then s.amount / r.usd_uyu else s.amount end,
      s.frequency
    )
  ), 0) as monthly
  from public.recurring_services s
  cross join rate r
  where s.active and s.direction = 'ingreso'
    and s.confirmation_status <> 'rechazada'
    and s.amount is not null
)
select
  round((ro.monthly + ao.monthly)::numeric, 2) as fixed_monthly_usd,
  round(ri.monthly::numeric, 2) as recurring_revenue_usd,
  round((ri.monthly - ro.monthly - ao.monthly)::numeric, 2) as gap_usd,
  round(((ro.monthly + ao.monthly) * (select value from public.app_settings where key = 'reserve_months'))::numeric, 2) as reserve_target_usd,
  case
    when ri.monthly >= (ro.monthly + ao.monthly) then 100
    when (ro.monthly + ao.monthly) = 0 then 100
    else round((ri.monthly / (ro.monthly + ao.monthly) * 100)::numeric, 1)
  end as coverage_pct
from recurring_out ro, asset_out ao, recurring_in ri;

-- -------------------------------------------------------------
-- RLS
-- -------------------------------------------------------------

alter table public.partners enable row level security;
alter table public.partner_repayments enable row level security;

do $$
declare t text;
begin
  foreach t in array array['partners', 'partner_repayments'] loop
    execute format('create policy "%1$s_select" on public.%1$I for select to authenticated using (true)', t);
    execute format('create policy "%1$s_insert" on public.%1$I for insert to authenticated with check (public.can_write())', t);
    execute format('create policy "%1$s_update" on public.%1$I for update to authenticated using (public.can_write()) with check (public.can_write())', t);
    execute format('create policy "%1$s_delete" on public.%1$I for delete to authenticated using (public.is_admin())', t);
  end loop;
end;
$$;
