"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";

const txt = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim() || null;
const num = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? "").trim();
  return v ? Number(v) : null;
};

/** Gasto único de estructura: apertura, honorarios, trámites. */
export async function createCompanyExpense(formData: FormData): Promise<void> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { error } = await supabase.from("project_charges").insert({
    project_id: null,
    scope: "empresa",
    direction: "egreso",
    concept: String(formData.get("concept") ?? "").trim(),
    amount: num(formData, "amount") ?? 0,
    currency: String(formData.get("currency") ?? "USD"),
    charge_date: txt(formData, "charge_date") ?? new Date().toISOString().slice(0, 10),
    category_id: txt(formData, "category_id"),
    payment_method_id: txt(formData, "payment_method_id"),
    notes: txt(formData, "notes"),
  });

  if (error) throw new Error(`No se pudo crear el gasto: ${error.message}`);
  revalidatePath("/finanzas");
}

/** Gasto recurrente de estructura: contador, herramientas, banco. */
export async function createCompanyRecurring(formData: FormData): Promise<void> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { error } = await supabase.from("recurring_services").insert({
    project_id: null,
    client_id: null,
    scope: "empresa",
    direction: "egreso",
    concept: String(formData.get("concept") ?? "").trim(),
    amount: 0,
    net_cost: num(formData, "net_cost") ?? 0,
    net_currency: String(formData.get("net_currency") ?? "USD"),
    currency: String(formData.get("net_currency") ?? "USD"),
    frequency: String(formData.get("frequency") ?? "mensual"),
    next_billing_date: txt(formData, "next_billing_date"),
    category_id: txt(formData, "category_id"),
    payment_method_id: txt(formData, "payment_method_id"),
    notes: txt(formData, "notes"),
    active: true,
  });

  if (error) throw new Error(`No se pudo crear el gasto recurrente: ${error.message}`);
  revalidatePath("/finanzas");
}

export async function setExpensePayment(
  chargeId: string,
  status: "cobrado" | "pendiente"
): Promise<void> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { error } = await supabase
    .from("project_charges")
    .update({
      billing_status: status,
      collected_at: status === "cobrado" ? new Date().toISOString().slice(0, 10) : null,
    })
    .eq("id", chargeId);

  if (error) throw new Error(`No se pudo actualizar: ${error.message}`);
  revalidatePath("/finanzas");
}

export async function deleteCompanyItem(
  table: "project_charges" | "recurring_services",
  id: string
): Promise<void> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { error } =
    table === "project_charges"
      ? await supabase.from("project_charges").delete().eq("id", id)
      : await supabase.from("recurring_services").update({ active: false }).eq("id", id);

  if (error) throw new Error(`No se pudo eliminar: ${error.message}`);
  revalidatePath("/finanzas");
}
