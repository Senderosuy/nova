"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";

export async function createAsset(formData: FormData): Promise<void> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const cost = String(formData.get("cost") ?? "").trim();
  const providerId = String(formData.get("provider_id") ?? "").trim();

  let providerName: string | null = null;
  if (providerId) {
    const { data } = await supabase
      .from("providers")
      .select("name")
      .eq("id", providerId)
      .single();
    providerName = data?.name ?? null;
  }

  const { error } = await supabase.from("assets").insert({
    type: String(formData.get("type") ?? "otro"),
    name: String(formData.get("name") ?? "").trim(),
    provider: providerName,
    provider_id: providerId || null,
    identifier: String(formData.get("identifier") ?? "").trim() || null,
    ownership: String(formData.get("ownership") ?? "nova"),
    cost: cost ? Number(cost) : null,
    currency: String(formData.get("currency") ?? "USD"),
    billing_cycle: String(formData.get("billing_cycle") ?? "anual"),
    cost_reason: String(formData.get("cost_reason") ?? "").trim() || null,
    expires_at: String(formData.get("expires_at") ?? "").trim() || null,
    notes: String(formData.get("notes") ?? "").trim() || null,
  });

  if (error) throw new Error(`No se pudo crear el activo: ${error.message}`);
  revalidatePath("/activos");
}

/** Resuelve el nombre del proveedor a partir de su id (se guarda desnormalizado). */
async function providerNameOf(
  supabase: ReturnType<typeof createClient>,
  providerId: string
): Promise<string | null> {
  if (!providerId) return null;
  const { data } = await supabase
    .from("providers")
    .select("name")
    .eq("id", providerId)
    .single();
  return data?.name ?? null;
}

export async function updateAsset(id: string, formData: FormData): Promise<void> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const cost = String(formData.get("cost") ?? "").trim();
  const providerId = String(formData.get("provider_id") ?? "").trim();

  const { error } = await supabase
    .from("assets")
    .update({
      type: String(formData.get("type") ?? "otro"),
      name: String(formData.get("name") ?? "").trim(),
      provider: await providerNameOf(supabase, providerId),
      provider_id: providerId || null,
      identifier: String(formData.get("identifier") ?? "").trim() || null,
      ownership: String(formData.get("ownership") ?? "nova"),
      cost: cost ? Number(cost) : null,
      currency: String(formData.get("currency") ?? "USD"),
      billing_cycle: String(formData.get("billing_cycle") ?? "anual"),
      cost_reason: String(formData.get("cost_reason") ?? "").trim() || null,
      expires_at: String(formData.get("expires_at") ?? "").trim() || null,
      paid_at: String(formData.get("paid_at") ?? "").trim() || null,
      notes: String(formData.get("notes") ?? "").trim() || null,
    })
    .eq("id", id);

  if (error) throw new Error(`No se pudo actualizar el activo: ${error.message}`);

  revalidatePath("/activos");
  revalidatePath("/proyectos");
}

/**
 * Archiva el activo (soft-delete) y cierra sus asignaciones vigentes,
 * para que deje de sumar al costo de los proyectos.
 * No se borra: la memoria se archiva.
 */
export async function deleteAsset(id: string): Promise<void> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const today = new Date().toISOString().slice(0, 10);

  await supabase
    .from("asset_assignments")
    .update({ assigned_until: today })
    .eq("asset_id", id)
    .is("assigned_until", null);

  const { error } = await supabase
    .from("assets")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw new Error(`No se pudo archivar el activo: ${error.message}`);

  revalidatePath("/activos");
  revalidatePath("/proyectos");
}
