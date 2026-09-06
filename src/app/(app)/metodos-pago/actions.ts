"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";

const txt = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim() || null;

export async function createPaymentMethod(formData: FormData): Promise<void> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const lastFour = txt(formData, "last_four");
  if (lastFour && !/^[0-9]{4}$/.test(lastFour)) {
    throw new Error("Los últimos dígitos deben ser exactamente 4 números.");
  }

  const { error } = await supabase.from("payment_methods").insert({
    label: String(formData.get("label") ?? "").trim(),
    kind: String(formData.get("kind") ?? "tarjeta"),
    institution: txt(formData, "institution"),
    last_four: lastFour,
    currency: String(formData.get("currency") ?? "USD"),
    notes: txt(formData, "notes"),
  });

  if (error) throw new Error(`No se pudo crear el método de pago: ${error.message}`);
  revalidatePath("/metodos-pago");
}

export async function updatePaymentMethod(id: string, formData: FormData): Promise<void> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const lastFour = txt(formData, "last_four");
  if (lastFour && !/^[0-9]{4}$/.test(lastFour)) {
    throw new Error("Los últimos dígitos deben ser exactamente 4 números.");
  }

  const { error } = await supabase
    .from("payment_methods")
    .update({
      label: String(formData.get("label") ?? "").trim(),
      kind: String(formData.get("kind") ?? "tarjeta"),
      institution: txt(formData, "institution"),
      last_four: lastFour,
      currency: String(formData.get("currency") ?? "USD"),
      notes: txt(formData, "notes"),
    })
    .eq("id", id);

  if (error) throw new Error(`No se pudo actualizar: ${error.message}`);
  revalidatePath("/metodos-pago");
}

export async function togglePaymentMethod(id: string, active: boolean): Promise<void> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { error } = await supabase
    .from("payment_methods")
    .update({ active: !active })
    .eq("id", id);

  if (error) throw new Error(`No se pudo cambiar el estado: ${error.message}`);
  revalidatePath("/metodos-pago");
}
