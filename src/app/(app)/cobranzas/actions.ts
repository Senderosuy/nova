"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";

/**
 * Registra en qué etapa de cobranza está un caso y qué se conversó.
 *
 * El escalamiento nunca es automático: el sistema sugiere según los
 * días de atraso, pero avanzar de etapa —y sobre todo suspender— es
 * una decisión de una persona.
 */
export async function updateCollectionCase(formData: FormData): Promise<void> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const serviceId = String(formData.get("service_id") ?? "").trim() || null;
  const chargeId = String(formData.get("charge_id") ?? "").trim() || null;
  const dueDate = String(formData.get("due_date") ?? "").trim();
  const stage = String(formData.get("stage") ?? "recordatorio");
  const note = String(formData.get("contact_note") ?? "").trim() || null;

  if (!dueDate) throw new Error("Falta la fecha de vencimiento del caso.");

  const payload = {
    service_id: serviceId,
    charge_id: chargeId,
    client_id: String(formData.get("client_id") ?? "").trim() || null,
    project_id: String(formData.get("project_id") ?? "").trim() || null,
    amount_usd: Number(formData.get("amount_usd") ?? 0),
    due_date: dueDate,
    stage,
    contact_note: note,
    last_contact_at: new Date().toISOString().slice(0, 10),
    resolved_at:
      stage === "cobrado" || stage === "incobrable"
        ? new Date().toISOString().slice(0, 10)
        : null,
  };

  const { error } = await supabase
    .from("collection_cases")
    .upsert(payload, {
      onConflict: serviceId ? "service_id,due_date" : "charge_id,due_date",
    });

  if (error) throw new Error(`No se pudo guardar el caso: ${error.message}`);

  // Cobrado en la gestión = cobrado en el origen, para no tener dos verdades
  if (stage === "cobrado") {
    if (serviceId) {
      await supabase
        .from("recurring_services")
        .update({
          billing_status: "cobrado",
          collected_at: new Date().toISOString().slice(0, 10),
        })
        .eq("id", serviceId);
    } else if (chargeId) {
      await supabase
        .from("project_charges")
        .update({
          billing_status: "cobrado",
          collected_at: new Date().toISOString().slice(0, 10),
        })
        .eq("id", chargeId);
    }
  }

  revalidatePath("/cobranzas");
  revalidatePath("/finanzas");
}
