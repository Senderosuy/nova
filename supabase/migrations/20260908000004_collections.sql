-- =============================================================
-- GESTIÓN DE COBRANZA
--
-- Sin consecuencia visible, el pago se posterga. Pero cortar el
-- servicio es una palanca desproporcionada: un cliente que debe
-- USD 160 puede estar recibiendo consultas por su web.
--
-- Por eso el escalamiento es gradual y NUNCA automático: el Hub
-- detecta y propone, la acción la ejecuta una persona. Que un cron
-- baje el sitio de un cliente es demasiado poder para un sistema
-- que se alimenta de datos cargados a mano.
--
-- La suspensión técnica queda fuera de alcance: el Hub no tiene
-- acceso para modificar sitios alojados en Lovable, y antes hay que
-- verificar qué permite el contrato con cada cliente.
-- =============================================================

create table public.collection_cases (
  id uuid primary key default gen_random_uuid(),
  -- Origen: una anualidad o un cargo único
  service_id uuid references public.recurring_services (id) on delete cascade,
  charge_id uuid references public.project_charges (id) on delete cascade,
  client_id uuid references public.clients (id),
  project_id uuid references public.projects (id),
  amount_usd numeric(12, 2) not null,
  due_date date not null,
  stage text not null default 'por_vencer'
    check (stage in (
      'por_vencer',
      'recordatorio',
      'segundo_aviso',
      'aviso_suspension',
      'suspendido',
      'cobrado',
      'incobrable'
    )),
  last_contact_at date,
  contact_note text,
  resolved_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint collection_source_chk check (
    (service_id is not null and charge_id is null) or
    (charge_id is not null and service_id is null)
  ),
  unique (service_id, due_date),
  unique (charge_id, due_date)
);

create index collection_cases_stage_idx on public.collection_cases (stage, due_date);

create trigger collection_cases_set_updated_at
  before update on public.collection_cases
  for each row execute function public.set_updated_at();

-- -------------------------------------------------------------
-- Escalamiento sugerido según días de atraso
--
-- Es una propuesta, no una acción: el sistema calcula en qué etapa
-- debería estar cada caso y quien gestiona decide si avanzar.
-- -------------------------------------------------------------

create or replace function public.suggested_stage(days_overdue int)
returns text
language sql
immutable
as $$
  select case
    when days_overdue < 0 then 'por_vencer'
    when days_overdue < 15 then 'recordatorio'
    when days_overdue < 30 then 'segundo_aviso'
    when days_overdue < 45 then 'aviso_suspension'
    else 'suspendido'
  end;
$$;

-- -------------------------------------------------------------
-- Cobros pendientes con su atraso
-- -------------------------------------------------------------

create or replace view public.pending_collections as
select
  sc.service_id,
  null::uuid as charge_id,
  sc.concept,
  p.id as project_id,
  p.name as project_name,
  c.id as client_id,
  c.name as client_name,
  public.to_usd(sc.amount, sc.currency) as amount_usd,
  sc.renewal_date as due_date,
  (current_date - sc.renewal_date) as days_overdue,
  public.suggested_stage((current_date - sc.renewal_date)::int) as suggested_stage,
  sc.confirmation_status,
  cc.id as case_id,
  cc.stage as current_stage,
  cc.last_contact_at,
  cc.contact_note
from public.service_schedule sc
join public.recurring_services s on s.id = sc.service_id
left join public.projects p on p.id = sc.project_id and p.deleted_at is null
left join public.clients c on c.id = p.client_id
left join public.collection_cases cc
  on cc.service_id = sc.service_id and cc.due_date = sc.renewal_date
where s.direction = 'ingreso'
  and sc.billing_status = 'pendiente'
  and coalesce(sc.amount, 0) > 0
  and sc.renewal_date is not null
  -- Lo que vence en los próximos 30 días y todo lo ya vencido
  and sc.renewal_date <= current_date + 30
  and coalesce(cc.stage, 'por_vencer') not in ('cobrado', 'incobrable')

union all

select
  null,
  ch.id,
  ch.concept,
  p.id,
  p.name,
  c.id,
  c.name,
  public.to_usd(ch.amount, ch.currency),
  ch.charge_date,
  (current_date - ch.charge_date),
  public.suggested_stage((current_date - ch.charge_date)::int),
  null,
  cc.id,
  cc.stage,
  cc.last_contact_at,
  cc.contact_note
from public.project_charges ch
left join public.projects p on p.id = ch.project_id and p.deleted_at is null
left join public.clients c on c.id = p.client_id
left join public.collection_cases cc
  on cc.charge_id = ch.id and cc.due_date = ch.charge_date
where ch.direction = 'ingreso'
  and ch.billing_status = 'pendiente'
  and ch.amount > 0
  and ch.charge_date <= current_date + 30
  and coalesce(cc.stage, 'por_vencer') not in ('cobrado', 'incobrable');

-- -------------------------------------------------------------
-- Resumen por cliente
-- -------------------------------------------------------------

create or replace view public.collection_summary as
select
  client_id,
  coalesce(client_name, 'Sin cliente') as client_name,
  count(*) as casos,
  count(*) filter (where days_overdue > 0) as vencidos,
  count(*) filter (where days_overdue >= 45) as criticos,
  round(sum(amount_usd), 2) as total_usd,
  round(sum(amount_usd) filter (where days_overdue > 0), 2) as vencido_usd,
  max(days_overdue) as max_atraso
from public.pending_collections
group by client_id, client_name;

-- -------------------------------------------------------------
-- RLS
-- -------------------------------------------------------------

alter table public.collection_cases enable row level security;

create policy collection_cases_select on public.collection_cases
  for select to authenticated using (true);
create policy collection_cases_write on public.collection_cases
  for all to authenticated using (public.can_write()) with check (public.can_write());
