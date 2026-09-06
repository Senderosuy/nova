import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import {
  assignAsset,
  unassignAsset,
  updateProjectStatus,
  setOwnershipType,
  updateProject,
  archiveProject,
  setAssetOwnership,
  setAllAssetsToClient,
} from "./actions";
import { AssetEditor } from "@/components/asset-editor";
import { RevenuePanel } from "@/components/revenue-panel";
import { CostBreakdown } from "@/components/cost-breakdown";
import { InvestmentPanel } from "@/components/investment-panel";
import { TechProfilePanel } from "@/components/tech-profile-panel";
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
  const THIS_YEAR = new Date().getFullYear();
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const [{ data: project }, { data: assignments }, { data: allAssets }, { data: takenAssets }, { data: events }, { data: providers }, { data: clientList }, { data: costs }, { data: schedule }, { data: charges }, { data: catalog }, { data: techProfile }, { data: techStatus }, { data: outflows }, { data: ownedMethods }, { data: investment }, { data: payMethods }, { data: lineItems }, { data: margins }] =
    await Promise.all([
      supabase
        .from("projects")
        .select("id,name,type,status,ownership_type,client_id,brand,description,production_url,repo_url,docs_repo,docs_path,docs_branch,docs_synced_at,docs_sync_result,clients(name)")
        .eq("id", id)
        .is("deleted_at", null)
        .single(),
      supabase
        .from("asset_assignments")
        .select(
          "id,assigned_from,assigned_until,assets(id,name,type,provider,provider_id,identifier,ownership,expires_at,paid_at,notes,cost,currency,billing_cycle,cost_reason)"
        )
        .eq("project_id", id)
        .order("assigned_from", { ascending: false }),
      supabase
        .from("assets")
        .select("id,name,type,ownership")
        .is("deleted_at", null)
        .order("name"),
      supabase
        .from("asset_assignments")
        .select("asset_id")
        .is("assigned_until", null),
      supabase
        .from("project_events")
        .select("id,event_type,description,created_at")
        .eq("project_id", id)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase.from("providers").select("id,name").is("deleted_at", null).order("name"),
      supabase.from("clients").select("id,name").is("deleted_at", null).order("name"),
      supabase
        .from("project_costs")
        .select("currency,net_monthly,net_yearly")
        .eq("project_id", id),
      supabase
        .from("service_schedule")
        .select("*")
        .eq("project_id", id),
      supabase
        .from("project_charges")
        .select("id,direction,concept,amount,currency,charge_date,billing_status")
        .eq("project_id", id)
        .order("charge_date", { ascending: false }),
      supabase
        .from("service_catalog")
        .select("id,concept,reference_price,currency,kind")
        .order("concept"),
      supabase
        .from("project_tech_profiles")
        .select("*")
        .eq("project_id", id)
        .maybeSingle(),
      supabase
        .from("project_tech_status")
        .select("completeness_pct,filled_fields,total_fields,days_since_review")
        .eq("project_id", id)
        .maybeSingle(),
      supabase
        .from("cash_movements")
        .select("usd,direction,payment_method_id,occurred_on")
        .eq("project_id", id)
        .eq("direction", "egreso"),
      supabase
        .from("payment_methods")
        .select("id,owner_partner_id,partners(name)")
        .not("owner_partner_id", "is", null),
      supabase
        .from("project_investment")
        .select("invested_total_usd,invested_year_usd,returned_total_usd,net_position_usd")
        .eq("project_id", id)
        .single(),
      supabase.from("payment_methods").select("id,label").eq("active", true).order("label"),
      supabase
        .from("project_line_items")
        .select("*")
        .eq("project_id", id)
        .order("margin_usd_year"),
      supabase
        .from("project_margin")
        .select("year,revenue_usd,cost_usd,margin_usd,margin_pct")
        .eq("project_id", id)
        .in("year", [THIS_YEAR, THIS_YEAR + 1]),
    ]);

  if (!project) notFound();

  const today = new Date().toISOString().slice(0, 10);
  const ownerOf = new Map(
    (ownedMethods ?? []).map((m) => {
      const rel = m.partners as unknown as { name: string } | { name: string }[] | null;
      const one = Array.isArray(rel) ? rel[0] : rel;
      return [m.id, one?.name ?? "socio"];
    })
  );
  const fundedMap = new Map<string, number>();
  for (const mv of outflows ?? []) {
    if (!mv.payment_method_id || mv.occurred_on > today) continue;
    const who = ownerOf.get(mv.payment_method_id);
    if (!who) continue;
    fundedMap.set(who, (fundedMap.get(who) ?? 0) + Number(mv.usd));
  }
  const fundedBy = [...fundedMap.entries()].map(([name, usd]) => ({
    name,
    usd: Math.round(usd * 100) / 100,
  }));

  const clientRel = project.clients as unknown as
    | { name: string }
    | { name: string }[]
    | null;
  const clientName = Array.isArray(clientRel) ? clientRel[0]?.name : clientRel?.name;

  const active = (assignments ?? []).filter((a) => !a.assigned_until);
  // Un activo asignado a cualquier proyecto no vuelve a ofrecerse:
  // el selector muestra solo lo que está libre.
  const takenIds = new Set((takenAssets ?? []).map((t) => t.asset_id));
  const assignable = (allAssets ?? []).filter((a) => !takenIds.has(a.id));

  return (
    <div>
      <Link href="/proyectos" className="text-xs text-muted hover:text-accent">
        ← Proyectos
      </Link>

      <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-semibold tracking-tight">
            {project.name}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {project.ownership_type === "propio" && (
              <span className="mr-2 rounded-full bg-violet/20 px-2 py-0.5 text-xs text-violet">
                producto propio
              </span>
            )}
            {clientName ?? "—"}
            {project.brand ? " · " + project.brand : ""} · {project.type}
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

        <div className="flex flex-col items-start gap-2 sm:items-end">
        <form
          action={setOwnershipType.bind(
            null,
            project.id,
            project.ownership_type === "propio" ? "cliente" : "propio"
          )}
        >
          <SubmitButton className="text-xs text-muted hover:text-accent" pendingLabel="…">
            {project.ownership_type === "propio"
              ? "Marcar como proyecto de cliente"
              : "Marcar como producto propio"}
          </SubmitButton>
        </form>
        <form action={updateProjectStatus.bind(null, project.id)} className="flex gap-2">
          <select name="status" defaultValue={project.status} className={inputCls + " mt-0 w-full sm:w-44"}>
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
      </div>

      <details className="mt-4 rounded-[18px] border border-line bg-ink-2 px-5 py-4">
        <summary className="cursor-pointer text-xs text-muted hover:text-accent">
          Editar datos del proyecto
        </summary>
        <form action={updateProject.bind(null, project.id)} className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-medium uppercase tracking-wide text-muted">
            Nombre
            <input name="name" defaultValue={project.name} required className={inputCls} />
          </label>
          <label className="block text-xs font-medium uppercase tracking-wide text-muted">
            Cliente
            <select name="client_id" defaultValue={project.client_id ?? ""} className={inputCls}>
              {(clientList ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-medium uppercase tracking-wide text-muted">
            Tipo
            <select name="type" defaultValue={project.type} className={inputCls}>
              {["landing", "ecommerce", "sistema", "automatizacion", "otro"].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-medium uppercase tracking-wide text-muted">
            Marca
            <input name="brand" defaultValue={project.brand ?? ""} className={inputCls} />
          </label>
          <label className="block text-xs font-medium uppercase tracking-wide text-muted">
            URL de producción
            <input name="production_url" type="url" defaultValue={project.production_url ?? ""} className={inputCls} />
          </label>
          <label className="block text-xs font-medium uppercase tracking-wide text-muted sm:col-span-2">
            Enlace al código <span className="normal-case">(Lovable, GitHub o donde esté)</span>
            <input name="repo_url" defaultValue={project.repo_url ?? ""} className={inputCls} />
          </label>
          <label className="block text-xs font-medium uppercase tracking-wide text-muted sm:col-span-2">
            Descripción
            <textarea name="description" rows={2} defaultValue={project.description ?? ""} className={inputCls} />
          </label>
          <SubmitButton
            className="rounded-lg bg-accent px-4 py-2 font-display text-sm font-semibold text-ink hover:opacity-90 sm:col-span-2"
            pendingLabel="Guardando…"
          >
            Guardar cambios
          </SubmitButton>
        </form>

        <form action={archiveProject.bind(null, project.id)} className="mt-4 border-t border-line pt-3">
          <SubmitButton className="text-xs text-muted hover:text-violet" pendingLabel="Archivando…">
            Archivar proyecto
          </SubmitButton>
          <span className="ml-3 text-xs text-muted">
            Cierra sus asignaciones y lo saca de las listas. No borra el historial.
          </span>
        </form>
      </details>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_360px]">
        <div>
          {project.ownership_type === "propio" && investment && (
            <div className="mb-6">
              <InvestmentPanel
                inv={investment as never}
                year={THIS_YEAR}
                fundedBy={fundedBy}
              />
            </div>
          )}

          <div className="mb-6 rounded-[18px] border border-line bg-ink-2 p-5">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
              <h2 className="font-display text-base font-semibold">
                {project.ownership_type === "propio" ? "Proyección por año" : "Resultado por año"}
              </h2>
              <span className="text-xs text-muted">interno — no se informa al cliente</span>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {(margins ?? []).map((m) => (
                <div key={m.year} className="rounded-lg border border-line bg-ink p-4">
                  <p className="font-display text-sm font-semibold">{m.year}</p>
                  <dl className="mt-2 space-y-1 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-muted">Ingreso</dt>
                      <dd>USD {Number(m.revenue_usd).toLocaleString("es-UY")}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted">Costo neto</dt>
                      <dd>USD {Number(m.cost_usd).toLocaleString("es-UY")}</dd>
                    </div>
                    <div className="flex justify-between border-t border-line pt-1">
                      <dt className="font-medium">Margen</dt>
                      <dd className={Number(m.margin_usd) >= 0 ? "font-display font-semibold text-accent" : "font-display font-semibold text-violet"}>
                        USD {Number(m.margin_usd).toLocaleString("es-UY")}
                        {m.margin_pct !== null && (
                          <span className="ml-1 text-xs font-normal text-muted">
                            {Number(m.margin_pct)}%
                          </span>
                        )}
                      </dd>
                    </div>
                  </dl>
                </div>
              ))}
            </div>

            <p className="mt-4 text-xs uppercase tracking-wide text-muted">Costo recurrente</p>
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

          <div className="mb-6">
            <CostBreakdown items={(lineItems ?? []) as never} />
          </div>

          <div className="mb-6">
            <RevenuePanel
              projectId={project.id}
              services={(schedule ?? []) as never}
              charges={(charges ?? []) as never}
              assets={active.map((x) => {
                const r = x.assets as unknown as { id: string; name: string; expires_at: string | null } | { id: string; name: string; expires_at: string | null }[] | null;
                const one = Array.isArray(r) ? r[0] : r;
                return { id: one?.id ?? "", name: one?.name ?? "", expires_at: one?.expires_at ?? null };
              })}
              catalog={catalog ?? []}
              methods={payMethods ?? []}
            />
          </div>

          <div className="rounded-[18px] border border-line bg-ink-2">
            <div className="flex flex-col gap-3 border-b border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-display text-base font-semibold">Activos asignados</h2>
                {active.length > 0 && (
                  <form action={setAllAssetsToClient.bind(null, project.id)} className="mt-1">
                    <SubmitButton
                      className="text-xs text-muted hover:text-accent"
                      title="Marca todos como del cliente: su costo deja de pesar sobre Nova"
                      pendingLabel="Aplicando…"
                    >
                      Marcar todos como del cliente
                    </SubmitButton>
                  </form>
                )}
              </div>
              <form action={assignAsset.bind(null, project.id)} className="flex gap-2">
                <select name="asset_id" className={inputCls + " mt-0 w-full sm:w-56"} defaultValue="">
                  <option value="" disabled>
                    Asignar activo…
                  </option>
                  {assignable.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.type})
                      {a.ownership === "cliente" ? " · del cliente" : ""}
                    </option>
                  ))}
                  {assignable.length === 0 && (
                    <option value="" disabled>
                      Todos los activos están asignados
                    </option>
                  )}
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
                    className="flex flex-col gap-2 border-b border-line px-5 py-3 text-sm last:border-0 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <span className="font-medium">{asset.name}</span>
                      {asset.ownership === "cliente" && (
                        <span className="ml-2 rounded-full bg-ink-3 px-2 py-0.5 text-xs text-cream">
                          del cliente
                        </span>
                      )}
                      <span className="ml-2 text-xs text-muted">
                        {asset.type} · {asset.provider ?? "—"}
                        {asset.expires_at ? ` · vence ${asset.expires_at}` : ""}
                        {asset.cost
                          ? ` · ${asset.currency} ${asset.cost} ${asset.billing_cycle}`
                          : " · sin costo"}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-start gap-4">
                    <form
                      action={setAssetOwnership.bind(
                        null,
                        project.id,
                        asset.id,
                        asset.ownership === "cliente" ? "nova" : "cliente"
                      )}
                    >
                      <SubmitButton
                        className="text-xs text-muted hover:text-accent"
                        title="Decide si el costo pesa sobre Nova o sobre el cliente"
                        pendingLabel="…"
                      >
                        {asset.ownership === "cliente" ? "Pasar a Nova" : "Pasar al cliente"}
                      </SubmitButton>
                    </form>
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

        <div className="space-y-6">
        <TechProfilePanel
          projectId={project.id}
          profile={(techProfile ?? null) as never}
          status={(techStatus ?? null) as never}
          docs={{
            docs_repo: project.docs_repo,
            docs_path: project.docs_path,
            docs_branch: project.docs_branch,
            docs_synced_at: project.docs_synced_at,
            docs_sync_result: project.docs_sync_result,
          }}
        />

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
    </div>
  );
}
