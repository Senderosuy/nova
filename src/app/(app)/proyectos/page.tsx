import Link from "next/link";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createProject } from "./actions";
import { SubmitButton } from "@/components/submit-button";
import { SearchInput } from "@/components/search-input";
import { matches } from "@/lib/search";

const STATUSES = [
  "presupuestado",
  "en_desarrollo",
  "activo",
  "pausado",
  "finalizado",
  "archivado",
] as const;

const TYPES = ["landing", "ecommerce", "sistema", "automatizacion", "otro"] as const;

const inputCls =
  "mt-1.5 w-full rounded-lg border border-line-2 bg-ink px-3 py-2 text-sm text-cream outline-none focus:border-accent";
const labelCls = "block text-xs font-medium uppercase tracking-wide text-muted";

export default async function ProyectosPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const { status, q } = await searchParams;
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  let query = supabase
    .from("projects")
    .select("id,name,type,status,brand,production_url,repo_url,clients(name)")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (status && (STATUSES as readonly string[]).includes(status)) {
    query = query.eq("status", status);
  }

  const THIS_YEAR = new Date().getFullYear();

  const [{ data: projects }, { data: clients }, { data: techStatus }, { data: brandRows }, { data: annual }] = await Promise.all([
    query,
    supabase
      .from("clients")
      .select("id,name")
      .is("deleted_at", null)
      .order("name"),
    supabase.from("project_tech_status").select("project_id,completeness_pct,has_doc"),
    supabase.from("projects").select("brand").not("brand", "is", null).is("deleted_at", null),
    supabase
      .from("project_margin")
      .select("project_id,year,revenue_usd,cost_usd,margin_usd")
      .in("year", [THIS_YEAR, THIS_YEAR + 1]),
  ]);

  const clientNameOf = (p: { clients: unknown }) => {
    const rel = p.clients as { name: string } | { name: string }[] | null;
    return Array.isArray(rel) ? rel[0]?.name : rel?.name;
  };
  const filtered = (projects ?? []).filter((p) =>
    matches(q, p.name, p.type, p.status, p.production_url, clientNameOf(p))
  );

  type Cell = { revenue: number; cost: number; margin: number };
  const byProject = new Map<string, Record<number, Cell>>();
  for (const row of annual ?? []) {
    const entry = byProject.get(row.project_id) ?? {};
    entry[row.year] = {
      revenue: Number(row.revenue_usd),
      cost: Number(row.cost_usd),
      margin: Number(row.margin_usd),
    };
    byProject.set(row.project_id, entry);
  }

  const brands = [...new Set((brandRows ?? []).map((b) => b.brand as string))].sort();

  const techByProject = new Map(
    (techStatus ?? []).map((t) => [
      t.project_id,
      { pct: Number(t.completeness_pct), hasDoc: Boolean(t.has_doc) },
    ])
  );

  const shown = new Set(filtered.map((p) => p.id));
  const totals = (annual ?? [])
    .filter((r) => shown.has(r.project_id))
    .reduce<Record<number, Cell>>((acc, r) => {
      const cur = acc[r.year] ?? { revenue: 0, cost: 0, margin: 0 };
      acc[r.year] = {
        revenue: cur.revenue + Number(r.revenue_usd),
        cost: cur.cost + Number(r.cost_usd),
        margin: cur.margin + Number(r.margin_usd),
      };
      return acc;
    }, {});

  const usd = (n: number | undefined) =>
    n === undefined
      ? "—"
      : n.toLocaleString("es-UY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });


  return (
    <div>
      <h1 className="font-display text-xl sm:text-2xl font-semibold tracking-tight">Proyectos</h1>
      <p className="mt-1 text-sm text-muted">
        {filtered.length} proyecto{filtered.length === 1 ? "" : "s"}
        {status ? ` · filtro: ${status.replace("_", " ")}` : ""}
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        <Link
          href="/proyectos"
          className={
            !status
              ? "rounded-full bg-accent-dim px-3 py-1 text-xs text-accent"
              : "rounded-full border border-line-2 px-3 py-1 text-xs text-muted hover:text-cream"
          }
        >
          Todos
        </Link>
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={`/proyectos?status=${s}`}
            className={
              status === s
                ? "rounded-full bg-accent-dim px-3 py-1 text-xs text-accent"
                : "rounded-full border border-line-2 px-3 py-1 text-xs text-muted hover:text-cream"
            }
          >
            {s.replace("_", " ")}
          </Link>
        ))}
      </div>

      <div className="mt-4">
        <SearchInput placeholder="Buscar proyecto, cliente, tipo…" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="overflow-x-auto rounded-[18px] border border-line bg-ink-2">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-3 font-medium">Proyecto</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="hidden sm:table-cell px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium" title="Completitud de la ficha técnica">Ficha</th>
                <th className="px-4 py-3 text-right font-medium">
                  {THIS_YEAR} <span className="normal-case">margen</span>
                </th>
                <th className="px-4 py-3 text-right font-medium">
                  {THIS_YEAR + 1} <span className="normal-case">margen</span>
                </th>
                <th className="hidden sm:table-cell px-4 py-3 font-medium">Links</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const rel = p.clients as unknown as
                  | { name: string }
                  | { name: string }[]
                  | null;
                const clientName = Array.isArray(rel) ? rel[0]?.name : rel?.name;
                const cells = byProject.get(p.id) ?? {};
                const cell = (y: number) => {
                  const c = cells[y];
                  if (!c || (c.revenue === 0 && c.cost === 0)) return <span className="text-muted">—</span>;
                  return (
                    <div className="leading-tight">
                      <p className={c.margin >= 0 ? "font-medium text-accent" : "font-medium text-violet"}>
                        {usd(c.margin)}
                      </p>
                      <p className="text-xs text-muted">
                        {usd(c.revenue)} − {usd(c.cost)}
                      </p>
                    </div>
                  );
                };
                return (
                <tr key={p.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/proyectos/${p.id}`} className="hover:text-accent">
                      {p.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted">{clientName ?? "—"}</td>
                  <td className="hidden px-4 py-3 text-muted sm:table-cell">{p.brand ?? "—"}</td>
                  <td className="hidden px-4 py-3 text-muted sm:table-cell">{p.type}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-ink-3 px-2.5 py-0.5 text-xs text-cream">
                      {p.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {(() => {
                      const t = techByProject.get(p.id);
                      if (!t || t.pct === 0)
                        return (
                          <span className="text-xs text-muted" title="Sin ficha técnica">
                            —
                          </span>
                        );
                      return (
                        <span
                          className={t.pct >= 80 ? "text-xs text-accent" : "text-xs text-cream"}
                          title={
                            t.hasDoc
                              ? "Documento completo cargado"
                              : `Ficha técnica ${t.pct}% completa`
                          }
                        >
                          {t.hasDoc ? "✓ doc" : `${t.pct}%`}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3 text-right">{cell(THIS_YEAR)}</td>
                  <td className="px-4 py-3 text-right">{cell(THIS_YEAR + 1)}</td>
                  <td className="hidden px-4 py-3 text-xs sm:table-cell">
                    {p.production_url && (
                      <a
                        href={p.production_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-accent hover:underline"
                      >
                        prod
                      </a>
                    )}
                    {p.repo_url && (
                      <a
                        href={p.repo_url}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-2 text-violet hover:underline"
                      >
                        repo
                      </a>
                    )}
                    {!p.production_url && !p.repo_url && (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-muted">
                    Sin proyectos {status ? "con ese estado" : "todavía"}.
                  </td>
                </tr>
              )}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr className="border-t border-line-2 text-xs uppercase tracking-wide">
                  <td colSpan={6} className="px-4 py-3 text-muted">
                    Margen total
                  </td>
                  <td className="px-4 py-3 text-right font-display text-sm font-semibold text-cream">
                    {usd(totals[THIS_YEAR]?.margin)}
                  </td>
                  <td className="px-4 py-3 text-right font-display text-sm font-semibold text-cream">
                    {usd(totals[THIS_YEAR + 1]?.margin)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        <form
          action={createProject}
          className="h-fit rounded-[18px] border border-line bg-ink-2 p-5"
        >
          <h2 className="font-display text-base font-semibold">Nuevo proyecto</h2>

          <label className={`${labelCls} mt-4`}>
            Cliente *
            <select name="client_id" required className={inputCls} defaultValue="">
              <option value="" disabled>
                Elegir…
              </option>
              {(clients ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <label className={`${labelCls} mt-3`}>
            Nombre *
            <input name="name" required className={inputCls} />
          </label>

          <label className={`${labelCls} mt-3`}>
            Marca <span className="normal-case">(opcional)</span>
            <input name="brand" list="marcas" placeholder="Senderos del Tannat" className={inputCls} />
            <datalist id="marcas">
              {brands.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
          </label>

          <label className={`${labelCls} mt-3`}>
            Tipo
            <select name="type" defaultValue="otro" className={inputCls}>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>

          <label className={`${labelCls} mt-3`}>
            Estado
            <select name="status" defaultValue="en_desarrollo" className={inputCls}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace("_", " ")}
                </option>
              ))}
            </select>
          </label>

          <label className={`${labelCls} mt-3`}>
            URL producción
            <input name="production_url" type="url" className={inputCls} />
          </label>

          <label className={`${labelCls} mt-3`}>
            Descripción
            <textarea name="description" rows={2} className={inputCls} />
          </label>

          <SubmitButton
            className="mt-5 w-full rounded-lg bg-accent px-4 py-2 font-display text-sm font-semibold text-ink transition-opacity hover:opacity-90"
           pendingLabel="Creando…">Crear proyecto</SubmitButton>
        </form>
      </div>
    </div>
  );
}
