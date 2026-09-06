-- =============================================================
-- La completitud debe contemplar el documento
--
-- Un proyecto con el README completo cargado tiene su memoria
-- resuelta, aunque no se hayan llenado los doce campos sueltos.
-- La vista anterior solo miraba los campos, así que esos proyectos
-- aparecían como "sin ficha" en el dashboard y en la grilla.
-- =============================================================

create or replace view public.project_tech_status as
with fields as (
  select
    p.id as project_id,
    p.name,
    tp.project_id is not null as has_profile,
    (coalesce(tp.doc_content, '') <> '') as has_doc,
    tp.reviewed_at,
    case when tp.reviewed_at is null then null
         else (current_date - tp.reviewed_at) end as days_since_review,
    (
      (case when coalesce(tp.stack_text, '') <> '' then 1 else 0 end) +
      (case when coalesce(tp.hosting, '') <> '' then 1 else 0 end) +
      (case when coalesce(tp.database_info, '') <> '' then 1 else 0 end) +
      (case when coalesce(tp.domains_dns, '') <> '' then 1 else 0 end) +
      (case when coalesce(tp.repo_info, '') <> '' then 1 else 0 end) +
      (case when coalesce(tp.deploy_process, '') <> '' then 1 else 0 end) +
      (case when coalesce(tp.integrations_text, '') <> '' then 1 else 0 end) +
      (case when coalesce(tp.credentials_location, '') <> '' then 1 else 0 end) +
      (case when coalesce(tp.continuation_requirements, '') <> '' then 1 else 0 end)
    ) as filled
  from public.projects p
  left join public.project_tech_profiles tp on tp.project_id = p.id
  where p.deleted_at is null
)
select
  project_id,
  name,
  has_profile,
  reviewed_at,
  days_since_review,
  filled as filled_fields,
  9 as total_fields,
  -- Con documento la ficha está resuelta; sin él se mide por campos
  case when has_doc then 100
       else round((filled::numeric / 9 * 100), 0)
  end as completeness_pct,
  -- Columna nueva al final: create or replace no permite intercalarlas
  has_doc
from fields;
