-- =============================================================
-- FICHA TÉCNICA 360
--
-- Responde dos preguntas: cómo está hecho este proyecto y qué se
-- necesita para continuarlo. Es el pilar de memoria del Hub.
--
-- Una ficha vale por lo que dice y por lo fresca que está: una
-- ficha de hace dos años miente con confianza. Por eso se registra
-- cuándo se revisó por última vez y se mide la completitud.
--
-- Las credenciales NUNCA se guardan acá: solo dónde están.
-- =============================================================

alter table public.project_tech_profiles
  add column stack_text text,
  add column hosting text,
  add column database_info text,
  add column domains_dns text,
  add column repo_info text,
  add column deploy_process text,
  add column integrations_text text,
  add column access_notes text,
  add column known_issues text,
  add column reviewed_at date,
  add column reviewed_by uuid references public.profiles (id);

comment on column public.project_tech_profiles.access_notes is
  'Quién tiene acceso y a qué. Nunca credenciales: eso va en credentials_location como referencia al gestor de secretos.';
comment on column public.project_tech_profiles.reviewed_at is
  'Última revisión. Una ficha vieja da información desactualizada con apariencia de certeza.';

-- -------------------------------------------------------------
-- Completitud y frescura de la ficha
-- -------------------------------------------------------------

create or replace view public.project_tech_status as
select
  p.id as project_id,
  p.name,
  tp.project_id is not null as has_profile,
  tp.reviewed_at,
  case
    when tp.reviewed_at is null then null
    else (current_date - tp.reviewed_at)
  end as days_since_review,
  -- Nueve campos definen una ficha completa
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
  ) as filled_fields,
  9 as total_fields,
  round(
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
    )::numeric / 9 * 100, 0
  ) as completeness_pct
from public.projects p
left join public.project_tech_profiles tp on tp.project_id = p.id
where p.deleted_at is null;

-- -------------------------------------------------------------
-- Registrar en el historial cada revisión de la ficha
-- -------------------------------------------------------------

create or replace function public.log_tech_profile_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.reviewed_at is distinct from old.reviewed_at and new.reviewed_at is not null then
    insert into public.project_events (project_id, event_type, description, author)
    values (new.project_id, 'ficha_revisada', 'Ficha técnica revisada', auth.uid());
  end if;
  return new;
end;
$$;

drop trigger if exists tech_profile_reviewed on public.project_tech_profiles;
create trigger tech_profile_reviewed
  after update on public.project_tech_profiles
  for each row execute function public.log_tech_profile_review();
