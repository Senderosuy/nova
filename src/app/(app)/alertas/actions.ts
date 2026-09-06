"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";

export async function setAlertStatus(id: string, status: string): Promise<void> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { error } = await supabase
    .from("alerts")
    .update({
      status,
      resolved_at: status === "resuelta" ? new Date().toISOString() : null,
    })
    .eq("id", id);

  if (error) throw new Error(`No se pudo actualizar la alerta: ${error.message}`);
  revalidatePath("/alertas");
  revalidatePath("/");
}

export async function runAlertScan(): Promise<void> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { error } = await supabase.rpc("generate_alerts");
  if (error) throw new Error(`No se pudo ejecutar el barrido: ${error.message}`);

  revalidatePath("/alertas");
  revalidatePath("/");
}
