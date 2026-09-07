-- =============================================================
-- ANÁLISIS COMERCIAL DE DOMINIOS
--
-- El cliente más barato de conseguir es el que ya tenés. Si paga un
-- dominio todos los años y no lo usa, ahí hay una conversación: o se
-- desarrolla algo, o confirma que lo quiere solo reservado.
--
-- Dos oportunidades distintas:
--   1. Dominios sin uso: reservados, en parking o caídos
--   2. Extensiones faltantes: tiene el .com y no el .com.uy
--
-- La pieza que hace que esto sirva es el REGISTRO DE LA RESPUESTA:
-- sin él, el informe repite los mismos dominios todos los meses y
-- se deja de mirar.
-- =============================================================

-- -------------------------------------------------------------
-- Estado técnico del dominio
-- -------------------------------------------------------------

alter table public.assets
  add column web_status text
    check (web_status in ('sin_dns', 'parking', 'error', 'redirige', 'activa', 'sin_verificar')),
  add column web_checked_at timestamptz,
  add column web_detail text,
  add column web_final_url text;

comment on column public.assets.web_status is
  'Estado del sitio. La detección de parking es heurística: sirve como sugerencia de conversación, no como conclusión.';

-- -------------------------------------------------------------
-- Estado comercial: la respuesta del cliente
-- -------------------------------------------------------------

alter table public.assets
  add column commercial_status text not null default 'sin_conversar'
    check (commercial_status in (
      'sin_conversar',
      'reservado_a_pedido',
      'oportunidad_abierta',
      'en_desarrollo',
      'a_dar_de_baja'
    )),
  add column commercial_note text,
  add column commercial_updated_at timestamptz;

comment on column public.assets.commercial_status is
  'reservado_a_pedido: el cliente confirmó que lo quiere solo reservado. Deja de aparecer en el informe.';

create or replace function public.touch_commercial_status()
returns trigger
language plpgsql
as $$
begin
  if new.commercial_status is distinct from old.commercial_status then
    new.commercial_updated_at := now();
  end if;
  return new;
end;
$$;

create trigger assets_commercial_touch
  before update on public.assets
  for each row execute function public.touch_commercial_status();

-- -------------------------------------------------------------
-- Extensiones que tendría sentido tener
-- -------------------------------------------------------------

create table public.tld_targets (
  tld text primary key,
  label text not null,
  applies_to text not null default 'uy' check (applies_to in ('uy', 'br', 'global')),
  approx_cost_usd numeric(10, 2),
  sort_order int not null default 100
);

insert into public.tld_targets (tld, label, applies_to, approx_cost_usd, sort_order) values
  ('.com',     'Comercial global',      'global', 10.46, 10),
  ('.com.uy',  'Comercial Uruguay',     'uy',     23.56, 20),
  ('.uy',      'Uruguay',               'uy',     23.56, 30),
  ('.com.br',  'Comercial Brasil',      'br',     11.99, 40),
  ('.app',     'Aplicación',            'global', 20.19, 50),
  ('.net',     'Alternativa a .com',    'global', 12.00, 60);

-- -------------------------------------------------------------
-- Oportunidad 1: dominios que se pagan y no se usan
-- -------------------------------------------------------------

create or replace view public.domain_opportunities as
select
  a.id as asset_id,
  a.name as domain,
  a.identifier,
  a.web_status,
  a.web_detail,
  a.web_checked_at,
  a.commercial_status,
  a.commercial_note,
  a.commercial_updated_at,
  a.expires_at,
  p.id as project_id,
  p.name as project_name,
  c.id as client_id,
  coalesce(c.name, 'Nova (sin cliente)') as client_name,
  a.ownership,
  public.to_usd(a.cost, a.currency) as cost_usd_year,
  -- Un dominio con web activa no es oportunidad; uno caído es urgente
  case
    when a.web_status = 'error' then 'urgente'
    when a.web_status in ('sin_dns', 'parking') then 'alta'
    when a.web_status = 'redirige' then 'media'
    else 'ninguna'
  end as opportunity
from public.assets a
left join public.asset_assignments aa on aa.asset_id = a.id and aa.assigned_until is null
left join public.projects p on p.id = aa.project_id and p.deleted_at is null
left join public.clients c on c.id = p.client_id
where a.deleted_at is null
  and a.type = 'dominio'
  -- Ya conversado y resuelto: sale del informe
  and a.commercial_status not in ('reservado_a_pedido', 'en_desarrollo');

-- -------------------------------------------------------------
-- Oportunidad 2: extensiones que le faltan a cada marca
--
-- Se agrupa por la raíz del dominio: fotolink.uy y fotolink.com.uy
-- son la misma marca con dos extensiones.
-- -------------------------------------------------------------

create or replace view public.missing_tlds as
with owned as (
  select
    a.id,
    lower(coalesce(a.identifier, a.name)) as full_domain,
    -- Raíz: lo que va antes del primer punto
    split_part(lower(coalesce(a.identifier, a.name)), '.', 1) as root,
    -- Extensión: todo lo que sigue
    '.' || substring(lower(coalesce(a.identifier, a.name)) from position('.' in lower(coalesce(a.identifier, a.name))) + 1) as tld,
    aa.project_id,
    p.client_id,
    coalesce(c.name, 'Nova (sin cliente)') as client_name
  from public.assets a
  left join public.asset_assignments aa on aa.asset_id = a.id and aa.assigned_until is null
  left join public.projects p on p.id = aa.project_id and p.deleted_at is null
  left join public.clients c on c.id = p.client_id
  where a.deleted_at is null and a.type = 'dominio'
),
roots as (
  select root, client_id, client_name, count(*) as owned_count,
         array_agg(tld order by tld) as owned_tlds
  from owned group by root, client_id, client_name
)
select
  r.root,
  r.client_id,
  r.client_name,
  r.owned_tlds,
  t.tld as missing_tld,
  t.label,
  t.approx_cost_usd,
  r.root || t.tld as suggested_domain
from roots r
cross join public.tld_targets t
where not (t.tld = any(r.owned_tlds))
  -- Solo sugerir extensiones del mercado donde opera
  and (t.applies_to <> 'br' or exists (
    select 1 from unnest(r.owned_tlds) x where x like '%.br'
  ));

-- -------------------------------------------------------------
-- Resumen por cliente para el informe
-- -------------------------------------------------------------

create or replace view public.commercial_summary as
select
  coalesce(c.id, '00000000-0000-0000-0000-000000000000'::uuid) as client_id,
  coalesce(c.name, 'Nova (sin cliente)') as client_name,
  count(*) filter (where o.opportunity = 'urgente') as urgentes,
  count(*) filter (where o.opportunity = 'alta') as alta,
  count(*) filter (where o.opportunity = 'media') as media,
  count(*) filter (where o.web_status is null or o.web_status = 'sin_verificar') as sin_verificar,
  round(sum(o.cost_usd_year) filter (where o.opportunity in ('alta', 'urgente')), 2)
    as gasto_sin_uso_usd
from public.domain_opportunities o
left join public.clients c on c.id = o.client_id
group by c.id, c.name;

-- -------------------------------------------------------------
-- RLS
-- -------------------------------------------------------------

alter table public.tld_targets enable row level security;

create policy tld_targets_select on public.tld_targets
  for select to authenticated using (true);
create policy tld_targets_write on public.tld_targets
  for all to authenticated using (public.can_write()) with check (public.can_write());
