"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";

export async function registerRepayment(
  partnerId: string,
  formData: FormData
): Promise<void> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const amount = Number(String(formData.get("amount") ?? "").trim());
  if (!amount || amount <= 0) throw new Error("El importe debe ser mayor a cero.");

  const { error } = await supabase.from("partner_repayments").insert({
    partner_id: partnerId,
    amount,
    currency: String(formData.get("currency") ?? "USD"),
    paid_on:
      String(formData.get("paid_on") ?? "").trim() ||
      new Date().toISOString().slice(0, 10),
    notes: String(formData.get("notes") ?? "").trim() || null,
  });

  if (error) throw new Error(`No se pudo registrar la amortización: ${error.message}`);
  revalidatePath("/socios");
}

export async function deleteRepayment(id: string): Promise<void> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { error } = await supabase.from("partner_repayments").delete().eq("id", id);
  if (error) throw new Error(`No se pudo eliminar: ${error.message}`);
  revalidatePath("/socios");
}

/** Ajusta los parámetros de la cascada (reserva y % de amortización). */
export async function updateCascadeSettings(formData: FormData): Promise<void> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const reserve = Number(String(formData.get("reserve_months") ?? "2"));
  const pct = Number(String(formData.get("amortization_pct") ?? "30"));

  const [a, b] = await Promise.all([
    supabase.from("app_settings").update({ value: reserve }).eq("key", "reserve_months"),
    supabase.from("app_settings").update({ value: pct }).eq("key", "amortization_pct"),
  ]);

  if (a.error || b.error)
    throw new Error(`No se pudo actualizar: ${(a.error ?? b.error)?.message}`);

  revalidatePath("/socios");
}
