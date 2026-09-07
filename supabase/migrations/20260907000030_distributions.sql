-- =============================================================
-- Reparto de utilidades
--
-- Dos retiros distintos que no hay que confundir:
--   amortización -> devuelve capital aportado, baja el saldo
--   utilidad     -> reparte ganancia, NO toca el aporte pendiente
--
-- Si se mezclaran, repartir ganancias parecería devolver capital y
-- el socio quedaría cobrando dos veces lo mismo.
-- =============================================================

alter table public.partner_repayments
  add column kind text not null default 'amortizacion'
    check (kind in ('amortizacion', 'utilidad'));

comment on column public.partner_repayments.kind is
  'amortizacion: devuelve aporte de capital. utilidad: reparto de ganancias, no reduce el saldo pendiente.';

alter table public.partner_repayments
  add column period text;

comment on column public.partner_repayments.period is
  'Período al que corresponde el reparto, formato YYYY-MM o YYYY.';

-- -------------------------------------------------------------
-- Solo la amortización reduce lo que Nova le debe al socio
-- -------------------------------------------------------------

create or replace view public.partner_account as
with rate as (
  select value as usd_uyu from public.app_settings where key = 'usd_uyu_rate'
),
capital_partner as (
  select id from public.partners
  where active and contribution_kind in ('capital', 'capital_y_trabajo')
  order by created_at
  limit 1
),
client_methods as (
  select id from public.payment_methods where owner_client_id is not null
),
partner_methods as (
  select id, owner_partner_id from public.payment_methods
  where owner_partner_id is not null
),
contributed as (
  select
    coalesce(pm.owner_partner_id, (select id from capital_partner)) as partner_id,
    round(sum(m.usd)::numeric, 2) as usd
  from public.cash_movements m
  left join partner_methods pm on pm.id = m.payment_method_id
  where m.direction = 'egreso'
    and m.occurred_on <= current_date
    and (m.payment_method_id is null
         or m.payment_method_id not in (select id from client_methods))
    and (m.payment_method_id is null or pm.id is not null)
  group by 1
),
repaid as (
  select
    r.partner_id,
    round(sum(case when r.currency = 'UYU' then r.amount / rt.usd_uyu else r.amount end)
      filter (where r.kind = 'amortizacion')::numeric, 2) as amortized,
    round(sum(case when r.currency = 'UYU' then r.amount / rt.usd_uyu else r.amount end)
      filter (where r.kind = 'utilidad')::numeric, 2) as distributed
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
  coalesce(r.amortized, 0) as repaid_usd,
  round((coalesce(c.usd, 0) - coalesce(r.amortized, 0))::numeric, 2) as balance_usd,
  coalesce(r.distributed, 0) as distributed_usd
from public.partners p
left join contributed c on c.partner_id = p.id
left join repaid r on r.partner_id = p.id
where p.active;

-- -------------------------------------------------------------
-- Cascada aplicada al resultado acumulado
--
-- Calcula cuánto corresponde a cada escalón con las reglas vigentes,
-- descontando lo ya retirado. Es una propuesta, no un movimiento:
-- el reparto se registra a mano cuando se decide hacerlo.
-- -------------------------------------------------------------

create or replace view public.profit_waterfall as
with params as (
  select
    (select value from public.app_settings where key = 'reserve_months') as reserve_months,
    (select value from public.app_settings where key = 'amortization_pct') as amort_pct
),
result as (
  -- Resultado acumulado de movimientos ya ocurridos
  select round((
    coalesce(sum(usd) filter (where direction = 'ingreso'), 0)
    - coalesce(sum(usd) filter (where direction = 'egreso'), 0)
  )::numeric, 2) as net_usd
  from public.cash_movements
  where occurred_on <= current_date
),
fixed as (
  select fixed_monthly_usd from public.sustainability
),
withdrawn as (
  select
    coalesce(sum(amount) filter (where kind = 'amortizacion'), 0) as amortized,
    coalesce(sum(amount) filter (where kind = 'utilidad'), 0) as distributed
  from public.partner_repayments
  where currency = 'USD'
),
calc as (
  select
    r.net_usd,
    round((f.fixed_monthly_usd * p.reserve_months)::numeric, 2) as reserve_target,
    p.amort_pct,
    w.amortized,
    w.distributed,
    -- Excedente disponible después de cubrir la reserva
    greatest(
      r.net_usd - (f.fixed_monthly_usd * p.reserve_months) - w.amortized - w.distributed,
      0
    ) as surplus
  from result r, fixed f, params p, withdrawn w
)
select
  net_usd as accumulated_result_usd,
  reserve_target as reserve_target_usd,
  least(greatest(net_usd, 0), reserve_target) as reserve_covered_usd,
  amort_pct as amortization_pct,
  surplus as surplus_usd,
  round((surplus * amort_pct / 100)::numeric, 2) as to_amortize_usd,
  round((surplus * (100 - amort_pct) / 100)::numeric, 2) as to_distribute_usd,
  amortized as already_amortized_usd,
  distributed as already_distributed_usd
from calc;
