"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";

export async function createProject(formData: FormData): Promise<void> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { error } = await supabase.from("projects").insert({
    client_id: String(formData.get("client_id") ?? ""),
    name: String(formData.get("name") ?? "").trim(),
    type: String(formData.get("type") ?? "otro"),
    brand: String(formData.get("brand") ?? "").trim() || null,
    status: String(formData.get("status") ?? "en_desarrollo"),
    description: String(formData.get("description") ?? "").trim() || null,
    production_url: String(formData.get("production_url") ?? "").trim() || null,
    repo_url: String(formData.get("repo_url") ?? "").trim() || null,
  });

  if (error) throw new Error(`No se pudo crear el proyecto: ${error.message}`);
  revalidatePath("/proyectos");
  revalidatePath("/");
}
