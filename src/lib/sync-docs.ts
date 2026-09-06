import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchRepoFile, GitHubError } from "@/lib/github";
import { parseTechDocument } from "@/lib/tech-parser";

export type DocSyncOutcome = {
  project: string;
  status: "actualizada" | "sin_cambios" | "sin_archivo" | "error";
  detail: string;
};

/**
 * Lee la ficha desde el repositorio del proyecto y la vuelca en la
 * ficha técnica. Se usa desde la UI y desde el cron diario, por eso
 * vive acá y no en una server action.
 *
 * No pisa la ficha con vacío: si el archivo no existe o no tiene
 * secciones reconocibles, deja lo que había y lo reporta.
 */
export async function syncProjectDoc(
  supabase: SupabaseClient,
  project: {
    id: string;
    name: string;
    docs_repo: string | null;
    docs_path: string | null;
    docs_branch: string | null;
  }
): Promise<DocSyncOutcome> {
  if (!project.docs_repo) {
    return { project: project.name, status: "sin_archivo", detail: "Sin repositorio configurado." };
  }

  const path = project.docs_path || "ficha-tecnica.md";

  try {
    const file = await fetchRepoFile(project.docs_repo, path, project.docs_branch);

    if (!file) {
      const detail = `No existe ${path} en ${project.docs_repo}.`;
      await supabase
        .from("projects")
        .update({ docs_synced_at: new Date().toISOString(), docs_sync_result: detail })
        .eq("id", project.id);
      return { project: project.name, status: "sin_archivo", detail };
    }

    // El documento completo es la fuente de verdad; el parseo por
    // secciones es un extra para poder medir completitud.
    const { values, matched } = parseTechDocument(file.content);

    const { error } = await supabase.from("project_tech_profiles").upsert(
      {
        project_id: project.id,
        ...values,
        doc_content: file.content,
        doc_fetched_at: new Date().toISOString(),
        reviewed_at: new Date().toISOString().slice(0, 10),
      },
      { onConflict: "project_id" }
    );

    if (error) throw new Error(error.message);

    const kb = (file.content.length / 1024).toFixed(1);
    const detail =
      `${path} leído (${kb} KB)` +
      (matched.length
        ? ` · ${matched.length} sección(es) reconocida(s)`
        : " · sin secciones estándar, se muestra el documento completo");

    await supabase
      .from("projects")
      .update({ docs_synced_at: new Date().toISOString(), docs_sync_result: detail })
      .eq("id", project.id);

    return { project: project.name, status: "actualizada", detail };
  } catch (e) {
    const msg =
      e instanceof GitHubError
        ? e.message
        : e instanceof Error
          ? e.message
          : "Error desconocido";

    await supabase
      .from("projects")
      .update({
        docs_synced_at: new Date().toISOString(),
        docs_sync_result: `error: ${msg}`,
      })
      .eq("id", project.id);

    return { project: project.name, status: "error", detail: msg };
  }
}

/** Sincroniza todos los proyectos que tengan repositorio configurado. */
export async function syncAllProjectDocs(
  supabase: SupabaseClient
): Promise<DocSyncOutcome[]> {
  const { data: projects } = await supabase
    .from("projects")
    .select("id,name,docs_repo,docs_path,docs_branch")
    .not("docs_repo", "is", null)
    .is("deleted_at", null);

  const results: DocSyncOutcome[] = [];
  for (const p of projects ?? []) {
    results.push(await syncProjectDoc(supabase, p));
  }
  return results;
}
