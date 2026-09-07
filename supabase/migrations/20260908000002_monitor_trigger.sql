-- =============================================================
-- Disparador de monitoreo desde la base
--
-- Vercel Cron en plan Hobby solo permite ejecuciones diarias, pero
-- un e-commerce necesita chequeos cada pocos minutos. pg_cron sí
-- permite frecuencia por minuto, y pg_net puede llamar al endpoint.
--
-- El disparador corre cada minuto; el endpoint decide a quién le
-- toca según el intervalo de cada sitio. Un solo cron sirve para
-- todas las frecuencias.
--
-- El secreto se guarda en una tabla propia y no en el código: así
-- no viaja en el repositorio ni en las migraciones.
-- =============================================================

create table if not exists private_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table private_config enable row level security;

-- Nadie accede por API: solo funciones security definer y el rol de servicio
create policy private_config_admin on private_config
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

comment on table private_config is
  'Secretos que necesita la base para llamar a la app. Sin acceso desde la API pública.';

-- -------------------------------------------------------------
-- Dispara el chequeo si hay algún sitio vencido.
-- Evita la llamada cuando no hay nada que hacer, para no gastar
-- una petición por minuto sin motivo.
-- -------------------------------------------------------------

create or replace function public.trigger_monitor_check()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  pending int;
  secret text;
begin
  select count(*) into pending
  from public.site_monitors
  where active and next_check_at <= now();

  if pending = 0 then
    return;
  end if;

  select value into secret from private_config where key = 'cron_secret';
  if secret is null then
    raise notice 'Falta cron_secret en private_config: el monitoreo no se dispara.';
    return;
  end if;

  perform net.http_get(
    url := 'https://hub.latamnova.app/api/cron/monitor',
    headers := jsonb_build_object('Authorization', 'Bearer ' || secret),
    timeout_milliseconds := 55000
  );
end;
$$;

select cron.schedule(
  'nova-monitor-tick',
  '* * * * *',
  'select public.trigger_monitor_check();'
);
