"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
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
