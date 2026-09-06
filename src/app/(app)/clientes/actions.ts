"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";

export async function createClientRecord(formData: FormData): Promise<void> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { error } = await supabase.from("clients").insert({
    name: String(formData.get("name") ?? "").trim(),
    kind: String(formData.get("kind") ?? "externo"),
    contact_name: String(formData.get("contact_name") ?? "").trim() || null,
    contact_email: String(formData.get("contact_email") ?? "").trim() || null,
    contact_phone: String(formData.get("contact_phone") ?? "").trim() || null,
    notes: String(formData.get("notes") ?? "").trim() || null,
  });

  if (error) throw new Error(`No se pudo crear el cliente: ${error.message}`);
  revalidatePath("/clientes");
}

export async function toggleClientStatus(id: string, current: string): Promise<void> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { error } = await supabase
    .from("clients")
    .update({ status: current === "activo" ? "inactivo" : "activo" })
    .eq("id", id);

  if (error) throw new Error(`No se pudo actualizar el cliente: ${error.message}`);
  revalidatePath("/clientes");
}
