"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";

export async function createMonitor(formData: FormData): Promise<void> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const url = String(formData.get("url") ?? "").trim();
  if (!/^https?:\/\//i.test(url)) {
    throw new Error("La URL debe empezar con http:// o https://");
  }

  const { error } = await supabase.from("site_monitors").insert({
    project_id: String(formData.get("project_id") ?? "").trim() || null,
    label: String(formData.get("label") ?? "").trim(),
    url,
    interval_minutes: Number(formData.get("interval_minutes") ?? 720),
    criticality: String(formData.get("criticality") ?? "normal"),
  });

  if (error) throw new Error(`No se pudo crear el monitor: ${error.message}`);
  revalidatePath("/monitoreo");
}

export async function updateMonitor(id: string, formData: FormData): Promise<void> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { error } = await supabase
    .from("site_monitors")
    .update({
      label: String(formData.get("label") ?? "").trim(),
      url: String(formData.get("url") ?? "").trim(),
      interval_minutes: Number(formData.get("interval_minutes") ?? 720),
      criticality: String(formData.get("criticality") ?? "normal"),
      timeout_seconds: Number(formData.get("timeout_seconds") ?? 10),
      // Al cambiar el intervalo, el próximo chequeo se recalcula ya
      next_check_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) throw new Error(`No se pudo actualizar: ${error.message}`);
  revalidatePath("/monitoreo");
}

export async function toggleMonitor(id: string, active: boolean): Promise<void> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { error } = await supabase
    .from("site_monitors")
    .update({ active: !active, next_check_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw new Error(`No se pudo cambiar el estado: ${error.message}`);
  revalidatePath("/monitoreo");
}

export async function deleteMonitor(id: string): Promise<void> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { error } = await supabase.from("site_monitors").delete().eq("id", id);
  if (error) throw new Error(`No se pudo eliminar: ${error.message}`);
  revalidatePath("/monitoreo");
}

/** Fuerza el chequeo inmediato de todos los sitios. */
export async function checkNow(): Promise<void> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  await supabase
    .from("site_monitors")
    .update({ next_check_at: new Date().toISOString() })
    .eq("active", true);

  const secret = process.env.CRON_SECRET;
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://hub.latamnova.app";

  if (secret) {
    try {
      await fetch(`${base}/api/cron/monitor`, {
        headers: { Authorization: `Bearer ${secret}` },
        cache: "no-store",
      });
    } catch {
      // Si falla la llamada, el próximo ciclo del cron los levanta igual
    }
  }

  revalidatePath("/monitoreo");
  revalidatePath("/");
}
