import Link from "next/link";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { SubmitButton } from "@/components/submit-button";
import {
  createCompanyExpense,
  createCompanyRecurring,
  setExpensePayment,
  deleteCompanyItem,
} from "./actions";

const inputCls =
  "mt-1 w-full rounded-lg border border-line-2 bg-ink px-3 py-2 text-sm text-cream outline-none focus:border-accent";
const labelCls = "block text-xs font-medium uppercase tracking-wide text-muted";

const usd = (n: number | null | undefined) =>
  n === null || n === undefined
    ? "—"
    : `USD ${Number(n).toLocaleString("es-UY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const MONTHS = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

export default async function FinanzasPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const { year: yearParam } = await searchParams;
  const year = Number(yearParam) || new Date().getFullYear();

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const [
    { data: yearly },
    { data: monthly },
    { data: byCategory },
    { data: byMethod },
    { data: expenses },
    { data: recurring },
    { data: categories },
    { data: methods },
  ] = await Promise.all([
    supabase.from("finance_yearly").select("*").order("year"),
    supabase
      .from("finance_monthly")
      .select("*")
      .gte("period", `${year}-01-01`)
      .lte("period", `${year}-12-31`)
      .order("period"),
    supabase.from("spend_by_category").select("*").eq("year", year).order("sort_order"),
    supabase.from("spend_by_payment_method").select("*").eq("year", year),
    supabase
      .from("project_charges")
      .select("id,concept,amount,currency,charge_date,billing_status,expense_categories(name),payment_methods(label)")
      .eq("scope", "empresa")
      .order("charge_date", { ascending: false }),
    supabase
      .from("recurring_services")
      .select("id,concept,net_cost,net_currency,frequency,next_billing_date,expense_categories(name),payment_methods(label)")
      .eq("scope", "empresa")
      .eq("active", true)
      .order("concept"),
    supabase.from("expense_categories").select("id,name").order("sort_order"),
    supabase.from("payment_methods").select("id,label").eq("active", true).order("label"),
  ]);

  const thisYear = (yearly ?? []).find((y) => y.year === year);
  const years = (yearly ?? []).map((y) => y.year);

  // Consolidar gasto por método (la vista trae una fila por mes)
  const methodTotals = new Map<string, number>();
  for (const m of byMethod ?? []) {
    methodTotals.set(m.label, (methodTotals.get(m.label) ?? 0) + Number(m.usd_total));
  }

  const rel = (v: unknown) => {
    const r = v as { name?: string; label?: string } | { name?: string; label?: string }[] | null;
    const one = Array.isArray(r) ? r[0] : r;
    return one?.name ?? one?.label ?? null;
  };

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">
            Finanzas de Nova
          </h1>
          <p className="mt-1 text-sm text-muted">
            Resultado de la empresa: ingresos, egresos y estructura. El overhead se
            muestra separado del costo de los proyectos.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/finanzas/movimientos?anio=${year}`}
            className="rounded-full border border-accent/40 bg-accent-dim px-3 py-1 text-xs text-accent hover:border-accent"
          >
            Ver movimientos
          </Link>
          {years.map((y) => (
            <a
              key={y}
              href={`/finanzas?year=${y}`}
              className={
                y === year
                  ? "rounded-full bg-accent-dim px-3 py-1 text-xs text-accent"
                  : "rounded-full border border-line-2 px-3 py-1 text-xs text-muted hover:text-cream"
              }
            >
              {y}
            </a>
          ))}
        </div>
      </div>

      {/* Resumen del año */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {[
          { label: `Ingresos ${year}`, value: thisYear?.revenue_usd, tone: "accent" },
          { label: `Egresos ${year}`, value: thisYear?.expense_usd, tone: "cream" },
          { label: "Estructura (overhead)", value: thisYear?.overhead_usd, tone: "muted" },
          { label: "Resultado neto", value: thisYear?.net_usd, tone: "net" },
        ].map((c) => (
          <div key={c.label} className="rounded-[18px] border border-line bg-ink-2 p-5">
            <p className="text-xs uppercase tracking-wide text-muted">{c.label}</p>
            <p
              className={`mt-2 font-display text-xl font-semibold sm:text-2xl ${
                c.tone === "accent"
                  ? "text-accent"
                  : c.tone === "net"
                    ? Number(c.value ?? 0) >= 0
                      ? "text-accent"
                      : "text-violet"
                    : c.tone === "muted"
                      ? "text-muted"
                      : "text-cream"
              }`}
            >
              {usd(c.value as number)}
            </p>
          </div>
        ))}
      </div>

      {/* Mensual */}
      <div className="mt-8 overflow-x-auto rounded-[18px] border border-line bg-ink-2">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-3 font-medium">Mes {year}</th>
              <th className="px-4 py-3 text-right font-medium">Ingresos</th>
              <th className="px-4 py-3 text-right font-medium">Egresos</th>
              <th className="px-4 py-3 text-right font-medium">Estructura</th>
              <th className="px-4 py-3 text-right font-medium">Neto</th>
            </tr>
          </thead>
          <tbody>
            {(monthly ?? []).map((m) => (
              <tr key={m.period} className="border-b border-line last:border-0 hover:bg-ink">
                <td className="px-4 py-3">
                  <Link
                    href={`/finanzas/movimientos?desde=${m.period}&hasta=${new Date(new Date(m.period).getUTCFullYear(), new Date(m.period).getUTCMonth() + 1, 0).toISOString().slice(0, 10)}`}
                    className="hover:text-accent"
                  >
                    {MONTHS[new Date(m.period).getUTCMonth()]}
                  </Link>
                </td>
                <td className="px-4 py-3 text-right text-accent">{usd(m.revenue_usd)}</td>
                <td className="px-4 py-3 text-right">{usd(m.expense_usd)}</td>
                <td className="px-4 py-3 text-right text-muted">{usd(m.overhead_usd)}</td>
                <td
                  className={`px-4 py-3 text-right font-medium ${
                    Number(m.net_usd) >= 0 ? "text-accent" : "text-violet"
                  }`}
                >
                  {usd(m.net_usd)}
                </td>
              </tr>
            ))}
            {(monthly ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted">
                  Sin movimientos en {year}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Reportes por categoría y método */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-[18px] border border-line bg-ink-2 p-5">
          <h2 className="font-display text-base font-semibold">Gasto por categoría</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {(byCategory ?? []).map((c) => (
              <li key={c.category_id}>
                <Link
                  href={`/finanzas/movimientos?anio=${year}&categoria=${encodeURIComponent(c.name)}`}
                  className="flex justify-between rounded-lg px-2 py-1 -mx-2 hover:bg-ink"
                >
                  <span className="text-muted">{c.name}</span>
                  <span>{usd(c.usd_total)}</span>
                </Link>
              </li>
            ))}
            {(byCategory ?? []).length === 0 && (
              <li className="text-muted">Sin gastos categorizados en {year}.</li>
            )}
          </ul>
        </div>

        <div className="rounded-[18px] border border-line bg-ink-2 p-5">
          <h2 className="font-display text-base font-semibold">Gasto por método de pago</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {[...methodTotals.entries()].map(([label, total]) => (
              <li key={label}>
                <Link
                  href={`/finanzas/movimientos?anio=${year}&metodo=${encodeURIComponent(label)}`}
                  className="flex justify-between rounded-lg px-2 py-1 -mx-2 hover:bg-ink"
                >
                  <span className="text-muted">{label}</span>
                  <span>{usd(total)}</span>
                </Link>
              </li>
            ))}
            {methodTotals.size === 0 && (
              <li className="text-muted">
                Sin gastos asociados a un método. Asigná métodos a los activos y servicios.
              </li>
            )}
          </ul>
        </div>
      </div>

      {/* Gastos de estructura */}
      <h2 className="mt-10 font-display text-lg font-semibold">Gastos de estructura</h2>
      <p className="mt-1 text-sm text-muted">
        Costos de Nova como empresa, sin proyecto asociado.
      </p>

      <div className="mt-4 grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <div className="rounded-[18px] border border-line bg-ink-2">
            <div className="border-b border-line px-5 py-3">
              <h3 className="font-display text-sm font-semibold">Recurrentes</h3>
            </div>
            <ul>
              {(recurring ?? []).map((r) => (
                <li
                  key={r.id}
                  className="flex flex-col gap-2 border-b border-line px-5 py-3 text-sm last:border-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <span className="font-medium">{r.concept}</span>
                    <span className="ml-2 text-cream">
                      {r.net_currency} {Number(r.net_cost).toLocaleString("es-UY")}
                    </span>
                    <span className="ml-2 text-xs text-muted">
                      / {r.frequency}
                      {rel(r.expense_categories) ? ` · ${rel(r.expense_categories)}` : ""}
                      {rel(r.payment_methods) ? ` · ${rel(r.payment_methods)}` : ""}
                    </span>
                  </div>
                  <form action={deleteCompanyItem.bind(null, "recurring_services", r.id)}>
                    <SubmitButton className="text-xs text-muted hover:text-violet" pendingLabel="…">
                      Archivar
                    </SubmitButton>
                  </form>
                </li>
              ))}
              {(recurring ?? []).length === 0 && (
                <li className="px-5 py-6 text-center text-sm text-muted">
                  Sin gastos recurrentes de estructura.
                </li>
              )}
            </ul>
          </div>

          <div className="rounded-[18px] border border-line bg-ink-2">
            <div className="border-b border-line px-5 py-3">
              <h3 className="font-display text-sm font-semibold">Únicos</h3>
            </div>
            <ul>
              {(expenses ?? []).map((e) => (
                <li
                  key={e.id}
                  className="flex flex-col gap-2 border-b border-line px-5 py-3 text-sm last:border-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <span className="font-medium">{e.concept}</span>
                    <span className="ml-2 text-cream">
                      {e.currency} {Number(e.amount).toLocaleString("es-UY")}
                    </span>
                    <span className="ml-2 text-xs text-muted">
                      {e.charge_date}
                      {rel(e.expense_categories) ? ` · ${rel(e.expense_categories)}` : ""}
                      {rel(e.payment_methods) ? ` · ${rel(e.payment_methods)}` : ""}
                    </span>
                    <span
                      className={`ml-2 rounded-full px-2 py-0.5 text-xs ${
                        e.billing_status === "cobrado"
                          ? "bg-accent-dim text-accent"
                          : "bg-ink-3 text-muted"
                      }`}
                    >
                      {e.billing_status === "cobrado" ? "pagado" : "pendiente"}
                    </span>
                  </div>
                  <div className="flex shrink-0 gap-3 text-xs">
                    <form
                      action={setExpensePayment.bind(
                        null,
                        e.id,
                        e.billing_status === "cobrado" ? "pendiente" : "cobrado"
                      )}
                    >
                      <SubmitButton className="text-accent hover:underline" pendingLabel="…">
                        {e.billing_status === "cobrado" ? "Deshacer" : "Marcar pagado"}
                      </SubmitButton>
                    </form>
                    <form action={deleteCompanyItem.bind(null, "project_charges", e.id)}>
                      <SubmitButton className="text-muted hover:text-violet" pendingLabel="…">
                        Eliminar
                      </SubmitButton>
                    </form>
                  </div>
                </li>
              ))}
              {(expenses ?? []).length === 0 && (
                <li className="px-5 py-6 text-center text-sm text-muted">
                  Sin gastos únicos de estructura.
                </li>
              )}
            </ul>
          </div>
        </div>

        <div className="space-y-6">
          <form
            action={createCompanyRecurring}
            className="h-fit rounded-[18px] border border-line bg-ink-2 p-5"
          >
            <h3 className="font-display text-base font-semibold">Gasto recurrente</h3>
            <p className="mt-1 text-xs text-muted">Contador, herramientas, banco…</p>

            <label className={`${labelCls} mt-4`}>
              Concepto *
              <input name="concept" required className={inputCls} />
            </label>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className={labelCls}>
                Importe
                <input name="net_cost" type="number" step="0.01" required className={inputCls} />
              </label>
              <label className={labelCls}>
                Moneda
                <select name="net_currency" defaultValue="UYU" className={inputCls}>
                  <option value="UYU">UYU</option>
                <option value="BRL">BRL</option>
                  <option value="USD">USD</option>
                </select>
              </label>
            </div>

            <label className={`${labelCls} mt-3`}>
              Frecuencia
              <select name="frequency" defaultValue="mensual" className={inputCls}>
                <option value="mensual">mensual</option>
                <option value="trimestral">trimestral</option>
                <option value="semestral">semestral</option>
                <option value="anual">anual</option>
              </select>
            </label>

            <label className={`${labelCls} mt-3`}>
              Próximo pago
              <input name="next_billing_date" type="date" className={inputCls} />
            </label>

            <label className={`${labelCls} mt-3`}>
              Categoría
              <select name="category_id" defaultValue="" className={inputCls}>
                <option value="">— sin categoría —</option>
                {(categories ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>

            <label className={`${labelCls} mt-3`}>
              Método de pago
              <select name="payment_method_id" defaultValue="" className={inputCls}>
                <option value="">— sin método —</option>
                {(methods ?? []).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>

            <SubmitButton
              className="mt-5 w-full rounded-lg bg-accent px-4 py-2 font-display text-sm font-semibold text-ink hover:opacity-90"
              pendingLabel="Creando…"
            >
              Crear recurrente
            </SubmitButton>
          </form>

          <form
            action={createCompanyExpense}
            className="h-fit rounded-[18px] border border-line bg-ink-2 p-5"
          >
            <h3 className="font-display text-base font-semibold">Gasto único</h3>
            <p className="mt-1 text-xs text-muted">Apertura, trámites, honorarios…</p>

            <label className={`${labelCls} mt-4`}>
              Concepto *
              <input name="concept" required className={inputCls} />
            </label>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className={labelCls}>
                Importe
                <input name="amount" type="number" step="0.01" required className={inputCls} />
              </label>
              <label className={labelCls}>
                Moneda
                <select name="currency" defaultValue="UYU" className={inputCls}>
                  <option value="UYU">UYU</option>
                <option value="BRL">BRL</option>
                  <option value="USD">USD</option>
                </select>
              </label>
            </div>

            <label className={`${labelCls} mt-3`}>
              Fecha
              <input
                name="charge_date"
                type="date"
                defaultValue={new Date().toISOString().slice(0, 10)}
                className={inputCls}
              />
            </label>

            <label className={`${labelCls} mt-3`}>
              Categoría
              <select name="category_id" defaultValue="" className={inputCls}>
                <option value="">— sin categoría —</option>
                {(categories ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>

            <label className={`${labelCls} mt-3`}>
              Método de pago
              <select name="payment_method_id" defaultValue="" className={inputCls}>
                <option value="">— sin método —</option>
                {(methods ?? []).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>

            <SubmitButton
              className="mt-5 w-full rounded-lg bg-accent px-4 py-2 font-display text-sm font-semibold text-ink hover:opacity-90"
              pendingLabel="Creando…"
            >
              Crear gasto
            </SubmitButton>
          </form>
        </div>
      </div>
    </div>
  );
}
