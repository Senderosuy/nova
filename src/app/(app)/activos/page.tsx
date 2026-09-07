import Link from "next/link";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createAsset } from "./actions";
import { SearchInput } from "@/components/search-input";
import { AssetEditor } from "@/components/asset-editor";
import { matches } from "@/lib/search";
import { SubmitButton } from "@/components/submit-button";

const TYPES = ["dominio", "hosting", "herramienta", "licencia", "otro"] as const;

const inputCls =
  "mt-1.5 w-full rounded-lg border border-line-2 bg-ink px-3 py-2 text-sm text-cream outline-none focus:border-accent";
const labelCls = "block text-xs font-medium uppercase tracking-wide text-muted";

function daysLeft(expires: string | null): number | null {
  if (!expires) return null;
  const diff = new Date(expires).getTime() - Date.now();
  return Math.ceil(diff / 86_400_000);
}

function ExpiryBadge({ expires }: { expires: string | null }) {
  const days = daysLeft(expires);
  if (days === null) return <span className="text-muted">—</span>;
  const cls =
    days <= 30
      ? "bg-violet/20 text-violet"
      : days <= 90
        ? "bg-accent-dim text-accent"
        : "bg-ink-3 text-muted";
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs ${cls}`}>
      {expires} · {days} d
    </span>
  );
}

export default async function ActivosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; ver?: string }>;
}) {
  const { q, ver } = await searchParams;
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const [{ data: assets }, { data: providers }, { data: assignments }] = await Promise.all([
    supabase
      .from("assets")
      .select(
        "id,type,name,provider,provider_id,identifier,ownership,cost,currency,billing_cycle,expires_at,paid_at,notes,cost_reason"
      )
      .is("deleted_at", null)
      .order("expires_at", { ascending: true, nullsFirst: false }),
    supabase.from("providers").select("id,name").is("deleted_at", null).order("name"),
    supabase
      .from("asset_assignments")
      .select("asset_id,projects(name)")
      .is("assigned_until", null),
  ]);

  const REASON_LABEL: Record<string, string> = {
    reserva_dominio: "reserva",
    herramienta_interna: "herramienta interna",
    infraestructura: "infraestructura",
    marca: "marca",
    cliente_potencial: "cliente potencial",
    otro: "otro",
  };

  const projectOf = new Map(
    (assignments ?? []).map((x) => {
      const rel = x.projects as unknown as { name: string } | { name: string }[] | null;
      const one = Array.isArray(rel) ? rel[0] : rel;
      return [x.asset_id, one?.name ?? null];
    })
  );


  const filtered = (assets ?? []).filter((a) =>
    matches(q, a.name, a.type, a.provider, a.identifier, a.ownership, a.billing_cycle)
  );

  const orphans = filtered.filter(
    (a) => !projectOf.get(a.id) && a.ownership === "nova"
  );
  const unlabeled = orphans.filter((a) => !a.cost_reason);

  // Vistas rápidas sobre el mismo listado, sin salir de la pantalla
  const shown =
    ver === "sin-causa"
      ? unlabeled
      : ver === "nova"
        ? filtered.filter((a) => !projectOf.get(a.id) && a.ownership === "nova")
        : ver === "cliente"
          ? filtered.filter((a) => a.ownership === "cliente")
          : ver === "sin-proyecto"
            ? filtered.filter((a) => !projectOf.get(a.id))
            : filtered;

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-semibold tracking-tight">Activos</h1>
          <p className="mt-1 text-sm text-muted">
            {filtered.length} activo{filtered.length === 1 ? "" : "s"}
            {q ? ` de ${assets?.length ?? 0}` : " — dominios, hostings, herramientas y licencias de Nova"}.
          </p>
        </div>
        <Link
          href="/proveedores"
          className="rounded-lg border border-line-2 px-4 py-2 text-sm text-muted transition-colors hover:border-accent hover:text-accent"
        >
          Sincronizar desde proveedores
        </Link>
      </div>

      {unlabeled.length > 0 && (
        <Link
          href="/activos?ver=sin-causa"
          className="mt-4 block rounded-lg border border-violet/40 bg-violet/10 px-4 py-2 text-sm text-violet hover:bg-violet/20"
        >
          {unlabeled.length} activo{unlabeled.length === 1 ? "" : "s"} sin proyecto ni causa
          declarada. Su costo lo cubre Nova: definí por qué se paga en cada uno.
        </Link>
      )}

      <div className="mt-4">
        <SearchInput placeholder="Buscar activo, proveedor, tipo…" />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {[
          { k: undefined, label: `Todos (${filtered.length})` },
          { k: "sin-causa", label: `Sin causa (${unlabeled.length})` },
          {
            k: "sin-proyecto",
            label: `Sin proyecto (${filtered.filter((a) => !projectOf.get(a.id)).length})`,
          },
          {
            k: "cliente",
            label: `Del cliente (${filtered.filter((a) => a.ownership === "cliente").length})`,
          },
        ].map((opt) => {
          const active = ver === opt.k || (!ver && !opt.k);
          const params = new URLSearchParams();
          if (q) params.set("q", q);
          if (opt.k) params.set("ver", opt.k);
          const href = params.toString() ? `/activos?${params}` : "/activos";
          return (
            <Link
              key={opt.label}
              href={href}
              className={
                active
                  ? "rounded-full bg-accent-dim px-3 py-1 text-xs text-accent"
                  : opt.k === "sin-causa" && unlabeled.length > 0
                    ? "rounded-full border border-violet/40 px-3 py-1 text-xs text-violet hover:bg-violet/10"
                    : "rounded-full border border-line-2 px-3 py-1 text-xs text-muted hover:text-cream"
              }
            >
              {opt.label}
            </Link>
          );
        })}
      </div>


      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="overflow-x-auto rounded-[18px] border border-line bg-ink-2">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-3 font-medium">Activo</th>
                <th className="hidden sm:table-cell px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium">Proveedor</th>
                <th className="px-4 py-3 font-medium">Gasto de</th>
                <th className="px-4 py-3 font-medium">Costo neto</th>
                <th className="px-4 py-3 font-medium">Vence</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((a) => (
                <tr key={a.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 font-medium">{a.name}</td>
                  <td className="hidden px-4 py-3 text-muted sm:table-cell">{a.type}</td>
                  <td className="px-4 py-3 text-muted">{a.provider ?? "—"}</td>
                  <td className="px-4 py-3">
                    {(() => {
                      const proj = projectOf.get(a.id);
                      if (a.ownership === "cliente")
                        return (
                          <span
                            className="rounded-full bg-ink-3 px-2 py-0.5 text-xs text-cream"
                            title="Del cliente: Nova lo administra pero no lo costea"
                          >
                            cliente{proj ? ` · ${proj}` : ""}
                          </span>
                        );
                      if (proj)
                        return <span className="text-xs text-muted">{proj}</span>;
                      if (a.cost_reason)
                        return (
                          <span className="rounded-full bg-ink-3 px-2 py-0.5 text-xs text-cream">
                            Nova · {REASON_LABEL[a.cost_reason] ?? a.cost_reason}
                          </span>
                        );
                      return (
                        <span
                          className="rounded-full bg-violet/20 px-2 py-0.5 text-xs text-violet"
                          title="Sin proyecto ni causa: definí por qué Nova lo paga"
                        >
                          sin causa
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {a.cost
                      ? `${a.currency} ${Number(a.cost).toLocaleString("es-UY")} / ${a.billing_cycle}`
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <ExpiryBadge expires={a.expires_at} />
                  </td>
                  <td className="px-4 py-3 align-top">
                    <AssetEditor asset={a} providers={providers ?? []} />
                  </td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted">
                    Sin activos. Sincronizá Hostinger o cargá uno manual.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <form
          action={createAsset}
          className="h-fit rounded-[18px] border border-line bg-ink-2 p-5"
        >
          <h2 className="font-display text-base font-semibold">Activo manual</h2>
          <p className="mt-1 text-xs text-muted">
            Para dominios .uy (nic.com.uy), licencias u otros fuera de Hostinger.
          </p>

          <label className={`${labelCls} mt-4`}>
            Tipo
            <select name="type" defaultValue="dominio" className={inputCls}>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>

          <label className={`${labelCls} mt-3`}>
            Nombre *
            <input name="name" required className={inputCls} placeholder="senderos.com.uy" />
          </label>

          <label className={`${labelCls} mt-3`}>
            Proveedor
            <select name="provider_id" defaultValue="" className={inputCls}>
              <option value="">— sin proveedor —</option>
              {(providers ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          <label className={`${labelCls} mt-3`}>
            Identificador
            <input name="identifier" className={inputCls} />
          </label>

          <label className={`${labelCls} mt-3`}>
            Propiedad
            <select name="ownership" defaultValue="nova" className={inputCls}>
              <option value="nova">Nova</option>
              <option value="cliente">Cliente</option>
            </select>
          </label>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className={labelCls}>
              Costo neto
              <input name="cost" type="number" step="0.01" className={inputCls} />
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
            Ciclo de cobro
            <select name="billing_cycle" defaultValue="anual" className={inputCls}>
              <option value="mensual">mensual</option>
              <option value="trimestral">trimestral</option>
              <option value="semestral">semestral</option>
              <option value="anual">anual</option>
              <option value="unico">pago único</option>
              <option value="gratis">gratis</option>
            </select>
          </label>

          <label className={`${labelCls} mt-3`}>
            Vencimiento
            <input name="expires_at" type="date" className={inputCls} />
          </label>

          <label className={`${labelCls} mt-3`}>
            Notas
            <textarea name="notes" rows={2} className={inputCls} />
          </label>

          <SubmitButton
            className="mt-5 w-full rounded-lg bg-accent px-4 py-2 font-display text-sm font-semibold text-ink transition-opacity hover:opacity-90"
           pendingLabel="Creando…">Crear activo</SubmitButton>
        </form>
      </div>
    </div>
  );
}
