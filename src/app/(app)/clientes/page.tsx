import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createClientRecord, toggleClientStatus } from "./actions";
import { SearchInput } from "@/components/search-input";
import { matches } from "@/lib/search";
import { SubmitButton } from "@/components/submit-button";

const inputCls =
  "mt-1.5 w-full rounded-lg border border-line-2 bg-ink px-3 py-2 text-sm text-cream outline-none focus:border-accent";
const labelCls = "block text-xs font-medium uppercase tracking-wide text-muted";

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: clients } = await supabase
    .from("clients")
    .select("id,name,kind,contact_name,contact_email,contact_phone,status")
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  const filtered = (clients ?? []).filter((c) =>
    matches(q, c.name, c.kind, c.contact_name, c.contact_email, c.contact_phone, c.status)
  );

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold tracking-tight">Clientes</h1>
      <p className="mt-1 text-sm text-muted">
        {filtered.length} cliente{filtered.length === 1 ? "" : "s"}
        {q ? ` de ${clients?.length ?? 0}` : " registrados"}.
      </p>

      <div className="mt-4">
        <SearchInput placeholder="Buscar cliente, contacto, email…" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="overflow-hidden rounded-[18px] border border-line bg-ink-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium">Contacto</th>
                <th className="px-4 py-3 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 font-medium">{c.name}</td>
                  <td className="px-4 py-3 text-muted">{c.kind}</td>
                  <td className="px-4 py-3 text-muted">
                    {c.contact_name ?? "—"}
                    {c.contact_email ? ` · ${c.contact_email}` : ""}
                  </td>
                  <td className="px-4 py-3">
                    <form
                      action={toggleClientStatus.bind(null, c.id, c.status)}
                      className="inline"
                    >
                      <button
                        type="submit"
                        title="Cambiar estado"
                        className={
                          c.status === "activo"
                            ? "rounded-full bg-accent-dim px-2.5 py-0.5 text-xs text-accent"
                            : "rounded-full border border-line-2 px-2.5 py-0.5 text-xs text-muted"
                        }
                      >
                        {c.status}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted">
                    Sin clientes todavía. Cargá el primero con el formulario.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <form
          action={createClientRecord}
          className="h-fit rounded-[18px] border border-line bg-ink-2 p-5"
        >
          <h2 className="font-display text-base font-semibold">Nuevo cliente</h2>

          <label className={`${labelCls} mt-4`}>
            Nombre *
            <input name="name" required className={inputCls} />
          </label>

          <label className={`${labelCls} mt-3`}>
            Tipo
            <select name="kind" defaultValue="externo" className={inputCls}>
              <option value="externo">Externo</option>
              <option value="interno">Interno</option>
            </select>
          </label>

          <label className={`${labelCls} mt-3`}>
            Contacto
            <input name="contact_name" className={inputCls} />
          </label>

          <label className={`${labelCls} mt-3`}>
            Email
            <input name="contact_email" type="email" className={inputCls} />
          </label>

          <label className={`${labelCls} mt-3`}>
            Teléfono
            <input name="contact_phone" className={inputCls} />
          </label>

          <label className={`${labelCls} mt-3`}>
            Notas
            <textarea name="notes" rows={2} className={inputCls} />
          </label>

          <SubmitButton
            className="mt-5 w-full rounded-lg bg-accent px-4 py-2 font-display text-sm font-semibold text-ink transition-opacity hover:opacity-90"
           pendingLabel="Creando…">Crear cliente</SubmitButton>
        </form>
      </div>
    </div>
  );
}
