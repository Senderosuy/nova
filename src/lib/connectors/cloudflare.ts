import type { SupabaseClient } from "@supabase/supabase-js";
import { MissingCredentialError, type ProviderConnector, type SyncResult } from "./types";

const BASE = "https://api.cloudflare.com/client/v4";

type Zone = {
  id: string;
  name: string;
  status: string;
  plan?: { name?: string };
};

/**
 * Cloudflare: trae las zonas (dominios gestionados por DNS/CDN).
 * Las zonas del plan Free se registran con billing_cycle 'gratis' y
 * costo 0 — no inflan el costo recurrente de ningún proyecto.
 */
export const cloudflareConnector: ProviderConnector = {
  key: "cloudflare",
  label: "Cloudflare",
  envVar: "CLOUDFLARE_API_TOKEN",
  capabilities: ["Zonas DNS activas", "Plan de cada zona (Free / de pago)"],

  async sync(supabase: SupabaseClient, providerId: string): Promise<SyncResult> {
    const token = process.env.CLOUDFLARE_API_TOKEN;
    if (!token) throw new MissingCredentialError("CLOUDFLARE_API_TOKEN");

    const res = await fetch(`${BASE}/zones?per_page=200`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Cloudflare respondió ${res.status} al listar zonas.`);

    const body = (await res.json()) as { success: boolean; result: Zone[] };
    if (!body.success) throw new Error("Cloudflare rechazó la consulta de zonas.");

    const { data: existing } = await supabase
      .from("assets")
      .select("id,identifier")
      .eq("provider_id", providerId);

    const byIdentifier = new Map((existing ?? []).map((a) => [a.identifier, a.id]));

    let created = 0;
    let updated = 0;

    for (const z of body.result) {
      const planName = z.plan?.name ?? "Free";
      const isFree = /free/i.test(planName);
      const found = byIdentifier.get(z.name);
      const payload = {
        notes: `Zona Cloudflare · plan ${planName} · estado ${z.status}`,
        billing_cycle: isFree ? "gratis" : "mensual",
      };

      if (found) {
        const { error } = await supabase.from("assets").update(payload).eq("id", found);
        if (!error) updated++;
      } else {
        const { error } = await supabase.from("assets").insert({
          type: "herramienta",
          name: `DNS ${z.name}`,
          provider: "Cloudflare",
          provider_id: providerId,
          identifier: z.name,
          ownership: "nova",
          cost: isFree ? 0 : null,
          currency: "USD",
          ...payload,
        });
        if (!error) created++;
      }
    }

    return {
      created,
      updated,
      message:
        body.result.length === 0
          ? "Credencial válida, pero la cuenta no tiene zonas cargadas en Cloudflare todavía"
          : `${created} zona(s) nueva(s), ${updated} actualizada(s)`,
    };
  },
};
