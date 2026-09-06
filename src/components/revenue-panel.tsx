import { SubmitButton } from "./submit-button";
import {
  createService,
  createCharge,
  setConfirmation,
  setServiceBilling,
  setChargeBilling,
  deleteCharge,
  archiveService,
  setBillingMode,
} from "@/app/(app)/proyectos/[id]/revenue-actions";

const inputCls =
  "mt-1 w-full rounded-lg border border-line-2 bg-ink px-3 py-2 text-sm text-cream outline-none focus:border-accent";
const labelCls = "block text-xs font-medium uppercase tracking-wide text-muted";

export type Schedule = {
  service_id: string;
  concept: string;
  amount: number | null;
  currency: string;
  net_cost: number | null;
  net_currency: string;
  frequency: string;
  confirmation_status: string;
  billing_status: string;
  lead_days: number;
  billing_mode: string;
  effective_first_charge: string | null;
  anchor_asset: string | null;
  anchor_expires_at: string | null;
  renewal_date: string | null;
  confirm_by: string | null;
  days_to_confirm: number | null;
};

export type Charge = {
  id: string;
  concept: string;
  amount: number;
  currency: string;
  charge_date: string;
  billing_status: string;
};

const money = (n: number | null, cur: string) =>
  n === null ? "—" : `${cur} ${Number(n).toLocaleString("es-UY")}`;

function Chip({ label, tone }: { label: string; tone: "ok" | "warn" | "idle" }) {
  const cls =
    tone === "ok"
      ? "bg-accent-dim text-accent"
      : tone === "warn"
        ? "bg-violet/20 text-violet"
        : "bg-ink-3 text-muted";
  return <span className={`rounded-full px-2.5 py-0.5 text-xs ${cls}`}>{label}</span>;
}

export function RevenuePanel({
  projectId,
  services,
  charges,
  assets,
  catalog,
}: {
  projectId: string;
  services: Schedule[];
  charges: Charge[];
  assets: { id: string; name: string; expires_at: string | null }[];
  catalog: { id: string; concept: string; reference_price: number | null; currency: string; kind: string }[];
}) {
  const recurring = catalog.filter((c) => c.kind === "recurrente");
  const oneOff = catalog.filter((c) => c.kind === "unico");

  return (
    <div className="space-y-6">
      {/* ---------------- Anualidades y servicios ---------------- */}
      <div className="rounded-[18px] border border-line bg-ink-2">
        <div className="border-b border-line px-5 py-4">
          <h2 className="font-display text-base font-semibold">Anualidades y servicios</h2>
          <p className="mt-1 text-xs text-muted">
            La fecha de confirmación se deriva del vencimiento del activo ancla.
          </p>
        </div>

        <ul>
          {services.map((s) => (
            <li key={s.service_id} className="border-b border-line px-5 py-4 last:border-0">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="font-medium">{s.concept}</p>
                  <p className="mt-0.5 text-sm">
                    <span className="text-accent">{money(s.amount, s.currency)}</span>
                    <span className="text-xs text-muted"> al cliente / {s.frequency}</span>
                    {s.net_cost !== null && Number(s.net_cost) > 0 && (
                      <>
                        <span className="mx-2 text-muted">·</span>
                        <span className="text-cream">
                          {money(s.net_cost, s.net_currency)}
                        </span>
                        <span className="text-xs text-muted"> costo neto</span>
                      </>
                    )}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {s.anchor_asset
                      ? `Ancla: ${s.anchor_asset} · renueva ${s.renewal_date ?? "—"}`
                      : `Renueva ${s.renewal_date ?? "sin fecha"}`}
                    {s.billing_mode === "vencido" && s.effective_first_charge
                      ? ` · primer cobro ${s.effective_first_charge}`
                      : ""}
                  </p>
                  {s.confirm_by && (s.frequency === "anual" || s.frequency === "semestral") && (
                    <p className="mt-1 text-xs">
                      <span className={
                        (s.days_to_confirm ?? 99) <= 15 ? "text-violet" : "text-muted"
                      }>
                        Confirmar antes del {s.confirm_by}
                        {s.days_to_confirm !== null &&
                          ` · ${s.days_to_confirm >= 0 ? `faltan ${s.days_to_confirm}` : `vencido hace ${-s.days_to_confirm}`} d`}
                      </span>
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Chip
                      label={`confirmación: ${s.confirmation_status}`}
                      tone={
                        s.confirmation_status === "confirmada"
                          ? "ok"
                          : s.confirmation_status === "rechazada"
                            ? "warn"
                            : "idle"
                      }
                    />
                    <Chip
                      label={`cobro: ${s.billing_status}`}
                      tone={s.billing_status === "cobrado" ? "ok" : "idle"}
                    />
                    <Chip label={s.billing_mode} tone="idle" />
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap gap-3 text-xs">
                  {s.confirmation_status !== "confirmada" && (
                    <form action={setConfirmation.bind(null, projectId, s.service_id, "confirmada")}>
                      <SubmitButton className="text-accent hover:underline" pendingLabel="…">
                        Confirmó
                      </SubmitButton>
                    </form>
                  )}
                  {s.confirmation_status !== "rechazada" && (
                    <form action={setConfirmation.bind(null, projectId, s.service_id, "rechazada")}>
                      <SubmitButton className="text-muted hover:text-violet" pendingLabel="…">
                        No sigue
                      </SubmitButton>
                    </form>
                  )}
                  {s.billing_status === "pendiente" ? (
                    <form action={setServiceBilling.bind(null, projectId, s.service_id, "cobrado")}>
                      <SubmitButton className="text-accent hover:underline" pendingLabel="…">
                        Marcar cobrado
                      </SubmitButton>
                    </form>
                  ) : (
                    <form action={setServiceBilling.bind(null, projectId, s.service_id, "pendiente")}>
                      <SubmitButton className="text-muted hover:text-cream" pendingLabel="…">
                        Deshacer cobro
                      </SubmitButton>
                    </form>
                  )}
                  <form
                    action={setBillingMode.bind(
                      null,
                      projectId,
                      s.service_id,
                      s.billing_mode === "vencido" ? "adelantado" : "vencido"
                    )}
                  >
                    <SubmitButton className="text-muted hover:text-cream" pendingLabel="…">
                      {s.billing_mode === "vencido" ? "Pasar a adelantado" : "Pasar a vencido"}
                    </SubmitButton>
                  </form>
                  <form action={archiveService.bind(null, projectId, s.service_id)}>
                    <SubmitButton className="text-muted hover:text-violet" pendingLabel="…">
                      Archivar
                    </SubmitButton>
                  </form>
                </div>
              </div>
            </li>
          ))}
          {services.length === 0 && (
            <li className="px-5 py-6 text-center text-sm text-muted">
              Sin anualidades. Agregá una para empezar a medir el margen.
            </li>
          )}
        </ul>

        <details className="border-t border-line px-5 py-4">
          <summary className="cursor-pointer text-sm text-accent">+ Nueva anualidad o servicio</summary>
          <form action={createService.bind(null, projectId)} className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className={`${labelCls} sm:col-span-2`}>
              Concepto
              <input
                name="concept"
                required
                list="catalogo-recurrente"
                defaultValue={recurring[0]?.concept ?? ""}
                className={inputCls}
              />
              <datalist id="catalogo-recurrente">
                {recurring.map((c) => (
                  <option key={c.id} value={c.concept} />
                ))}
              </datalist>
            </label>

            <label className={labelCls}>
              Precio al cliente
              <input
                name="amount"
                type="number"
                step="0.01"
                required
                defaultValue={recurring[0]?.reference_price ?? ""}
                className={inputCls}
              />
            </label>

            <label className={labelCls}>
              Moneda
              <select name="currency" defaultValue="USD" className={inputCls}>
                <option value="USD">USD</option>
                <option value="UYU">UYU</option>
              </select>
            </label>

            <label className={labelCls}>
              Frecuencia
              <select name="frequency" defaultValue="anual" className={inputCls}>
                <option value="anual">anual</option>
                <option value="semestral">semestral</option>
                <option value="trimestral">trimestral</option>
                <option value="mensual">mensual</option>
              </select>
            </label>

            <label className={labelCls}>
              Modalidad de cobro
              <select name="billing_mode" defaultValue="adelantado" className={inputCls}>
                <option value="adelantado">Adelantado — cobro el período que empieza</option>
                <option value="vencido">Vencido — cobro el período transcurrido</option>
              </select>
            </label>

            <label className={labelCls}>
              Días de anticipación
              <input name="lead_days" type="number" defaultValue={45} className={inputCls} />
            </label>

            <label className={`${labelCls} sm:col-span-2`}>
              Activo ancla <span className="normal-case">(su vencimiento gobierna el ciclo)</span>
              <select name="anchor_asset_id" defaultValue="" className={inputCls}>
                <option value="">— sin ancla, uso fecha manual —</option>
                {assets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {a.expires_at ? ` (vence ${a.expires_at})` : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className={`${labelCls} sm:col-span-2`}>
              Primer cobro <span className="normal-case">(opcional: si el primer período no se cobró)</span>
              <input name="first_charge_date" type="date" className={inputCls} />
            </label>

            <label className={`${labelCls} sm:col-span-2`}>
              Fecha de renovación manual <span className="normal-case">(solo si no hay ancla)</span>
              <input name="next_billing_date" type="date" className={inputCls} />
            </label>

            <SubmitButton
              className="rounded-lg bg-accent px-4 py-2 font-display text-sm font-semibold text-ink hover:opacity-90 sm:col-span-2"
              pendingLabel="Creando…"
            >
              Crear servicio
            </SubmitButton>
          </form>
        </details>
      </div>

      {/* ---------------- Cargos únicos ---------------- */}
      <div className="rounded-[18px] border border-line bg-ink-2">
        <div className="border-b border-line px-5 py-4">
          <h2 className="font-display text-base font-semibold">Cargos únicos</h2>
          <p className="mt-1 text-xs text-muted">
            Desarrollo, creación y extras. Impactan en el año de su fecha.
          </p>
        </div>

        <ul>
          {charges.map((c) => (
            <li
              key={c.id}
              className="flex flex-col gap-2 border-b border-line px-5 py-3 text-sm last:border-0 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <span className="font-medium">{c.concept}</span>
                <span className="ml-2 text-accent">{money(c.amount, c.currency)}</span>
                <span className="ml-2 text-xs text-muted">{c.charge_date}</span>
                <Chip
                  label={c.billing_status}
                  tone={c.billing_status === "cobrado" ? "ok" : "idle"}
                />
              </div>
              <div className="flex shrink-0 gap-3 text-xs">
                {c.billing_status === "pendiente" ? (
                  <form action={setChargeBilling.bind(null, projectId, c.id, "cobrado")}>
                    <SubmitButton className="text-accent hover:underline" pendingLabel="…">
                      Marcar cobrado
                    </SubmitButton>
                  </form>
                ) : (
                  <form action={setChargeBilling.bind(null, projectId, c.id, "pendiente")}>
                    <SubmitButton className="text-muted hover:text-cream" pendingLabel="…">
                      Deshacer
                    </SubmitButton>
                  </form>
                )}
                <form action={deleteCharge.bind(null, projectId, c.id)}>
                  <SubmitButton className="text-muted hover:text-violet" pendingLabel="…">
                    Eliminar
                  </SubmitButton>
                </form>
              </div>
            </li>
          ))}
          {charges.length === 0 && (
            <li className="px-5 py-6 text-center text-sm text-muted">
              Sin cargos únicos. Cargá acá el desarrollo o la creación del sitio.
            </li>
          )}
        </ul>

        <details className="border-t border-line px-5 py-4">
          <summary className="cursor-pointer text-sm text-accent">+ Nuevo cargo único</summary>
          <form action={createCharge.bind(null, projectId)} className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className={`${labelCls} sm:col-span-2`}>
              Concepto
              <input
                name="concept"
                required
                list="catalogo-unico"
                defaultValue={oneOff[0]?.concept ?? ""}
                className={inputCls}
              />
              <datalist id="catalogo-unico">
                {oneOff.map((c) => (
                  <option key={c.id} value={c.concept} />
                ))}
              </datalist>
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
              </select>
            </label>

            <label className={`${labelCls} sm:col-span-2`}>
              Fecha
              <input
                name="charge_date"
                type="date"
                defaultValue={new Date().toISOString().slice(0, 10)}
                className={inputCls}
              />
            </label>

            <SubmitButton
              className="rounded-lg bg-accent px-4 py-2 font-display text-sm font-semibold text-ink hover:opacity-90 sm:col-span-2"
              pendingLabel="Creando…"
            >
              Crear cargo
            </SubmitButton>
          </form>
        </details>
      </div>
    </div>
  );
}
