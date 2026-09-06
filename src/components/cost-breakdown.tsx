const usd = (n: number | null | undefined) =>
  n === null || n === undefined
    ? "—"
    : Number(n).toLocaleString("es-UY", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

export type LineItem = {
  kind: string;
  subkind: string | null;
  concept: string;
  expires_at: string | null;
  cycle: string | null;
  paid_with: string | null;
  cost_usd_year: number;
  price_usd_year: number;
  margin_usd_year: number;
};

const KIND_LABEL: Record<string, string> = {
  activo: "Activo",
  servicio: "Servicio",
  cargo: "Cargo",
};

/**
 * Desglose línea por línea: qué cuesta cada ítem y qué se cobra por él.
 * Todo normalizado a base anual en USD para poder compararlo.
 */
export function CostBreakdown({ items }: { items: LineItem[] }) {
  const cost = items.reduce((s, i) => s + Number(i.cost_usd_year), 0);
  const price = items.reduce((s, i) => s + Number(i.price_usd_year), 0);
  const margin = price - cost;
  const pct = price > 0 ? (margin / price) * 100 : null;

  // Agrupar dominios cuando son muchos: con pocos se lee mejor uno a uno
  const domains = items.filter((i) => i.kind === "activo" && i.subkind === "dominio");
  const groupDomains = domains.length > 6;
  const shown = groupDomains ? items.filter((i) => !domains.includes(i)) : items;

  const domainCost = domains.reduce((s, i) => s + Number(i.cost_usd_year), 0);

  return (
    <div className="rounded-[18px] border border-line bg-ink-2">
      <div className="flex flex-col gap-1 border-b border-line px-5 py-4 sm:flex-row sm:items-baseline sm:justify-between">
        <h2 className="font-display text-base font-semibold">
          Desglose: costo vs cobro
        </h2>
        <span className="text-xs text-muted">
          base anual en USD · interno, no se informa al cliente
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-5 py-3 font-medium">Concepto</th>
              <th className="px-4 py-3 text-right font-medium">Costo</th>
              <th className="px-4 py-3 text-right font-medium">Cobramos</th>
              <th className="px-4 py-3 text-right font-medium">Margen</th>
            </tr>
          </thead>
          <tbody>
            {groupDomains && domains.length > 0 && (
              <tr className="border-b border-line">
                <td className="px-5 py-3">
                  <span className="font-medium">Dominios ({domains.length})</span>
                  <span className="ml-2 text-xs text-muted">Activo</span>
                </td>
                <td className="px-4 py-3 text-right">{usd(domainCost)}</td>
                <td className="px-4 py-3 text-right text-muted">—</td>
                <td className="px-4 py-3 text-right text-violet">{usd(-domainCost)}</td>
              </tr>
            )}

            {shown.map((i, idx) => {
              const m = Number(i.margin_usd_year);
              return (
                <tr key={`${i.concept}-${idx}`} className="border-b border-line last:border-0">
                  <td className="px-5 py-3">
                    <span className="font-medium">{i.concept}</span>
                    <span className="ml-2 text-xs text-muted">
                      {KIND_LABEL[i.kind] ?? i.kind}
                      {i.cycle && i.cycle !== "unico" ? ` · ${i.cycle}` : ""}
                      {i.expires_at ? ` · ${i.expires_at}` : ""}
                      {i.paid_with ? ` · ${i.paid_with}` : ""}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {Number(i.cost_usd_year) > 0 ? usd(i.cost_usd_year) : <span className="text-muted">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right text-accent">
                    {Number(i.price_usd_year) > 0 ? usd(i.price_usd_year) : <span className="text-muted">—</span>}
                  </td>
                  <td
                    className={`px-4 py-3 text-right ${
                      m > 0 ? "text-accent" : m < 0 ? "text-violet" : "text-muted"
                    }`}
                  >
                    {m === 0 ? "—" : usd(m)}
                  </td>
                </tr>
              );
            })}

            {items.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-8 text-center text-muted">
                  Sin ítems. Asigná activos o cargá servicios para ver el desglose.
                </td>
              </tr>
            )}
          </tbody>

          {items.length > 0 && (
            <tfoot>
              <tr className="border-t border-line-2 font-display">
                <td className="px-5 py-3 text-xs uppercase tracking-wide text-muted">
                  Total anual
                </td>
                <td className="px-4 py-3 text-right font-semibold">{usd(cost)}</td>
                <td className="px-4 py-3 text-right font-semibold text-accent">
                  {usd(price)}
                </td>
                <td
                  className={`px-4 py-3 text-right font-semibold ${
                    margin >= 0 ? "text-accent" : "text-violet"
                  }`}
                >
                  {usd(margin)}
                  {pct !== null && (
                    <span className="ml-1 text-xs font-normal text-muted">
                      {pct.toFixed(0)}%
                    </span>
                  )}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {margin < 0 && items.length > 0 && (
        <p className="border-t border-line px-5 py-3 text-xs text-violet">
          Este proyecto cuesta más de lo que se cobra. Revisá las líneas en violeta:
          o se refacturan al cliente, o se absorben a conciencia.
        </p>
      )}
    </div>
  );
}
