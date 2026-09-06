# Nova Tech Hub — instrucciones para agentes

**Sistema nervioso interno de Latam Nova Group System:** memoria técnica de proyectos,
activos, proveedores, costeo neto y alertas de vencimiento.
Producción: https://hub.latamnova.app

## Antes de tocar cualquier cosa

1. `git pull --rebase`
2. `npm run agent:status` — ¿hay otro agente trabajando?
3. Leé **`docs/SPEC.md`** — modelo de datos, lógica de negocio y decisiones tomadas.
4. Leé **`docs/AGENT-PROTOCOL.md`** — cómo trabajar sin pisarse con otros agentes.
5. `npm run agent:claim "tu tarea" -- ruta/que/vas/a/tocar`

Al terminar: `npm run build` en verde → commit → push → `npm run agent:release`.
Si cambiaste la lógica o el modelo de datos, **actualizá `docs/SPEC.md`**.

## Reglas que no se negocian

- **Verificar, no suponer.** Nada se da por hecho sin salida real de consola: build,
  `migration list`, request HTTP, `vercel ls`. El build en verde no garantiza que
  producción funcione (la frontera cliente/servidor solo falla en runtime).
- **Migraciones versionadas.** Todo cambio de schema va en `supabase/migrations/`.
  Nunca desde el dashboard de Supabase. Nunca editar una migración ya pusheada.
- **Secretos nunca en texto plano** — ni en chat, ni en logs, ni en commits. Para
  verificar una credencial, comprobá presencia (`grep -c "^VAR=." .env.local`), no valor.
- **Costos netos = información interna.** Nunca se exponen al cliente.
- **No inventar diseño.** Los tokens visuales están en `src/app/globals.css`, extraídos
  de latamnova.app.
- **Next 16:** el middleware es `src/proxy.ts` y exporta `proxy()`. Documentación real
  en `node_modules/next/dist/docs/`.
- Formularios: usar siempre `<SubmitButton>`, nunca `<button type="submit">` pelado.
- Interfaz y commits en español rioplatense.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
