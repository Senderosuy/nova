// Cliente server-only de la API de Hostinger.
// El token vive en HOSTINGER_API_TOKEN (sin NEXT_PUBLIC_): nunca llega al browser.

const BASE = "https://developers.hostinger.com";

export type HostingerDomain = {
  id: number;
  domain: string | null;
  type: string | null;
  status: string | null;
  created_at: string | null;
  expires_at: string | null;
};

export async function fetchHostingerDomains(): Promise<HostingerDomain[]> {
  const token = process.env.HOSTINGER_API_TOKEN;
  if (!token) {
    throw new Error(
      "Falta HOSTINGER_API_TOKEN en las variables de entorno del servidor."
    );
  }

  const res = await fetch(`${BASE}/api/domains/v1/portfolio`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Hostinger respondió ${res.status} al listar dominios.`);
  }

  return (await res.json()) as HostingerDomain[];
}
