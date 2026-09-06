import Link from "next/link";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";

const usd = (n: number | null | undefined, dec = 2) =>
  n === null || n === undefined
    ? "—"
    : Number(n).toLocaleString("es-UY", {
        minimumFractionDigits: dec,
        maximumFractionDigits: dec,
      });

const MONTHS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function Card({
  label,
  value,
  hint,
  tone = "cream",
  href,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "cream" | "accent" | "violet" | "muted";
  href?: string;
}) {
  const color =
    tone === "accent"
      ? "text-accent"
      : tone === "violet"
        ? "text-violet"
        : tone === "muted"
          ? "text-muted"
          : "text-cream";

  const inner = (
    <>
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className={`mt-2 font-display text-xl font-semibold sm:text-2xl ${color}`}>
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </>
  );

  return href ? (
    <Link
      href={href}
      className="rounded-[18px] border border-line bg-ink-2 p-5 transition-colors hover:border-line-2"
    >
      {inner}
    </Link>
  ) : (
    <div className="rounded-[18px] border border-line bg-ink-2 p-5">{inner}</div>
  );
}

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

  const [
    { data: renewals },
    { data: collections },
    { data: sust },
    { data: monthly },
    { data: partners },
    { data: techStatus },
  ] = await Promise.all([
    supabase.from("upcoming_renewals").select("*").order("due_date").limit(10),
    supabase.from("upcoming_collections").select("*").order("due_date").limit(10),
    supabase.from("sustainability").select("*").single(),
    supabase.from("finance_monthly").select("*").eq("period", thisMonth).maybeSingle(),
    supabase.from("partner_account").select("name,balance_usd").gt("balance_usd", 0),
    supabase
      .from("project_tech_status")
      .select("project_id,name,completeness_pct,days_since_review"),
  ]);

  const gap = Number(sust?.gap_usd ?? 0);
  const coverage = Number(sust?.coverage_pct ?? 0);
  const annualitiesNeeded = gap < 0 ? Math.ceil((-gap * 12) / 160) : 0;

  const next90 = (renewals ?? []).filter((r) => Number(r.days_left) <= 90);
  const renewalCost = next90.reduce((s, r) => s + Number(r.usd_amount ?? 0), 0);

  const collectionsTotal = (collections ?? [])
    .filter((c) => c.billing_status === "pendiente")
    .reduce((s, c) => s + Number(c.usd_amount ?? 0), 0);

  const needsAttention = (techStatus ?? []).filter(
    (t) =>
      Number(t.completeness_pct ?? 0) === 0 ||
      (t.days_since_review !== null && Number(t.days_since_review) > 180)
  );

  const partnerDebt = (partners ?? []).reduce(
    (s, p) => s + Number(p.balance_usd ?? 0),
    0
  );

  return (
    <div>
      <h1 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">
        Panorama de Nova
      </h1>
      <p className="mt-1 text-sm text-muted">
        {MONTHS[now.getMonth()]} de {now.getFullYear()}
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Card
          label="Resultado del mes"
          value={`USD ${usd(monthly?.net_usd ?? 0, 0)}`}
          hint={`ingresos ${usd(monthly?.revenue_usd ?? 0, 0)} · egresos ${usd(monthly?.expense_usd ?? 0, 0)}`}
          tone={Number(monthly?.net_usd ?? 0) >= 0 ? "accent" : "violet"}
          href="/finanzas"
        />
        <Card
          label="Autosustentabilidad"
          value={`${coverage}%`}
          hint={
            gap < 0
              ? `faltan USD ${usd(-gap, 0)}/mes · ${annualitiesNeeded} anualidades`
              : "Nova cubre sus gastos fijos"
          }
          tone={coverage >= 100 ? "accent" : "violet"}
          href="/socios"
        />
        <Card
          label="Vence en 90 días"
          value={String(next90.length)}
          hint={`USD ${usd(renewalCost, 0)} a renovar`}
          tone={next90.length > 0 ? "cream" : "muted"}
          href="/activos"
        />
        <Card
          label="Aporte del socio"
          value={`USD ${usd(partnerDebt, 0)}`}
          hint="pendiente de amortizar"
          tone="muted"
          href="/socios"
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-[18px] border border-line bg-ink-2">
          <div className="flex items-baseline justify-between border-b border-line px-5 py-4">
            <h2 className="font-display text-base font-semibold">Próximas renovaciones</h2>
            <Link href="/alertas" className="text-xs text-muted hover:text-accent">
              ver alertas
            </Link>
          </div>
          <ul>
            {(renewals ?? []).slice(0, 6).map((r) => (
              <li
                key={`${r.kind}-${r.source_id}`}
                className="flex items-center justify-between gap-3 border-b border-line px-5 py-3 text-sm last:border-0"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{r.concept}</p>
                  <p className="text-xs text-muted">
                    {r.due_date}
                    {r.project_name ? ` · ${r.project_name}` : ""}
                    {r.paid_with ? ` · ${r.paid_with}` : ""}
                    {r.auto_renew === false ? " · SIN autorrenovación" : ""}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p
                    className={
                      Number(r.days_left) <= 30 ? "text-sm text-violet" : "text-sm text-muted"
                    }
                  >
                    {r.days_left} d
                  </p>
                  {r.usd_amount ? (
                    <p className="text-xs text-muted">USD {usd(r.usd_amount, 0)}</p>
                  ) : null}
                </div>
              </li>
            ))}
            {(renewals ?? []).length === 0 && (
              <li className="px-5 py-8 text-center text-sm text-muted">
                Nada vence en los próximos 180 días.
              </li>
            )}
          </ul>
        </div>

        <div className="rounded-[18px] border border-line bg-ink-2">
          <div className="flex items-baseline justify-between border-b border-line px-5 py-4">
            <h2 className="font-display text-base font-semibold">Cobros previstos</h2>
            <span className="text-xs text-accent">USD {usd(collectionsTotal, 0)}</span>
          </div>
          <ul>
            {(collections ?? []).slice(0, 6).map((c) => (
              <li
                key={c.service_id}
                className="flex items-center justify-between gap-3 border-b border-line px-5 py-3 text-sm last:border-0"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {c.client_name ?? c.project_name ?? c.concept}
                  </p>
                  <p className="text-xs text-muted">
                    {c.concept} · {c.due_date}
                    {c.confirmation_status === "pendiente" && c.confirm_by
                      ? ` · confirmar antes del ${c.confirm_by}`
                      : ""}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm text-accent">USD {usd(c.usd_amount, 0)}</p>
                  <p
                    className={
                      c.confirmation_status === "confirmada"
                        ? "text-xs text-accent"
                        : "text-xs text-muted"
                    }
                  >
                    {c.confirmation_status}
                  </p>
                </div>
              </li>
            ))}
            {(collections ?? []).length === 0 && (
              <li className="px-5 py-8 text-center text-sm text-muted">
                Sin cobros previstos en los próximos 180 días.
              </li>
            )}
          </ul>
        </div>
      </div>

      {needsAttention.length > 0 && (
        <div className="mt-6 rounded-[18px] border border-line bg-ink-2 p-5">
          <h2 className="font-display text-base font-semibold">Memoria técnica pendiente</h2>
          <p className="mt-1 text-sm text-muted">
            Proyectos sin ficha o sin revisar hace más de seis meses. Si alguien tuviera que
            retomarlos hoy, no tendría dónde mirar.
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {needsAttention.map((t) => (
              <li key={t.project_id}>
                <Link
                  href={`/proyectos/${t.project_id}`}
                  className="rounded-full border border-line-2 px-3 py-1 text-xs text-muted hover:border-accent hover:text-accent"
                >
                  {t.name}
                  {Number(t.completeness_pct ?? 0) === 0
                    ? " · sin ficha"
                    : ` · ${t.days_since_review} d`}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
