# Nova Tech Hub — Especificación técnica viva

> **Documento de referencia único.** Si vas a tocar el código, leé esto primero.
> Evita tener que reconstruir la lógica leyendo archivos sueltos.
> Última actualización: 2026-09-07

---

## 1. Qué es y qué no es

**Nova Tech Hub** es el sistema nervioso interno de **Latam Nova Group System**: memoria
técnica de proyectos, catálogo de activos, condiciones con proveedores, costeo neto,
ingresos, margen por proyecto, finanzas de la empresa y motor de alertas.

**NO es** un CRM (sin pipeline ni leads), **NO es** un ERP ni un sistema contable
(sin facturación fiscal, IVA, conciliación bancaria ni plan de cuentas), **NO es** un
gestor de tareas, **NO es** un portal de clientes. Responde *"¿cómo venimos?"*, no
reemplaza al contador. Toda feature nueva se contrasta contra esta frontera.

**Regla transversal:** los costos netos son **información interna**. Nunca se exponen al
cliente. El precio al cliente vive en un campo distinto del costo.

## 2. Stack y despliegue

| Capa | Tecnología |
|---|---|
| Frontend | Next.js 16.3.4 (App Router, RSC), React 19, TypeScript, Tailwind 4 |
| Backend | Supabase — Postgres 17, Auth, RLS, `pg_cron` |
| Hosting | Vercel (auto-deploy en push a `main`) |
| Dominio | https://hub.latamnova.app |
| Repo | https://github.com/Senderosuy/nova |
| Proyecto Supabase | ref `swsdfrkkzrswjnliihxt` (West US Oregon) |

**Convención crítica de Next 16:** el middleware es **`src/proxy.ts`** y exporta
`proxy()`, no `middleware()`. Documentación embebida en `node_modules/next/dist/docs/`.

**Frontera cliente/servidor:** la lógica pura va en `src/lib/`, sin directiva. Un helper
exportado desde un archivo `"use client"` **no puede invocarse desde un Server Component**
— falla en runtime, no en build. Ya pasó con `matches()`.

**Vistas de Postgres:** `create or replace view` **no permite intercalar columnas nuevas
en el medio**. Las columnas agregadas van al final, o hay drop + recreate en cascada.
Ya pasó con `service_schedule`.

### Variables de entorno

| Variable | Uso | Visibilidad |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | cliente y servidor | pública |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | cliente y servidor | pública |
| `HOSTINGER_API_TOKEN` | conector Hostinger | **secreta** |
| `CLOUDFLARE_API_TOKEN` | conector Cloudflare | **secreta** |

En Vercel: las `NEXT_PUBLIC_*` con `--no-sensitive --visibility config`; las secretas con
`--sensitive`. Nunca imprimir valores en chat, logs ni commits.

## 3. Modelo de datos

### Entidades

| Tabla | Rol |
|---|---|
| `profiles` | usuarios internos + rol (`admin` / `operador` / `lectura`) |
| `clients` | clientes (interno/externo) |
| `projects` | proyectos, con `ownership_type`: de cliente o **producto propio** |
| `project_tech_profiles` | Ficha Técnica 360 — **sin UI todavía** |
| `providers` | a quién le contratamos y en qué condiciones |
| `assets` | activos (dominios, hosting, herramientas, licencias) |
| `asset_assignments` | activo ↔ proyecto (N:M, con vigencia) |
| `recurring_services` | ítems recurrentes: ingresos y egresos, de proyecto o empresa |
| `project_charges` | movimientos únicos: ingresos y egresos, de proyecto o empresa |
| `service_catalog` | precios de referencia (anualidad landing = USD 160) |
| `payment_methods` | medios de pago de Nova |
| `expense_categories` | categorías de gasto de estructura |
| `alerts` | alertas generadas |
| `project_events` | historial por proyecto |
| `documents` | metadatos de archivos — **sin UI todavía** |
| `app_settings` | configuración (`usd_uyu_rate` = 40,243) |

### Los dos ejes de todo movimiento

Cada movimiento —único o recurrente— se clasifica por:

- **`direction`**: `ingreso` o `egreso`
- **`scope`**: `proyecto` o `empresa` (overhead)

Los cuatro cuadrantes usan la misma maquinaria de ciclos, monedas y proyección. Un gasto
de contador es *egreso + empresa*; el abono de un cliente, *ingreso + proyecto*. **Se
generalizó en vez de duplicar tablas**: por eso `project_charges` y `recurring_services`
sirven para ambos alcances y `project_id` es opcional.

### Decisiones estructurales

1. **Activos separados de proyectos**, vinculados por `asset_assignments` con vigencia.
   Desasignar cierra la vigencia, no borra.
2. **Cobro ≠ vencimiento**: `next_billing_date` (ingreso) y `expires_at` (riesgo de caída).
3. **Costo neto vs precio al cliente**: campos distintos, el primero interno.
4. **Soft-delete** en clients, projects, assets y providers. La memoria se archiva.
5. **Credenciales no se almacenan**: se guarda *dónde* están.
6. **Métodos de pago: solo últimos cuatro dígitos.** Nunca el número completo, CVV ni
   vencimiento. Validado por constraint (`^[0-9]{4}$`) y en el formulario.
7. **Un gasto puntual no es un activo.** Activo = se posee y se renueva. Cargo único =
   ya ocurrió y no se repite (un stand, una compra de imágenes).

### Ciclos

`mensual` · `trimestral` · `semestral` · `anual` · `unico` · `gratis`

- `unico`: usa `assets.paid_at` o `charge_date` para saber en qué año impacta.
- `gratis`: inventariado con costo 0 (zonas Cloudflare Free).

## 4. Lógica financiera

### Costeo

- **`project_costs`** — run rate: costo normalizado mensual/anual por moneda.
- **`project_annual_costs`** — año calendario en USD. **No prorratea**: `payments_in_year()`
  proyecta las fechas de pago desde la renovación y cuenta las que caen en el año. Un VPS
  bianual que vence en 2028 tiene pago en 2026 y 2028, **cero en 2027**.

### Ingresos

- **`project_annual_revenue`** — cargos únicos del año + recurrentes proyectados.
- **`project_margin`** — ingreso − costo, con porcentaje.
- **`project_line_items`** — desglose línea por línea normalizado a base anual en USD,
  con margen por ítem. Responde "¿qué me cuesta y qué cobro por cada cosa?".
- **`client_line_items`** — lo mismo consolidado por cliente (sin pantalla todavía).

### Modalidad de cobro

`billing_mode`: **adelantado** (se cobra el período que empieza) o **vencido** (se cobra
el transcurrido; el primer cobro cae una renovación después). `payments_in_year_from()`
ignora los cobros previos al primer cobro efectivo.

**Origen real:** las landings existentes no cobraron el primer año, así que su anualidad
se cobra en 2027. Sin esto el margen de 2026 mostraría un ingreso inexistente.

### Anualidades ancladas

Un ítem recurrente puede tener **`anchor_asset_id`**: su fecha se deriva del vencimiento
del activo. `confirm_by = expires_at − lead_days` (45 por defecto). Cuando el conector
trae la renovación nueva, la fecha de confirmación se recalcula sola.

### Proyectos propios

`ownership_type = 'propio'` cambia la lectura: el costo no es un problema sino
**inversión**. `project_investment` da invertido total, invertido del año, recuperado y
posición neta, contando **solo movimientos ya ocurridos**. Fotolink es el primer caso.

### Finanzas de empresa

- **`cash_movements`** — unifica únicos, recurrentes proyectados y costos de activos:
  un renglón por ocurrencia con su fecha real.
- **`finance_monthly` / `finance_yearly`** — resultado con el **overhead separado** del
  costo de proyectos.
- **`spend_by_payment_method`** — qué se paga con cada tarjeta o cuenta.
- **`spend_by_category`** — en qué se va la estructura.

## 5. Motor de alertas

`generate_alerts()` recorre los umbrales **90, 60, 30, 15 días**. Cron
`nova-alerts-daily`, `0 9 * * *` UTC (06:00 Uruguay).

**Cadena de renovación**, en orden causal:

1. **Confirmar** con el cliente (`confirm_by`) — solo ingresos de ciclo **anual o
   semestral**: pedir confirmación con 45 días para un servicio mensual generaba alertas
   permanentemente vencidas.
2. **Cobrar** — solo si ya confirmó y no se cobró.
3. **Renovar** — la alerta del activo.

Si el cliente **rechaza**, un trigger cierra las alertas abiertas del servicio: no tiene
sentido avisar de renovar algo que se da de baja.

**Idempotencia por índice único**: `(asset_id, threshold, due_date)` y
`(service_id, threshold, due_date, service_stage)`. Verificado: 2ª corrida genera 0.

## 6. Seguridad y RLS

RLS en todas las tablas. SELECT: cualquier autenticado. INSERT/UPDATE: `can_write()`
(admin u operador). DELETE: `is_admin()`. Anónimos sin acceso. Las funciones son
`security definer` para evitar recursión al consultar `profiles` desde una política.

**Limitación conocida:** todos los roles ven todo, incluidos costos netos y finanzas. No
hay segmentación por proyecto ni ocultamiento de información sensible.

**Alta de usuarios:** se crea en el dashboard de Supabase (Authentication → Users, con
Auto Confirm) y se promueve por SQL sobre `profiles.role`. No hay pantalla de usuarios.

## 7. Integridad: anti-duplicados

**UI:** `<SubmitButton>` (`useFormStatus`) se deshabilita mientras la acción está en vuelo.
**Base:** índices únicos parciales en projects (client+nombre), clients, assets
(identifier), asset_assignments vigentes y recurring_services por proyecto+concepto.

Origen: un doble clic creó proyectos duplicados y asignó el mismo dominio dos veces.

## 8. Conectores

Contrato en `src/lib/connectors/types.ts`. **Agregar un proveedor con API = crear un
archivo + registrarlo en `index.ts` + un UPDATE en `providers`.** La UI y `syncProvider()`
son genéricas.

| Proveedor | Estado | Qué trae |
|---|---|---|
| Hostinger | ✅ conectada | dominios, vencimientos, **precios reales** de `/billing/v1/subscriptions` |
| Cloudflare | ✅ conectada | dominios del registrador con vencimiento y autorrenovación, + zonas DNS |
| Google Workspace | ❌ sin conector | no hay API de facturación para clientes directos |
| nic.com.uy | ❌ sin API | ANTEL no expone API; queda WHOIS `whois.nic.org.uy` |

**Aprendizajes de API:**
- Los **tokens de cuenta** de Cloudflare dan 401 contra `/user/tokens/verify` aunque sean
  válidos. Verificar contra `/accounts` o `/zones`.
- Cloudflare devuelve **lista vacía sin error** cuando falta un permiso. Un `[]` no
  significa "no hay datos". El permiso de zona necesita **su propia política** con alcance
  "All zones from an account": no aparece bajo "Entire Account".
- Hostinger no vincula suscripción con dominio: el precio se deriva **por TLD**.
- Google: Cloud Billing API es solo GCP; Reseller API solo para revendedores. La vía
  práctica sería importar el CSV de factura.

## 9. Estado de datos (2026-09-07)

- 5 clientes, 5 proyectos (Fotolink marcado **propio**), ~30 activos, 5 proveedores
- nic.com.uy: 18 dominios `.uy` a $948 UYU/año = **$17.064 UYU/año**
- Hostinger: 12 ítems = **USD 792,24/año** (incluye VPS KVM 4 a USD 347,88/año)
- Cloudflare: fotolinkmedia.com USD 10,46/año, autorrenovación activa
- Fotolink: **USD 841 invertidos**, sin retorno todavía
- 0 alertas abiertas — el primer vencimiento es el 22/01/2027
- **0 métodos de pago cargados** y **0 gastos de estructura**: hasta que se carguen, los
  reportes por medio de pago y el overhead están vacíos
- 4 cargos "Desarrollo de landing" en USD 0 pendientes de completar o borrar

**Dato de negocio:** Cloudflare Registrar (USD 10,46) cuesta la mitad que Hostinger
(USD 20,19) para un `.com`. Hay 5 `.com` en Hostinger migrables al vencer.

## 10. Roadmap

### Hecho
Etapas 0, 1, 3, 5, 6 del plan original, más: proveedores con condiciones, costeo neto,
conectores API, búsqueda, anti-duplicados, responsive, eje de ingresos completo
(catálogo, cargos, anualidades ancladas, doble estado confirmación/cobro), finanzas de
empresa con métodos de pago y categorías, desglose línea por línea, proyectos propios.

### Pendiente
- **Ficha Técnica 360** (Etapa 2): tabla existe, falta UI. Pilar de memoria.
- Notificación por email de alertas
- Refresco WHOIS para los 18 dominios `.uy`
- Conector Google Workspace vía Admin SDK (conteo de licencias)
- Pantalla consolidada por cliente (`client_line_items` ya existe)
- Pantalla de usuarios y roles
- Etapas 7, 8, 9: automatizaciones, capa de IA, dashboard ejecutivo

## 11. Identidad visual

Tokens de `latamnova.app` en `src/app/globals.css`. **No inventar colores.**

```
--ink #05070f   --ink-2 #0a0e1e   --ink-3 #10162e
--accent #35e6d4 (cyan)   --violet #7b6cff
--cream #eaf0ff   --muted #93a0c2
Display: Space Grotesk · Body: Inter · Radio: 18px
```

Convenciones: tarjetas `rounded-[18px] border-line bg-ink-2`, formulario de alta en
columna derecha, chips de filtro redondeados, violeta para lo negativo o riesgoso, cyan
para lo positivo. Verbos según dirección: un egreso se **paga**, un ingreso se **cobra**.

Nav lateral fija en escritorio; bajo `lg` es barra superior con menú desplegable. Tablas
con `overflow-x-auto` y ancho mínimo; columnas secundarias ocultas en móvil.

## 12. Comandos habituales

```bash
npm run dev
npm run build                      # verificar antes de commitear

npx supabase migration new <nombre>
npx supabase db push
npx supabase db query --linked --file <archivo.sql>

git push                           # deploy automático
npx -y vercel logs <url>           # errores de runtime

npm run agent:status               # ¿hay otro agente trabajando?
```

**Regla:** todo cambio de esquema es una migración versionada. Nunca desde el dashboard.
