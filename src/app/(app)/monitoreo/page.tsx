import Link from "next/link";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { SubmitButton } from "@/components/submit-button";
import {
  createMonitor,
  updateMonitor,
  toggleMonitor,
  deleteMonitor,
  checkNow,
} from "./actions";

const inputCls =
  "mt-1 w-full rounded-lg border border-line-2 bg-ink px-3 py-2 text-sm text-cream outline-none focus:border-accent";
const labelCls = "block text-xs font-medium uppercase tracking-wide text-muted";

/** Traduce minutos a algo que se lee de un vistazo. */
const everyLabel = (min: number) => {
  if (min < 60) return `cada ${min} min`;
  if (min === 60) return "cada hora";
  if (min < 1440) return `cada ${Math.round(min / 60)} h`;
  if (min === 1440) return "1 vez al día";
  return `cada ${Math.round(min / 1440)} días`;
};

const ago = (iso: string | null) => {
  if (!iso) return "nunca";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "recién";
  if (mins < 60) return `hace ${mins} min`;
  if (mins < 1440) return `hace ${Math.round(mins / 60)} h`;
  return `hace ${Math.round(mins / 1440)} d`;
};

const STATUS = {
  ok: { label: "en línea", cls: "bg-accent-dim text-accent" },
  caido: { label: "CAÍDO", cls: "bg-violet/20 text-violet" },
  sospecha: { label: "verificando", cls: "bg-ink-3 text-cream" },
  sin_datos: { label: "sin datos", cls: "bg-ink-3 text-muted" },
} as const;

export default async function MonitoreoPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const [{ data: monitors }, { data: projects }, { data: events }] = await Promise.all([
    supabase
      .from("monitor_status")
      .select("*")
      .order("status", { ascending: true })
      .order("label"),
    supabase
      .from("projects")
      .select("id,name")
      .is("deleted_at", null)
      .order("name"),
    supabase
      .from("monitor_events")
      .select("id,monitor_id,event,occurred_at,error,downtime_minutes")
      .order("occurred_at", { ascending: false })
      .limit(15),
  ]);

  const down = (monitors ?? []).filter((m) => m.status === "caido");
  const suspect = (monitors ?? []).filter((m) => m.status === "sospecha");
  const labelOf = new Map((monitors ?? []).map((m) => [m.monitor_id, m.label]));

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">
            Monitoreo de sitios
          </h1>
          <p className="mt-1 text-sm text-muted">
            Los sitios que Nova sostiene. Un fallo se reintenta a los 3 minutos antes de
            darlo por caído, para no alarmar por microcortes.
          </p>
        </div>
        <form action={checkNow}>
          <SubmitButton
            className="rounded-lg border border-line-2 px-4 py-2 text-sm text-muted hover:border-accent hover:text-accent"
            pendingLabel="Chequeando…"
          >
            Chequear ahora
          </SubmitButton>
        </form>
      </div>

      {/* Alarma: lo primero que se ve si hay algo mal */}
      {down.length > 0 && (
        <div className="mt-5 rounded-[18px] border border-violet bg-violet/10 p-5">
          <h2 className="font-display text-base font-semibold text-violet">
            {down.length} sitio{down.length === 1 ? "" : "s"} caído
            {down.length === 1 ? "" : "s"}
          </h2>
          <ul className="mt-3 space-y-2">
            {down.map((m) => (
              <li key={m.monitor_id} className="text-sm">
                <span className="font-medium text-cream">{m.label}</span>
                <span className="text-muted"> · {m.url}</span>
                <p className="text-xs text-violet">
                  {m.last_error ?? `HTTP ${m.last_status_code}`}
                  {m.down_minutes ? ` · caído hace ${everyLabel(m.down_minutes)}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {suspect.length > 0 && (
        <p className="mt-4 rounded-lg border border-line-2 bg-ink-2 px-4 py-2 text-sm text-cream">
          {suspect.length} sitio{suspect.length === 1 ? "" : "s"} sin responder, esperando
          confirmación en 3 minutos.
        </p>
      )}

      {down.length === 0 && suspect.length === 0 && (monitors ?? []).length > 0 && (
        <p className="mt-5 rounded-lg border border-accent/30 bg-accent-dim px-4 py-2 text-sm text-accent">
          Todos los sitios responden con normalidad.
        </p>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="space-y-3">
          {(monitors ?? []).map((m) => {
            const st = STATUS[m.status as keyof typeof STATUS] ?? STATUS.sin_datos;
            return (
              <div
                key={m.monitor_id}
                className={`rounded-[18px] border bg-ink-2 p-5 ${
                  m.status === "caido" ? "border-violet/50" : "border-line"
                } ${m.active ? "" : "opacity-60"}`}
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h2 className="font-display text-base font-semibold">
                      {m.label}
                      <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-normal ${st.cls}`}>
                        {st.label}
                      </span>
                      {m.criticality === "critico" && (
                        <span className="ml-2 rounded-full bg-ink-3 px-2 py-0.5 text-xs font-normal text-cream">
                          crítico
                        </span>
                      )}
                    </h2>
                    <a
                      href={m.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 block truncate text-xs text-accent hover:underline"
                    >
                      {m.url}
                    </a>
                    <p className="mt-1 text-xs text-muted">
                      {everyLabel(m.interval_minutes)} · último chequeo{" "}
                      {ago(m.last_checked_at)}
                      {m.client_name ? ` · ${m.client_name}` : ""}
                    </p>
                  </div>

                  <div className="shrink-0 text-right">
                    {m.uptime_30d !== null && (
                      <>
                        <p
                          className={
                            Number(m.uptime_30d) >= 99.5
                              ? "font-display text-sm text-accent"
                              : "font-display text-sm text-violet"
                          }
                        >
                          {Number(m.uptime_30d).toFixed(2)}%
                        </p>
                        <p className="text-xs text-muted">
                          30 días
                          {Number(m.outages_30d) > 0
                            ? ` · ${m.outages_30d} caída${Number(m.outages_30d) === 1 ? "" : "s"}`
                            : ""}
                        </p>
                      </>
                    )}
                  </div>
                </div>

                <details className="mt-3">
                  <summary className="cursor-pointer text-xs text-muted hover:text-accent">
                    Configurar
                  </summary>
                  <form
                    action={updateMonitor.bind(null, m.monitor_id)}
                    className="mt-3 grid gap-3 sm:grid-cols-2"
                  >
                    <label className={labelCls}>
                      Nombre
                      <input name="label" defaultValue={m.label} required className={inputCls} />
                    </label>
                    <label className={labelCls}>
                      URL
                      <input name="url" defaultValue={m.url} required className={inputCls} />
                    </label>
                    <label className={labelCls}>
                      Chequear cada (minutos)
                      <input
                        name="interval_minutes"
                        type="number"
                        min="1"
                        defaultValue={m.interval_minutes}
                        className={inputCls}
                      />
                    </label>
                    <label className={labelCls}>
                      Criticidad
                      <select name="criticality" defaultValue={m.criticality} className={inputCls}>
                        <option value="critico">Crítico — venta online</option>
                        <option value="normal">Normal — institucional</option>
                        <option value="bajo">Bajo — sin tráfico</option>
                      </select>
                    </label>
                    <label className={`${labelCls} sm:col-span-2`}>
                      Timeout (segundos)
                      <input
                        name="timeout_seconds"
                        type="number"
                        min="1"
                        max="60"
                        defaultValue={10}
                        className={inputCls}
                      />
                    </label>
                    <SubmitButton
                      className="rounded-lg bg-accent px-4 py-2 font-display text-sm font-semibold text-ink hover:opacity-90"
                      pendingLabel="Guardando…"
                    >
                      Guardar
                    </SubmitButton>
                  </form>

                  <div className="mt-3 flex gap-4">
                    <form action={toggleMonitor.bind(null, m.monitor_id, m.active)}>
                      <SubmitButton className="text-xs text-muted hover:text-cream" pendingLabel="…">
                        {m.active ? "Pausar" : "Reanudar"}
                      </SubmitButton>
                    </form>
                    <form action={deleteMonitor.bind(null, m.monitor_id)}>
                      <SubmitButton className="text-xs text-muted hover:text-violet" pendingLabel="…">
                        Eliminar
                      </SubmitButton>
                    </form>
                  </div>
                </details>
              </div>
            );
          })}

          {(monitors ?? []).length === 0 && (
            <p className="rounded-[18px] border border-line bg-ink-2 px-5 py-8 text-center text-sm text-muted">
              Sin sitios monitoreados.
            </p>
          )}
        </div>

        <div className="space-y-6">
          <form
            action={createMonitor}
            className="h-fit rounded-[18px] border border-line bg-ink-2 p-5"
          >
            <h2 className="font-display text-base font-semibold">Nuevo monitor</h2>

            <label className={`${labelCls} mt-4`}>
              Nombre *
              <input name="label" required className={inputCls} />
            </label>

            <label className={`${labelCls} mt-3`}>
              URL *
              <input name="url" type="url" required placeholder="https://" className={inputCls} />
            </label>

            <label className={`${labelCls} mt-3`}>
              Proyecto
              <select name="project_id" defaultValue="" className={inputCls}>
                <option value="">— sin proyecto —</option>
                {(projects ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>

            <label className={`${labelCls} mt-3`}>
              Chequear cada (minutos)
              <input
                name="interval_minutes"
                type="number"
                min="1"
                defaultValue={720}
                className={inputCls}
              />
              <span className="mt-1 block normal-case text-muted">
                5 para venta online, 720 para una landing
              </span>
            </label>

            <label className={`${labelCls} mt-3`}>
              Criticidad
              <select name="criticality" defaultValue="normal" className={inputCls}>
                <option value="critico">Crítico</option>
                <option value="normal">Normal</option>
                <option value="bajo">Bajo</option>
              </select>
            </label>

            <SubmitButton
              className="mt-5 w-full rounded-lg bg-accent px-4 py-2 font-display text-sm font-semibold text-ink hover:opacity-90"
              pendingLabel="Creando…"
            >
              Crear monitor
            </SubmitButton>
          </form>

          {(events ?? []).length > 0 && (
            <div className="rounded-[18px] border border-line bg-ink-2 p-5">
              <h2 className="font-display text-base font-semibold">Historial</h2>
              <ul className="mt-3 space-y-2 text-xs">
                {(events ?? []).map((e) => (
                  <li key={e.id}>
                    <span
                      className={e.event === "caida" ? "text-violet" : "text-accent"}
                    >
                      {e.event === "caida" ? "cayó" : "volvió"}
                    </span>{" "}
                    <span className="text-cream">{labelOf.get(e.monitor_id) ?? "—"}</span>
                    <span className="text-muted">
                      {" "}
                      · {new Date(e.occurred_at).toLocaleString("es-UY")}
                      {e.downtime_minutes
                        ? ` · estuvo ${everyLabel(e.downtime_minutes)} abajo`
                        : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <p className="mt-6 text-xs text-muted">
        El chequeo automático necesita un disparador externo que llame cada minuto a{" "}
        <code className="text-cream">/api/cron/monitor</code>. Ver{" "}
        <Link href="/monitoreo" className="text-accent">
          docs/SPEC.md
        </Link>
        .
      </p>
    </div>
  );
}
