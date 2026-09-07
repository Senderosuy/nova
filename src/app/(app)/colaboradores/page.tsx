import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { SubmitButton } from "@/components/submit-button";
import {
  createCollaborator,
  updateCollaborator,
  toggleCollaborator,
} from "./actions";

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

const KINDS = [
  { v: "socio", l: "Socio" },
  { v: "interno", l: "Interno" },
  { v: "externo", l: "Externo" },
] as const;

export default async function ColaboradoresPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const [{ data: people }, { data: accounts }] = await Promise.all([
    supabase
      .from("collaborators")
      .select("*")
      .order("active", { ascending: false })
      .order("name"),
    supabase.from("collaborator_account").select("*"),
  ]);

  const accountOf = new Map((accounts ?? []).map((a) => [a.collaborator_id, a]));

  const totalPending = (accounts ?? []).reduce(
    (s, a) => s + Number(a.pending_usd ?? 0),
    0
  );

  return (
    <div>
      <h1 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">
        Colaboradores
      </h1>
      <p className="mt-1 text-sm text-muted">
        Quién trabaja en los proyectos y cuánto le paga Nova por hora. La tarifa que se
        cobra al cliente se define en cada proyecto, y la diferencia es la rentabilidad
        de la empresa.
      </p>

      {totalPending > 0 && (
        <p className="mt-4 rounded-lg border border-violet/40 bg-violet/10 px-4 py-2 text-sm text-violet">
          USD {usd(totalPending)} pendientes de pago a colaboradores.
        </p>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="space-y-3">
          {(people ?? []).map((c) => {
            const acc = accountOf.get(c.id);
            return (
              <div
                key={c.id}
                className={`rounded-[18px] border bg-ink-2 p-5 ${
                  c.active ? "border-line" : "border-line opacity-60"
                }`}
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="font-display text-base font-semibold">
                      {c.name}
                      <span className="ml-2 rounded-full bg-ink-3 px-2 py-0.5 text-xs font-normal text-muted">
                        {c.kind}
                      </span>
                      {!c.active && (
                        <span className="ml-2 rounded-full bg-ink-3 px-2 py-0.5 text-xs font-normal text-muted">
                          inactivo
                        </span>
                      )}
                    </h2>
                    <p className="mt-1 text-xs text-muted">
                      {c.default_hourly_cost
                        ? `${c.currency} ${usd(c.default_hourly_cost)} por hora`
                        : "Tarifa sin definir"}
                      {c.email ? ` · ${c.email}` : ""}
                    </p>
                  </div>

                  {acc && Number(acc.assignments_count) > 0 && (
                    <div className="text-right">
                      <p className="text-sm">
                        {Number(acc.worked_hours).toLocaleString("es-UY")} h trabajadas
                      </p>
                      <p className="text-xs text-muted">
                        USD {usd(acc.earned_usd)} generados
                        {Number(acc.pending_usd) > 0 && (
                          <span className="text-violet">
                            {" "}
                            · {usd(acc.pending_usd)} sin pagar
                          </span>
                        )}
                      </p>
                    </div>
                  )}
                </div>

                <details className="mt-3">
                  <summary className="cursor-pointer text-xs text-muted hover:text-accent">
                    Editar
                  </summary>
                  <form
                    action={updateCollaborator.bind(null, c.id)}
                    className="mt-3 grid gap-3 sm:grid-cols-2"
                  >
                    <label className={labelCls}>
                      Nombre
                      <input name="name" defaultValue={c.name} required className={inputCls} />
                    </label>
                    <label className={labelCls}>
                      Tipo
                      <select name="kind" defaultValue={c.kind} className={inputCls}>
                        {KINDS.map((k) => (
                          <option key={k.v} value={k.v}>
                            {k.l}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className={labelCls}>
                      Costo por hora
                      <input
                        name="default_hourly_cost"
                        type="number"
                        step="0.01"
                        defaultValue={c.default_hourly_cost ?? ""}
                        className={inputCls}
                      />
                    </label>
                    <label className={labelCls}>
                      Moneda
                      <select name="currency" defaultValue={c.currency} className={inputCls}>
                        <option value="USD">USD</option>
                        <option value="UYU">UYU</option>
                        <option value="BRL">BRL</option>
                      </select>
                    </label>
                    <label className={`${labelCls} sm:col-span-2`}>
                      Email
                      <input name="email" defaultValue={c.email ?? ""} className={inputCls} />
                    </label>
                    <label className={`${labelCls} sm:col-span-2`}>
                      Notas
                      <input name="notes" defaultValue={c.notes ?? ""} className={inputCls} />
                    </label>
                    <SubmitButton
                      className="rounded-lg bg-accent px-4 py-2 font-display text-sm font-semibold text-ink hover:opacity-90"
                      pendingLabel="Guardando…"
                    >
                      Guardar
                    </SubmitButton>
                  </form>

                  <form action={toggleCollaborator.bind(null, c.id, c.active)} className="mt-3">
                    <SubmitButton className="text-xs text-muted hover:text-violet" pendingLabel="…">
                      {c.active ? "Dar de baja" : "Reactivar"}
                    </SubmitButton>
                  </form>
                </details>
              </div>
            );
          })}

          {(people ?? []).length === 0 && (
            <p className="rounded-[18px] border border-line bg-ink-2 px-5 py-8 text-center text-sm text-muted">
              Sin colaboradores cargados.
            </p>
          )}
        </div>

        <form
          action={createCollaborator}
          className="h-fit rounded-[18px] border border-line bg-ink-2 p-5"
        >
          <h2 className="font-display text-base font-semibold">Nuevo colaborador</h2>

          <label className={`${labelCls} mt-4`}>
            Nombre *
            <input name="name" required className={inputCls} />
          </label>

          <label className={`${labelCls} mt-3`}>
            Tipo
            <select name="kind" defaultValue="externo" className={inputCls}>
              {KINDS.map((k) => (
                <option key={k.v} value={k.v}>
                  {k.l}
                </option>
              ))}
            </select>
          </label>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className={labelCls}>
              Costo por hora
              <input
                name="default_hourly_cost"
                type="number"
                step="0.01"
                className={inputCls}
              />
            </label>
            <label className={labelCls}>
              Moneda
              <select name="currency" defaultValue="USD" className={inputCls}>
                <option value="USD">USD</option>
                <option value="UYU">UYU</option>
                <option value="BRL">BRL</option>
              </select>
            </label>
          </div>

          <label className={`${labelCls} mt-3`}>
            Email
            <input name="email" type="email" className={inputCls} />
          </label>

          <label className={`${labelCls} mt-3`}>
            Notas
            <input name="notes" className={inputCls} />
          </label>

          <SubmitButton
            className="mt-5 w-full rounded-lg bg-accent px-4 py-2 font-display text-sm font-semibold text-ink hover:opacity-90"
            pendingLabel="Creando…"
          >
            Crear colaborador
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}
