"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";

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
