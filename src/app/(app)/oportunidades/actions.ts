"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";

/**
 * Registra la respuesta del cliente sobre un dominio sin uso.
 * Es lo que hace que el informe se vacíe con el tiempo en vez de
 * repetir los mismos casos todos los meses.
 */
export async function setCommercialStatus(
  assetId: string,
  formData: FormData
): Promise<void> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { error } = await supabase
    .from("assets")
    .update({
      commercial_status: String(formData.get("commercial_status") ?? "sin_conversar"),
      commercial_note: String(formData.get("commercial_note") ?? "").trim() || null,
    })
    .eq("id", assetId);

  if (error) throw new Error(`No se pudo guardar: ${error.message}`);
  revalidatePath("/oportunidades");
}

/** Vuelve a verificar el estado de todos los dominios. */
export async function recheckDomains(): Promise<void> {
  const secret = process.env.CRON_SECRET;
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://hub.latamnova.app";

  if (secret) {
    try {
      // Dos tandas para cubrir el inventario completo
      for (let i = 0; i < 2; i++) {
        await fetch(`${base}/api/cron/domain-check?limit=15`, {
          headers: { Authorization: `Bearer ${secret}` },
          cache: "no-store",
        });
      }
    } catch {
      // Si falla, el job mensual los levanta igual
    }
  }

  revalidatePath("/oportunidades");
}
