import Link from "next/link";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createProject } from "./actions";
import { SubmitButton } from "@/components/submit-button";

const STATUSES = [
  "presupuestado",
  "en_desarrollo",
  "activo",
  "pausado",
  "finalizado",
  "archivado",
] as const;

const TYPES = ["landing", "ecommerce", "sistema", "automatizacion", "otro"] as const;

const inputCls =
  "mt-1.5 w-full rounded-lg border border-line-2 bg-ink px-3 py-2 text-sm text-cream outline-none focus:border-accent";
const labelCls = "block text-xs font-medium uppercase tracking-wide text-muted";

export default async function ProyectosPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  let query = supabase
    .from("projects")
    .select("id,name,type,status,production_url,repo_url,clients(name)")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (status && (STATUSES as readonly string[]).includes(status)) {
    query = query.eq("status", status);
  }

  const [{ data: projects }, { data: clients }] = await Promise.all([
    query,
    supabase
      .from("clients")
      .select("id,name")
      .is("deleted_at", null)
      .order("name"),
  ]);

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold tracking-tight">Proyectos</h1>
      <p className="mt-1 text-sm text-muted">
        {projects?.length ?? 0} proyecto{(projects?.length ?? 0) === 1 ? "" : "s"}
        {status ? ` · filtro: ${status.replace("_", " ")}` : ""}
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        <Link
          href="/proyectos"
          className={
            !status
              ? "rounded-full bg-accent-dim px-3 py-1 text-xs text-accent"
              : "rounded-full border border-line-2 px-3 py-1 text-xs text-muted hover:text-cream"
          }
        >
          Todos
        </Link>
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={`/proyectos?status=${s}`}
            className={
              status === s
                ? "rounded-full bg-accent-dim px-3 py-1 text-xs text-accent"
                : "rounded-full border border-line-2 px-3 py-1 text-xs text-muted hover:text-cream"
            }
          >
            {s.replace("_", " ")}
          </Link>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="overflow-hidden rounded-[18px] border border-line bg-ink-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-3 font-medium">Proyecto</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Links</th>
              </tr>
            </thead>
            <tbody>
              {(projects ?? []).map((p) => {
                const rel = p.clients as unknown as
                  | { name: string }
                  | { name: string }[]
                  | null;
                const clientName = Array.isArray(rel) ? rel[0]?.name : rel?.name;
                return (
                <tr key={p.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/proyectos/${p.id}`} className="hover:text-accent">
                      {p.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted">{clientName ?? "—"}</td>
                  <td className="px-4 py-3 text-muted">{p.type}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-ink-3 px-2.5 py-0.5 text-xs text-cream">
                      {p.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {p.production_url && (
                      <a
                        href={p.production_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-accent hover:underline"
                      >
                        prod
                      </a>
                    )}
                    {p.repo_url && (
                      <a
                        href={p.repo_url}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-2 text-violet hover:underline"
                      >
                        repo
                      </a>
                    )}
                    {!p.production_url && !p.repo_url && (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                </tr>
                );
              })}
              {(projects ?? []).length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted">
                    Sin proyectos {status ? "con ese estado" : "todavía"}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <form
          action={createProject}
          className="h-fit rounded-[18px] border border-line bg-ink-2 p-5"
        >
          <h2 className="font-display text-base font-semibold">Nuevo proyecto</h2>

          <label className={`${labelCls} mt-4`}>
            Cliente *
            <select name="client_id" required className={inputCls} defaultValue="">
              <option value="" disabled>
                Elegir…
              </option>
              {(clients ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <label className={`${labelCls} mt-3`}>
            Nombre *
            <input name="name" required className={inputCls} />
          </label>

          <label className={`${labelCls} mt-3`}>
            Tipo
            <select name="type" defaultValue="otro" className={inputCls}>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>

          <label className={`${labelCls} mt-3`}>
            Estado
            <select name="status" defaultValue="en_desarrollo" className={inputCls}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace("_", " ")}
                </option>
              ))}
            </select>
          </label>

          <label className={`${labelCls} mt-3`}>
            URL producción
            <input name="production_url" type="url" className={inputCls} />
          </label>

          <label className={`${labelCls} mt-3`}>
            Repositorio
            <input name="repo_url" type="url" className={inputCls} />
          </label>

          <label className={`${labelCls} mt-3`}>
            Descripción
            <textarea name="description" rows={2} className={inputCls} />
          </label>

          <SubmitButton
            className="mt-5 w-full rounded-lg bg-accent px-4 py-2 font-display text-sm font-semibold text-ink transition-opacity hover:opacity-90"
           pendingLabel="Creando…">Crear proyecto</SubmitButton>
        </form>
      </div>
    </div>
  );
}
