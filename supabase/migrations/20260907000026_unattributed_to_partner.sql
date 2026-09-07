-- =============================================================
-- Los egresos sin medio identificado los cubrió el socio de capital
--
-- Nova todavía no tiene cuenta propia: cada peso que sale lo pone
-- Cristian. Atribuir solo los movimientos que tienen medio de pago
-- cargado subestimaba el aporte —Fotolink mostraba USD 143 cuando
-- la inversión real es 841— porque los cargos únicos no lo tenían.
--
-- La regla vale mientras no exista un medio propio de la empresa.
-- El día que Nova pague de su cuenta, esos movimientos van a tener
-- su método y dejarán de atribuirse al socio.
-- =============================================================

create or replace view public.partner_account as
with rate as (
  select value as usd_uyu from public.app_settings where key = 'usd_uyu_rate'
),
-- Socio que aporta capital: absorbe lo que no tiene medio identificado
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
    -- lo que paga un cliente con su medio nunca es aporte
    and (m.payment_method_id is null
         or m.payment_method_id not in (select id from client_methods))
    -- un medio de la propia empresa tampoco lo es
    and (m.payment_method_id is null or pm.id is not null)
  group by 1
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
-- Quién financió cada proyecto, con la misma regla
-- -------------------------------------------------------------

create or replace view public.project_funding as
with capital_partner as (
  select id, name from public.partners
  where active and contribution_kind in ('capital', 'capital_y_trabajo')
  order by created_at
  limit 1
),
client_methods as (
  select id from public.payment_methods where owner_client_id is not null
),
partner_methods as (
  select pm.id, pm.owner_partner_id, pt.name
  from public.payment_methods pm
  join public.partners pt on pt.id = pm.owner_partner_id
)
select
  m.project_id,
  coalesce(pm.owner_partner_id, (select id from capital_partner)) as partner_id,
  coalesce(pm.name, (select name from capital_partner)) as partner_name,
  round(sum(m.usd)::numeric, 2) as usd
from public.cash_movements m
left join partner_methods pm on pm.id = m.payment_method_id
where m.direction = 'egreso'
  and m.project_id is not null
  and m.occurred_on <= current_date
  and (m.payment_method_id is null
       or m.payment_method_id not in (select id from client_methods))
  and (m.payment_method_id is null or pm.id is not null)
group by m.project_id, 2, 3;
