import Link from "next/link";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const [projects, clients, alerts] = await Promise.all([
    supabase.from("projects").select("id,status").is("deleted_at", null),
    supabase
      .from("clients")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null),
    supabase
      .from("alerts")
      .select("id", { count: "exact", head: true })
      .eq("status", "pendiente"),
  ]);

  const byStatus = (s: string) =>
    projects.data?.filter((p) => p.status === s).length ?? 0;

  const cards = [
    { label: "Proyectos activos", value: byStatus("activo"), href: "/proyectos?status=activo" },
    { label: "En desarrollo", value: byStatus("en_desarrollo"), href: "/proyectos?status=en_desarrollo" },
    { label: "Clientes", value: clients.count ?? 0, href: "/clientes" },
    { label: "Alertas pendientes", value: alerts.count ?? 0, href: "/alertas" },
  ];

  return (
    <div>
      <h1 className="font-display text-xl sm:text-2xl font-semibold tracking-tight">Dashboard</h1>
      <p className="mt-1 text-sm text-muted">Estado general de la operación de Nova.</p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {cards.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className="rounded-[18px] border border-line bg-ink-2 p-5 transition-colors hover:border-line-2"
          >
            <p className="text-xs uppercase tracking-wide text-muted">{c.label}</p>
            <p className="mt-2 font-display text-2xl sm:text-3xl font-semibold text-accent">
              {c.value}
            </p>
          </Link>
        ))}
      </div>

      <div className="mt-10 rounded-[18px] border border-line bg-ink-2 p-6">
        <h2 className="font-display text-base font-semibold">Próximos pasos</h2>
        <p className="mt-2 text-sm text-muted">
          Cargá los clientes y proyectos reales de Nova para completar el criterio de
          salida del MVP. Las fichas técnicas, activos y alertas llegan en la Release 2.
        </p>
      </div>
    </div>
  );
}
