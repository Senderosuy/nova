const usd = (n: number | null | undefined) =>
  n === null || n === undefined
    ? "—"
    : Number(n).toLocaleString("es-UY", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

export type SpendGroup = {
  provider: string;
  items_count: number;
  usd_month: number;
  usd_year: number;
  next_due: string | null;
};

export type SpendItem = {
  item_id: string;
  concept: string;
  provider: string;
  cycle: string;
  expires_at: string | null;
  usd_year: number;
};

const CYCLE_LABEL: Record<string, string> = {
  mensual: "por mes",
  trimestral: "por trimestre",
  semestral: "por semestre",
  anual: "por año",
  unico: "pago único",
  gratis: "sin costo",
};

/**
 * Lo que el cliente paga de su bolsillo en este proyecto.
 *
 * No entra en las cuentas de Nova, pero se administra y en muchos
 * casos se recomendó desde acá. Sirve para responderle cuando
 * pregunte qué paga y por qué: agrupado por proveedor, mensual
 * primero —que es como lo ve en su tarjeta— y con el detalle
 * disponible si quiere ir ítem por ítem.
 *
 * No se compara con lo que Nova le factura: son cosas distintas.
 */
export function ClientSpendPanel({
  groups,
  items,
}: {
  groups: SpendGroup[];
  items: SpendItem[];
}) {
  if (groups.length === 0) return null;

  const totalMonth = groups.reduce((s, g) => s + Number(g.usd_month), 0);
  const totalYear = groups.reduce((s, g) => s + Number(g.usd_year), 0);
  const totalItems = groups.reduce((s, g) => s + Number(g.items_count), 0);

  const upcoming = groups
    .map((g) => g.next_due)
    .filter((d): d is string => Boolean(d))
    .sort()[0];

  return (
    <div className="rounded-[18px] border border-line bg-ink-2">
      <div className="flex flex-col gap-1 border-b border-line px-5 py-4 sm:flex-row sm:items-baseline sm:justify-between">
        <div>
          <h2 className="font-display text-base font-semibold">
            Lo que paga el cliente
          </h2>
          <p className="mt-1 text-xs text-muted">
            {totalItems} ítem{totalItems === 1 ? "" : "s"} que administramos, contratados
            a su nombre.
          </p>
        </div>
        <span className="text-xs text-accent">se puede compartir con el cliente</span>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2 px-5 py-4">
        <div>
          <p className="font-display text-2xl font-semibold text-cream">
            USD {usd(totalMonth)}
            <span className="text-sm font-normal text-muted">/mes</span>
          </p>
          <p className="text-xs text-muted">USD {usd(totalYear)} al año</p>
        </div>
        {upcoming && (
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">
              Próxima renovación
            </p>
            <p className="mt-0.5 text-sm">{upcoming}</p>
          </div>
        )}
      </div>

      <ul className="border-t border-line">
        {groups.map((g) => {
          const detail = items.filter((i) => i.provider === g.provider);
          return (
            <li key={g.provider} className="border-b border-line px-5 py-3 last:border-0">
              <details>
                <summary className="flex cursor-pointer items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <span className="font-medium">{g.provider}</span>
                    <span className="ml-2 text-xs text-muted">
                      {g.items_count} ítem{Number(g.items_count) === 1 ? "" : "s"}
                      {g.next_due ? ` · vence ${g.next_due}` : ""}
                    </span>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm">
                      USD {usd(g.usd_month)}
                      <span className="text-xs text-muted">/mes</span>
                    </p>
                    <p className="text-xs text-muted">USD {usd(g.usd_year)} al año</p>
                  </div>
                </summary>

                <ul className="mt-2 space-y-1 border-l-2 border-line-2 pl-3">
                  {detail.map((i) => (
                    <li key={i.item_id} className="flex justify-between gap-3 text-xs">
                      <span className="text-muted">
                        {i.concept}
                        {i.expires_at ? ` · vence ${i.expires_at}` : ""}
                      </span>
                      <span className="shrink-0">
                        USD {usd(i.usd_year)}{" "}
                        <span className="text-muted">
                          {CYCLE_LABEL[i.cycle] ?? i.cycle}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            </li>
          );
        })}
      </ul>

      <p className="border-t border-line px-5 py-3 text-xs text-muted">
        Contratado y pagado por el cliente. No forma parte de los costos ni de la
        facturación de Nova.
      </p>
    </div>
  );
}
