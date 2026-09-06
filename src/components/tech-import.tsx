"use client";

import { useState } from "react";
import { parseTechDocument, TECH_TEMPLATE, type TechField } from "@/lib/tech-parser";

const LABELS: Record<TechField, string> = {
  stack_text: "Stack",
  hosting: "Dónde corre",
  database_info: "Base de datos",
  domains_dns: "Dominios y DNS",
  repo_info: "Repositorio",
  deploy_process: "Cómo se despliega",
  integrations_text: "Integraciones",
  credentials_location: "Dónde están las credenciales",
  access_notes: "Quién tiene acceso",
  technical_decisions: "Decisiones técnicas",
  continuation_requirements: "Qué se necesita para continuarlo",
  known_issues: "Problemas conocidos",
};

/**
 * Importa una ficha desde un archivo o texto con secciones etiquetadas
 * y las vuelca en los campos del formulario. No guarda: deja todo listo
 * para revisar antes de confirmar.
 */
export function TechImport() {
  const [result, setResult] = useState<{
    matched: TechField[];
    unknown: string[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apply = (text: string) => {
    setError(null);
    const { values, matched, unknownHeadings } = parseTechDocument(text);

    if (matched.length === 0) {
      setError(
        "No se reconoció ninguna sección. Usá encabezados como '## Stack', '[STACK]' o 'STACK:'."
      );
      setResult(null);
      return;
    }

    // Volcar en los textarea del formulario de la ficha
    const form = document.querySelector<HTMLFormElement>("form[data-tech-form]");
    if (!form) {
      setError("No se encontró el formulario de la ficha.");
      return;
    }
    for (const [field, value] of Object.entries(values)) {
      const el = form.querySelector<HTMLTextAreaElement>(`[name="${field}"]`);
      if (el && value) el.value = value;
    }

    setResult({ matched, unknown: unknownHeadings });
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 512_000) {
      setError("El archivo es demasiado grande (máximo 500 KB).");
      return;
    }
    apply(await file.text());
    e.target.value = "";
  };

  const downloadTemplate = () => {
    const blob = new Blob([TECH_TEMPLATE], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ficha-tecnica.md";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="rounded-lg border border-line bg-ink p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">
        Importar desde archivo
      </p>
      <p className="mt-1 text-xs text-muted">
        Subí un .md o .txt con secciones etiquetadas y cada una va a su campo. Reconoce{" "}
        <code className="text-cream">## Stack</code>,{" "}
        <code className="text-cream">[STACK]</code> y{" "}
        <code className="text-cream">STACK:</code>.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="cursor-pointer rounded-lg border border-line-2 px-3 py-1.5 text-xs text-muted hover:border-accent hover:text-accent">
          Elegir archivo
          <input
            type="file"
            accept=".md,.txt,.markdown,text/plain,text/markdown"
            onChange={onFile}
            className="hidden"
          />
        </label>
        <button
          type="button"
          onClick={downloadTemplate}
          className="text-xs text-muted underline-offset-2 hover:text-accent hover:underline"
        >
          Descargar plantilla
        </button>
      </div>

      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-muted hover:text-accent">
          o pegar el texto
        </summary>
        <textarea
          rows={5}
          placeholder="## Stack&#10;Next.js 16, TypeScript…"
          onPaste={(e) => {
            const text = e.clipboardData.getData("text");
            if (text) setTimeout(() => apply(text), 0);
          }}
          className="mt-2 w-full rounded-lg border border-line-2 bg-ink-2 px-3 py-2 text-sm text-cream outline-none focus:border-accent"
        />
      </details>

      {error && <p className="mt-3 text-xs text-violet">{error}</p>}

      {result && (
        <div className="mt-3 rounded-lg border border-accent/40 bg-accent-dim px-3 py-2">
          <p className="text-xs text-accent">
            {result.matched.length} campo{result.matched.length === 1 ? "" : "s"} completado
            {result.matched.length === 1 ? "" : "s"}:{" "}
            {result.matched.map((f) => LABELS[f]).join(", ")}. Revisá y guardá.
          </p>
          {result.unknown.length > 0 && (
            <p className="mt-1 text-xs text-muted">
              Secciones no reconocidas: {result.unknown.join(", ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
