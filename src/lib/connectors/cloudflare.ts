import type { SupabaseClient } from "@supabase/supabase-js";
import { MissingCredentialError, type ProviderConnector, type SyncResult } from "./types";

const BASE = "https://api.cloudflare.com/client/v4";

type Zone = {
  id: string;
  name: string;
  status: string;
  plan?: { name?: string };
};

type RegistrarDomain = {
  name: string;
  expires_at: string | null;
  auto_renew: boolean;
  last_known_status: string | null;
};

async function call<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Cloudflare respondió ${res.status} en ${path}`);
  const body = (await res.json()) as { success: boolean; result: T };
  if (!body.success) throw new Error(`Cloudflare rechazó la consulta ${path}`);
  return body.result;
}

/**
 * Cloudflare aporta dos cosas distintas:
 *  - Registrar: dominios propios, con vencimiento y autorrenovación.
 *  - Zonas: DNS/CDN, que pueden pertenecer a dominios registrados afuera.
 * Un dominio del registrador se guarda como 'dominio' con su vencimiento;
 * la zona de un dominio externo, como herramienta con costo cero si es Free.
 */
export const cloudflareConnector: ProviderConnector = {
  key: "cloudflare",
  label: "Cloudflare",
  envVar: "CLOUDFLARE_API_TOKEN",
  capabilities: [
    "Dominios del registrador con vencimiento",
    "Zonas DNS y plan de cada una",
  ],

  async sync(supabase: SupabaseClient, providerId: string): Promise<SyncResult> {
    const token = process.env.CLOUDFLARE_API_TOKEN;
    if (!token) throw new MissingCredentialError("CLOUDFLARE_API_TOKEN");

    const accounts = await call<{ id: string }[]>("/accounts", token);
    const accountId = accounts[0]?.id;
    if (!accountId) throw new Error("La credencial no tiene ninguna cuenta asociada.");

    const [zones, domains] = await Promise.all([
      call<Zone[]>("/zones?per_page=200", token),
      call<RegistrarDomain[]>(`/accounts/${accountId}/registrar/domains`, token).catch(
        () => [] as RegistrarDomain[]
      ),
    ]);

    const { data: existing } = await supabase
      .from("assets")
      .select("id,identifier,cost")
      .eq("provider_id", providerId);

    const byIdentifier = new Map(
      (existing ?? []).map((a) => [a.identifier, { id: a.id, cost: a.cost }])
    );
    const registered = new Set(domains.map((d) => d.name));

    let created = 0;
    let updated = 0;

    // 1. Dominios registrados en Cloudflare: vencimiento y autorrenovación reales
    for (const d of domains) {
      const expires = d.expires_at ? d.expires_at.slice(0, 10) : null;
      const found = byIdentifier.get(d.name);
      const notes = `Cloudflare Registrar · ${d.last_known_status ?? "?"}${
        d.auto_renew ? " · autorrenovación activa" : " · SIN autorrenovación"
      }`;

      if (found) {
        const { error } = await supabase
          .from("assets")
          .update({ type: "dominio", expires_at: expires, notes })
          .eq("id", found.id);
        if (!error) updated++;
      } else {
        const { error } = await supabase.from("assets").insert({
          type: "dominio",
          name: d.name,
          provider: "Cloudflare",
          provider_id: providerId,
          identifier: d.name,
          ownership: "nova",
          expires_at: expires,
          currency: "USD",
          billing_cycle: "anual",
          notes,
        });
        if (!error) created++;
      }
    }

    // 2. Zonas cuyo dominio NO está en el registrador: sólo aportan DNS
    for (const z of zones) {
      if (registered.has(z.name)) continue;

      const planName = z.plan?.name ?? "Free";
      const isFree = /free/i.test(planName);
      const identifier = `dns:${z.name}`;
      const found = byIdentifier.get(identifier);
      const payload = {
        notes: `Zona Cloudflare · plan ${planName} · ${z.status}`,
        billing_cycle: isFree ? "gratis" : "mensual",
      };

      if (found) {
        const { error } = await supabase.from("assets").update(payload).eq("id", found.id);
        if (!error) updated++;
      } else {
        const { error } = await supabase.from("assets").insert({
          type: "herramienta",
          name: `DNS ${z.name}`,
          provider: "Cloudflare",
          provider_id: providerId,
          identifier,
          ownership: "nova",
          cost: isFree ? 0 : null,
          currency: "USD",
          ...payload,
        });
        if (!error) created++;
      }
    }

    const detail = `${domains.length} dominio(s) del registrador, ${zones.length} zona(s)`;
    return {
      created,
      updated,
      message:
        created + updated === 0
          ? `Credencial válida. ${detail}, nada nuevo que sincronizar`
          : `${created} nuevo(s), ${updated} actualizado(s) · ${detail}`,
    };
  },
};
