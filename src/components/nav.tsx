"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/clientes", label: "Clientes" },
  { href: "/proyectos", label: "Proyectos" },
  { href: "/activos", label: "Activos" },
  { href: "/proveedores", label: "Proveedores" },
  { href: "/alertas", label: "Alertas" },
];

/**
 * Navegación lateral. En escritorio es una columna fija; en móvil se
 * convierte en barra superior con menú desplegable.
 */
export function Nav({ email, logout }: { email: string; logout: () => Promise<void> }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Cerrar el menú al navegar
  useEffect(() => setOpen(false), [pathname]);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const linkCls = (href: string) =>
    `block rounded-lg px-3 py-2 text-sm transition-colors ${
      isActive(href)
        ? "bg-accent-dim text-accent"
        : "text-muted hover:bg-ink-3 hover:text-cream"
    }`;

  return (
    <>
      {/* Barra superior — solo móvil */}
      <header className="fixed inset-x-0 top-0 z-30 flex items-center justify-between border-b border-line bg-ink-2 px-4 py-3 lg:hidden">
        <Link href="/" className="font-display text-base font-semibold tracking-tight">
          Nova <span className="text-accent">Tech Hub</span>
        </Link>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={open}
          className="rounded-lg border border-line-2 p-2 text-muted hover:text-accent"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            {open ? (
              <>
                <path d="M6 6l12 12" />
                <path d="M18 6L6 18" />
              </>
            ) : (
              <>
                <path d="M3 6h18" />
                <path d="M3 12h18" />
                <path d="M3 18h18" />
              </>
            )}
          </svg>
        </button>
      </header>

      {/* Fondo oscuro al abrir en móvil */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-ink/70 lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      {/* Panel lateral */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-line bg-ink-2 transition-transform duration-200 lg:w-56 lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="hidden px-5 py-6 lg:block">
          <Link href="/" className="font-display text-lg font-semibold tracking-tight">
            Nova <span className="text-accent">Tech Hub</span>
          </Link>
        </div>

        <div className="px-5 py-5 lg:hidden">
          <p className="font-display text-base font-semibold">Menú</p>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className={linkCls(item.href)}>
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
    </>
  );
}
