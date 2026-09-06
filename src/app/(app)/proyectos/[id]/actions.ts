"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

export async function assignAsset(projectId: string, formData: FormData): Promise<void> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const assetId = String(formData.get("asset_id") ?? "");
  if (!assetId) return;

  const { error } = await supabase.from("asset_assignments").insert({
    asset_id: assetId,
    project_id: projectId,
  });

  if (error) throw new Error(`No se pudo asignar el activo: ${error.message}`);

  await supabase.from("project_events").insert({
    project_id: projectId,
    event_type: "activo_asignado",
    description: "Activo asignado al proyecto",
    metadata: { asset_id: assetId },
  });

  revalidatePath(`/proyectos/${projectId}`);
}

export async function unassignAsset(
  projectId: string,
  assignmentId: string
): Promise<void> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { error } = await supabase
    .from("asset_assignments")
    .update({ assigned_until: new Date().toISOString().slice(0, 10) })
    .eq("id", assignmentId);

  if (error) throw new Error(`No se pudo desasignar el activo: ${error.message}`);
  revalidatePath(`/proyectos/${projectId}`);
}

export async function updateProjectStatus(
  projectId: string,
  formData: FormData
): Promise<void> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { error } = await supabase
    .from("projects")
    .update({ status: String(formData.get("status") ?? "en_desarrollo") })
    .eq("id", projectId);

  if (error) throw new Error(`No se pudo actualizar el estado: ${error.message}`);
  revalidatePath(`/proyectos/${projectId}`);
  revalidatePath("/proyectos");
  revalidatePath("/");
}

/** Alterna entre proyecto de cliente y producto propio de Nova. */
export async function setOwnershipType(
  projectId: string,
  type: "cliente" | "propio"
): Promise<void> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { error } = await supabase
    .from("projects")
    .update({ ownership_type: type })
    .eq("id", projectId);

  if (error) throw new Error(`No se pudo cambiar la naturaleza: ${error.message}`);
  revalidatePath(`/proyectos/${projectId}`);
  revalidatePath("/proyectos");
}

/** Edita los datos básicos del proyecto. */
export async function updateProject(
  projectId: string,
  formData: FormData
): Promise<void> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const txt = (k: string) => String(formData.get(k) ?? "").trim() || null;
  const name = String(formData.get("name") ?? "").trim();

  if (!name) throw new Error("El nombre no puede quedar vacío.");

  const { error } = await supabase
    .from("projects")
    .update({
      name,
      client_id: txt("client_id"),
      type: String(formData.get("type") ?? "otro"),
      description: txt("description"),
      production_url: txt("production_url"),
      repo_url: txt("repo_url"),
    })
    .eq("id", projectId);

  if (error) throw new Error(`No se pudo actualizar el proyecto: ${error.message}`);

  revalidatePath(`/proyectos/${projectId}`);
  revalidatePath("/proyectos");
}

/** Archiva el proyecto: cierra sus asignaciones y lo saca de las listas. */
export async function archiveProject(projectId: string): Promise<void> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  await supabase
    .from("asset_assignments")
    .update({ assigned_until: new Date().toISOString().slice(0, 10) })
    .eq("project_id", projectId)
    .is("assigned_until", null);

  const { error } = await supabase
    .from("projects")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", projectId);

  if (error) throw new Error(`No se pudo archivar: ${error.message}`);
  redirect("/proyectos");
}
