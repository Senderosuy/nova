import { updateAsset, deleteAsset } from "@/app/(app)/activos/actions";
import { SubmitButton } from "./submit-button";

const TYPES = ["dominio", "hosting", "herramienta", "licencia", "otro"] as const;
const CYCLES = ["mensual", "trimestral", "semestral", "anual", "unico", "gratis"] as const;

const inputCls =
  "mt-1 w-full rounded-lg border border-line-2 bg-ink px-3 py-2 text-sm text-cream outline-none focus:border-accent";
const labelCls = "block text-xs font-medium uppercase tracking-wide text-muted";

export type EditableAsset = {
  id: string;
  type: string;
  name: string;
  provider: string | null;
  provider_id: string | null;
  identifier: string | null;
  ownership: string;
  cost: number | null;
  currency: string;
  billing_cycle: string;
  expires_at: string | null;
  paid_at: string | null;
  notes: string | null;
};

/**
 * Formulario de edición de un activo, plegable.
 * Se usa tanto en /activos como en el detalle de proyecto.
 */
export function AssetEditor({
  asset,
  providers,
}: {
  asset: EditableAsset;
  providers: { id: string; name: string }[];
}) {
  return (
    <details className="group">
      <summary className="cursor-pointer list-none text-xs text-muted hover:text-accent">
        Editar
      </summary>

      <div className="mt-3 rounded-lg border border-line bg-ink p-4">
        <form
          action={updateAsset.bind(null, asset.id)}
          className="grid gap-3 sm:grid-cols-2"
        >
          <label className={`${labelCls} sm:col-span-2`}>
            Nombre
            <input name="name" defaultValue={asset.name} required className={inputCls} />
          </label>

          <label className={labelCls}>
            Tipo
            <select name="type" defaultValue={asset.type} className={inputCls}>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>

          <label className={labelCls}>
            Proveedor
            <select
              name="provider_id"
              defaultValue={asset.provider_id ?? ""}
              className={inputCls}
            >
              <option value="">— sin proveedor —</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          <label className={labelCls}>
            Identificador
            <input
              name="identifier"
              defaultValue={asset.identifier ?? ""}
              className={inputCls}
            />
          </label>

          <label className={labelCls}>
            Propiedad
            <select name="ownership" defaultValue={asset.ownership} className={inputCls}>
              <option value="nova">Nova</option>
              <option value="cliente">Cliente</option>
            </select>
          </label>

          <label className={labelCls}>
            Costo neto
            <input
              name="cost"
              type="number"
              step="0.01"
              defaultValue={asset.cost ?? ""}
              className={inputCls}
            />
          </label>

          <label className={labelCls}>
            Moneda
            <select name="currency" defaultValue={asset.currency} className={inputCls}>
              <option value="USD">USD</option>
              <option value="UYU">UYU</option>
            </select>
          </label>

          <label className={labelCls}>
            Ciclo
            <select
              name="billing_cycle"
              defaultValue={asset.billing_cycle}
              className={inputCls}
            >
              {CYCLES.map((c) => (
                <option key={c} value={c}>
                  {c === "unico" ? "pago único" : c}
                </option>
              ))}
            </select>
          </label>

          <label className={labelCls}>
            Vencimiento
            <input
              name="expires_at"
              type="date"
              defaultValue={asset.expires_at ?? ""}
              className={inputCls}
            />
          </label>

          <label className={`${labelCls} sm:col-span-2`}>
            Fecha de pago <span className="normal-case">(solo para pago único)</span>
            <input
              name="paid_at"
              type="date"
              defaultValue={asset.paid_at ?? ""}
              className={inputCls}
            />
          </label>

          <label className={`${labelCls} sm:col-span-2`}>
            Notas
            <textarea
              name="notes"
              rows={2}
              defaultValue={asset.notes ?? ""}
              className={inputCls}
            />
          </label>

          <SubmitButton
            className="rounded-lg bg-accent px-4 py-2 font-display text-sm font-semibold text-ink hover:opacity-90"
            pendingLabel="Guardando…"
          >
            Guardar cambios
          </SubmitButton>
        </form>

        <form action={deleteAsset.bind(null, asset.id)} className="mt-3 border-t border-line pt-3">
          <SubmitButton
            className="rounded-lg border border-violet/40 px-4 py-2 text-sm text-violet hover:bg-violet/10"
            pendingLabel="Archivando…"
            title="Archiva el activo y cierra sus asignaciones. No borra el historial."
          >
            Eliminar activo
          </SubmitButton>
          <span className="ml-3 text-xs text-muted">
            Lo quita de los proyectos y del costeo. El historial se conserva.
          </span>
        </form>
      </div>
    </details>
  );
}
