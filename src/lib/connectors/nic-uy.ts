import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProviderConnector, SyncResult } from "./types";

const WHOIS_URL = "https://dns2-edge.sva.antel.com.uy/dominio/consulta/whois";

/** Consultas por corrida. La API pide captcha tras unas pocas seguidas. */
const BATCH_SIZE = 3;
/** Pausa entre consultas, para no golpear el servicio. */
const DELAY_MS = 1500;

type WhoisResponse = {
  respuestaOK: boolean;
  mensaje: string | null;
  estado: string | null;
  fechaAlta: string | null;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * nic.com.uy (ANTEL) no tiene API de cuenta ni WHOIS por puerto 43 accesible,
 * pero su consulta pública devuelve la fecha de ALTA del dominio.
 *
 * Los .uy renuevan en el aniversario del alta — verificado contra el panel
 * de ANTEL en cuatro dominios, coincidencia exacta. Por eso alcanza con
 * consultar UNA vez cada dominio: guardada la fecha de alta, el vencimiento
 * se deriva solo todos los años sin volver a la API.
 *
 * El servicio pide captcha tras unas pocas consultas seguidas, así que cada
 * corrida procesa un lote chico y solo dominios que aún no tienen fecha.
 * No se intenta sortear el captcha: es un servicio público gratuito.
 */
export const nicUyConnector: ProviderConnector = {
  key: "nic_uy_whois",
  label: "nic.com.uy",
  envVar: null,
  capabilities: [
    "Fecha de alta por WHOIS público",
    "Vencimiento derivado del aniversario",
  ],

  async sync(supabase: SupabaseClient, providerId: string): Promise<SyncResult> {
    // Solo los que todavía no tienen fecha de alta conocida
    const { data: pending } = await supabase
      .from("assets")
      .select("id,identifier,name")
      .eq("provider_id", providerId)
      .eq("type", "dominio")
      .is("deleted_at", null)
      .is("registered_at", null)
      .limit(BATCH_SIZE);

    if (!pending || pending.length === 0) {
      const { count } = await supabase
        .from("assets")
        .select("id", { count: "exact", head: true })
        .eq("provider_id", providerId)
        .is("deleted_at", null)
        .not("registered_at", "is", null);

      return {
        created: 0,
        updated: 0,
        message: `Todos los dominios tienen fecha de alta (${count ?? 0}). Los vencimientos se recalculan solos cada año.`,
      };
    }

    let updated = 0;
    let blocked = false;

    for (const asset of pending) {
      const domain = asset.identifier ?? asset.name;
      if (!domain) continue;

      try {
        const res = await fetch(WHOIS_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ dominio: domain }),
          cache: "no-store",
        });

        if (!res.ok) continue;
        const data = (await res.json()) as WhoisResponse;

        // El servicio avisa cuando corta por captcha: se respeta y se corta.
        if (data.mensaje && /captcha/i.test(data.mensaje)) {
          blocked = true;
          break;
        }

        if (!data.fechaAlta) continue;

        const registeredAt = data.fechaAlta.slice(0, 10);
        const { error } = await supabase
          .from("assets")
          .update({
            registered_at: registeredAt,
            auto_renew: true,
            notes: `Alta ${registeredAt} · estado ${data.estado ?? "?"} · renovación automática por débito. Vencimiento derivado del aniversario.`,
          })
          .eq("id", asset.id);

        if (!error) updated++;
      } catch {
        // Un fallo puntual de red no debe cortar el lote entero
        continue;
      }

      await sleep(DELAY_MS);
    }

    // Recalcular vencimientos con las fechas nuevas
    await supabase.rpc("roll_expirations");

    const { count: remaining } = await supabase
      .from("assets")
      .select("id", { count: "exact", head: true })
      .eq("provider_id", providerId)
      .eq("type", "dominio")
      .is("deleted_at", null)
      .is("registered_at", null);

    const tail = remaining
      ? ` Quedan ${remaining} sin consultar: volvé a sincronizar en unos minutos.`
      : " Todos los dominios quedaron con fecha de alta.";

    return {
      created: 0,
      updated,
      message: blocked
        ? `${updated} actualizado(s). El servicio pidió captcha y se detuvo la consulta.${tail}`
        : `${updated} dominio(s) actualizado(s).${tail}`,
    };
  },
};
