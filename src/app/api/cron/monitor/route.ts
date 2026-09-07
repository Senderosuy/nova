import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Chequeo de disponibilidad de los sitios que Nova sostiene.
 *
 * Se invoca cada minuto desde un disparador externo; el endpoint
 * decide a quién le toca según el intervalo de cada sitio. Así un
 * solo disparador sirve para frecuencias distintas: un e-commerce
 * cada 5 minutos y una landing dos veces al día.
 *
 * La lógica de confirmación vive en record_check() en la base: un
 * fallo pasa a "sospecha" y se reintenta a los 3 minutos; solo el
 * segundo fallo consecutivo confirma la caída. Evita alertar por
 * microcortes de red.
 */

function db() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  );
}

type CheckOutcome = {
  ok: boolean;
  status?: number;
  error?: string;
};

/**
 * Un sitio está caído si no responde, si tarda demasiado o si
 * devuelve un error del servidor. Un 403 puede ser un firewall
 * legítimo, así que no cuenta como caída.
 */
async function probe(url: string, timeoutSeconds: number): Promise<CheckOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutSeconds * 1000);

  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "NovaTechHub-Monitor/1.0" },
      cache: "no-store",
    });

    if (res.status >= 500) {
      return { ok: false, status: res.status, error: `Error del servidor ${res.status}` };
    }
    if (res.status === 404) {
      return { ok: false, status: res.status, error: "La página no existe (404)" };
    }
    return { ok: true, status: res.status };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error desconocido";
    return {
      ok: false,
      error: /abort/i.test(msg)
        ? `Sin respuesta en ${timeoutSeconds} segundos`
        : msg,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const supabase = db();

  // Solo los que ya vencieron su intervalo
  const { data: due } = await supabase
    .from("site_monitors")
    .select("id,label,url,timeout_seconds,status")
    .eq("active", true)
    .lte("next_check_at", new Date().toISOString())
    .limit(50);

  if (!due || due.length === 0) {
    return NextResponse.json({ ok: true, checked: 0, message: "Nada por chequear" });
  }

  const results = await Promise.all(
    due.map(async (m) => {
      const outcome = await probe(m.url, m.timeout_seconds ?? 10);

      const { data: state } = await supabase.rpc("record_check", {
        p_monitor_id: m.id,
        p_ok: outcome.ok,
        p_status_code: outcome.status ?? null,
        p_error: outcome.error ?? null,
      });

      return {
        label: m.label,
        url: m.url,
        ok: outcome.ok,
        status: outcome.status,
        error: outcome.error,
        state,
      };
    })
  );

  const down = results.filter((r) => r.state === "caido");
  const recovered = results.filter((r) => r.state === "recuperado");

  return NextResponse.json({
    ok: true,
    checked: results.length,
    down: down.length,
    recovered: recovered.length,
    results,
  });
}
