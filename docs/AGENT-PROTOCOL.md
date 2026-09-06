# Protocolo de trabajo multi-agente — Nova Tech Hub

> Para cualquier IA (Claude, GPT, Gemini, Copilot…) que vaya a trabajar sobre este repo.
> **Leé este documento completo antes de tocar un solo archivo.**

---

## 0. Antes que nada

1. Leé **`docs/SPEC.md`** — contiene el modelo de datos, la lógica de negocio y las
   decisiones ya tomadas. No las rediscutas sin motivo: fueron deliberadas.
2. Ejecutá **`npm run agent:status`**. Te dice si hay otro agente trabajando ahora mismo
   y sobre qué archivos.
3. Recién entonces planificá tu tarea.

## 1. El problema que este protocolo resuelve

Varios agentes pueden trabajar sobre este repo **en paralelo y sin verse**, cada uno con
su copia local. Los riesgos reales:

- Dos agentes editando el mismo archivo → conflictos o trabajo perdido.
- Dos migraciones creadas con timestamps solapados → schema inconsistente.
- Un agente refactoriza mientras otro construye sobre la versión vieja.
- Un agente da por hecho un estado de base que otro ya cambió.

La coordinación se hace **por el repositorio mismo**, porque es lo único que todos
compartimos. No hay servidor de locks: hay archivos versionados en `.agent/`.

## 2. Ciclo obligatorio

```
 1. git pull --rebase              ← siempre, antes de todo
 2. npm run agent:status           ← ¿hay alguien trabajando?
 3. npm run agent:claim "..."      ← reservás tu alcance
 4. trabajás y verificás (build)
 5. commit + push                  ← chico y frecuente
 6. npm run agent:release          ← liberás
```

**Nunca** trabajes más de ~45 minutos sin pushear. El repo es el canal de comunicación:
si no pusheás, los demás no saben qué hacés.

## 3. Comandos de coordinación

```bash
npm run agent:status                       # quién trabaja, en qué, desde cuándo
npm run agent:claim "auth" -- src/app/login   # reservar alcance
npm run agent:heartbeat                    # sigo vivo (renueva el lock)
npm run agent:release                      # terminé
```

El script vive en `scripts/agent.mjs`, no tiene dependencias y escribe en
`.agent/locks/<agente>.json`. Se identifica por la variable `AGENT_NAME` (o por el
usuario del sistema si no está seteada).

### Qué hace `agent:status`

- Lista los locks activos y su antigüedad.
- Marca como **stale** los de más de 90 minutos sin heartbeat (podés ignorarlos).
- Muestra los commits de las últimas 24 h y si hay commits remotos sin traer.

### Si hay un lock activo que se superpone con tu tarea

**No lo pises.** Opciones, en orden:
1. Trabajá en otra parte del sistema que no se superponga.
2. Si es bloqueante, dejá una nota en `.agent/NOTES.md`, commiteala y avisá al humano.
3. Si el lock está stale (>90 min), podés tomarlo, pero **dejá constancia** en el commit:
   `chore(agent): tomo lock stale de <agente>`.

## 4. Reglas de convivencia

### Migraciones de base de datos
- Formato: `supabase/migrations/AAAAMMDDHHMMSS_nombre.sql`.
- **Antes de crear una**, corré `agent:status` y mirá si hay otra migración sin aplicar.
- **Nunca edites una migración ya pusheada.** Creá una nueva que corrija.
- Toda migración debe ser **idempotente donde se pueda** (`if not exists`,
  `create or replace`, `on conflict do nothing`).
- Nunca modifiques el schema desde el dashboard de Supabase: se pierde el versionado.

### Commits
- Mensajes en español, formato `tipo: descripción` (`feat:`, `fix:`, `chore:`, `docs:`).
- Un commit = un cambio coherente. Nada de commits de 20 archivos sin relación.
- **Verificá `npm run build` en verde antes de commitear.** Push a `main` deploya a
  producción automáticamente.

### Alcance
- No refactorices código fuera de tu tarea. Si ves algo mejorable, anotalo en
  `.agent/NOTES.md` en vez de arreglarlo por tu cuenta.
- No renombres archivos ni funciones compartidas sin avisar por `.agent/NOTES.md`.

### Secretos
- **Nunca** imprimas ni commitees valores de `.env.local`.
- Para verificar una credencial, comprobá **presencia**, no valor:
  `grep -c "^VAR=." .env.local`
- Los archivos `.env*` están en `.gitignore` (excepto `.env.example`, vacío).

## 5. Verificación: no asumas, comprobá

Este proyecto tiene una regla dura: **nada se da por hecho sin salida real de consola.**

| Afirmación | Cómo se verifica |
|---|---|
| "compila" | `npm run build` y leer la salida |
| "la migración se aplicó" | `npx supabase migration list` |
| "el dato quedó guardado" | `npx supabase db query --linked --file q.sql` |
| "está desplegado" | `npx -y vercel ls` → estado `Ready` |
| "la página anda" | request HTTP real; el build no detecta errores de runtime |
| "la API responde" | llamada real y leer el cuerpo, no solo el código HTTP |

**Caso real que justifica esto:** el build pasó en verde y producción devolvía 500,
porque una función exportada desde un archivo `"use client"` no puede invocarse desde un
Server Component. Solo se detectó al hacer un request y leer los logs de Vercel.

**Otro caso:** Cloudflare devolvió `[]` sin error cuando al token le faltaba un permiso.
Una lista vacía no significa "no hay datos".

## 6. Estilo de código

- TypeScript estricto. Si el tipo de una relación de Supabase es ambiguo
  (`objeto | array`), normalizalo explícitamente en vez de forzar un `as`.
- Server Components por defecto; `"use client"` solo donde haga falta interactividad.
- Lógica reutilizable en `src/lib/` **sin** directiva de cliente.
- Server Actions en `actions.ts` junto a la página que las usa.
- Formularios: siempre `<SubmitButton>`, nunca `<button type="submit">` pelado
  (evita duplicados por doble clic).
- Diseño: usar los tokens de `globals.css`. **Nunca inventar colores ni tipografías.**
- Textos de interfaz en español rioplatense.

## 7. Estructura del repo

```
docs/SPEC.md              ← la especificación viva. Empezá acá.
docs/AGENT-PROTOCOL.md    ← este documento
.agent/locks/             ← locks activos (uno por agente)
.agent/NOTES.md           ← mensajes entre agentes y deuda técnica detectada
scripts/agent.mjs         ← herramienta de coordinación
supabase/migrations/      ← schema versionado
src/app/(app)/            ← pantallas autenticadas
src/lib/connectors/       ← integraciones con proveedores
src/components/           ← componentes compartidos
```

## 8. Al terminar tu tarea

1. `npm run build` en verde.
2. Commit + push.
3. **Actualizá `docs/SPEC.md`** si cambiaste el modelo de datos, la lógica de negocio,
   agregaste una integración o completaste una etapa del roadmap. El spec desactualizado
   es peor que no tenerlo.
4. `npm run agent:release`.
5. Si dejás algo a medias, escribilo en `.agent/NOTES.md` con suficiente contexto para
   que otro lo retome sin leer todo el código.

## 9. Contexto de negocio que conviene entender

Latam Nova es una empresa uruguaya de desarrollo. Su cliente principal es Senderos Group
(interno) y tiene clientes externos: agencia de viajes, transporte, profesionales
independientes (psicólogos, abogados) y Fotolink.

El Hub existe porque **la memoria operativa se perdía**: dominios, hostings, decisiones
técnicas y fechas de renovación vivían en cabezas y chats. Cada decisión de diseño
apunta a que eso no vuelva a pasar.

El usuario trabaja en español, es directo y técnico, y valora la verificación sobre la
suposición. Prefiere que le señales un error tuyo antes de que él lo descubra.
