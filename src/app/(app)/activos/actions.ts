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
    expires_at: String(formData.get("expires_at") ?? "").trim() || null,
    notes: String(formData.get("notes") ?? "").trim() || null,
  });

  if (error) throw new Error(`No se pudo crear el activo: ${error.message}`);
  revalidatePath("/activos");
}
