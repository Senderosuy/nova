import Link from "next/link";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { SubmitButton } from "@/components/submit-button";
import { setCommercialStatus, recheckDomains } from "./actions";

const inputCls =
  "mt-1 w-full rounded-lg border border-line-2 bg-ink px-3 py-2 text-sm text-cream outline-none focus:border-accent";
const labelCls = "block text-xs font-medium uppercase tracking-wide text-muted";

const usd = (n: number | null | undefined) =>
  n === null || n === undefined
    ? "—"
    : Number(n).toLocaleString("es-UY", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

const WEB_STATUS: Record<string, { label: string; cls: string; hint: string }> = {
  sin_dns: {
    label: "sin sitio",
    cls: "bg-violet/20 text-violet",
    hint: "Se paga todos los años y no apunta a ningún lado.",
  },
  parking: {
    label: "parking",
    cls: "bg-violet/20 text-violet",
    hint: "Muestra la página del registrador, no un sitio propio.",
  },
  error: {
    label: "con error",
    cls: "bg-violet/30 text-violet",
    hint: "Tenía sitio y algo se rompió. Revisar antes de ofrecer nada.",
  },
  redirige: {
    label: "redirige",
    cls: "bg-ink-3 text-cream",
    hint: "Apunta a otro dominio. Puede estar bien así.",
  },
  activa: { label: "activa", cls: "bg-accent-dim text-accent", hint: "" },
};

const COMMERCIAL = [
  { v: "sin_conversar", l: "Sin conversar" },
  { v: "reservado_a_pedido", l: "El cliente lo quiere reservado" },
  { v: "oportunidad_abierta", l: "Oportunidad abierta" },
  { v: "en_desarrollo", l: "Ya en desarrollo" },
  { v: "a_dar_de_baja", l: "A dar de baja" },
] as const;

export default async function OportunidadesPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const [{ data: opps }, { data: missing }] = await Promise.all([
    supabase
      .from("domain_opportunities")
      .select("*")
      .order("client_name")
      .order("domain"),
    supabase
      .from("missing_tlds")
      .select("*")
      .order("client_name")
      .order("root"),
  ]);

  const actionable = (opps ?? []).filter((o) => o.opportunity !== "ninguna");
  const urgent = actionable.filter((o) => o.opportunity === "urgente");
  const unverified = (opps ?? []).filter(
    (o) => !o.web_status || o.web_status === "sin_verificar"
  );

  const wasted = actionable.reduce((s, o) => s + Number(o.cost_usd_year ?? 0), 0);

  // Agrupar por cliente para que sea una conversación por cliente
  const byClient = new Map<string, typeof actionable>();
  for (const o of actionable) {
    const key = o.client_name as string;
    byClient.set(key, [...(byClient.get(key) ?? []), o]);
  }

  const missingByClient = new Map<string, typeof missing>();
  for (const m of missing ?? []) {
    const key = m.client_name as string;
    missingByClient.set(key, [...(missingByClient.get(key) ?? []), m]);
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">
            Oportunidades
          </h1>
          <p className="mt-1 text-sm text-muted">
            Dominios que se pagan y no se usan, y extensiones que le faltan a cada marca.
            El cliente que ya tenés es el más barato de conseguir.
          </p>
        </div>
        <form action={recheckDomains}>
          <SubmitButton
            className="rounded-lg border border-line-2 px-4 py-2 text-sm text-muted hover:border-accent hover:text-accent"
            pendingLabel="Verificando…"
          >
            Verificar dominios
          </SubmitButton>
        </form>
      </div>

      {/* Resumen */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <div className="rounded-[18px] border border-line bg-ink-2 p-5">
          <p className="text-xs uppercase tracking-wide text-muted">Sin uso</p>
          <p className="mt-2 font-display text-xl font-semibold sm:text-2xl">
            {actionable.length}
          </p>
          <p className="text-xs text-muted">dominios a conversar</p>
        </div>
        <div className="rounded-[18px] border border-line bg-ink-2 p-5">
          <p className="text-xs uppercase tracking-wide text-muted">Se paga al año</p>
          <p className="mt-2 font-display text-xl font-semibold text-violet sm:text-2xl">
            USD {usd(wasted)}
          </p>
          <p className="text-xs text-muted">por dominios sin sitio</p>
        </div>
        <div className="rounded-[18px] border border-line bg-ink-2 p-5">
          <p className="text-xs uppercase tracking-wide text-muted">Con error</p>
          <p
            className={`mt-2 font-display text-xl font-semibold sm:text-2xl ${
              urgent.length > 0 ? "text-violet" : "text-muted"
            }`}
          >
            {urgent.length}
          </p>
          <p className="text-xs text-muted">revisar antes de ofrecer</p>
        </div>
        <div className="rounded-[18px] border border-line bg-ink-2 p-5">
          <p className="text-xs uppercase tracking-wide text-muted">Extensiones</p>
          <p className="mt-2 font-display text-xl font-semibold text-accent sm:text-2xl">
            {(missing ?? []).length}
          </p>
          <p className="text-xs text-muted">para proteger marcas</p>
        </div>
      </div>

      {unverified.length > 0 && (
        <p className="mt-4 rounded-lg border border-line-2 bg-ink-2 px-4 py-2 text-sm text-muted">
          {unverified.length} dominio{unverified.length === 1 ? "" : "s"} sin verificar
          todavía. Usá &quot;Verificar dominios&quot;.
        </p>
      )}

      {/* Dominios sin uso, por cliente */}
      <h2 className="mt-8 font-display text-lg font-semibold">Dominios sin uso</h2>
      <p className="mt-1 text-sm text-muted">
        La detección es orientativa: sirve para abrir la conversación, no como conclusión.
      </p>

      <div className="mt-4 space-y-4">
        {[...byClient.entries()].map(([client, items]) => (
          <div key={client} className="rounded-[18px] border border-line bg-ink-2">
            <div className="flex items-baseline justify-between border-b border-line px-5 py-3">
              <h3 className="font-display text-base font-semibold">{client}</h3>
              <span className="text-xs text-muted">
                {items.length} dominio{items.length === 1 ? "" : "s"} · USD{" "}
                {usd(items.reduce((s, i) => s + Number(i.cost_usd_year ?? 0), 0))} al año
              </span>
            </div>

            <ul>
              {items.map((o) => {
                const st = WEB_STATUS[o.web_status as string] ?? {
                  label: "sin verificar",
                  cls: "bg-ink-3 text-muted",
                  hint: "",
                };
                return (
                  <li key={o.asset_id} className="border-b border-line px-5 py-3 last:border-0">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="font-medium">
                          {o.domain}
                          <span
                            className={`ml-2 rounded-full px-2 py-0.5 text-xs font-normal ${st.cls}`}
                          >
                            {st.label}
                          </span>
                        </p>
                        <p className="mt-0.5 text-xs text-muted">
                          {o.web_detail ?? "—"}
                          {o.project_name ? ` · ${o.project_name}` : " · sin proyecto"}
                          {o.expires_at ? ` · vence ${o.expires_at}` : ""}
                        </p>
                        {st.hint && (
                          <p className="mt-0.5 text-xs text-muted/70">{st.hint}</p>
                        )}
                        {o.commercial_note && (
                          <p className="mt-1 text-xs text-cream">
                            Nota: {o.commercial_note}
                          </p>
                        )}
                      </div>
                      <span className="shrink-0 text-sm text-muted">
                        USD {usd(o.cost_usd_year)}
                      </span>
                    </div>

                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-accent">
                        Registrar respuesta del cliente
                      </summary>
                      <form
                        action={setCommercialStatus.bind(null, o.asset_id)}
                        className="mt-2 flex flex-wrap items-end gap-2"
                      >
                        <label className={labelCls}>
                          Qué dijo
                          <select
                            name="commercial_status"
                            defaultValue={o.commercial_status}
                            className={inputCls + " w-64"}
                          >
                            {COMMERCIAL.map((c) => (
                              <option key={c.v} value={c.v}>
                                {c.l}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className={labelCls + " flex-1"}>
                          Nota
                          <input
                            name="commercial_note"
                            defaultValue={o.commercial_note ?? ""}
                            placeholder="Lo quiere para una marca futura"
                            className={inputCls}
                          />
                        </label>
                        <SubmitButton
                          className="rounded-lg bg-accent px-3 py-2 font-display text-xs font-semibold text-ink hover:opacity-90"
                          pendingLabel="…"
                        >
                          Guardar
                        </SubmitButton>
                      </form>
                    </details>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}

        {actionable.length === 0 && (
          <p className="rounded-[18px] border border-line bg-ink-2 px-5 py-8 text-center text-sm text-muted">
            Ningún dominio sin uso pendiente de conversar.
          </p>
        )}
      </div>

      {/* Extensiones faltantes */}
      <h2 className="mt-10 font-display text-lg font-semibold">
        Extensiones para proteger la marca
      </h2>
      <p className="mt-1 text-sm text-muted">
        Extensiones que el cliente no tiene. Reservarlas es barato y evita que otro las
        registre.
      </p>

      <div className="mt-4 space-y-4">
        {[...missingByClient.entries()].map(([client, items]) => (
          <div key={client} className="rounded-[18px] border border-line bg-ink-2 p-5">
            <h3 className="font-display text-base font-semibold">{client}</h3>
            <ul className="mt-3 space-y-1 text-sm">
              {(items ?? []).map((m) => (
                <li
                  key={m.suggested_domain}
                  className="flex items-baseline justify-between gap-3"
                >
                  <span>
                    <span className="text-cream">{m.suggested_domain}</span>
                    <span className="ml-2 text-xs text-muted">{m.label}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted">
                    ~USD {usd(m.approx_cost_usd)} al año
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}

        {(missing ?? []).length === 0 && (
          <p className="rounded-[18px] border border-line bg-ink-2 px-5 py-8 text-center text-sm text-muted">
            Sin extensiones faltantes.
          </p>
        )}
      </div>

      <p className="mt-6 text-xs text-muted">
        Los costos de extensiones son estimados y no se verifica disponibilidad: antes de
        ofrecer, confirmá que el dominio esté libre.{" "}
        <Link href="/activos" className="text-accent">
          Ver inventario
        </Link>
      </p>
    </div>
  );
}
