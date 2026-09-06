"use client";

import { useFormStatus } from "react-dom";

/**
 * Botón de submit que se bloquea solo mientras la acción está en vuelo.
 * Evita que un doble clic cree dos registros iguales.
 */
export function SubmitButton({
  children,
  pendingLabel,
  className,
  title,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
  title?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      title={title}
      aria-busy={pending}
      className={`${className ?? ""} disabled:cursor-not-allowed disabled:opacity-50`}
    >
      {pending ? (pendingLabel ?? "Guardando…") : children}
    </button>
  );
}
