"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { getConnector } from "@/lib/connectors";

/**
 * Sincroniza cualquier proveedor que tenga conector registrado.
 * No conoce a Hostinger ni a Cloudflare: resuelve por integration_key.
 */
export async function syncProvider(providerId: string): Promise<void> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: provider } = await supabase
    .from("providers")
    .select("id,name,integration_key")
    .eq("id", providerId)
    .single();

  if (!provider) redirect("/proveedores?syncError=Proveedor%20inexistente");

  const connector = getConnector(provider.integration_key);
  if (!connector) {
    redirect(
      `/proveedores?syncError=${encodeURIComponent(
        `${provider.name} no tiene conector implementado.`
      )}`
    );
  }

  try {
    const result = await connector.sync(supabase, provider.id);
    await supabase
      .from("providers")
      .update({
        integration_status: "conectada",
        last_synced_at: new Date().toISOString(),
        last_sync_result: result.message,
      })
      .eq("id", provider.id);

    revalidatePath("/proveedores");
    revalidatePath("/activos");
    redirect(
      `/proveedores?synced=${encodeURIComponent(`${provider.name}: ${result.message}`)}`
    );
  } catch (e) {
    // redirect() lanza internamente: no lo tratamos como fallo del conector.
    if (e && typeof e === "object" && "digest" in e) throw e;

    const msg = e instanceof Error ? e.message : "Error desconocido";
    await supabase
      .from("providers")
      .update({
        integration_status: "error",
        last_synced_at: new Date().toISOString(),
        last_sync_result: msg,
      })
      .eq("id", provider.id);

    revalidatePath("/proveedores");
    redirect(`/proveedores?syncError=${encodeURIComponent(`${provider.name}: ${msg}`)}`);
  }
}

function text(fd: FormData, key: string): string | null {
  const v = String(fd.get(key) ?? "").trim();
  return v || null;
}

export async function createProvider(formData: FormData): Promise<void> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { error } = await supabase.from("providers").insert({
    name: String(formData.get("name") ?? "").trim(),
    website: text(formData, "website"),
    category: String(formData.get("category") ?? "otro"),
    billing_model: String(formData.get("billing_model") ?? "pago"),
    contract_context: text(formData, "contract_context"),
    payment_method: text(formData, "payment_method"),
    payment_terms: text(formData, "payment_terms"),
    account_reference: text(formData, "account_reference"),
    currency: String(formData.get("currency") ?? "USD"),
    notes: text(formData, "notes"),
  });

  if (error) throw new Error(`No se pudo crear el proveedor: ${error.message}`);
  revalidatePath("/proveedores");
}

export async function updateProvider(id: string, formData: FormData): Promise<void> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { error } = await supabase
    .from("providers")
    .update({
      contract_context: text(formData, "contract_context"),
      billing_model: String(formData.get("billing_model") ?? "pago"),
      payment_method: text(formData, "payment_method"),
      payment_terms: text(formData, "payment_terms"),
      account_reference: text(formData, "account_reference"),
    })
    .eq("id", id);

  if (error) throw new Error(`No se pudo actualizar el proveedor: ${error.message}`);
  revalidatePath("/proveedores");
}

/**
 * Archiva un proveedor. No se borra: sus activos históricos conservan
 * la referencia. Se rechaza si todavía tiene activos vigentes.
 */
export async function archiveProvider(providerId: string): Promise<void> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { count } = await supabase
    .from("assets")
    .select("id", { count: "exact", head: true })
    .eq("provider_id", providerId)
    .is("deleted_at", null);

  if ((count ?? 0) > 0) {
    redirect(
      `/proveedores?syncError=${encodeURIComponent(
        `No se puede archivar: el proveedor tiene ${count} activo(s) vigente(s). Reasignalos o archivalos primero.`
      )}`
    );
  }

  const { error } = await supabase
    .from("providers")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", providerId);

  if (error) throw new Error(`No se pudo archivar: ${error.message}`);
  revalidatePath("/proveedores");
  redirect("/proveedores?synced=Proveedor%20archivado");
}
