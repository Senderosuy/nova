import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { logout } from "./actions";

const nav = [
  { href: "/", label: "Dashboard" },
  { href: "/clientes", label: "Clientes" },
  { href: "/proyectos", label: "Proyectos" },
  { href: "/activos", label: "Activos" },
];

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login");

  const email = (data.claims.email as string) ?? "";

  return (
    <div className="flex min-h-screen bg-ink">
      <aside className="fixed inset-y-0 left-0 flex w-56 flex-col border-r border-line bg-ink-2">
        <div className="px-5 py-6">
          <Link href="/" className="font-display text-lg font-semibold tracking-tight">
            Nova <span className="text-accent">Tech Hub</span>
          </Link>
        </div>

        <nav className="flex-1 space-y-1 px-3">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-ink-3 hover:text-cream"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="border-t border-line px-5 py-4">
          <p className="truncate text-xs text-muted" title={email}>
            {email}
          </p>
          <form action={logout}>
            <button
              type="submit"
              className="mt-2 text-xs text-muted underline-offset-2 hover:text-accent hover:underline"
            >
              Cerrar sesión
            </button>
          </form>
        </div>
      </aside>

      <main className="ml-56 flex-1 px-8 py-8">{children}</main>
    </div>
  );
}
