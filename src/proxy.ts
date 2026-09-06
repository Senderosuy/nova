import { type NextRequest } from "next/server";
import { updateSession } from "@/utils/supabase/middleware";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /**
     * Todas las rutas excepto estáticos, imágenes y /api.
     *
     * Las rutas de API no pasan por el guard de sesión: se autentican
     * por su cuenta (el cron usa su propio secreto). Sin excluirlas, el
     * proxy les devuelve la página de login en vez de ejecutarlas.
     */
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
