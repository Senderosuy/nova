import { SubmitButton } from "./submit-button";
import {
  setClientRate,
  createAssignment,
  logHours,
  setAssignmentStatus,
  setAssignmentPayment,
  deleteAssignment,
} from "@/app/(app)/proyectos/[id]/work-actions";

const inputCls =
  "mt-1 w-full rounded-lg border border-line-2 bg-ink px-3 py-2 text-sm text-cream outline-none focus:border-accent";
const labelCls = "block text-xs font-medium uppercase tracking-wide text-muted";

const n2 = (n: number | null | undefined) =>
  n === null || n === undefined
    ? "—"
    : Number(n).toLocaleString("es-UY", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

const hrs = (n: number | null | undefined) =>
  n === null || n === undefined ? "0" : Number(n).toLocaleString("es-UY");

export type Assignment = {
  assignment_id: string;
  collaborator_name: string;
  collaborator_kind: string;
  title: string;
  mode: string;
  status: string;
  payment_status: string;
  currency: string;
  estimated_hours: number | null;
  worked_hours: number;
  hourly_cost: number | null;
  fixed_cost: number | null;
  cost_amount: number | null;
  cost_usd: number | null;
  hours_deviation: number | null;
};

export type WorkSummary = {
  client_hourly_rate: number | null;
  rate_currency: string | null;
  worked_hours: number;
  estimated_hours: number;
  work_cost_usd: number;
  billable_usd: number;
  unpaid_usd: number;
} | null;

/**
 * Trabajo del proyecto: quién hace qué, cuánto cuesta y cuánto se
 * factura. Nova cobra al cliente una tarifa y le paga al colaborador
 * otra menor: la diferencia es su rentabilidad.
 */
export function WorkPanel({
  projectId,
  assignments,
  summary,
  collaborators,
}: {
  projectId: string;
  assignments: Assignment[];
  summary: WorkSummary;
  collaborators: { id: string; name: string; default_hourly_cost: number | null; currency: string }[];
}) {
  const rate = Number(summary?.client_hourly_rate ?? 0);
  const worked = Number(summary?.worked_hours ?? 0);
  const cost = Number(summary?.work_cost_usd ?? 0);
  const billable = Number(summary?.billable_usd ?? 0);
  const unpaid = Number(summary?.unpaid_usd ?? 0);
  const margin = billable - cost;

  return (
    <div className="rounded-[18px] border border-line bg-ink-2">
      <div className="flex flex-col gap-1 border-b border-line px-5 py-4 sm:flex-row sm:items-baseline sm:justify-between">
        <div>
          <h2 className="font-display text-base font-semibold">Trabajo y horas</h2>
          <p className="mt-1 text-xs text-muted">
            Quién trabaja, cuánto cuesta y cuánto se factura.
          </p>
        </div>
        <span className="text-xs text-muted">interno — no se informa al cliente</span>
      </div>

      {/* Resumen */}
      {assignments.length > 0 && (
        <div className="grid grid-cols-2 gap-4 border-b border-line px-5 py-4 lg:grid-cols-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">Horas</p>
            <p className="mt-1 font-display text-lg font-semibold">
              {hrs(worked)}
              {Number(summary?.estimated_hours ?? 0) > 0 && (
                <span className="text-sm font-normal text-muted">
                  {" "}
                  de {hrs(summary?.estimated_hours)}
                </span>
              )}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">Costo</p>
            <p className="mt-1 font-display text-lg font-semibold">USD {n2(cost)}</p>
            {unpaid > 0 && (
              <p className="text-xs text-violet">USD {n2(unpaid)} sin pagar</p>
            )}
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">Facturable</p>
            <p className="mt-1 font-display text-lg font-semibold text-accent">
              {rate > 0 ? `USD ${n2(billable)}` : "—"}
            </p>
            {rate > 0 && (
              <p className="text-xs text-muted">a {rate} por hora</p>
            )}
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">Margen</p>
            <p
              className={`mt-1 font-display text-lg font-semibold ${
                margin >= 0 ? "text-accent" : "text-violet"
              }`}
            >
              {rate > 0 ? `USD ${n2(margin)}` : "—"}
            </p>
          </div>
        </div>
      )}

      {/* Asignaciones */}
      <ul>
        {assignments.map((a) => {
          const dev = a.hours_deviation;
          return (
            <li key={a.assignment_id} className="border-b border-line px-5 py-4 last:border-0">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="font-medium">
                    {a.title}
                    <span className="ml-2 rounded-full bg-ink-3 px-2 py-0.5 text-xs font-normal text-muted">
                      {a.mode === "horas" ? "por horas" : "entregable"}
                    </span>
                    {a.status === "entregado" && (
                      <span className="ml-2 rounded-full bg-accent-dim px-2 py-0.5 text-xs font-normal text-accent">
                        entregado
                      </span>
                    )}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {a.collaborator_name} · {a.collaborator_kind}
                    {a.mode === "horas"
                      ? ` · ${a.currency} ${n2(a.hourly_cost)} por hora`
                      : ` · ${a.currency} ${n2(a.fixed_cost)} fijo`}
                  </p>

                  {a.mode === "horas" && (
                    <p className="mt-1 text-xs">
                      <span className="text-cream">{hrs(a.worked_hours)} h</span>
                      {a.estimated_hours ? (
                        <span className="text-muted">
                          {" "}
                          de {hrs(a.estimated_hours)} estimadas
                        </span>
                      ) : null}
                      {dev !== null && dev !== undefined && Number(dev) !== 0 && (
                        <span className={Number(dev) > 0 ? " text-violet" : " text-accent"}>
                          {" "}
                          · {Number(dev) > 0 ? "+" : ""}
                          {hrs(dev)} h de desvío
                        </span>
                      )}
                    </p>
                  )}
                </div>

                <div className="shrink-0 text-right">
                  <p className="font-display text-sm font-semibold">
                    {a.currency} {n2(a.cost_amount)}
                  </p>
                  <p
                    className={
                      a.payment_status === "pagado"
                        ? "text-xs text-accent"
                        : "text-xs text-muted"
                    }
                  >
                    {a.payment_status}
                  </p>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-4 text-xs">
                {a.mode === "horas" && a.status === "en_curso" && (
                  <details>
                    <summary className="cursor-pointer text-accent">Registrar horas</summary>
                    <form
                      action={logHours.bind(null, projectId, a.assignment_id)}
                      className="mt-2 flex flex-wrap items-end gap-2"
                    >
                      <label className={labelCls}>
                        Horas
                        <input
                          name="hours"
                          type="number"
                          step="0.25"
                          required
                          className={inputCls + " w-24"}
                        />
                      </label>
                      <label className={labelCls}>
                        Fecha
                        <input
                          name="worked_on"
                          type="date"
                          defaultValue={new Date().toISOString().slice(0, 10)}
                          className={inputCls + " w-40"}
                        />
                      </label>
                      <label className={labelCls + " flex-1"}>
                        Qué se hizo
                        <input name="description" className={inputCls} />
                      </label>
                      <SubmitButton
                        className="rounded-lg bg-accent px-3 py-2 font-display text-xs font-semibold text-ink hover:opacity-90"
                        pendingLabel="…"
                      >
                        Registrar
                      </SubmitButton>
                    </form>
                  </details>
                )}

                {a.status === "en_curso" ? (
                  <form action={setAssignmentStatus.bind(null, projectId, a.assignment_id, "entregado")}>
                    <SubmitButton className="text-muted hover:text-accent" pendingLabel="…">
                      Marcar entregado
                    </SubmitButton>
                  </form>
                ) : (
                  <form action={setAssignmentStatus.bind(null, projectId, a.assignment_id, "en_curso")}>
                    <SubmitButton className="text-muted hover:text-cream" pendingLabel="…">
                      Reabrir
                    </SubmitButton>
                  </form>
                )}

                <form
                  action={setAssignmentPayment.bind(
                    null,
                    projectId,
                    a.assignment_id,
                    a.payment_status === "pagado" ? "pendiente" : "pagado"
                  )}
                >
                  <SubmitButton className="text-muted hover:text-accent" pendingLabel="…">
                    {a.payment_status === "pagado" ? "Marcar impago" : "Marcar pagado"}
                  </SubmitButton>
                </form>

                <form action={deleteAssignment.bind(null, projectId, a.assignment_id)}>
                  <SubmitButton className="text-muted hover:text-violet" pendingLabel="…">
                    Eliminar
                  </SubmitButton>
                </form>
              </div>
            </li>
          );
        })}

        {assignments.length === 0 && (
          <li className="px-5 py-6 text-center text-sm text-muted">
            Sin trabajo asignado. Agregá quién va a hacerlo y cómo se le paga.
          </li>
        )}
      </ul>

      {/* Tarifa al cliente */}
      <div className="border-t border-line px-5 py-4">
        <form
          action={setClientRate.bind(null, projectId)}
          className="flex flex-wrap items-end gap-3"
        >
          <label className={labelCls}>
            Tarifa al cliente por hora
            <input
              name="client_hourly_rate"
              type="number"
              step="0.01"
              defaultValue={summary?.client_hourly_rate ?? ""}
              className={inputCls + " w-32"}
            />
          </label>
          <label className={labelCls}>
            Moneda
            <select
              name="rate_currency"
              defaultValue={summary?.rate_currency ?? "USD"}
              className={inputCls + " w-28"}
            >
              <option value="USD">USD</option>
              <option value="UYU">UYU</option>
              <option value="BRL">BRL</option>
            </select>
          </label>
          <SubmitButton
            className="rounded-lg border border-line-2 px-3 py-2 text-sm text-muted hover:border-accent hover:text-accent"
            pendingLabel="Guardando…"
          >
            Guardar tarifa
          </SubmitButton>
        </form>
      </div>

      {/* Nueva asignación */}
      <details className="border-t border-line px-5 py-4">
        <summary className="cursor-pointer text-sm text-accent">
          + Asignar trabajo
        </summary>
        <form
          action={createAssignment.bind(null, projectId)}
          className="mt-4 grid gap-3 sm:grid-cols-2"
        >
          <label className={`${labelCls} sm:col-span-2`}>
            Qué hay que hacer *
            <input name="title" required placeholder="Rediseño del home" className={inputCls} />
          </label>

          <label className={labelCls}>
            Colaborador *
            <select name="collaborator_id" required defaultValue="" className={inputCls}>
              <option value="" disabled>
                Elegir…
              </option>
              {collaborators.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.default_hourly_cost
                    ? ` — ${c.currency} ${c.default_hourly_cost}/h`
                    : ""}
                </option>
              ))}
            </select>
          </label>

          <label className={labelCls}>
            Modalidad
            <select name="mode" defaultValue="horas" className={inputCls}>
              <option value="horas">Por horas</option>
              <option value="entregable">Entregable a monto fijo</option>
            </select>
          </label>

          <label className={labelCls}>
            Costo por hora <span className="normal-case">(si no, usa el del colaborador)</span>
            <input name="hourly_cost" type="number" step="0.01" className={inputCls} />
          </label>

          <label className={labelCls}>
            Horas estimadas
            <input name="estimated_hours" type="number" step="0.5" className={inputCls} />
          </label>

          <label className={labelCls}>
            Monto fijo <span className="normal-case">(solo entregable)</span>
            <input name="fixed_cost" type="number" step="0.01" className={inputCls} />
          </label>

          <label className={labelCls}>
            Moneda
            <select name="currency" defaultValue="USD" className={inputCls}>
              <option value="USD">USD</option>
              <option value="UYU">UYU</option>
              <option value="BRL">BRL</option>
            </select>
          </label>

          <SubmitButton
            className="rounded-lg bg-accent px-4 py-2 font-display text-sm font-semibold text-ink hover:opacity-90 sm:col-span-2"
            pendingLabel="Asignando…"
          >
            Asignar trabajo
          </SubmitButton>
        </form>
      </details>
    </div>
  );
}
