import { SubmitButton } from "./submit-button";
import { saveTechProfile, markReviewed } from "@/app/(app)/proyectos/[id]/tech-actions";

const inputCls =
  "mt-1 w-full rounded-lg border border-line-2 bg-ink px-3 py-2 text-sm text-cream outline-none focus:border-accent";
const labelCls = "block text-xs font-medium uppercase tracking-wide text-muted";

export type TechProfile = {
  stack_text: string | null;
  hosting: string | null;
  database_info: string | null;
  domains_dns: string | null;
  repo_info: string | null;
  deploy_process: string | null;
  integrations_text: string | null;
  credentials_location: string | null;
  access_notes: string | null;
  technical_decisions: string | null;
  continuation_requirements: string | null;
  known_issues: string | null;
  reviewed_at: string | null;
} | null;

export type TechStatus = {
  completeness_pct: number;
  filled_fields: number;
  total_fields: number;
  days_since_review: number | null;
} | null;

/** Campos de la ficha, en el orden en que alguien los necesitaría al retomar. */
const FIELDS: {
  name: keyof NonNullable<TechProfile>;
  label: string;
  hint?: string;
  rows?: number;
}[] = [
  { name: "stack_text", label: "Stack", hint: "Lenguajes, framework, versiones", rows: 2 },
  { name: "hosting", label: "Dónde corre", hint: "Hosting, servidor, plataforma", rows: 2 },
  { name: "database_info", label: "Base de datos", hint: "Motor, dónde vive, backups", rows: 2 },
  { name: "domains_dns", label: "Dominios y DNS", hint: "Qué dominio apunta a dónde", rows: 2 },
  { name: "repo_info", label: "Repositorio", hint: "Dónde está el código y en qué rama", rows: 2 },
  { name: "deploy_process", label: "Cómo se despliega", hint: "Pasos para publicar un cambio", rows: 3 },
  { name: "integrations_text", label: "Integraciones", hint: "APIs y servicios de terceros", rows: 2 },
  {
    name: "credentials_location",
    label: "Dónde están las credenciales",
    hint: "La referencia, nunca el secreto",
    rows: 2,
  },
  { name: "access_notes", label: "Quién tiene acceso", hint: "Personas y a qué sistemas", rows: 2 },
  { name: "technical_decisions", label: "Decisiones técnicas", hint: "Por qué se hizo así", rows: 3 },
  {
    name: "continuation_requirements",
    label: "Qué se necesita para continuarlo",
    hint: "Lo que alguien nuevo tendría que conseguir o saber",
    rows: 3,
  },
  { name: "known_issues", label: "Problemas conocidos", hint: "Deuda técnica, cosas frágiles", rows: 2 },
];

/**
 * Ficha Técnica 360: cómo está hecho el proyecto y qué hace falta para
 * continuarlo. Muestra completitud y antigüedad porque una ficha vieja
 * informa mal con apariencia de certeza.
 */
export function TechProfilePanel({
  projectId,
  profile,
  status,
}: {
  projectId: string;
  profile: TechProfile;
  status: TechStatus;
}) {
  const pct = Number(status?.completeness_pct ?? 0);
  const days = status?.days_since_review ?? null;
  const stale = days !== null && days > 180;

  const filled = FIELDS.filter((f) => (profile?.[f.name] ?? "") !== "");
  const empty = FIELDS.filter((f) => (profile?.[f.name] ?? "") === "");

  return (
    <div className="rounded-[18px] border border-line bg-ink-2">
      <div className="flex flex-col gap-2 border-b border-line px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-display text-base font-semibold">Ficha técnica 360</h2>
          <p className="mt-1 text-xs text-muted">
            Cómo está hecho y qué se necesita para continuarlo.
          </p>
        </div>
        <div className="text-right">
          <p
            className={`font-display text-lg font-semibold ${
              pct >= 80 ? "text-accent" : pct >= 40 ? "text-cream" : "text-muted"
            }`}
          >
            {pct}%
          </p>
          <p className="text-xs text-muted">
            {status?.filled_fields ?? 0} de {status?.total_fields ?? 9} campos clave
          </p>
        </div>
      </div>

      <div className="px-5 pt-4">
        <div className="h-1.5 overflow-hidden rounded-full bg-ink">
          <div
            className={pct >= 80 ? "h-full bg-accent" : "h-full bg-violet"}
            style={{ width: `${pct}%` }}
          />
        </div>

        <p className={`mt-2 text-xs ${stale ? "text-violet" : "text-muted"}`}>
          {profile?.reviewed_at
            ? `Revisada el ${profile.reviewed_at}${
                days !== null ? ` · hace ${days} día${days === 1 ? "" : "s"}` : ""
              }${stale ? " — conviene verificar que siga vigente" : ""}`
            : "Sin revisar todavía."}
        </p>
      </div>

      {/* Lectura: lo que ya está documentado */}
      {filled.length > 0 && (
        <dl className="mt-4 space-y-3 px-5">
          {filled.map((f) => (
            <div key={f.name} className="border-l-2 border-line-2 pl-3">
              <dt className="text-xs uppercase tracking-wide text-muted">{f.label}</dt>
              <dd className="mt-0.5 whitespace-pre-wrap text-sm">{profile?.[f.name]}</dd>
            </div>
          ))}
        </dl>
      )}

      {empty.length > 0 && (
        <p className="mt-4 px-5 text-xs text-muted">
          Sin completar: {empty.map((f) => f.label.toLowerCase()).join(", ")}.
        </p>
      )}

      <details className="mt-4 border-t border-line px-5 py-4">
        <summary className="cursor-pointer text-sm text-accent">
          {profile ? "Editar ficha" : "Completar ficha"}
        </summary>

        <form action={saveTechProfile.bind(null, projectId)} className="mt-4 space-y-3">
          {FIELDS.map((f) => (
            <label key={f.name} className={labelCls}>
              {f.label}
              {f.hint && (
                <span className="ml-2 normal-case text-muted/70">{f.hint}</span>
              )}
              <textarea
                name={f.name}
                rows={f.rows ?? 2}
                defaultValue={profile?.[f.name] ?? ""}
                className={inputCls}
              />
            </label>
          ))}

          <p className="text-xs text-violet">
            No escribas contraseñas, tokens ni claves. En &quot;dónde están las
            credenciales&quot; va la referencia al gestor de secretos, no el secreto.
          </p>

          <SubmitButton
            className="w-full rounded-lg bg-accent px-4 py-2 font-display text-sm font-semibold text-ink hover:opacity-90"
            pendingLabel="Guardando…"
          >
            Guardar ficha
          </SubmitButton>
        </form>
      </details>

      {profile && (
        <form
          action={markReviewed.bind(null, projectId)}
          className="border-t border-line px-5 py-3"
        >
          <SubmitButton className="text-xs text-muted hover:text-accent" pendingLabel="…">
            Sigue vigente — marcar como revisada hoy
          </SubmitButton>
        </form>
      )}
    </div>
  );
}
