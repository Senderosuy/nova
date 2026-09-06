import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

const usd = (n: number | null | undefined) =>
  n === null || n === undefined
    ? "—"
    : Number(n).toLocaleString("es-UY", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

export default async function ClienteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const [{ data: summary }, { data: projects }, { data: lines }, { data: services }] =
    await Promise.all([
      supabase.from("client_summary").select("*").eq("client_id", id).maybeSingle(),
      supabase
        .from("projects")
        .select("id,name,type,status,ownership_type,production_url")
        .eq("client_id", id)
        .is("deleted_at", null)
        .order("name"),
      supabase
        .from("client_line_items")
        .select("*")
        .eq("client_id", id)
        .order("margin_usd_year"),
      supabase
        .from("service_schedule")
        .select("*")
        .in(
          "project_id",
          (
            await supabase
              .from("projects")
              .select("id")
              .eq("client_id", id)
              .is("deleted_at", null)
          ).data?.map((p) => p.id) ?? ["00000000-0000-0000-0000-000000000000"]
        ),
    ]);

  if (!summary) notFound();

  const margin = Number(summary.margin_usd_year ?? 0);
  const revenue = Number(summary.revenue_usd_year ?? 0);
  const cost = Number(summary.cost_usd_year ?? 0);
  const pct = revenue > 0 ? (margin / revenue) * 100 : null;

  const income = (services ?? []).filter((s) => Number(s.amount ?? 0) > 0);

  return (
    <div>
      <Link href="/clientes" className="text-xs text-muted hover:text-accent">
        ← Clientes
      </Link>

      <h1 className="mt-2 font-display text-xl font-semibold tracking-tight sm:text-2xl">
        {summary.name}
      </h1>
      <p className="mt-1 text-sm text-muted">
        {summary.kind} · {summary.status} · {summary.projects_count} proyecto
        {Number(summary.projects_count) === 1 ? "" : "s"} · {summary.assets_count} activo
        {Number(summary.assets_count) === 1 ? "" : "s"}
      </p>

      {/* Resultado consolidado */}
      <div className="mt-6 grid grid-cols-3 gap-3 sm:gap-4">
        <div className="rounded-[18px] border border-line bg-ink-2 p-5">
          <p className="text-xs uppercase tracking-wide text-muted">Le cobramos</p>
          <p className="mt-2 font-display text-xl font-semibold text-accent sm:text-2xl">
            {usd(revenue)}
          </p>
          <p className="text-xs text-muted">al año</p>
        </div>
        <div className="rounded-[18px] border border-line bg-ink-2 p-5">
          <p className="text-xs uppercase tracking-wide text-muted">Nos cuesta</p>
          <p className="mt-2 font-display text-xl font-semibold sm:text-2xl">{usd(cost)}</p>
          <p className="text-xs text-muted">al año</p>
        </div>
        <div className="rounded-[18px] border border-line bg-ink-2 p-5">
          <p className="text-xs uppercase tracking-wide text-muted">Margen</p>
          <p
            className={`mt-2 font-display text-xl font-semibold sm:text-2xl ${
              margin >= 0 ? "text-accent" : "text-violet"
            }`}
          >
            {usd(margin)}
          </p>
          <p className="text-xs text-muted">
            {pct !== null ? `${pct.toFixed(0)}% del ingreso` : "sin ingreso"}
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          {/* Desglose consolidado */}
          <div className="overflow-hidden rounded-[18px] border border-line bg-ink-2">
            <div className="flex flex-col gap-1 border-b border-line px-5 py-4 sm:flex-row sm:items-baseline sm:justify-between">
              <h2 className="font-display text-base font-semibold">
                Desglose de todos sus proyectos
              </h2>
              <span className="text-xs text-muted">
                base anual en USD · interno
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-5 py-3 font-medium">Concepto</th>
                    <th className="px-4 py-3 text-right font-medium">Costo</th>
                    <th className="px-4 py-3 text-right font-medium">Cobramos</th>
                    <th className="px-4 py-3 text-right font-medium">Margen</th>
                  </tr>
                </thead>
                <tbody>
                  {(lines ?? []).map((l, i) => {
                    const m = Number(l.margin_usd_year);
                    return (
                      <tr
                        key={`${l.concept}-${i}`}
                        className="border-b border-line last:border-0"
                      >
                        <td className="px-5 py-3">
                          <span className="font-medium">{l.concept}</span>
                          <span className="ml-2 text-xs text-muted">
                            {l.kind}
                            {l.cycle && l.cycle !== "unico" ? ` · ${l.cycle}` : ""}
                            {l.paid_with ? ` · ${l.paid_with}` : ""}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {Number(l.cost_usd_year) > 0 ? (
                            usd(l.cost_usd_year)
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-accent">
                          {Number(l.price_usd_year) > 0 ? (
                            usd(l.price_usd_year)
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td
                          className={`px-4 py-3 text-right ${
                            m > 0 ? "text-accent" : m < 0 ? "text-violet" : "text-muted"
                          }`}
                        >
                          {m === 0 ? "—" : usd(m)}
                        </td>
                      </tr>
                    );
                  })}
                  {(lines ?? []).length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-5 py-8 text-center text-muted">
                        Sin ítems cargados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Anualidades */}
          {income.length > 0 && (
            <div className="rounded-[18px] border border-line bg-ink-2">
              <div className="border-b border-line px-5 py-4">
                <h2 className="font-display text-base font-semibold">
                  Estado de las anualidades
                </h2>
              </div>
              <ul>
                {income.map((s) => (
                  <li
                    key={s.service_id}
                    className="flex flex-col gap-2 border-b border-line px-5 py-3 text-sm last:border-0 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <span className="font-medium">{s.concept}</span>
                      <span className="ml-2 text-accent">
                        {s.currency} {Number(s.amount).toLocaleString("es-UY")}
                      </span>
                      <span className="ml-2 text-xs text-muted">
                        renueva {s.renewal_date ?? "—"}
                      </span>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <span
                        className={
                          s.confirmation_status === "confirmada"
                            ? "rounded-full bg-accent-dim px-2.5 py-0.5 text-xs text-accent"
                            : s.confirmation_status === "rechazada"
                              ? "rounded-full bg-violet/20 px-2.5 py-0.5 text-xs text-violet"
                              : "rounded-full bg-ink-3 px-2.5 py-0.5 text-xs text-muted"
                        }
                      >
                        {s.confirmation_status}
                      </span>
                      <span
                        className={
                          s.billing_status === "cobrado"
                            ? "rounded-full bg-accent-dim px-2.5 py-0.5 text-xs text-accent"
                            : "rounded-full bg-ink-3 px-2.5 py-0.5 text-xs text-muted"
                        }
                      >
                        {s.billing_status}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Proyectos */}
        <div className="h-fit rounded-[18px] border border-line bg-ink-2 p-5">
          <h2 className="font-display text-base font-semibold">Proyectos</h2>
          <ul className="mt-3 space-y-2">
            {(projects ?? []).map((p) => (
              <li key={p.id}>
                <Link
                  href={`/proyectos/${p.id}`}
                  className="block rounded-lg border border-line px-3 py-2 text-sm transition-colors hover:border-accent"
                >
                  <span className="font-medium">{p.name}</span>
                  {p.ownership_type === "propio" && (
                    <span className="ml-2 rounded-full bg-violet/20 px-2 py-0.5 text-xs text-violet">
                      propio
                    </span>
                  )}
                  <span className="mt-0.5 block text-xs text-muted">
                    {p.type} · {p.status.replace("_", " ")}
                  </span>
                </Link>
              </li>
            ))}
            {(projects ?? []).length === 0 && (
              <li className="text-sm text-muted">Sin proyectos.</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
