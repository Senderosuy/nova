-- =============================================================
-- Anti-duplicados: unicidad real a nivel base
-- (complementa el bloqueo de doble submit en la UI)
-- =============================================================

-- Un cliente no puede tener dos proyectos con el mismo nombre
create unique index projects_client_name_uniq
  on public.projects (client_id, lower(name))
  where deleted_at is null;

-- Nombres de cliente únicos
create unique index clients_name_uniq
  on public.clients (lower(name))
  where deleted_at is null;

-- Un activo no puede repetirse por identificador
create unique index assets_identifier_uniq
  on public.assets (lower(identifier))
  where deleted_at is null and identifier is not null;

-- Un activo no puede estar asignado dos veces al mismo proyecto
create unique index asset_assignments_active_uniq
  on public.asset_assignments (asset_id, project_id)
  where assigned_until is null;

-- Un mismo concepto no se duplica por proyecto
create unique index recurring_services_project_concept_uniq
  on public.recurring_services (project_id, lower(concept))
  where active and project_id is not null;
