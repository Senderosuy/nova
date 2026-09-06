import Link from "next/link";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createAsset } from "./actions";
import { SearchInput, matches } from "@/components/search-input";
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
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const [{ data: assets }, { data: providers }] = await Promise.all([
    supabase
      .from("assets")
      .select(
        "id,type,name,provider,identifier,ownership,cost,currency,billing_cycle,expires_at"
      )
      .is("deleted_at", null)
      .order("expires_at", { ascending: true, nullsFirst: false }),
    supabase.from("providers").select("id,name").is("deleted_at", null).order("name"),
  ]);

  const filtered = (assets ?? []).filter((a) =>
    matches(q, a.name, a.type, a.provider, a.identifier, a.ownership, a.billing_cycle)
  );

  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Activos</h1>
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

      <div className="mt-4">
        <SearchInput placeholder="Buscar activo, proveedor, tipo…" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="overflow-hidden rounded-[18px] border border-line bg-ink-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-3 font-medium">Activo</th>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium">Proveedor</th>
                <th className="px-4 py-3 font-medium">Costo neto</th>
                <th className="px-4 py-3 font-medium">Vence</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 font-medium">{a.name}</td>
                  <td className="px-4 py-3 text-muted">{a.type}</td>
                  <td className="px-4 py-3 text-muted">{a.provider ?? "—"}</td>
                  <td className="px-4 py-3 text-muted">
                    {a.cost
                      ? `${a.currency} ${Number(a.cost).toLocaleString("es-UY")} / ${a.billing_cycle}`
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <ExpiryBadge expires={a.expires_at} />
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted">
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
