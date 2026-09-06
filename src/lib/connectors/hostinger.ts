import type { SupabaseClient } from "@supabase/supabase-js";
import { MissingCredentialError, type ProviderConnector, type SyncResult } from "./types";

const BASE = "https://developers.hostinger.com";

type HostingerDomain = {
  id: number;
  domain: string | null;
  status: string | null;
  expires_at: string | null;
};

type HostingerSubscription = {
  name: string;
  status: string;
  billing_period: number;
  billing_period_unit: string;
  currency_code: string;
  renewal_price: number;
  next_billing_at: string | null;
};

async function call<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Hostinger respondió ${res.status} en ${path}`);
  return (await res.json()) as T;
}

/** Precio anual por TLD, derivado de las suscripciones reales de la cuenta. */
function annualPriceByTld(subs: HostingerSubscription[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const s of subs) {
    const m = /^(\.[a-z.]+) Domain$/i.exec(s.name);
    if (!m) continue;
    const years = s.billing_period_unit === "year" ? s.billing_period : 1;
    const annual = s.renewal_price / 100 / (years || 1);
    map.set(m[1].toLowerCase(), Math.round(annual * 100) / 100);
  }
  return map;
}

export const hostingerConnector: ProviderConnector = {
  key: "hostinger",
  label: "Hostinger",
  envVar: "HOSTINGER_API_TOKEN",
  capabilities: ["Dominios y vencimientos", "Precios de renovación reales"],

  async sync(supabase: SupabaseClient, providerId: string): Promise<SyncResult> {
    const token = process.env.HOSTINGER_API_TOKEN;
    if (!token) throw new MissingCredentialError("HOSTINGER_API_TOKEN");

    const [domains, subs] = await Promise.all([
      call<HostingerDomain[]>("/api/domains/v1/portfolio", token),
      call<HostingerSubscription[]>("/api/billing/v1/subscriptions", token).catch(
        () => [] as HostingerSubscription[]
      ),
    ]);

    const prices = annualPriceByTld(subs);
    const registered = domains.filter((d) => d.domain);

    const { data: existing } = await supabase
      .from("assets")
      .select("id,identifier,cost")
      .eq("type", "dominio")
      .eq("provider_id", providerId);

    const byIdentifier = new Map(
      (existing ?? []).map((a) => [a.identifier, { id: a.id, cost: a.cost }])
    );

    let created = 0;
    let updated = 0;

    for (const d of registered) {
      const name = d.domain as string;
      const expires = d.expires_at ? d.expires_at.slice(0, 10) : null;
      const tld = name.slice(name.indexOf("."));
      const price = prices.get(tld) ?? null;
      const found = byIdentifier.get(name);

      if (found) {
        const patch: Record<string, unknown> = {
          expires_at: expires,
          notes: `Estado Hostinger: ${d.status ?? "?"}`,
        };
        // No pisar un costo cargado a mano: sólo completar si falta.
        if (found.cost === null && price !== null) {
          patch.cost = price;
          patch.currency = "USD";
          patch.billing_cycle = "anual";
        }
        const { error } = await supabase.from("assets").update(patch).eq("id", found.id);
        if (!error) updated++;
      } else {
        const { error } = await supabase.from("assets").insert({
          type: "dominio",
          name,
          provider: "Hostinger",
          provider_id: providerId,
          identifier: name,
          ownership: "nova",
          expires_at: expires,
          cost: price,
          currency: "USD",
          billing_cycle: price !== null ? "anual" : "anual",
          notes: `Estado Hostinger: ${d.status ?? "?"}`,
        });
        if (!error) created++;
      }
    }

    return {
      created,
      updated,
      message: `${created} nuevo(s), ${updated} actualizado(s) · ${prices.size} TLD con precio`,
    };
  },
};
