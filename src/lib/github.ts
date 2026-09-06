/**
 * Lectura de archivos desde GitHub, server-side.
 * El token es opcional: los repos públicos se leen sin credencial,
 * pero GitHub limita a 60 pedidos por hora sin autenticar.
 */

const API = "https://api.github.com";

export class GitHubError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "GitHubError";
  }
}

function headers(): HeadersInit {
  const h: Record<string, string> = {
    Accept: "application/vnd.github.raw+json",
    "User-Agent": "nova-tech-hub",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

/** Normaliza owner/repo desde una URL completa o el formato corto. */
export function normalizeRepo(input: string): string | null {
  const clean = input.trim().replace(/\.git$/, "");
  const url = /github\.com[/:]([^/]+)\/([^/?#]+)/i.exec(clean);
  if (url) return `${url[1]}/${url[2]}`;
  const short = /^([\w.-]+)\/([\w.-]+)$/.exec(clean);
  if (short) return `${short[1]}/${short[2]}`;
  return null;
}

export type FetchedDoc = {
  content: string;
  path: string;
  repo: string;
  branch: string | null;
};

/**
 * Trae el contenido de un archivo. Devuelve null si el archivo no existe,
 * porque eso es una situación normal (todavía no lo crearon), no un error.
 */
export async function fetchRepoFile(
  repo: string,
  path: string,
  branch?: string | null
): Promise<FetchedDoc | null> {
  const ref = branch ? `?ref=${encodeURIComponent(branch)}` : "";
  const url = `${API}/repos/${repo}/contents/${encodeURI(path)}${ref}`;

  const res = await fetch(url, { headers: headers(), cache: "no-store" });

  if (res.status === 404) return null;

  if (res.status === 401 || res.status === 403) {
    throw new GitHubError(
      process.env.GITHUB_TOKEN
        ? "GitHub rechazó la credencial o el token no tiene acceso a este repositorio."
        : "Repositorio privado o límite de pedidos alcanzado: falta cargar GITHUB_TOKEN en el servidor.",
      res.status
    );
  }

  if (!res.ok) {
    throw new GitHubError(`GitHub respondió ${res.status} al leer ${path}.`, res.status);
  }

  return {
    content: await res.text(),
    path,
    repo,
    branch: branch ?? null,
  };
}
