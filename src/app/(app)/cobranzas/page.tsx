import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { SubmitButton } from "@/components/submit-button";
import { updateCollectionCase } from "./actions";

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

/** El escalamiento es gradual: el aviso con fecha suele resolver antes de llegar al corte. */
const STAGES = [
  { v: "por_vencer", l: "Por vencer", days: "—" },
  { v: "recordatorio", l: "Recordatorio", days: "al vencer" },
  { v: "segundo_aviso", l: "Segundo aviso", days: "+15 días" },
  { v: "aviso_suspension", l: "Aviso de suspensión", days: "+30 días" },
  { v: "suspendido", l: "Suspendido", days: "+45 días" },
  { v: "cobrado", l: "Cobrado", days: "" },
  { v: "incobrable", l: "Incobrable", days: "" },
] as const;

const stageLabel = (v: string | null) =>
  STAGES.find((s) => s.v === v)?.l ?? "Por vencer";

export default async function CobranzasPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const [{ data: pending }, { data: summary }, { data: history }] = await Promise.all([
    supabase
      .from("pending_collections")
      .select("*")
      .order("days_overdue", { ascending: false }),
    supabase.from("collection_summary").select("*").order("vencido_usd", {
      ascending: false,
      nullsFirst: false,
    }),
    supabase
      .from("collection_cases")
      .select("id,stage,amount_usd,due_date,last_contact_at,contact_note")
      .in("stage", ["cobrado", "incobrable"])
      .order("resolved_at", { ascending: false })
      .limit(10),
  ]);

  const overdue = (pending ?? []).filter((c) => Number(c.days_overdue) > 0);
  const critical = overdue.filter((c) => Number(c.days_overdue) >= 45);
  const upcoming = (pending ?? []).filter((c) => Number(c.days_overdue) <= 0);

  const overdueTotal = overdue.reduce((s, c) => s + Number(c.amount_usd ?? 0), 0);
  const upcomingTotal = upcoming.reduce((s, c) => s + Number(c.amount_usd ?? 0), 0);

  return (
    <div>
      <h1 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">
        Cobranzas
      </h1>
      <p className="mt-1 text-sm text-muted">
        Qué hay que cobrar y qué está atrasado. El escalamiento es gradual y lo decidís
        vos: el sistema sugiere la etapa según los días, no la aplica solo.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <div className="rounded-[18px] border border-line bg-ink-2 p-5">
          <p className="text-xs uppercase tracking-wide text-muted">Vencido</p>
          <p
            className={`mt-2 font-display text-xl font-semibold sm:text-2xl ${
              overdueTotal > 0 ? "text-violet" : "text-muted"
            }`}
          >
            USD {usd(overdueTotal)}
          </p>
          <p className="text-xs text-muted">
            {overdue.length} caso{overdue.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="rounded-[18px] border border-line bg-ink-2 p-5">
          <p className="text-xs uppercase tracking-wide text-muted">Por vencer</p>
          <p className="mt-2 font-display text-xl font-semibold text-accent sm:text-2xl">
            USD {usd(upcomingTotal)}
          </p>
          <p className="text-xs text-muted">próximos 30 días</p>
        </div>
        <div className="rounded-[18px] border border-line bg-ink-2 p-5">
          <p className="text-xs uppercase tracking-wide text-muted">Críticos</p>
          <p
            className={`mt-2 font-display text-xl font-semibold sm:text-2xl ${
              critical.length > 0 ? "text-violet" : "text-muted"
            }`}
          >
            {critical.length}
          </p>
          <p className="text-xs text-muted">más de 45 días</p>
        </div>
        <div className="rounded-[18px] border border-line bg-ink-2 p-5">
          <p className="text-xs uppercase tracking-wide text-muted">Clientes</p>
          <p className="mt-2 font-display text-xl font-semibold sm:text-2xl">
            {(summary ?? []).length}
          </p>
          <p className="text-xs text-muted">con saldo pendiente</p>
        </div>
      </div>

      {/* Escalamiento, para tenerlo presente */}
      <div className="mt-6 rounded-[18px] border border-line bg-ink-2 p-5">
        <h2 className="font-display text-base font-semibold">Escalamiento sugerido</h2>
        <ol className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {STAGES.filter((s) => s.days).map((s, i) => (
            <li key={s.v} className="flex items-baseline gap-2">
              <span className="font-display text-accent">{i + 1}</span>
              <span>
                {s.l}
                <span className="ml-1 text-xs text-muted">{s.days}</span>
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs text-muted">
          La suspensión del sitio no está automatizada y requiere revisar el contrato con
          cada cliente. El aviso con fecha suele resolver el pago antes de llegar ahí.
        </p>
      </div>

      {/* Casos */}
      <h2 className="mt-8 font-display text-lg font-semibold">
        {overdue.length > 0 ? "Vencidos" : "Sin vencimientos atrasados"}
      </h2>

      <div className="mt-4 space-y-3">
        {[...overdue, ...upcoming].map((c) => {
          const days = Number(c.days_overdue);
          const key = `${c.service_id ?? c.charge_id}-${c.due_date}`;
          return (
            <div
              key={key}
              className={`rounded-[18px] border bg-ink-2 p-5 ${
                days >= 45 ? "border-violet/50" : "border-line"
              }`}
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="font-medium">
                    {c.client_name ?? "Sin cliente"}
                    <span className="ml-2 rounded-full bg-ink-3 px-2 py-0.5 text-xs font-normal text-muted">
                      {stageLabel(c.current_stage ?? c.suggested_stage)}
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {c.concept}
                    {c.project_name ? ` · ${c.project_name}` : ""} · vence {c.due_date}
                  </p>
                  {c.contact_note && (
                    <p className="mt-1 text-xs text-cream">
                      Última gestión: {c.contact_note}
                      {c.last_contact_at ? ` (${c.last_contact_at})` : ""}
                    </p>
                  )}
                  {c.confirmation_status === "pendiente" && (
                    <p className="mt-1 text-xs text-muted">
                      El cliente todavía no confirmó la continuidad.
                    </p>
                  )}
                </div>

                <div className="shrink-0 text-right">
                  <p className="font-display text-sm font-semibold">
                    USD {usd(c.amount_usd)}
                  </p>
                  <p
                    className={
                      days >= 45
                        ? "text-xs text-violet"
                        : days > 0
                          ? "text-xs text-cream"
                          : "text-xs text-muted"
                    }
                  >
                    {days > 0
                      ? `${days} días de atraso`
                      : days === 0
                        ? "vence hoy"
                        : `en ${-days} días`}
                  </p>
                </div>
              </div>

              <details className="mt-3">
                <summary className="cursor-pointer text-xs text-accent">
                  Registrar gestión
                </summary>
                <form action={updateCollectionCase} className="mt-3 flex flex-wrap items-end gap-2">
                  <input type="hidden" name="service_id" value={c.service_id ?? ""} />
                  <input type="hidden" name="charge_id" value={c.charge_id ?? ""} />
                  <input type="hidden" name="client_id" value={c.client_id ?? ""} />
                  <input type="hidden" name="project_id" value={c.project_id ?? ""} />
                  <input type="hidden" name="amount_usd" value={c.amount_usd ?? 0} />
                  <input type="hidden" name="due_date" value={c.due_date} />

                  <label className={labelCls}>
                    Etapa
                    <select
                      name="stage"
                      defaultValue={c.current_stage ?? c.suggested_stage}
                      className={inputCls + " w-56"}
                    >
                      {STAGES.map((s) => (
                        <option key={s.v} value={s.v}>
                          {s.l}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={labelCls + " flex-1"}>
                    Qué se conversó
                    <input
                      name="contact_note"
                      defaultValue={c.contact_note ?? ""}
                      placeholder="Se le mandó el recordatorio, dijo que paga la semana que viene"
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
                {c.current_stage !== c.suggested_stage && (
                  <p className="mt-2 text-xs text-muted">
                    Por los días de atraso correspondería:{" "}
                    <span className="text-cream">{stageLabel(c.suggested_stage)}</span>
                  </p>
                )}
              </details>
            </div>
          );
        })}

        {(pending ?? []).length === 0 && (
          <p className="rounded-[18px] border border-line bg-ink-2 px-5 py-8 text-center text-sm text-muted">
            Nada por cobrar en los próximos 30 días.
          </p>
        )}
      </div>

      {(history ?? []).length > 0 && (
        <div className="mt-8 rounded-[18px] border border-line bg-ink-2 p-5">
          <h2 className="font-display text-base font-semibold">Casos cerrados</h2>
          <ul className="mt-3 space-y-1 text-xs">
            {(history ?? []).map((h) => (
              <li key={h.id} className="flex justify-between gap-3">
                <span className="text-muted">
                  {h.due_date} · {h.contact_note ?? "—"}
                </span>
                <span
                  className={h.stage === "cobrado" ? "text-accent" : "text-violet"}
                >
                  {stageLabel(h.stage)} · USD {usd(h.amount_usd)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
