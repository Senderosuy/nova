import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { SubmitButton } from "@/components/submit-button";
import { createPaymentMethod, updatePaymentMethod, togglePaymentMethod } from "./actions";

const KINDS = [
  "tarjeta",
  "cuenta_bancaria",
  "paypal",
  "transferencia",
  "efectivo",
  "otro",
] as const;

const inputCls =
  "mt-1 w-full rounded-lg border border-line-2 bg-ink px-3 py-2 text-sm text-cream outline-none focus:border-accent";
const labelCls = "block text-xs font-medium uppercase tracking-wide text-muted";

export default async function MetodosPagoPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const year = new Date().getFullYear();

  const [{ data: methods }, { data: spend }] = await Promise.all([
    supabase
      .from("payment_methods")
      .select("id,label,kind,institution,last_four,currency,notes,active")
      .order("active", { ascending: false })
      .order("label"),
    supabase
      .from("spend_by_payment_method")
      .select("payment_method_id,year,usd_total,movimientos")
      .eq("year", year),
  ]);

  const totals = new Map<string, { usd: number; n: number }>();
  for (const s of spend ?? []) {
    const cur = totals.get(s.payment_method_id) ?? { usd: 0, n: 0 };
    totals.set(s.payment_method_id, {
      usd: cur.usd + Number(s.usd_total),
      n: cur.n + Number(s.movimientos),
    });
  }

  return (
    <div>
      <h1 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">
        Métodos de pago
      </h1>
      <p className="mt-1 text-sm text-muted">
        Con qué paga Nova. Cada gasto se asocia a un método para poder responder qué se
        paga con cada tarjeta o cuenta. Se guardan solo los últimos cuatro dígitos.
      </p>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="space-y-3">
          {(methods ?? []).map((m) => {
            const t = totals.get(m.id);
            return (
              <div
                key={m.id}
                className={`rounded-[18px] border bg-ink-2 p-5 ${
                  m.active ? "border-line" : "border-line opacity-60"
                }`}
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="font-display text-base font-semibold">
                      {m.label}
                      {!m.active && (
                        <span className="ml-2 rounded-full bg-ink-3 px-2 py-0.5 text-xs font-normal text-muted">
                          inactivo
                        </span>
                      )}
                    </h2>
                    <p className="mt-1 text-xs text-muted">
                      {m.kind.replace("_", " ")}
                      {m.institution ? ` · ${m.institution}` : ""}
                      {m.last_four ? ` · ····${m.last_four}` : ""} · {m.currency}
                    </p>
                  </div>
                  <div className="text-right">
                    {t ? (
                      <>
                        <p className="font-display text-sm text-accent">
                          USD {t.usd.toLocaleString("es-UY")}
                        </p>
                        <p className="text-xs text-muted">
                          {t.n} movimiento{t.n === 1 ? "" : "s"} en {year}
                        </p>
                      </>
                    ) : (
                      <p className="text-xs text-muted">sin movimientos en {year}</p>
                    )}
                  </div>
                </div>

                <details className="mt-3">
                  <summary className="cursor-pointer text-xs text-muted hover:text-accent">
                    Editar
                  </summary>
                  <form
                    action={updatePaymentMethod.bind(null, m.id)}
                    className="mt-3 grid gap-3 sm:grid-cols-2"
                  >
                    <label className={`${labelCls} sm:col-span-2`}>
                      Etiqueta
                      <input name="label" defaultValue={m.label} required className={inputCls} />
                    </label>
                    <label className={labelCls}>
                      Tipo
                      <select name="kind" defaultValue={m.kind} className={inputCls}>
                        {KINDS.map((k) => (
                          <option key={k} value={k}>
                            {k.replace("_", " ")}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className={labelCls}>
                      Institución
                      <input
                        name="institution"
                        defaultValue={m.institution ?? ""}
                        className={inputCls}
                      />
                    </label>
                    <label className={labelCls}>
                      Últimos 4 dígitos
                      <input
                        name="last_four"
                        maxLength={4}
                        pattern="[0-9]{4}"
                        defaultValue={m.last_four ?? ""}
                        className={inputCls}
                      />
                    </label>
                    <label className={labelCls}>
                      Moneda
                      <select name="currency" defaultValue={m.currency} className={inputCls}>
                        <option value="USD">USD</option>
                        <option value="UYU">UYU</option>
                      </select>
                    </label>
                    <label className={`${labelCls} sm:col-span-2`}>
                      Notas
                      <input name="notes" defaultValue={m.notes ?? ""} className={inputCls} />
                    </label>
                    <SubmitButton
                      className="rounded-lg bg-accent px-4 py-2 font-display text-sm font-semibold text-ink hover:opacity-90"
                      pendingLabel="Guardando…"
                    >
                      Guardar
                    </SubmitButton>
                  </form>

                  <form
                    action={togglePaymentMethod.bind(null, m.id, m.active)}
                    className="mt-3"
                  >
                    <SubmitButton className="text-xs text-muted hover:text-violet" pendingLabel="…">
                      {m.active ? "Dar de baja" : "Reactivar"}
                    </SubmitButton>
                  </form>
                </details>
              </div>
            );
          })}

          {(methods ?? []).length === 0 && (
            <p className="rounded-[18px] border border-line bg-ink-2 px-5 py-8 text-center text-sm text-muted">
              Sin métodos de pago. Cargá el primero con el formulario.
            </p>
          )}
        </div>

        <form
          action={createPaymentMethod}
          className="h-fit rounded-[18px] border border-line bg-ink-2 p-5"
        >
          <h2 className="font-display text-base font-semibold">Nuevo método</h2>
          <p className="mt-1 text-xs text-muted">
            Nunca cargues el número completo de tarjeta, CVV ni vencimiento.
          </p>

          <label className={`${labelCls} mt-4`}>
            Etiqueta *
            <input
              name="label"
              required
              placeholder="BBVA Visa ····2014"
              className={inputCls}
            />
          </label>

          <label className={`${labelCls} mt-3`}>
            Tipo
            <select name="kind" defaultValue="tarjeta" className={inputCls}>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {k.replace("_", " ")}
                </option>
              ))}
            </select>
          </label>

          <label className={`${labelCls} mt-3`}>
            Institución
            <input name="institution" placeholder="BBVA" className={inputCls} />
          </label>

          <label className={`${labelCls} mt-3`}>
            Últimos 4 dígitos
            <input
              name="last_four"
              maxLength={4}
              pattern="[0-9]{4}"
              placeholder="2014"
              className={inputCls}
            />
          </label>

          <label className={`${labelCls} mt-3`}>
            Moneda habitual
            <select name="currency" defaultValue="USD" className={inputCls}>
              <option value="USD">USD</option>
              <option value="UYU">UYU</option>
            </select>
          </label>

          <label className={`${labelCls} mt-3`}>
            Notas
            <input name="notes" className={inputCls} />
          </label>

          <SubmitButton
            className="mt-5 w-full rounded-lg bg-accent px-4 py-2 font-display text-sm font-semibold text-ink hover:opacity-90"
            pendingLabel="Creando…"
          >
            Crear método
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}
