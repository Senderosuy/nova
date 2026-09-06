const usd = (n: number) =>
  Number(n).toLocaleString("es-UY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export type Investment = {
  invested_total_usd: number;
  invested_year_usd: number;
  returned_total_usd: number;
  net_position_usd: number;
};

/**
 * Para productos propios de Nova el costo no es un problema: es inversión.
 * Se muestra lo invertido, lo recuperado y la posición neta, sin advertencias.
 */
export function InvestmentPanel({ inv, year }: { inv: Investment; year: number }) {
  const recovered =
    Number(inv.invested_total_usd) > 0
      ? (Number(inv.returned_total_usd) / Number(inv.invested_total_usd)) * 100
      : null;

  return (
    <div className="rounded-[18px] border border-violet/30 bg-ink-2 p-5">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <h2 className="font-display text-base font-semibold">
          Inversión de Nova
          <span className="ml-2 rounded-full bg-violet/20 px-2 py-0.5 text-xs font-normal text-violet">
            producto propio
          </span>
        </h2>
        <span className="text-xs text-muted">movimientos ya ocurridos, en USD</span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">Invertido total</p>
          <p className="mt-1 font-display text-xl font-semibold text-cream">
            {usd(inv.invested_total_usd)}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">Invertido {year}</p>
          <p className="mt-1 font-display text-xl font-semibold text-cream">
            {usd(inv.invested_year_usd)}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">Recuperado</p>
          <p className="mt-1 font-display text-xl font-semibold text-accent">
            {usd(inv.returned_total_usd)}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">Posición neta</p>
          <p
            className={`mt-1 font-display text-xl font-semibold ${
              Number(inv.net_position_usd) >= 0 ? "text-accent" : "text-violet"
            }`}
          >
            {usd(inv.net_position_usd)}
          </p>
        </div>
      </div>

      <p className="mt-4 text-xs text-muted">
        {recovered !== null && recovered > 0
          ? `Recuperado el ${recovered.toFixed(0)}% de la inversión.`
          : "Todavía sin retorno. El costo acumulado es la inversión de Nova en el producto."}
      </p>
    </div>
  );
}
