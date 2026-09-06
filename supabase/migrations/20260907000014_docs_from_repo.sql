-- =============================================================
-- Ficha técnica sincronizada desde el repositorio
--
-- Que la ficha viva junto al código resuelve el problema de fondo:
-- se actualiza en el mismo commit que el cambio, y nadie tiene que
-- acordarse de venir al Hub a reflejarlo.
--
-- repo_url puede apuntar a Lovable, Vercel o cualquier plataforma,
-- así que el repositorio de documentación es un campo aparte.
-- =============================================================

alter table public.projects
  add column docs_repo text,
  add column docs_path text not null default 'ficha-tecnica.md',
  add column docs_branch text,
  add column docs_synced_at timestamptz,
  add column docs_sync_result text;

comment on column public.projects.docs_repo is
  'Repositorio en formato owner/repo desde donde se lee la ficha. Null = ficha manual.';
comment on column public.projects.docs_path is
  'Ruta del archivo dentro del repo. Por defecto ficha-tecnica.md en la raíz.';
comment on column public.projects.docs_branch is
  'Rama a leer. Null usa la rama por defecto del repositorio.';

-- Estado de sincronización por proyecto
create or replace view public.project_docs_status as
select
  p.id as project_id,
  p.name,
  p.docs_repo,
  p.docs_path,
  p.docs_branch,
  p.docs_synced_at,
  p.docs_sync_result,
  case
    when p.docs_repo is null then 'manual'
    when p.docs_synced_at is null then 'sin_sincronizar'
    when p.docs_sync_result ilike 'error%' then 'error'
    else 'sincronizada'
  end as docs_status
from public.projects p
where p.deleted_at is null;
