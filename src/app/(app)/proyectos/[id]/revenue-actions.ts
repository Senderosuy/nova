"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";

const num = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? "").trim();
  return v ? Number(v) : null;
};
const txt = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim() || null;

/** Anualidad o servicio recurrente, anclado al vencimiento de un activo. */
export async function createService(projectId: string, formData: FormData): Promise<void> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: project } = await supabase
    .from("projects")
    .select("client_id")
    .eq("id", projectId)
    .single();

  const { error } = await supabase.from("recurring_services").insert({
    project_id: projectId,
    client_id: project?.client_id ?? null,
    catalog_id: txt(formData, "catalog_id"),
    concept: String(formData.get("concept") ?? "").trim(),
    amount: num(formData, "amount") ?? 0,
    currency: String(formData.get("currency") ?? "USD"),
    frequency: String(formData.get("frequency") ?? "anual"),
    net_cost: num(formData, "net_cost"),
    net_currency: String(formData.get("net_currency") ?? "USD"),
    billing_mode: String(formData.get("billing_mode") ?? "adelantado"),
    first_charge_date: txt(formData, "first_charge_date"),
    anchor_asset_id: txt(formData, "anchor_asset_id"),
    lead_days: num(formData, "lead_days") ?? 45,
    next_billing_date: txt(formData, "next_billing_date"),
    notes: txt(formData, "notes"),
    active: true,
  });

  if (error) throw new Error(`No se pudo crear el servicio: ${error.message}`);
  revalidatePath(`/proyectos/${projectId}`);
  revalidatePath("/proyectos");
}

/** Registra la respuesta del cliente sobre continuar o no. */
export async function setConfirmation(
  projectId: string,
  serviceId: string,
  status: "confirmada" | "rechazada" | "pendiente"
): Promise<void> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { error } = await supabase
    .from("recurring_services")
    .update({
      confirmation_status: status,
      confirmed_at: status === "confirmada" ? new Date().toISOString().slice(0, 10) : null,
    })
    .eq("id", serviceId);

  if (error) throw new Error(`No se pudo actualizar la confirmación: ${error.message}`);
  revalidatePath(`/proyectos/${projectId}`);
  revalidatePath("/alertas");
}

export async function setServiceBilling(
  projectId: string,
  serviceId: string,
  status: "cobrado" | "pendiente"
): Promise<void> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { error } = await supabase
    .from("recurring_services")
    .update({
      billing_status: status,
      collected_at: status === "cobrado" ? new Date().toISOString().slice(0, 10) : null,
    })
    .eq("id", serviceId);

  if (error) throw new Error(`No se pudo actualizar el cobro: ${error.message}`);
  revalidatePath(`/proyectos/${projectId}`);
  revalidatePath("/alertas");
}

export async function archiveService(projectId: string, serviceId: string): Promise<void> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { error } = await supabase
    .from("recurring_services")
    .update({ active: false })
    .eq("id", serviceId);

  if (error) throw new Error(`No se pudo archivar el servicio: ${error.message}`);
  revalidatePath(`/proyectos/${projectId}`);
  revalidatePath("/proyectos");
}

/** Cargo único: desarrollo, creación, extras. */
export async function createCharge(projectId: string, formData: FormData): Promise<void> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { error } = await supabase.from("project_charges").insert({
    project_id: projectId,
    concept: String(formData.get("concept") ?? "").trim(),
    amount: num(formData, "amount") ?? 0,
    currency: String(formData.get("currency") ?? "USD"),
    charge_date: txt(formData, "charge_date") ?? new Date().toISOString().slice(0, 10),
    notes: txt(formData, "notes"),
  });

  if (error) throw new Error(`No se pudo crear el cargo: ${error.message}`);
  revalidatePath(`/proyectos/${projectId}`);
  revalidatePath("/proyectos");
}

export async function setChargeBilling(
  projectId: string,
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

  if (error) throw new Error(`No se pudo actualizar el cobro: ${error.message}`);
  revalidatePath(`/proyectos/${projectId}`);
}

export async function deleteCharge(projectId: string, chargeId: string): Promise<void> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { error } = await supabase.from("project_charges").delete().eq("id", chargeId);
  if (error) throw new Error(`No se pudo eliminar el cargo: ${error.message}`);
  revalidatePath(`/proyectos/${projectId}`);
  revalidatePath("/proyectos");
}

/** Cambia la modalidad de cobro (adelantado / vencido) de un servicio. */
export async function setBillingMode(
  projectId: string,
  serviceId: string,
  mode: "adelantado" | "vencido"
): Promise<void> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { error } = await supabase
    .from("recurring_services")
    .update({ billing_mode: mode })
    .eq("id", serviceId);

  if (error) throw new Error(`No se pudo cambiar la modalidad: ${error.message}`);
  revalidatePath(`/proyectos/${projectId}`);
  revalidatePath("/proyectos");
}
