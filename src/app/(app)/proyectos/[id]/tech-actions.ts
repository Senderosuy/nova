"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";

const txt = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim() || null;

/**
 * Guarda la ficha técnica. Cada guardado cuenta como revisión: si
 * alguien la abrió y la confirmó, la ficha está fresca a esa fecha.
 */
export async function saveTechProfile(
  projectId: string,
  formData: FormData
): Promise<void> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: claims } = await supabase.auth.getClaims();
  const userId = (claims?.claims?.sub as string) ?? null;

  const payload = {
    project_id: projectId,
    stack_text: txt(formData, "stack_text"),
    hosting: txt(formData, "hosting"),
    database_info: txt(formData, "database_info"),
    domains_dns: txt(formData, "domains_dns"),
    repo_info: txt(formData, "repo_info"),
    deploy_process: txt(formData, "deploy_process"),
    integrations_text: txt(formData, "integrations_text"),
    credentials_location: txt(formData, "credentials_location"),
    access_notes: txt(formData, "access_notes"),
    technical_decisions: txt(formData, "technical_decisions"),
    continuation_requirements: txt(formData, "continuation_requirements"),
    known_issues: txt(formData, "known_issues"),
    reviewed_at: new Date().toISOString().slice(0, 10),
    reviewed_by: userId,
  };

  const { error } = await supabase
    .from("project_tech_profiles")
    .upsert(payload, { onConflict: "project_id" });

  if (error) throw new Error(`No se pudo guardar la ficha: ${error.message}`);

  revalidatePath(`/proyectos/${projectId}`);
  revalidatePath("/proyectos");
}

/** Marca la ficha como revisada sin cambiar el contenido. */
export async function markReviewed(projectId: string): Promise<void> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: claims } = await supabase.auth.getClaims();

  const { error } = await supabase
    .from("project_tech_profiles")
    .upsert(
      {
        project_id: projectId,
        reviewed_at: new Date().toISOString().slice(0, 10),
        reviewed_by: (claims?.claims?.sub as string) ?? null,
      },
      { onConflict: "project_id" }
    );

  if (error) throw new Error(`No se pudo marcar como revisada: ${error.message}`);
  revalidatePath(`/proyectos/${projectId}`);
}
