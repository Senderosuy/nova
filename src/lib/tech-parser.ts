/**
 * Parser de fichas técnicas desde texto etiquetado.
 *
 * Acepta tres formatos de encabezado, porque la gente documenta distinto:
 *   ## Stack          (markdown)
 *   [STACK]           (corchetes)
 *   STACK:            (dos puntos, al inicio de línea)
 *
 * Todo lo que sigue a un encabezado, hasta el próximo, es el contenido
 * de ese campo. El texto anterior al primer encabezado se ignora.
 */

export const TECH_FIELDS = [
  "stack_text",
  "hosting",
  "database_info",
  "domains_dns",
  "repo_info",
  "deploy_process",
  "integrations_text",
  "credentials_location",
  "access_notes",
  "technical_decisions",
  "continuation_requirements",
  "known_issues",
] as const;

export type TechField = (typeof TECH_FIELDS)[number];

/** Sinónimos aceptados por campo, en minúsculas y sin acentos. */
const ALIASES: Record<TechField, string[]> = {
  stack_text: ["stack", "tecnologias", "tecnologia", "lenguajes", "framework"],
  hosting: ["donde corre", "hosting", "servidor", "infraestructura", "plataforma", "deploy target"],
  database_info: ["base de datos", "base", "database", "db", "datos"],
  domains_dns: ["dominios y dns", "dominios", "dns", "dominio"],
  repo_info: ["repositorio", "repo", "codigo", "git"],
  deploy_process: ["como se despliega", "despliegue", "deploy", "publicacion", "ci/cd", "cicd"],
  integrations_text: ["integraciones", "apis", "servicios de terceros", "integracion"],
  credentials_location: [
    "donde estan las credenciales",
    "credenciales",
    "secretos",
    "accesos tecnicos",
  ],
  access_notes: ["quien tiene acceso", "accesos", "permisos", "usuarios"],
  technical_decisions: ["decisiones tecnicas", "decisiones", "arquitectura", "por que"],
  continuation_requirements: [
    "que se necesita para continuarlo",
    "continuidad",
    "requisitos",
    "para continuar",
    "onboarding",
  ],
  known_issues: ["problemas conocidos", "problemas", "deuda tecnica", "issues", "pendientes"],
};

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9/ ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Resuelve un encabezado a un campo, o null si no reconoce ninguno. */
function matchField(heading: string): TechField | null {
  const h = norm(heading);
  if (!h) return null;

  for (const field of TECH_FIELDS) {
    for (const alias of ALIASES[field]) {
      if (h === alias) return field;
    }
  }
  // Coincidencia parcial: "stack tecnologico" cae en stack
  for (const field of TECH_FIELDS) {
    for (const alias of ALIASES[field]) {
      if (h.startsWith(alias) || alias.startsWith(h)) return field;
    }
  }
  return null;
}

const HEADING_PATTERNS = [
  /^#{1,6}\s+(.+?)\s*$/, //  ## Stack
  /^\[(.+?)\]\s*$/, //       [STACK]
  /^([A-Za-zÁÉÍÓÚÑáéíóúñ0-9 /]+):\s*$/, // STACK:
];

function headingOf(line: string): string | null {
  for (const p of HEADING_PATTERNS) {
    const m = p.exec(line.trim());
    if (m) return m[1];
  }
  return null;
}

export type ParseResult = {
  values: Partial<Record<TechField, string>>;
  matched: TechField[];
  unknownHeadings: string[];
};

export function parseTechDocument(text: string): ParseResult {
  const lines = text.split(/\r?\n/);
  const values: Partial<Record<TechField, string>> = {};
  const unknownHeadings: string[] = [];

  let current: TechField | null = null;
  let buffer: string[] = [];

  const flush = () => {
    if (current) {
      const content = buffer.join("\n").trim();
      if (content) {
        values[current] = values[current] ? `${values[current]}\n${content}` : content;
      }
    }
    buffer = [];
  };

  for (const line of lines) {
    const heading = headingOf(line);
    if (heading !== null) {
      flush();
      const field = matchField(heading);
      if (field) {
        current = field;
      } else {
        current = null;
        if (heading.trim()) unknownHeadings.push(heading.trim());
      }
      continue;
    }
    if (current) buffer.push(line);
  }
  flush();

  return {
    values,
    matched: Object.keys(values) as TechField[],
    unknownHeadings,
  };
}

/** Plantilla en blanco para que el usuario la complete y la suba. */
export const TECH_TEMPLATE = `## Stack
Lenguajes, framework y versiones.

## Dónde corre
Hosting, servidor o plataforma.

## Base de datos
Motor, dónde vive, cómo se respalda.

## Dominios y DNS
Qué dominio apunta a dónde.

## Repositorio
Dónde está el código y en qué rama.

## Cómo se despliega
Pasos para publicar un cambio.

## Integraciones
APIs y servicios de terceros.

## Dónde están las credenciales
La referencia al gestor de secretos. NUNCA el secreto.

## Quién tiene acceso
Personas y a qué sistemas.

## Decisiones técnicas
Por qué se hizo así.

## Qué se necesita para continuarlo
Lo que alguien nuevo tendría que conseguir o saber.

## Problemas conocidos
Deuda técnica y cosas frágiles.
`;
