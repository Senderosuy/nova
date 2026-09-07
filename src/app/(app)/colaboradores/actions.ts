"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";

const txt = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim() || null;
const num = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? "").trim();
  return v ? Number(v) : null;
};

export async function createCollaborator(formData: FormData): Promise<void> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { error } = await supabase.from("collaborators").insert({
    name: String(formData.get("name") ?? "").trim(),
    kind: String(formData.get("kind") ?? "externo"),
    default_hourly_cost: num(formData, "default_hourly_cost"),
    currency: String(formData.get("currency") ?? "USD"),
    email: txt(formData, "email"),
    notes: txt(formData, "notes"),
  });

  if (error) throw new Error(`No se pudo crear el colaborador: ${error.message}`);
  revalidatePath("/colaboradores");
}

export async function updateCollaborator(
  id: string,
  formData: FormData
): Promise<void> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { error } = await supabase
    .from("collaborators")
    .update({
      name: String(formData.get("name") ?? "").trim(),
      kind: String(formData.get("kind") ?? "externo"),
      default_hourly_cost: num(formData, "default_hourly_cost"),
      currency: String(formData.get("currency") ?? "USD"),
      email: txt(formData, "email"),
      notes: txt(formData, "notes"),
    })
    .eq("id", id);

  if (error) throw new Error(`No se pudo actualizar: ${error.message}`);
  revalidatePath("/colaboradores");
}

export async function toggleCollaborator(id: string, active: boolean): Promise<void> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { error } = await supabase
    .from("collaborators")
    .update({ active: !active })
    .eq("id", id);

  if (error) throw new Error(`No se pudo cambiar el estado: ${error.message}`);
  revalidatePath("/colaboradores");
}
