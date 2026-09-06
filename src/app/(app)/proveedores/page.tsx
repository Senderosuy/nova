import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createProvider, updateProvider } from "./actions";

const CATEGORIES = [
  "dominios",
  "hosting",
  "cdn",
  "productividad",
  "infraestructura",
  "otro",
] as const;
const MODELS = ["pago", "free", "freemium"] as const;

const inputCls =
  "mt-1.5 w-full rounded-lg border border-line-2 bg-ink px-3 py-2 text-sm text-cream outline-none focus:border-accent";
const labelCls = "block text-xs font-medium uppercase tracking-wide text-muted";

type Asset = { cost: number | null; currency: string; billing_cycle: string };

function monthly(cost: number | null, cycle: string): number {
  if (!cost) return 0;
  if (cycle === "mensual") return cost;
  if (cycle === "trimestral") return cost / 3;
  if (cycle === "semestral") return cost / 6;
  if (cycle === "anual") return cost / 12;
  return 0;
}

export default async function ProveedoresPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: providers } = await supabase
    .from("providers")
    .select(
      "id,name,website,category,billing_model,contract_context,payment_method,payment_terms,account_reference,currency,assets(cost,currency,billing_cycle,deleted_at)"
    )
    .is("deleted_at", null)
    .order("name");

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold tracking-tight">Proveedores</h1>
      <p className="mt-1 text-sm text-muted">
        A quién le contratamos, en qué condiciones y qué nos cuesta. Los costos son netos
        de Nova — nunca se informan al cliente.
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {(providers ?? []).map((p) => {
            const assets = ((p.assets ?? []) as Asset[]).filter(
              (a) => !(a as Asset & { deleted_at: string | null }).deleted_at
            );
            const totals = assets.reduce<Record<string, number>>((acc, a) => {
              const m = monthly(a.cost, a.billing_cycle);
              if (m > 0) acc[a.currency] = (acc[a.currency] ?? 0) + m;
              return acc;
            }, {});

            return (
              <div key={p.id} className="rounded-[18px] border border-line bg-ink-2 p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="font-display text-base font-semibold">
                      {p.name}
                      <span
                        className={
                          p.billing_model === "pago"
                            ? "ml-2 rounded-full bg-ink-3 px-2 py-0.5 text-xs font-normal text-cream"
                            : "ml-2 rounded-full bg-accent-dim px-2 py-0.5 text-xs font-normal text-accent"
                        }
                      >
                        {p.billing_model}
                      </span>
                    </h2>
                    <p className="mt-1 text-xs text-muted">
                      {p.category}
                      {p.website ? ` · ${p.website.replace("https://", "")}` : ""} ·{" "}
                      {assets.length} activo{assets.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="text-right">
                    {Object.entries(totals).length === 0 ? (
                      <p className="text-xs text-muted">sin costo recurrente</p>
                    ) : (
                      Object.entries(totals).map(([cur, m]) => (
                        <p key={cur} className="font-display text-sm text-accent">
                          {cur} {m.toFixed(0)}/mes
                          <span className="ml-2 text-xs text-muted">
                            {(m * 12).toFixed(0)}/año
                          </span>
                        </p>
                      ))
                    )}
                  </div>
                </div>

                {p.contract_context && (
                  <p className="mt-3 text-sm text-cream">{p.contract_context}</p>
                )}

                <details className="mt-3">
                  <summary className="cursor-pointer text-xs text-muted hover:text-accent">
                    Condiciones de pago
                  </summary>
                  <form
                    action={updateProvider.bind(null, p.id)}
                    className="mt-3 grid gap-3 sm:grid-cols-2"
                  >
                    <label className={`${labelCls} sm:col-span-2`}>
                      Qué le contratamos
                      <textarea
                        name="contract_context"
                        rows={2}
                        defaultValue={p.contract_context ?? ""}
                        className={inputCls}
                      />
                    </label>
                    <label className={labelCls}>
                      Modelo
                      <select
                        name="billing_model"
                        defaultValue={p.billing_model}
                        className={inputCls}
                      >
                        {MODELS.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className={labelCls}>
                      Forma de pago
                      <input
                        name="payment_method"
                        defaultValue={p.payment_method ?? ""}
                        className={inputCls}
                      />
                    </label>
                    <label className={labelCls}>
                      Condiciones
                      <input
                        name="payment_terms"
                        defaultValue={p.payment_terms ?? ""}
                        className={inputCls}
                      />
                    </label>
                    <label className={labelCls}>
                      Referencia de cuenta
                      <input
                        name="account_reference"
                        defaultValue={p.account_reference ?? ""}
                        className={inputCls}
                      />
                    </label>
                    <button
                      type="submit"
                      className="mt-1 rounded-lg bg-accent px-4 py-2 font-display text-sm font-semibold text-ink hover:opacity-90 sm:col-span-2"
                    >
                      Guardar condiciones
                    </button>
                  </form>
                </details>
              </div>
            );
          })}
        </div>

        <form
          action={createProvider}
          className="h-fit rounded-[18px] border border-line bg-ink-2 p-5"
        >
          <h2 className="font-display text-base font-semibold">Nuevo proveedor</h2>

          <label className={`${labelCls} mt-4`}>
            Nombre *
            <input name="name" required className={inputCls} />
          </label>

          <label className={`${labelCls} mt-3`}>
            Sitio
            <input name="website" type="url" className={inputCls} />
          </label>

          <label className={`${labelCls} mt-3`}>
            Categoría
            <select name="category" defaultValue="otro" className={inputCls}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          <label className={`${labelCls} mt-3`}>
            Modelo
            <select name="billing_model" defaultValue="pago" className={inputCls}>
              {MODELS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>

          <label className={`${labelCls} mt-3`}>
            Qué le contratamos
            <textarea name="contract_context" rows={2} className={inputCls} />
          </label>

          <label className={`${labelCls} mt-3`}>
            Forma de pago
            <input name="payment_method" className={inputCls} />
          </label>

          <label className={`${labelCls} mt-3`}>
            Condiciones
            <input name="payment_terms" className={inputCls} />
          </label>

          <label className={`${labelCls} mt-3`}>
            Referencia de cuenta
            <input name="account_reference" className={inputCls} />
          </label>

          <label className={`${labelCls} mt-3`}>
            Moneda
            <select name="currency" defaultValue="USD" className={inputCls}>
              <option value="USD">USD</option>
              <option value="UYU">UYU</option>
            </select>
          </label>

          <button
            type="submit"
            className="mt-5 w-full rounded-lg bg-accent px-4 py-2 font-display text-sm font-semibold text-ink hover:opacity-90"
          >
            Crear proveedor
          </button>
        </form>
      </div>
    </div>
  );
}
