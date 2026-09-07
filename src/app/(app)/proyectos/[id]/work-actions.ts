"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";

const txt = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim() || null;
const num = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? "").trim();
  return v ? Number(v) : null;
};

/** Tarifa por hora que Nova le cobra al cliente en este proyecto. */
export async function setClientRate(
  projectId: string,
  formData: FormData
): Promise<void> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { error } = await supabase
    .from("projects")
    .update({
      client_hourly_rate: num(formData, "client_hourly_rate"),
      rate_currency: String(formData.get("rate_currency") ?? "USD"),
    })
    .eq("id", projectId);

  if (error) throw new Error(`No se pudo guardar la tarifa: ${error.message}`);
  revalidatePath(`/proyectos/${projectId}`);
}

/**
 * Crea una asignación de trabajo. Por horas se paga lo trabajado a la
 * tarifa del colaborador; por entregable, un monto fijo sin importar
 * cuánto lleve.
 */
export async function createAssignment(
  projectId: string,
  formData: FormData
): Promise<void> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const mode = String(formData.get("mode") ?? "horas");
  const collaboratorId = String(formData.get("collaborator_id") ?? "").trim();

  // Si no se indica tarifa, se hereda la del colaborador
  let hourlyCost = num(formData, "hourly_cost");
  let currency = String(formData.get("currency") ?? "USD");

  if (mode === "horas" && !hourlyCost) {
    const { data: c } = await supabase
      .from("collaborators")
      .select("default_hourly_cost,currency")
      .eq("id", collaboratorId)
      .single();
    hourlyCost = c?.default_hourly_cost ?? null;
    if (c?.currency) currency = c.currency;
  }

  if (mode === "horas" && !hourlyCost) {
    throw new Error(
      "Falta el costo por hora: definilo acá o en la ficha del colaborador."
    );
  }

  const { error } = await supabase.from("work_assignments").insert({
    project_id: projectId,
    collaborator_id: collaboratorId,
    title: String(formData.get("title") ?? "").trim(),
    mode,
    hourly_cost: mode === "horas" ? hourlyCost : null,
    estimated_hours: mode === "horas" ? num(formData, "estimated_hours") : null,
    fixed_cost: mode === "entregable" ? num(formData, "fixed_cost") : null,
    currency,
    notes: txt(formData, "notes"),
  });

  if (error) throw new Error(`No se pudo crear la asignación: ${error.message}`);
  revalidatePath(`/proyectos/${projectId}`);
}

export async function logHours(
  projectId: string,
  assignmentId: string,
  formData: FormData
): Promise<void> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const hours = num(formData, "hours");
  if (!hours || hours <= 0) throw new Error("Las horas deben ser mayores a cero.");

  const { error } = await supabase.from("time_entries").insert({
    assignment_id: assignmentId,
    worked_on:
      txt(formData, "worked_on") ?? new Date().toISOString().slice(0, 10),
    hours,
    description: txt(formData, "description"),
  });

  if (error) throw new Error(`No se pudieron registrar las horas: ${error.message}`);
  revalidatePath(`/proyectos/${projectId}`);
}

export async function setAssignmentStatus(
  projectId: string,
  assignmentId: string,
  status: "en_curso" | "entregado" | "cancelado"
): Promise<void> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { error } = await supabase
    .from("work_assignments")
    .update({
      status,
      delivered_on:
        status === "entregado" ? new Date().toISOString().slice(0, 10) : null,
    })
    .eq("id", assignmentId);

  if (error) throw new Error(`No se pudo actualizar: ${error.message}`);
  revalidatePath(`/proyectos/${projectId}`);
}

export async function setAssignmentPayment(
  projectId: string,
  assignmentId: string,
  status: "pendiente" | "pagado"
): Promise<void> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { error } = await supabase
    .from("work_assignments")
    .update({
      payment_status: status,
      paid_at: status === "pagado" ? new Date().toISOString().slice(0, 10) : null,
    })
    .eq("id", assignmentId);

  if (error) throw new Error(`No se pudo actualizar el pago: ${error.message}`);
  revalidatePath(`/proyectos/${projectId}`);
  revalidatePath("/colaboradores");
}

export async function deleteAssignment(
  projectId: string,
  assignmentId: string
): Promise<void> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { error } = await supabase
    .from("work_assignments")
    .delete()
    .eq("id", assignmentId);

  if (error) throw new Error(`No se pudo eliminar: ${error.message}`);
  revalidatePath(`/proyectos/${projectId}`);
}
