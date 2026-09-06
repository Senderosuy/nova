-- =============================================================
-- Integraciones por proveedor: capacidad de API y estado de sync
-- =============================================================

alter table public.providers
  add column integration_key text,          -- conector en código: 'hostinger', 'cloudflare', ...
  add column integration_status text not null default 'sin_api'
    check (integration_status in ('sin_api', 'disponible', 'conectada', 'error')),
  add column api_docs_url text,
  add column last_synced_at timestamptz,
  add column last_sync_result text;

comment on column public.providers.integration_key is
  'Clave del conector implementado en src/lib/connectors. Null = sin integración.';
comment on column public.providers.integration_status is
  'sin_api: el proveedor no ofrece API de cuenta. disponible: hay conector pero falta credencial. conectada: sincroniza. error: última corrida falló.';

-- Estado inicial de los proveedores actuales
update public.providers
set integration_key = 'hostinger',
    integration_status = 'conectada',
    api_docs_url = 'https://developers.hostinger.com'
where name = 'Hostinger';

update public.providers
set integration_key = 'cloudflare',
    integration_status = 'disponible',
    api_docs_url = 'https://developers.cloudflare.com/api/'
where name = 'Cloudflare';

update public.providers
set integration_key = 'google_workspace',
    integration_status = 'disponible',
    api_docs_url = 'https://developers.google.com/admin-sdk'
where name = 'Google Workspace';

-- nic.com.uy no expone API de cuenta; sólo WHOIS público por dominio
update public.providers
set integration_key = 'nic_uy_whois',
    integration_status = 'disponible',
    api_docs_url = 'https://nic.com.uy',
    notes = coalesce(notes || ' · ', '') ||
            'Sin API de cuenta. Refresco de vencimientos vía WHOIS público (whois.nic.org.uy).'
where name = 'nic.com.uy';
