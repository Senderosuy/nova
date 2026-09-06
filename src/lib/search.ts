/**
 * Utilidad de búsqueda compartida (sin "use client": se ejecuta en el servidor).
 * Busca un término en varios campos ignorando mayúsculas y acentos.
 */
export function matches(
  term: string | undefined,
  ...fields: (string | null | undefined)[]
): boolean {
  if (!term) return true;
  const norm = (s: string) =>
    s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const q = norm(term);
  return fields.some((f) => f && norm(f).includes(q));
}
