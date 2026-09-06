import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { syncAllProjectDocs } from "@/lib/sync-docs";

/**
 * Sincroniza las fichas técnicas desde los repositorios.
 * Lo invoca Vercel Cron una vez por día; el secreto evita que
 * cualquiera pueda dispararlo desde afuera.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");

  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  );

  const results = await syncAllProjectDocs(supabase);

  return NextResponse.json({
    ok: true,
    synced: results.filter((r) => r.status === "actualizada").length,
    total: results.length,
    results,
  });
}
