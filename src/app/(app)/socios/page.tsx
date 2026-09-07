import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { SubmitButton } from "@/components/submit-button";
import { registerRepayment, deleteRepayment, updateCascadeSettings } from "./actions";

const inputCls =
  "mt-1 w-full rounded-lg border border-line-2 bg-ink px-3 py-2 text-sm text-cream outline-none focus:border-accent";
const labelCls = "block text-xs font-medium uppercase tracking-wide text-muted";

const usd = (n: number | null | undefined) =>
  n === null || n === undefined
    ? "—"
    : `USD ${Number(n).toLocaleString("es-UY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const KIND: Record<string, string> = {
  capital: "aporta capital",
  trabajo: "aporta trabajo",
  capital_y_trabajo: "aporta capital y trabajo",
};

export default async function SociosPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const [
    { data: accounts },
    { data: repayments },
    { data: sust },
    { data: settings },
    { data: waterfall },
    { data: methods },
  ] = await Promise.all([
    supabase.from("partner_account").select("*").order("contributed_usd", { ascending: false }),
    supabase
      .from("partner_repayments")
      .select("id,partner_id,amount,currency,paid_on,notes,kind,period")
      .order("paid_on", { ascending: false }),
    supabase.from("sustainability").select("*").single(),
    supabase.from("app_settings").select("key,value"),
    supabase.from("profit_waterfall").select("*").single(),
    supabase
      .from("payment_methods")
      .select("label,owner_partner_id")
      .not("owner_partner_id", "is", null),
  ]);

  const setting = (k: string, fallback: number) =>
    Number((settings ?? []).find((s) => s.key === k)?.value ?? fallback);

  const reserveMonths = setting("reserve_months", 2);
  const amortPct = setting("amortization_pct", 30);

  const fixed = Number(sust?.fixed_monthly_usd ?? 0);
  const revenue = Number(sust?.recurring_revenue_usd ?? 0);
  const gap = Number(sust?.gap_usd ?? 0);
  const coverage = Number(sust?.coverage_pct ?? 0);
  const projRevenue = Number(sust?.projected_revenue_usd ?? 0);
  const projCoverage = Number(sust?.projected_coverage_pct ?? 0);
  const projGap = Number(sust?.projected_gap_usd ?? 0);
  const reserveTarget = Number(sust?.reserve_target_usd ?? 0);

  // Cuántas anualidades de referencia faltan para cerrar la brecha
  const annualPrice = 160;
  const annualitiesNeeded = gap < 0 ? Math.ceil((-gap * 12) / annualPrice) : 0;

  return (
    <div>
      <h1 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">
        Socios y sustentabilidad
      </h1>
      <p className="mt-1 text-sm text-muted">
        Lo que Nova gasta hoy se paga con medios personales de un socio: eso es aporte, no
        dinero de la empresa. El aporte se deriva solo de los egresos, sin cargarlo aparte.
      </p>

      {/* ---------- Autosustentabilidad ---------- */}
      <div className="mt-6 rounded-[18px] border border-line bg-ink-2 p-5">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
          <h2 className="font-display text-base font-semibold">
            ¿Nova se sostiene sola?
          </h2>
          <span className="text-xs text-muted">
            comprometido = el cliente ya confirmó que sigue
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">Gastos fijos</p>
            <p className="mt-1 font-display text-xl font-semibold text-cream">
              {usd(fixed)}<span className="text-sm font-normal text-muted">/mes</span>
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">Ingreso comprometido</p>
            <p className="mt-1 font-display text-xl font-semibold text-accent">
              {usd(revenue)}<span className="text-sm font-normal text-muted">/mes</span>
            </p>
            {projRevenue > revenue && (
              <p className="text-xs text-muted">
                {usd(projRevenue)} si confirman todos
              </p>
            )}
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">Brecha</p>
            <p
              className={`mt-1 font-display text-xl font-semibold ${
                gap >= 0 ? "text-accent" : "text-violet"
              }`}
            >
              {usd(gap)}<span className="text-sm font-normal text-muted">/mes</span>
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">Cobertura</p>
            <p
              className={`mt-1 font-display text-xl font-semibold ${
                coverage >= 100 ? "text-accent" : "text-cream"
              }`}
            >
              {coverage}%
            </p>
          </div>
        </div>

        <div className="mt-4 h-2 overflow-hidden rounded-full bg-ink">
          <div
            className={coverage >= 100 ? "h-full bg-accent" : "h-full bg-violet"}
            style={{ width: `${Math.min(coverage, 100)}%` }}
          />
        </div>

        {projCoverage > coverage && (
          <p className="mt-2 text-xs text-muted">
            Proyectado con todas las anualidades confirmadas: {projCoverage}% de
            cobertura, brecha {usd(projGap)}/mes.
          </p>
        )}

        <p className="mt-3 text-sm text-muted">
          {gap >= 0 ? (
            <>
              Nova cubre sus gastos fijos con ingresos recurrentes. El excedente alimenta
              la reserva y la amortización.
            </>
          ) : (
            <>
              Faltan <span className="text-cream">{usd(-gap)}</span> por mes para el punto
              de equilibrio: unas{" "}
              <span className="text-cream">{annualitiesNeeded} anualidades</span> de USD{" "}
              {annualPrice} más, o el equivalente en abonos mensuales.
            </>
          )}
        </p>
      </div>

      {/* ---------- Cascada ---------- */}
      <div className="mt-6 rounded-[18px] border border-line bg-ink-2 p-5">
        <h2 className="font-display text-base font-semibold">
          Cascada de utilidades
        </h2>
        <p className="mt-1 text-sm text-muted">
          Cada escalón cobra solo si el anterior está cubierto.
        </p>

        <ol className="mt-4 space-y-3 text-sm">
          <li className="flex gap-3">
            <span className="font-display text-accent">1</span>
            <span>
              <span className="font-medium">Reserva de caja</span> — retener{" "}
              {reserveMonths} mes{reserveMonths === 1 ? "" : "es"} de gastos fijos:{" "}
              <span className="text-cream">{usd(reserveTarget)}</span>
            </span>
          </li>
          <li className="flex gap-3">
            <span className="font-display text-accent">2</span>
            <span>
              <span className="font-medium">Amortización</span> — {amortPct}% del excedente
              devuelve el aporte del socio
            </span>
          </li>
          <li className="flex gap-3">
            <span className="font-display text-accent">3</span>
            <span>
              <span className="font-medium">Reparto</span> — el resto, según participación
            </span>
          </li>
        </ol>

        <div className="mt-5 rounded-lg border border-line bg-ink p-4">
          <p className="text-xs uppercase tracking-wide text-muted">
            Situación actual
          </p>
          <dl className="mt-2 space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Resultado acumulado</dt>
              <dd
                className={
                  Number(waterfall?.accumulated_result_usd ?? 0) >= 0
                    ? "text-accent"
                    : "text-violet"
                }
              >
                {usd(waterfall?.accumulated_result_usd)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Reserva a cubrir</dt>
              <dd>{usd(waterfall?.reserve_target_usd)}</dd>
            </div>
            <div className="flex justify-between border-t border-line pt-1">
              <dt className="text-muted">Excedente disponible</dt>
              <dd>{usd(waterfall?.surplus_usd)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">→ a amortizar ({amortPct}%)</dt>
              <dd className="text-accent">{usd(waterfall?.to_amortize_usd)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">→ a repartir</dt>
              <dd className="text-accent">{usd(waterfall?.to_distribute_usd)}</dd>
            </div>
          </dl>
          {Number(waterfall?.surplus_usd ?? 0) === 0 && (
            <p className="mt-3 text-xs text-muted">
              Todavía no hay excedente: primero hay que cubrir el resultado negativo
              acumulado y la reserva de caja.
            </p>
          )}
          {Number(waterfall?.to_distribute_usd ?? 0) > 0 && (
            <p className="mt-3 text-xs text-muted">
              El reparto se divide según la participación de cada socio.
            </p>
          )}
        </div>

        <form
          action={updateCascadeSettings}
          className="mt-5 flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-end"
        >
          <label className={labelCls}>
            Meses de reserva
            <input
              name="reserve_months"
              type="number"
              min="0"
              step="1"
              defaultValue={reserveMonths}
              className={inputCls + " w-full sm:w-32"}
            />
          </label>
          <label className={labelCls}>
            % de amortización
            <input
              name="amortization_pct"
              type="number"
              min="0"
              max="100"
              step="1"
              defaultValue={amortPct}
              className={inputCls + " w-full sm:w-32"}
            />
          </label>
          <SubmitButton
            className="rounded-lg border border-line-2 px-4 py-2 text-sm text-muted hover:border-accent hover:text-accent"
            pendingLabel="Guardando…"
          >
            Guardar
          </SubmitButton>
        </form>
      </div>

      {/* ---------- Socios ---------- */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {(accounts ?? []).map((a) => {
          const own = (methods ?? []).filter((m) => m.owner_partner_id === a.partner_id);
          const mine = (repayments ?? []).filter((r) => r.partner_id === a.partner_id);

          return (
            <div key={a.partner_id} className="rounded-[18px] border border-line bg-ink-2 p-5">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="font-display text-base font-semibold">
                    {a.name}
                    {a.is_admin && (
                      <span className="ml-2 rounded-full bg-accent-dim px-2 py-0.5 text-xs font-normal text-accent">
                        administrador
                      </span>
                    )}
                  </h2>
                  <p className="mt-1 text-xs text-muted">
                    {a.share_pct}% · {KIND[a.contribution_kind] ?? a.contribution_kind}
                  </p>
                </div>
              </div>

              <dl className="mt-4 space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted">Aportado</dt>
                  <dd>{usd(a.contributed_usd)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">Amortizado</dt>
                  <dd className="text-accent">{usd(a.repaid_usd)}</dd>
                </div>
                <div className="flex justify-between border-t border-line pt-1">
                  <dt className="font-medium">Nova le debe</dt>
                  <dd
                    className={`font-display font-semibold ${
                      Number(a.balance_usd) > 0 ? "text-violet" : "text-muted"
                    }`}
                  >
                    {usd(a.balance_usd)}
                  </dd>
                </div>
              </dl>

              {own.length > 0 && (
                <p className="mt-3 text-xs text-muted">
                  Medios personales: {own.map((m) => m.label).join(", ")}
                </p>
              )}

              {mine.length > 0 && (
                <ul className="mt-3 space-y-1 border-t border-line pt-3 text-xs">
                  {mine.map((r) => (
                    <li key={r.id} className="flex items-center justify-between">
                      <span className="text-muted">
                        {r.paid_on} · {r.currency} {Number(r.amount).toLocaleString("es-UY")}
                        {r.kind === "utilidad" ? " · utilidad" : " · amortización"}
                      </span>
                      <form action={deleteRepayment.bind(null, r.id)}>
                        <SubmitButton className="text-muted hover:text-violet" pendingLabel="…">
                          Eliminar
                        </SubmitButton>
                      </form>
                    </li>
                  ))}
                </ul>
              )}

              {(a.distributed_usd ?? 0) > 0 && (
                <p className="mt-2 text-xs text-muted">
                  Utilidades retiradas: {usd(a.distributed_usd)}
                </p>
              )}

              {(
                <details className="mt-3 border-t border-line pt-3">
                  <summary className="cursor-pointer text-xs text-accent">
                    Registrar retiro
                  </summary>
                  <form
                    action={registerRepayment.bind(null, a.partner_id)}
                    className="mt-3 grid gap-3 sm:grid-cols-2"
                  >
                    <label className={`${labelCls} sm:col-span-2`}>
                      Tipo de retiro
                      <select name="kind" defaultValue="amortizacion" className={inputCls}>
                        <option value="amortizacion">
                          Amortización — devuelve capital, baja el saldo
                        </option>
                        <option value="utilidad">
                          Utilidad — reparto de ganancias
                        </option>
                      </select>
                    </label>

                    <label className={labelCls}>
                      Importe
                      <input name="amount" type="number" step="0.01" required className={inputCls} />
                    </label>
                    <label className={labelCls}>
                      Moneda
                      <select name="currency" defaultValue="USD" className={inputCls}>
                        <option value="USD">USD</option>
                        <option value="UYU">UYU</option>
                <option value="BRL">BRL</option>
                      </select>
                    </label>
                    <label className={labelCls}>
                      Período <span className="normal-case">(opcional)</span>
                      <input name="period" placeholder="2027-01" className={inputCls} />
                    </label>

                    <label className={labelCls}>
                      Fecha
                      <input
                        name="paid_on"
                        type="date"
                        defaultValue={new Date().toISOString().slice(0, 10)}
                        className={inputCls}
                      />
                    </label>
                    <SubmitButton
                      className="rounded-lg bg-accent px-4 py-2 font-display text-sm font-semibold text-ink hover:opacity-90 sm:col-span-2"
                      pendingLabel="Registrando…"
                    >
                      Registrar retiro
                    </SubmitButton>
                  </form>
                </details>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
