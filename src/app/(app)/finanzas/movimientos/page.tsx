import Link from "next/link";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";

const usd = (n: number | null | undefined) =>
  n === null || n === undefined
    ? "—"
    : Number(n).toLocaleString("es-UY", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

type Filters = {
  anio?: string;
  desde?: string;
  hasta?: string;
  direccion?: string;
  alcance?: string;
  categoria?: string;
  metodo?: string;
  proyecto?: string;
  cliente?: string;
  marca?: string;
};

/** Reconstruye la URL conservando los filtros vigentes. */
function urlWith(current: Filters, patch: Partial<Filters>): string {
  const merged = { ...current, ...patch };
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) {
    if (v) params.set(k, v);
  }
  const qs = params.toString();
  return qs ? `/finanzas/movimientos?${qs}` : "/finanzas/movimientos";
}

const KIND_LABEL: Record<string, string> = {
  unico: "único",
  recurrente: "recurrente",
  activo: "activo",
};

export default async function MovimientosPage({
  searchParams,
}: {
  searchParams: Promise<Filters>;
}) {
  const f = await searchParams;
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  let q = supabase.from("ledger").select("*").order("occurred_on", { ascending: false });

  if (f.anio) q = q.eq("year", Number(f.anio));
  if (f.desde) q = q.gte("occurred_on", f.desde);
  if (f.hasta) q = q.lte("occurred_on", f.hasta);
  if (f.direccion) q = q.eq("direction", f.direccion);
  if (f.alcance) q = q.eq("scope", f.alcance);
  if (f.categoria) q = q.eq("category_name", f.categoria);
  if (f.metodo) q = q.eq("method_label", f.metodo);
  if (f.proyecto) q = q.eq("project_id", f.proyecto);
  if (f.cliente) q = q.eq("client_id", f.cliente);
  if (f.marca) q = q.eq("brand", f.marca);

  const [{ data: rows }, { data: years }, { data: categories }, { data: methods }] =
    await Promise.all([
      q.limit(500),
      supabase.from("ledger").select("year"),
      supabase.from("expense_categories").select("name").order("sort_order"),
      supabase.from("payment_methods").select("label").order("label"),
    ]);

  const yearList = [...new Set((years ?? []).map((y) => y.year as number))].sort(
    (a, b) => b - a
  );

  const income = (rows ?? [])
    .filter((r) => r.direction === "ingreso")
    .reduce((s, r) => s + Number(r.usd), 0);
  const expense = (rows ?? [])
    .filter((r) => r.direction === "egreso")
    .reduce((s, r) => s + Number(r.usd), 0);

  const hasFilters = Object.values(f).some(Boolean);

  const chip = (label: string, active: boolean, href: string) => (
    <Link
      key={label + href}
      href={href}
      className={
        active
          ? "rounded-full bg-accent-dim px-3 py-1 text-xs text-accent"
          : "rounded-full border border-line-2 px-3 py-1 text-xs text-muted hover:text-cream"
      }
    >
      {label}
    </Link>
  );

  return (
    <div>
      <Link href="/finanzas" className="text-xs text-muted hover:text-accent">
        ← Finanzas
      </Link>

      <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">
            Movimientos
          </h1>
          <p className="mt-1 text-sm text-muted">
            {(rows ?? []).length} movimiento{(rows ?? []).length === 1 ? "" : "s"}
            {(rows ?? []).length === 500 ? " (primeros 500)" : ""} · ingresos{" "}
            <span className="text-accent">{usd(income)}</span> · egresos {usd(expense)}
          </p>
        </div>
        {hasFilters && (
          <Link
            href="/finanzas/movimientos"
            className="text-xs text-muted hover:text-violet"
          >
            Limpiar filtros
          </Link>
        )}
      </div>

      {/* Filtros */}
      <div className="mt-5 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-muted">Año</span>
          {chip("todos", !f.anio, urlWith(f, { anio: undefined }))}
          {yearList.map((y) =>
            chip(String(y), f.anio === String(y), urlWith(f, { anio: String(y) }))
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-muted">Tipo</span>
          {chip("todos", !f.direccion, urlWith(f, { direccion: undefined }))}
          {chip("ingresos", f.direccion === "ingreso", urlWith(f, { direccion: "ingreso" }))}
          {chip("egresos", f.direccion === "egreso", urlWith(f, { direccion: "egreso" }))}
          <span className="ml-3 text-xs uppercase tracking-wide text-muted">Alcance</span>
          {chip("todo", !f.alcance, urlWith(f, { alcance: undefined }))}
          {chip("proyectos", f.alcance === "proyecto", urlWith(f, { alcance: "proyecto" }))}
          {chip("estructura", f.alcance === "empresa", urlWith(f, { alcance: "empresa" }))}
        </div>

        {(categories ?? []).length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs uppercase tracking-wide text-muted">Categoría</span>
            {chip("todas", !f.categoria, urlWith(f, { categoria: undefined }))}
            {(categories ?? []).map((c) =>
              chip(
                c.name as string,
                f.categoria === c.name,
                urlWith(f, { categoria: c.name as string })
              )
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-muted">Medio</span>
          {chip("todos", !f.metodo, urlWith(f, { metodo: undefined }))}
          {(methods ?? []).map((m) =>
            chip(
              m.label as string,
              f.metodo === m.label,
              urlWith(f, { metodo: m.label as string })
            )
          )}
        </div>
      </div>

      {/* Listado */}
      <div className="mt-6 overflow-x-auto rounded-[18px] border border-line bg-ink-2">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-3 font-medium">Fecha</th>
              <th className="px-4 py-3 font-medium">Concepto</th>
              <th className="hidden px-4 py-3 font-medium lg:table-cell">Proyecto</th>
              <th className="hidden px-4 py-3 font-medium lg:table-cell">Categoría</th>
              <th className="hidden px-4 py-3 font-medium sm:table-cell">Medio</th>
              <th className="px-4 py-3 text-right font-medium">Importe</th>
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((r, i) => (
              <tr
                key={`${r.source_kind}-${r.source_id}-${r.occurred_on}-${i}`}
                className="border-b border-line last:border-0"
              >
                <td className="whitespace-nowrap px-4 py-3 text-muted">{r.occurred_on}</td>
                <td className="px-4 py-3">
                  <span className="font-medium">{r.concept}</span>
                  <span className="ml-2 text-xs text-muted">
                    {KIND_LABEL[r.source_kind as string] ?? r.source_kind}
                    {r.scope === "empresa" ? " · estructura" : ""}
                  </span>
                </td>
                <td className="hidden px-4 py-3 text-muted lg:table-cell">
                  {r.project_id ? (
                    <Link
                      href={`/proyectos/${r.project_id}`}
                      className="hover:text-accent"
                    >
                      {r.project_name}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="hidden px-4 py-3 text-muted lg:table-cell">
                  {r.category_name ?? "—"}
                </td>
                <td className="hidden px-4 py-3 text-muted sm:table-cell">
                  {r.method_label ?? "—"}
                </td>
                <td
                  className={`whitespace-nowrap px-4 py-3 text-right ${
                    r.direction === "ingreso" ? "text-accent" : "text-cream"
                  }`}
                >
                  {r.direction === "ingreso" ? "+" : "−"}
                  {usd(r.usd)}
                </td>
              </tr>
            ))}
            {(rows ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted">
                  Sin movimientos con estos filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-muted">
        Los movimientos recurrentes se proyectan a futuro desde su fecha de renovación:
        las fechas posteriores a hoy son previsiones, no pagos realizados.
      </p>
    </div>
  );
}
