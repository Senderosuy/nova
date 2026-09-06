"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { fetchHostingerDomains } from "@/lib/hostinger";

export async function syncHostinger(): Promise<void> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  let domains;
  try {
    domains = await fetchHostingerDomains();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error desconocido";
    redirect(`/activos?syncError=${encodeURIComponent(msg)}`);
  }

  const registered = domains.filter((d) => d.domain);

  const { data: existing, error: readError } = await supabase
    .from("assets")
    .select("id,identifier")
    .eq("type", "dominio")
    .eq("provider", "Hostinger");

  if (readError) redirect(`/activos?syncError=${encodeURIComponent(readError.message)}`);

  const byIdentifier = new Map((existing ?? []).map((a) => [a.identifier, a.id]));
  let created = 0;
  let updated = 0;

  for (const d of registered) {
    const expires = d.expires_at ? d.expires_at.slice(0, 10) : null;
    const existingId = byIdentifier.get(d.domain);

    if (existingId) {
      const { error } = await supabase
        .from("assets")
        .update({ expires_at: expires, notes: `Estado Hostinger: ${d.status ?? "?"}` })
        .eq("id", existingId);
      if (!error) updated++;
    } else {
      const { error } = await supabase.from("assets").insert({
        type: "dominio",
        name: d.domain,
        provider: "Hostinger",
        identifier: d.domain,
        ownership: "nova",
        expires_at: expires,
        notes: `Estado Hostinger: ${d.status ?? "?"}`,
      });
      if (!error) created++;
    }
  }

  revalidatePath("/activos");
  redirect(`/activos?synced=${created}&updated=${updated}`);
}

export async function createAsset(formData: FormData): Promise<void> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const cost = String(formData.get("cost") ?? "").trim();

  const { error } = await supabase.from("assets").insert({
    type: String(formData.get("type") ?? "otro"),
    name: String(formData.get("name") ?? "").trim(),
    provider: String(formData.get("provider") ?? "").trim() || null,
    identifier: String(formData.get("identifier") ?? "").trim() || null,
    ownership: String(formData.get("ownership") ?? "nova"),
    cost: cost ? Number(cost) : null,
    currency: String(formData.get("currency") ?? "USD"),
    expires_at: String(formData.get("expires_at") ?? "").trim() || null,
    notes: String(formData.get("notes") ?? "").trim() || null,
  });

  if (error) throw new Error(`No se pudo crear el activo: ${error.message}`);
  revalidatePath("/activos");
}
