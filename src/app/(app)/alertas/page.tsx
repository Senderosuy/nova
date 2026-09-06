import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { runAlertScan, setAlertStatus } from "./actions";

function daysTo(date: string): number {
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86_400_000);
}

export default async function AlertasPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: alerts } = await supabase
    .from("alerts")
    .select(
      "id,source_type,threshold_days,due_date,suggested_action,status,assets(name,provider),recurring_services(concept)"
    )
    .neq("status", "resuelta")
    .order("due_date", { ascending: true });

  const { count: resolved } = await supabase
    .from("alerts")
    .select("id", { count: "exact", head: true })
    .eq("status", "resuelta");

  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Alertas</h1>
          <p className="mt-1 text-sm text-muted">
            {alerts?.length ?? 0} abierta{(alerts?.length ?? 0) === 1 ? "" : "s"} ·{" "}
            {resolved ?? 0} resuelta{(resolved ?? 0) === 1 ? "" : "s"} · barrido automático
            diario 06:00
          </p>
        </div>
        <form action={runAlertScan}>
          <button
            type="submit"
            className="rounded-lg border border-line-2 px-4 py-2 text-sm text-muted transition-colors hover:border-accent hover:text-accent"
          >
            Ejecutar barrido ahora
          </button>
        </form>
      </div>

      <div className="mt-6 overflow-hidden rounded-[18px] border border-line bg-ink-2">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-3 font-medium">Acción</th>
              <th className="px-4 py-3 font-medium">Origen</th>
              <th className="px-4 py-3 font-medium">Vence</th>
              <th className="px-4 py-3 font-medium">Umbral</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {(alerts ?? []).map((a) => {
              const assetRel = a.assets as unknown as
                | { name: string; provider: string | null }
                | { name: string; provider: string | null }[]
                | null;
              const asset = Array.isArray(assetRel) ? assetRel[0] : assetRel;
              const svcRel = a.recurring_services as unknown as
                | { concept: string }
                | { concept: string }[]
                | null;
              const svc = Array.isArray(svcRel) ? svcRel[0] : svcRel;
              const left = daysTo(a.due_date);

              return (
                <tr key={a.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 font-medium">{a.suggested_action}</td>
                  <td className="px-4 py-3 text-muted">
                    {asset?.name ?? svc?.concept ?? "—"}
                    {asset?.provider ? ` · ${asset.provider}` : ""}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        left <= 15
                          ? "text-violet"
                          : left <= 30
                            ? "text-cream"
                            : "text-muted"
                      }
                    >
                      {a.due_date} · {left} d
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted">{a.threshold_days} d</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-ink-3 px-2.5 py-0.5 text-xs">
                      {a.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-xs">
                    {a.status === "pendiente" && (
                      <form action={setAlertStatus.bind(null, a.id, "vista")} className="inline">
                        <button type="submit" className="text-muted hover:text-cream">
                          Marcar vista
                        </button>
                      </form>
                    )}
                    <form
                      action={setAlertStatus.bind(null, a.id, "resuelta")}
                      className="ml-3 inline"
                    >
                      <button type="submit" className="text-accent hover:underline">
                        Resolver
                      </button>
                    </form>
                  </td>
                </tr>
              );
            })}
            {(alerts ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted">
                  Sin alertas abiertas. Nada vence en los próximos 90 días.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
