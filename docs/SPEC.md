# Nova Tech Hub — Especificación técnica viva

> **Documento de referencia único.** Si vas a tocar el código, leé esto primero.
> Evita tener que reconstruir la lógica leyendo archivos sueltos.
> Última actualización: 2026-09-07 (cierre de sesión, auditoría completa)

---

## 1. Qué es y qué no es

**Nova Tech Hub** es el sistema nervioso interno de **LatamNova Group SAS**: memoria
técnica de proyectos, catálogo de activos, proveedores, costeo neto, ingresos, margen,
finanzas de la empresa, socios, colaboradores, horas de trabajo y motor de alertas.

**NO es** un CRM, **NO es** un ERP ni sistema contable (sin facturación fiscal, IVA,
conciliación ni plan de cuentas), **NO es** un gestor de tareas, **NO es** un portal de
clientes. Responde *"¿cómo venimos?"*, no reemplaza al contador.

**Regla transversal:** los costos netos, márgenes, aportes y horas son **información
interna**. La única excepción explícita es el panel "Lo que paga el cliente", marcado
como compartible.

## 2. Stack y despliegue

| Capa | Tecnología |
|---|---|
| Frontend | Next.js 16.3.4 (App Router, RSC), React 19, TypeScript, Tailwind 4 |
| Backend | Supabase — Postgres 17, Auth, RLS, `pg_cron` |
| Hosting | Vercel (auto-deploy en push a `main`) + Vercel Cron |
| Dominio | https://hub.latamnova.app |
| Repo | https://github.com/Senderosuy/nova — **⚠ todavía público, pasar a privado** |
| Supabase | ref `swsdfrkkzrswjnliihxt` (West US Oregon) |

**Convenciones de Next 16:** middleware = `src/proxy.ts` exportando `proxy()`. Las rutas
`/api` están **excluidas** del guard de sesión: se autentican por su cuenta.

**Frontera cliente/servidor:** lógica en `src/lib/` sin directiva. Un helper exportado
desde `"use client"` no puede invocarse desde un Server Component (falla en runtime).

**React 19:** no llamar `setState` dentro de `useEffect` para sincronizar props. Comparar
durante el render y setear ahí (ver `nav.tsx`).

**Postgres:** `create or replace view` **no permite intercalar columnas**. Las nuevas van
al final o hay drop + recreate en cascada.

### Variables de entorno

| Variable | Uso | Visibilidad |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `_PUBLISHABLE_KEY` | cliente y servidor | pública |
| `HOSTINGER_API_TOKEN`, `CLOUDFLARE_API_TOKEN` | conectores | secreta |
| `SUPABASE_SERVICE_ROLE_KEY` | cron de sincronización de fichas | secreta, salta RLS |
| `CRON_SECRET` | protege `/api/cron/*` | secreta |
| `GITHUB_TOKEN` | fichas desde repos privados | secreta, opcional |

Nunca imprimir valores en chat, logs ni commits.

## 3. Modelo de datos

### Entidades

| Tabla | Rol |
|---|---|
| `profiles` | usuarios + rol (`admin` / `operador` / `lectura`) |
| `clients` | clientes; entidades legales (Senderos Group SAS, Molha e Safie Ltda) |
| `projects` | proyectos con `ownership_type` (cliente / propio), `brand`, `client_hourly_rate` |
| `project_tech_profiles` | Ficha 360: documento completo (`doc_content`) + campos |
| `providers` | a quién se le paga de forma sostenida, con `payment_method_id` por defecto |
| `assets` | activos con `ownership` (nova / cliente), `cost_reason`, `registered_at`, `auto_renew` |
| `asset_assignments` | activo ↔ proyecto con vigencia |
| `recurring_services` | recurrentes con `direction`, `scope`, `billing_mode`, `anchor_asset_id` |
| `project_charges` | movimientos únicos con `direction`, `scope` |
| `payment_methods` | medios de pago con titularidad: socio / cliente / Nova |
| `partners` | socios, participación, tipo de aporte |
| `partner_repayments` | retiros: `amortizacion` (baja el aporte) o `utilidad` (no lo toca) |
| `collaborators` | quién trabaja y cuánto cobra por hora |
| `work_assignments` | trabajo asignado: por horas o por entregable |
| `time_entries` | horas registradas |
| `alerts` | alertas por activo, servicio o tarjeta |
| `app_settings` | tipos de cambio, meses de reserva, % amortización |

### Los ejes que clasifican cada movimiento

- **`direction`**: ingreso / egreso
- **`scope`**: proyecto / empresa
- **`ownership`** del activo: nova / cliente
- **titularidad del medio de pago**: socio / cliente / Nova

### Reglas de exclusión — LEER ANTES DE TOCAR CUALQUIER VISTA

Estas reglas deciden qué cuenta como costo de Nova. **Cada vista que suma dinero debe
aplicarlas todas.** Hoy fallaron tres veces por aplicarlas en una vista y no en otra.

| Regla | Efecto |
|---|---|
| `direction = 'egreso'` | solo egresos son costo; solo ingresos son ingreso |
| `ownership = 'cliente'` | el activo es del cliente: Nova lo administra, no lo costea |
| medio de pago con `owner_client_id` | lo pagó el cliente: no es costo ni aporte |
| `scope = 'empresa'` | overhead, no cuelga de ningún proyecto |
| `confirmation_status <> 'rechazada'` | un servicio rechazado no proyecta nada |
| `first_charge_date` / `billing_mode = 'vencido'` | no contar cobros previos al primero efectivo |

**Vistas que suman dinero y deben ser coherentes entre sí:** `cash_movements`, `ledger`,
`project_costs`, `project_annual_costs`, `project_annual_revenue`, `project_line_items`,
`sustainability`, `partner_account`, `project_funding`, `finance_monthly/yearly`.
Verificación de coherencia: el costo de un proyecto por `project_line_items` (año en
curso), `project_annual_costs` y `cash_movements` debe coincidir. Auditado 2026-09-07: coincide.

### Decisiones estructurales

1. Activos separados de proyectos; desasignar cierra vigencia, no borra.
2. **Asignar un activo a un proyecto NO lo vuelve del cliente.** En las landings Nova paga
   el dominio y lo cobra en la anualidad. `ownership` se cambia aparte.
3. Todo activo sin proyecto declara `cost_reason`; sin causa, se marca en violeta.
4. Soft-delete en clients, projects, assets, providers.
5. Credenciales no se almacenan. Métodos de pago: solo últimos 4 dígitos + mes de vencimiento.
6. Un gasto puntual no es activo: activo = se posee y renueva; cargo = ocurrió una vez.
7. **Mientras Nova no tenga medio propio, todo egreso sin medio identificado lo cubrió el
   socio de capital.** Se apaga solo al crear un medio de la empresa.
8. **Socios trabajan como colaboradores y cobran por su trabajo**, aparte del aporte de capital.
9. Marca = etiqueta transversal en el proyecto, no nivel de jerarquía. Con 2 entidades
   legales no hace falta `parent_client_id`; se agrega cuando sean 5+.

### Ciclos y monedas

`mensual · trimestral · semestral · anual · unico · gratis`. Monedas: USD, UYU, BRL.
Conversión centralizada en `to_usd(amount, currency)`. Tipos de cambio en `app_settings`.

## 4. Lógica financiera

- **`project_annual_costs`** — año calendario, no prorratea (`payments_in_year`).
- **`project_annual_revenue`** — cargos de ingreso + recurrentes proyectados.
- **`project_line_items`** — desglose por ítem, base anual USD, con `paid_by_client` y
  `reference_usd_year` para mostrar lo del cliente entre paréntesis sin sumarlo.
- **`billing_mode`** adelantado/vencido: las landings existentes cobran a año vencido.
- **Anualidades ancladas**: `confirm_by = expires_at − lead_days` (45). Se recalcula solo.
- **`project_investment`** — productos propios: invertido, recuperado, posición neta.
- **`project_funding`** — quién financió cada proyecto.
- **`cash_movements`** — libro base; **`ledger`** = con nombres resueltos, filtrable.
- **`sustainability`** — dos lecturas: `recurring_revenue_usd` (**comprometido**: cliente
  confirmó) y `projected_revenue_usd` (todo lo cargado). Hoy 0% vs 17,9%.
- **`profit_waterfall`** — cascada: reserva (2 meses) → amortización (30%) → reparto 50/50.
  Es propuesta, no movimiento.
- **`client_spend_items` / `_by_provider`** — lo que paga el cliente, agrupado por proveedor.
- **`assignment_summary`, `project_work_summary`, `collaborator_account`** — horas y trabajo.

### ⚠ Brecha conocida: el trabajo está fuera del flujo de caja

`work_assignments` y `time_entries` **no entran en `cash_movements`**. El costo de horas no
impacta Finanzas, ni el margen del proyecto (`project_line_items`), ni la inversión de
Fotolink, ni el aporte del socio. Siendo la línea de negocio principal, es lo primero a
resolver. Decisiones pendientes: ¿el costo entra cuando se registra la hora o cuando se
paga? ¿Las horas no pagadas de los socios son deuda de Nova hacia ellos?

## 5. Motor de alertas

`generate_alerts()` diario 09:00 UTC, umbrales 90/60/30/15. Antes, `roll_expirations()`
08:30 avanza vencimientos de dominios con `registered_at` (aniversario) o `auto_renew`.

Fuentes: activos, servicios (confirmación → cobro, solo ciclos anual/semestral), tarjetas
(con conteo de dependencias). Un rechazo cierra las alertas del servicio. Idempotente.

## 6. Seguridad

RLS en **todas** las tablas (auditado). SELECT autenticado; INSERT/UPDATE `can_write()`;
DELETE `is_admin()`. Usuarios: cristian@ e it@senderosgroup.com, ambos admin.

**Limitación:** todos los roles ven todo. `/api/cron/*` protegido por `CRON_SECRET`.
Sin secretos en el historial de git (auditado).

## 7. Integraciones

| Proveedor | Estado |
|---|---|
| Hostinger | ✅ dominios, vencimientos, precios reales |
| Cloudflare | ✅ registrador (vencimiento, autorrenovación) + zonas |
| nic.com.uy | ✅ fecha de alta por API pública de ANTEL; vencimiento derivado del aniversario. Captcha tras ~4 consultas: lotes de 3, se detiene al detectarlo. 7/18 con fecha |
| GitHub | ✅ README → ficha técnica, cron diario 07:00 Vercel |
| Lovable | ✅ lectura de proyectos vía MCP (manual, no automatizado) |
| Google Workspace | ❌ sin API de facturación |

## 8. Fichas técnicas

El README del repo es la ficha. Si tiene secciones reconocibles, se parsean a campos.
Completitud: 100% si hay documento; por campos si es manual. Estado: 4/5 con doc
(Newen desde GitHub; Daniela, Rosmari y Fotolink desde Lovable). José Calisto manual pendiente.

## 9. Estado de datos (2026-09-07)

- 9 clientes, 9 proyectos (Fotolink propio), ~40 activos, 5 proveedores, 7 métodos de pago
- Aporte de Cristian: **USD 4.865**. Resultado acumulado −4.865. Sin excedente.
- Gastos fijos USD 298/mes; ingreso comprometido 0; proyectado 53/mes.
- 2 colaboradores (socios) sin tarifa definida. 0 asignaciones.
- 0 alertas abiertas; primer vencimiento 22/01/2027.

## 10. Roadmap

### Hecho en esta sesión
Eje de ingresos completo, finanzas de empresa, métodos de pago con titularidad, socios
y cascada, activos del cliente, causa de gasto, marca, BRL, libro de movimientos con
drill-down, dashboard ejecutivo, vista por cliente, Ficha 360 con importación y sync
desde GitHub, gasto del cliente, colaboradores y horas, edición/archivado de proyectos.

### Pendiente
Ver `.agent/NOTES.md`, sección 2026-09-07 cierre.

## 11. Identidad visual

Tokens de `latamnova.app` en `globals.css`. Violeta = negativo/riesgo, cyan = positivo.
Verbos: egreso se **paga**, ingreso se **cobra**. Importes entre paréntesis = referencia,
no suman.

## 12. Comandos

```bash
npm run dev · npm run build · npx tsc --noEmit · npx eslint "src/**/*.{ts,tsx}"
npx supabase migration new <n> · npx supabase db push
npx supabase db query --linked --file <f.sql>
npm run agent:status
```
