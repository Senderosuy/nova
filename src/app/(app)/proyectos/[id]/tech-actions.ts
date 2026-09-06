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

/** Guarda de dónde se lee la ficha y sincroniza en el momento. */
export async function saveDocsSource(
  projectId: string,
  formData: FormData
): Promise<void> {
  const { normalizeRepo } = await import("@/lib/github");
  const { syncProjectDoc } = await import("@/lib/sync-docs");

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const raw = String(formData.get("docs_repo") ?? "").trim();
  const repo = raw ? normalizeRepo(raw) : null;

  if (raw && !repo) {
    throw new Error(
      "Repositorio inválido. Usá owner/repo o la URL de GitHub."
    );
  }

  const { error } = await supabase
    .from("projects")
    .update({
      docs_repo: repo,
      docs_path: String(formData.get("docs_path") ?? "").trim() || "ficha-tecnica.md",
      docs_branch: String(formData.get("docs_branch") ?? "").trim() || null,
    })
    .eq("id", projectId);

  if (error) throw new Error(`No se pudo guardar: ${error.message}`);

  if (repo) {
    const { data: p } = await supabase
      .from("projects")
      .select("id,name,docs_repo,docs_path,docs_branch")
      .eq("id", projectId)
      .single();
    if (p) await syncProjectDoc(supabase, p);
  }

  revalidatePath(`/proyectos/${projectId}`);
}

/** Vuelve a leer la ficha del repositorio ahora. */
export async function syncDocsNow(projectId: string): Promise<void> {
  const { syncProjectDoc } = await import("@/lib/sync-docs");

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: p } = await supabase
    .from("projects")
    .select("id,name,docs_repo,docs_path,docs_branch")
    .eq("id", projectId)
    .single();

  if (p) await syncProjectDoc(supabase, p);
  revalidatePath(`/proyectos/${projectId}`);
}
