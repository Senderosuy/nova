import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Verifica si cada dominio tiene una web operativa.
 *
 * Mensual: un dominio no cambia de estado seguido, y una conversación
 * comercial dura un mes. Distinto del monitoreo de disponibilidad, que
 * corre cada pocos minutos sobre los sitios que Nova sostiene.
 *
 * La detección de parking es heurística: cada registrador arma su
 * página distinta y algunos sitios bloquean peticiones automatizadas.
 * El resultado es una sugerencia de conversación, nunca una conclusión.
 */

const PARKING_SIGNALS = [
  "domain is parked",
  "dominio estacionado",
  "this domain is for sale",
  "buy this domain",
  "domain for sale",
  "parkingcrew",
  "sedoparking",
  "hugedomains",
  "afternic",
  "godaddy.com/forsale",
  "future home of something quite cool",
  "página en construcción",
  "coming soon",
  "under construction",
  "default web site page",
  "apache2 ubuntu default",
  "welcome to nginx",
  "hostinger.com/es/creador-de-paginas-web",
];

type Verdict = {
  status: "sin_dns" | "parking" | "error" | "redirige" | "activa";
  detail: string;
  finalUrl?: string;
};

async function classify(domain: string): Promise<Verdict> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(`https://${domain}`, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; NovaTechHub/1.0; +https://hub.latamnova.app)",
      },
      cache: "no-store",
    });

    const finalUrl = res.url;
    const body = (await res.text()).slice(0, 20000).toLowerCase();

    if (res.status >= 500) {
      return { status: "error", detail: `El servidor responde ${res.status}`, finalUrl };
    }
    if (res.status === 404) {
      return { status: "error", detail: "La página principal no existe (404)", finalUrl };
    }

    // Página de parking del registrador
    const signal = PARKING_SIGNALS.find((s) => body.includes(s));
    if (signal) {
      return {
        status: "parking",
        detail: "Página del registrador, sin sitio propio",
        finalUrl,
      };
    }

    // Contenido demasiado pobre para ser un sitio real
    const text = body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (text.length < 200) {
      return { status: "parking", detail: "Página casi vacía", finalUrl };
    }

    // Redirige a otro dominio
    try {
      const target = new URL(finalUrl).hostname.replace(/^www\./, "");
      const origin = domain.replace(/^www\./, "");
      if (target !== origin) {
        return {
          status: "redirige",
          detail: `Redirige a ${target}`,
          finalUrl,
        };
      }
    } catch {
      // URL rara: se ignora la comparación
    }

    return { status: "activa", detail: `Sitio operativo (HTTP ${res.status})`, finalUrl };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    // Sin DNS o sin servidor: el dominio está reservado y nada más
    if (/enotfound|getaddrinfo|dns|econnrefused|certificate|tls/i.test(msg)) {
      return { status: "sin_dns", detail: "No resuelve: reservado sin sitio" };
    }
    if (/abort|timeout/i.test(msg)) {
      return { status: "error", detail: "Sin respuesta en 15 segundos" };
    }
    return { status: "sin_dns", detail: msg || "No se pudo conectar" };
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  );

  // Los que nunca se verificaron primero, después los más viejos
  const { data: domains } = await supabase
    .from("assets")
    .select("id,name,identifier,web_checked_at")
    .eq("type", "dominio")
    .is("deleted_at", null)
    .order("web_checked_at", { ascending: true, nullsFirst: true })
    .limit(Number(request.nextUrl.searchParams.get("limit") ?? 15));

  if (!domains || domains.length === 0) {
    return NextResponse.json({ ok: true, checked: 0 });
  }

  const results = await Promise.all(
    domains.map(async (d) => {
      const domain = (d.identifier ?? d.name).trim().toLowerCase();
      const verdict = await classify(domain);

      await supabase
        .from("assets")
        .update({
          web_status: verdict.status,
          web_detail: verdict.detail,
          web_final_url: verdict.finalUrl ?? null,
          web_checked_at: new Date().toISOString(),
        })
        .eq("id", d.id);

      return { domain, ...verdict };
    })
  );

  const byStatus = results.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});

  return NextResponse.json({
    ok: true,
    checked: results.length,
    byStatus,
    results,
  });
}
