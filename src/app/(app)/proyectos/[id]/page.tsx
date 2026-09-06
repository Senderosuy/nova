import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { assignAsset, unassignAsset, updateProjectStatus } from "./actions";
import { AssetEditor } from "@/components/asset-editor";
import { SubmitButton } from "@/components/submit-button";

const STATUSES = [
  "presupuestado",
  "en_desarrollo",
  "activo",
  "pausado",
  "finalizado",
  "archivado",
] as const;

const inputCls =
  "mt-1.5 w-full rounded-lg border border-line-2 bg-ink px-3 py-2 text-sm text-cream outline-none focus:border-accent";

export default async function ProyectoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const [{ data: project }, { data: assignments }, { data: allAssets }, { data: events }, { data: providers }, { data: costs }] =
    await Promise.all([
      supabase
        .from("projects")
        .select("id,name,type,status,description,production_url,repo_url,clients(name)")
        .eq("id", id)
        .is("deleted_at", null)
        .single(),
      supabase
        .from("asset_assignments")
        .select(
          "id,assigned_from,assigned_until,assets(id,name,type,provider,provider_id,identifier,ownership,expires_at,paid_at,notes,cost,currency,billing_cycle)"
        )
        .eq("project_id", id)
        .order("assigned_from", { ascending: false }),
      supabase
        .from("assets")
        .select("id,name,type")
        .is("deleted_at", null)
        .order("name"),
      supabase
        .from("project_events")
        .select("id,event_type,description,created_at")
        .eq("project_id", id)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase.from("providers").select("id,name").is("deleted_at", null).order("name"),
      supabase
        .from("project_costs")
        .select("currency,net_monthly,net_yearly")
        .eq("project_id", id),
    ]);

  if (!project) notFound();

  const clientRel = project.clients as unknown as
    | { name: string }
    | { name: string }[]
    | null;
  const clientName = Array.isArray(clientRel) ? clientRel[0]?.name : clientRel?.name;

  const active = (assignments ?? []).filter((a) => !a.assigned_until);
  const assignedIds = new Set(
    active.map((a) => {
      const rel = a.assets as unknown as { id: string } | { id: string }[] | null;
      return Array.isArray(rel) ? rel[0]?.id : rel?.id;
    })
  );
  const assignable = (allAssets ?? []).filter((a) => !assignedIds.has(a.id));

  return (
    <div>
      <Link href="/proyectos" className="text-xs text-muted hover:text-accent">
        ← Proyectos
      </Link>

      <div className="mt-2 flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            {project.name}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {clientName ?? "—"} · {project.type}
            {project.description ? ` · ${project.description}` : ""}
          </p>
          <p className="mt-1 space-x-3 text-xs">
            {project.production_url && (
              <a
                href={project.production_url}
                target="_blank"
                rel="noreferrer"
                className="text-accent hover:underline"
              >
                {project.production_url}
              </a>
            )}
            {project.repo_url && (
              <a
                href={project.repo_url}
                target="_blank"
                rel="noreferrer"
                className="text-violet hover:underline"
              >
                repositorio
              </a>
            )}
          </p>
        </div>

        <form action={updateProjectStatus.bind(null, project.id)} className="flex gap-2">
          <select name="status" defaultValue={project.status} className={inputCls + " mt-0 w-44"}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace("_", " ")}
              </option>
            ))}
          </select>
          <SubmitButton
            className="rounded-lg border border-line-2 px-3 py-2 text-sm text-muted hover:border-accent hover:text-accent"
           pendingLabel="Cambiando…">Cambiar</SubmitButton>
        </form>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_360px]">
        <div>
          <div className="mb-6 rounded-[18px] border border-line bg-ink-2 p-5">
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-base font-semibold">Costo neto del proyecto</h2>
              <span className="text-xs text-muted">interno — no se informa al cliente</span>
            </div>
            {(costs ?? []).length === 0 ? (
              <p className="mt-3 text-sm text-muted">
                Sin costos asociados. Asigná activos con costo o servicios recurrentes.
              </p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-6">
                {(costs ?? []).map((c) => (
                  <div key={c.currency}>
                    <p className="font-display text-2xl font-semibold text-accent">
                      {c.currency} {Number(c.net_monthly).toLocaleString("es-UY")}
                      <span className="ml-1 text-sm font-normal text-muted">/mes</span>
                    </p>
                    <p className="text-sm text-muted">
                      {c.currency} {Number(c.net_yearly).toLocaleString("es-UY")} / año
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-[18px] border border-line bg-ink-2">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h2 className="font-display text-base font-semibold">Activos asignados</h2>
              <form action={assignAsset.bind(null, project.id)} className="flex gap-2">
                <select name="asset_id" className={inputCls + " mt-0 w-56"} defaultValue="">
                  <option value="" disabled>
                    Asignar activo…
                  </option>
                  {assignable.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.type})
                    </option>
                  ))}
                </select>
                <SubmitButton
                  className="rounded-lg bg-accent px-3 py-2 font-display text-sm font-semibold text-ink hover:opacity-90"
                 pendingLabel="Asignando…">Asignar</SubmitButton>
              </form>
            </div>

            <ul>
              {active.map((a) => {
                type A = {
                  id: string;
                  name: string;
                  type: string;
                  provider: string | null;
                  provider_id: string | null;
                  identifier: string | null;
                  ownership: string;
                  expires_at: string | null;
                  paid_at: string | null;
                  notes: string | null;
                  cost: number | null;
                  currency: string;
                  billing_cycle: string;
                };
                const rel = a.assets as unknown as A | A[] | null;
                const asset = Array.isArray(rel) ? rel[0] : rel;
                if (!asset) return null;
                return (
                  <li
                    key={a.id}
                    className="flex items-center justify-between border-b border-line px-5 py-3 text-sm last:border-0"
                  >
                    <div>
                      <span className="font-medium">{asset.name}</span>
                      <span className="ml-2 text-xs text-muted">
                        {asset.type} · {asset.provider ?? "—"}
                        {asset.expires_at ? ` · vence ${asset.expires_at}` : ""}
                        {asset.cost
                          ? ` · ${asset.currency} ${asset.cost} ${asset.billing_cycle}`
                          : " · sin costo"}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-start gap-4">
                    <AssetEditor asset={asset} providers={providers ?? []} />
                    <form action={unassignAsset.bind(null, project.id, a.id)}>
                      <SubmitButton
                        className="text-xs text-muted hover:text-violet"
                        title="Finaliza la asignación (el activo sigue en inventario)"
                       pendingLabel="Quitando…">Desasignar</SubmitButton>
                    </form>
                    </div>
                  </li>
                );
              })}
              {active.length === 0 && (
                <li className="px-5 py-6 text-center text-sm text-muted">
                  Sin activos asignados. Elegí uno del selector.
                </li>
              )}
            </ul>
          </div>
        </div>

        <div className="rounded-[18px] border border-line bg-ink-2 p-5">
          <h2 className="font-display text-base font-semibold">Historial</h2>
          <ul className="mt-3 space-y-3">
            {(events ?? []).map((e) => (
              <li key={e.id} className="border-l-2 border-line-2 pl-3">
                <p className="text-sm">{e.description}</p>
                <p className="text-xs text-muted">
                  {e.event_type} · {new Date(e.created_at).toLocaleString("es-UY")}
                </p>
              </li>
            ))}
            {(events ?? []).length === 0 && (
              <li className="text-sm text-muted">Sin eventos todavía.</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
