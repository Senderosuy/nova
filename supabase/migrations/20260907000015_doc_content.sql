-- =============================================================
-- Documento completo de la ficha
--
-- Forzar doce secciones exactas es fricción: los repos ya tienen
-- README. Se guarda el documento entero y se muestra tal cual;
-- el parseo por secciones queda como extra cuando el archivo las
-- tiene, para poder medir completitud.
-- =============================================================

alter table public.project_tech_profiles
  add column doc_content text,
  add column doc_fetched_at timestamptz;

comment on column public.project_tech_profiles.doc_content is
  'Contenido completo del documento leído del repositorio. Es la fuente de verdad cuando el proyecto tiene repo configurado.';

-- El archivo por defecto pasa a ser el README, que ya existe en todos lados
alter table public.projects
  alter column docs_path set default 'README.md';

update public.projects
set docs_path = 'README.md'
where docs_path = 'ficha-tecnica.md' and docs_repo is null;
