"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * Buscador que escribe en el query param `q` con debounce.
 * Al vivir en la URL, el filtro se comparte, se marca y sobrevive al refresh.
 */
export function SearchInput({ placeholder }: { placeholder: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [value, setValue] = useState(params.get("q") ?? "");
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (value.trim()) next.set("q", value.trim());
      else next.delete("q");
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="relative">
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-line-2 bg-ink py-2 pl-9 pr-3 text-sm text-cream outline-none placeholder:text-muted focus:border-accent sm:w-80"
      />
      <svg
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      >
        <circle cx="9" cy="9" r="6" />
        <path d="m13.5 13.5 3 3" strokeLinecap="round" />
      </svg>
    </div>
  );
}

/** Busca un término en varios campos, sin distinguir mayúsculas ni acentos. */
export function matches(term: string | undefined, ...fields: (string | null | undefined)[]) {
  if (!term) return true;
  const norm = (s: string) =>
    s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const q = norm(term);
  return fields.some((f) => f && norm(f).includes(q));
}
