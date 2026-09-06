# Nova Tech Hub — Especificación técnica viva

> **Documento de referencia único.** Si vas a tocar el código, leé esto primero.
> Evita tener que reconstruir la lógica leyendo archivos sueltos.
> Última actualización: 2026-09-06

---

## 1. Qué es y qué no es

**Nova Tech Hub** es el sistema nervioso interno de **Latam Nova Group System**: memoria
técnica de proyectos, catálogo de activos tecnológicos, condiciones con proveedores,
costeo neto y motor de alertas de vencimientos.

**NO es** un CRM (sin pipeline ni leads), **NO es** un ERP (sin contabilidad ni
facturación fiscal), **NO es** un gestor de tareas, **NO es** un portal de clientes.
Toda feature nueva se contrasta contra esta frontera antes de entrar al backlog.

**Regla de negocio transversal:** los costos almacenados son **netos de Nova** y son
información interna. Nunca se exponen al cliente. El precio al cliente vive en un campo
distinto (`recurring_services.amount`).

## 2. Stack y despliegue

| Capa | Tecnología |
|---|---|
| Frontend | Next.js 16.3.4 (App Router, RSC), React 19, TypeScript, Tailwind 4 |
| Backend | Supabase — Postgres 17, Auth, RLS, `pg_cron` |
| Hosting | Vercel (auto-deploy en push a `main`) |
| Dominio | https://hub.latamnova.app |
| Repo | https://github.com/Senderosuy/nova |
| Proyecto Supabase | ref `swsdfrkkzrswjnliihxt` (West US Oregon) |

**Convención crítica de Next 16:** el middleware se llama **`src/proxy.ts`** y exporta
`proxy()`, no `middleware()`. La documentación oficial está embebida en
`node_modules/next/dist/docs/` — consultarla ante dudas de API.

**Frontera cliente/servidor:** la lógica pura reutilizable va en `src/lib/`, sin
directiva. Los componentes con `"use client"` solo contienen UI. Un helper exportado
desde un archivo `"use client"` **no puede invocarse desde un Server Component** (error
en runtime, no en build). Ya nos pasó con `matches()`.

### Variables de entorno

| Variable | Uso | Visibilidad |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | cliente y servidor | pública |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | cliente y servidor | pública |
| `HOSTINGER_API_TOKEN` | conector Hostinger | **secreta**, solo servidor |
| `CLOUDFLARE_API_TOKEN` | conector Cloudflare | **secreta**, solo servidor |

En Vercel, las `NEXT_PUBLIC_*` deben cargarse con `--no-sensitive --visibility config`;
las secretas con `--sensitive`. Nunca imprimir valores en chat, logs ni commits.

## 3. Modelo de datos

### Entidades

| Tabla | Rol |
|---|---|
| `profiles` | usuarios internos + rol (`admin` / `operador` / `lectura`) |
| `clients` | clientes (interno/externo) |
| `projects` | proyectos por cliente |
| `project_tech_profiles` | Ficha Técnica 360 (1:1 con proyecto) — **sin UI todavía** |
| `providers` | a quién le contratamos y en qué condiciones |
| `assets` | activos de Nova (dominios, hosting, herramientas, licencias) |
| `asset_assignments` | vínculo activo ↔ proyecto (N:M, con vigencia) |
| `recurring_services` | servicios recurrentes con costo neto y precio al cliente |
| `alerts` | alertas de vencimiento generadas |
| `project_events` | historial/timeline por proyecto |
| `documents` | metadatos de archivos (Storage) — **sin UI todavía** |
| `app_settings` | configuración (hoy: `usd_uyu_rate`) |

### Decisiones estructurales

1. **Los activos viven separados de los proyectos.** Se vinculan por
   `asset_assignments` con `assigned_from` / `assigned_until`. Desasignar **no borra**:
   cierra la vigencia. Así se sabe qué es de Nova aunque el proyecto termine.
2. **Cobro ≠ vencimiento.** `recurring_services` tiene `next_billing_date` (ingreso) y
   `expires_at` (riesgo de caída de servicio). Son flujos distintos.
3. **Costo neto vs precio al cliente.** `assets.cost` y `recurring_services.net_cost`
   son internos; `recurring_services.amount` es lo que se factura.
4. **Soft-delete** (`deleted_at`) en clients, projects y assets. La memoria se archiva,
   no se borra.
5. **Las credenciales no se almacenan.** `project_tech_profiles.credentials_location`
   guarda *dónde* están y quién tiene acceso, nunca el secreto.

### Ciclos de facturación (`billing_cycle` / `frequency`)

`mensual` · `trimestral` · `semestral` · `anual` · `unico` · `gratis`

- `unico`: se paga una vez. Usa `assets.paid_at` para saber en qué año impacta.
- `gratis`: inventariado pero con costo 0 (ej. zonas Cloudflare Free).

## 4. Lógica de costeo

Dos vistas, con propósitos distintos:

### `project_costs` — run rate
Costo mensual y anual **normalizado**, agrupado por moneda (no mezcla USD con UYU).
Responde "¿cuánto cuesta sostener esto por mes?".
Divide el costo por el ciclo: anual/12, trimestral/3, etc. Los ciclos `unico` y
`gratis` aportan 0.

### `project_annual_costs` — año calendario en USD
Responde "¿cuánto voy a pagar en 2026? ¿y en 2027?".
**No prorratea.** La función `payments_in_year(anchor, cycle, year)` proyecta las fechas
de pago hacia atrás y adelante desde la fecha de renovación y **cuenta cuántas caen
dentro del año**. Consecuencias:
- Un VPS bianual que vence en 2028 tiene pago en 2026 y 2028, **cero en 2027**.
- Un pago único impacta solo el año de `paid_at`.
- Los UYU se convierten con `app_settings.usd_uyu_rate` (editable, hoy 40,243 — BCU
  cierre 04/09/2026).

Los años mostrados en la UI se derivan de la fecha actual: no hay años hardcodeados.

## 5. Motor de alertas

`generate_alerts()` recorre los umbrales **90, 60, 30 y 15 días** y crea alertas para
activos y servicios cuya fecha caiga dentro de cada ventana.

- **Idempotencia por índice único:** `(asset_id, threshold_days, due_date)` y
  `(service_id, threshold_days, due_date)`. Correr el barrido dos veces no duplica.
  Verificado: 1ª corrida genera N, 2ª genera 0.
- **Cron:** `nova-alerts-daily`, `0 9 * * *` UTC (06:00 Uruguay) vía `pg_cron`.
- **Estados:** `pendiente` → `vista` → `resuelta`, o `pospuesta` con nueva fecha.
- Cada alerta nace con `suggested_action` en lenguaje natural.
- **Métrica de éxito del sistema entero:** vencimientos que sorprendieron a Nova = 0.

## 6. Seguridad y RLS

RLS habilitado en **todas** las tablas. Patrón uniforme:

| Operación | Quién |
|---|---|
| SELECT | cualquier autenticado |
| INSERT / UPDATE | `admin` u `operador` (función `can_write()`) |
| DELETE | solo `admin` (función `is_admin()`) |
| anónimo | sin acceso |

`can_write()` e `is_admin()` son `security definer` para evitar recursión de políticas
al consultar `profiles` desde dentro de una política.

Alta automática de perfil: trigger `on_auth_user_created` sobre `auth.users`.

## 7. Integridad: anti-duplicados

Defensa en dos capas, porque la UI sola no alcanza.

**Capa UI:** `<SubmitButton>` (`src/components/submit-button.tsx`) usa `useFormStatus`
para deshabilitarse mientras la acción está en vuelo. Aplicado a los 12 formularios.

**Capa base:** índices únicos parciales (ignoran registros archivados):
- `projects (client_id, lower(name))`
- `clients (lower(name))`
- `assets (lower(identifier))`
- `asset_assignments (asset_id, project_id)` where vigente
- `recurring_services (project_id, lower(concept))` where activo

Origen: un doble clic creó proyectos duplicados y asignó el mismo dominio dos veces,
inflando el costeo.

## 8. Arquitectura de conectores

Contrato en `src/lib/connectors/types.ts`:

```ts
type ProviderConnector = {
  key: string;              // = providers.integration_key
  label: string;
  envVar: string | null;    // credencial server-side
  capabilities: string[];
  sync: (supabase, providerId) => Promise<SyncResult>;
};
```

**Agregar un proveedor con API = crear un archivo + registrarlo en `index.ts` + un
UPDATE en `providers`.** La UI y la server action `syncProvider()` son genéricas: no
conocen ningún proveedor por nombre.

Estado por proveedor en `providers.integration_status`:
`sin_api` · `disponible` (falta credencial) · `conectada` · `error`.
Cada sync guarda `last_synced_at` y `last_sync_result`.

### Estado de las integraciones

| Proveedor | Conector | Estado | Notas |
|---|---|---|---|
| Hostinger | ✅ | conectada | dominios + **precios reales** de `/billing/v1/subscriptions` |
| Cloudflare | ✅ | credencial cargada | **falta permiso `Zone:Read` y `Domain Registrar:Read`** en el token |
| Google Workspace | ❌ | sin conector | no hay API de facturación para clientes directos |
| nic.com.uy | ❌ | sin API | ANTEL no expone API; queda WHOIS `whois.nic.org.uy` |

**Aprendizajes de API:**
- Los **tokens de cuenta** de Cloudflare dan 401 contra `/user/tokens/verify` aunque
  sean válidos. Verificar contra `/accounts` o `/zones`.
- Cloudflare devuelve **lista vacía sin error** cuando falta un permiso. Un `[]` no
  significa "no hay datos".
- Hostinger no vincula suscripción con dominio: el precio se deriva **por TLD**.
- Google Workspace: Cloud Billing API es solo GCP; Reseller API es solo para
  revendedores. La vía práctica sería importar el CSV de factura.

## 9. Estado de datos (2026-09-06)

- **5 clientes**, **5 proyectos**, **28 activos**, **5 proveedores**
- nic.com.uy: 18 dominios `.uy` a $948 UYU/año c/u = **$17.064 UYU/año**
- Hostinger: 12 ítems = **USD 792,24/año** (incluye VPS KVM 4 a USD 347,88/año)
- Cloudflare: 1 dominio (fotolinkmedia.com, USD 10,46/año) + zona DNS Free
- Google: fotolink.app (USD 14/año) + Workspace Business Standard (USD 12,60/mes)
- PHOS: stand USD 500, pago único 01/09/2026
- **0 alertas abiertas** — el primer vencimiento es el 22/01/2027

**Dato de negocio:** Cloudflare Registrar (USD 10,46) es la mitad de precio que
Hostinger (USD 20,19) para un `.com`. Hay 5 `.com` en Hostinger migrables al vencer.

## 10. Roadmap

### Hecho
- Etapa 0 — definición y frontera de producto
- Etapa 1 — auth, layout, CRUD clientes y proyectos, dashboard
- Etapa 3 — catálogo de activos + asignaciones
- Etapa 5 — motor de alertas con cron
- Etapa 6 — historial automático por triggers
- Extras — proveedores con condiciones de pago, costeo neto, conectores API,
  búsqueda en 5 pantallas, anti-duplicados

### Pendiente
- **Etapa 2 — Ficha Técnica 360**: tabla `project_tech_profiles` existe, falta UI.
  Es el pilar de memoria: "cómo está hecho y qué necesito para continuarlo".
- **Etapa 4 — UI de servicios recurrentes**: la tabla existe, se cargan por SQL.
- Notificación por email de alertas (hoy hay que entrar a verlas)
- Etapa 7 — automatizaciones y escalamiento
- Etapa 8 — capa de IA (RAG sobre fichas, activos e historial)
- Etapa 9 — dashboard ejecutivo
- Conector Google Workspace vía Admin SDK (conteo de licencias)
- Refresco WHOIS para dominios `.uy`

## 11. Identidad visual

Tokens extraídos de `latamnova.app` (`src/app/globals.css`). **No inventar colores.**

```
--ink #05070f   --ink-2 #0a0e1e   --ink-3 #10162e
--accent #35e6d4 (cyan)   --violet #7b6cff
--cream #eaf0ff   --muted #93a0c2
Display: Space Grotesk · Body: Inter · Radio: 18px
```

Convenciones de UI: tablas en tarjetas `rounded-[18px] border-line bg-ink-2`,
formulario de alta en columna derecha de 320px, chips de filtro redondeados,
badges de vencimiento (violeta ≤30 d, cyan ≤90 d, gris resto).

## 12. Comandos habituales

```bash
# Desarrollo
npm run dev
npm run build                      # verificar antes de commitear

# Base de datos (nunca tocar el schema desde el dashboard)
npx supabase migration new <nombre>
npx supabase db push
npx supabase db query --linked --file <archivo.sql>

# Despliegue
git push                           # deploy automático
npx -y vercel logs <url>           # diagnóstico de errores en runtime
```

**Regla:** todo cambio de esquema es una migración versionada en `supabase/migrations/`.
Nunca editar el schema desde el dashboard de Supabase.
