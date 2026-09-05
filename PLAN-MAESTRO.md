# Plan Maestro de Construcción — Nova Tech Hub

**Latam Nova Group System** · Documento base v1.0 · Septiembre 2026

---

## 1. Contexto y problema que resuelve

Latam Nova Group System es una empresa de desarrollo tecnológico (software, automatización, sitios web, landings, e-commerce) cuyo principal cliente es Senderos Group, operando como cliente interno. Además atiende clientes externos: una agencia de viajes (e-commerce + sistema de gestión de procesos en presupuestación), profesionales independientes (psicólogos, abogados, con landings autoadministrables) y una empresa de transporte (landing autogestionable).

El problema central no es la falta de clientes ni de proyectos: es la **pérdida de memoria operativa**. Cada proyecto entregado deja detrás dominios, hostings, credenciales, decisiones técnicas, fechas de renovación y cobros recurrentes que hoy viven dispersos en cabezas, chats y planillas. Nova Tech Hub existe para que la empresa nunca pierda el conocimiento de qué construyó, con qué lo construyó, qué activos le pertenecen, qué vence y qué se cobra.

## 2. Definición: qué es y qué NO es (Etapa 0)

**Nova Tech Hub ES** el sistema nervioso interno de Nova: memoria técnica de proyectos, catálogo de activos tecnológicos, calendario de recurrencias y motor de alertas, con un dashboard ejecutivo encima y una capa de IA como asistente de consulta.

**Nova Tech Hub NO ES:**

- Un CRM: no gestiona pipeline comercial, leads ni oportunidades de venta.
- Un ERP: no lleva contabilidad, facturación fiscal ni recursos humanos.
- Una herramienta de gestión de tareas tipo Jira/Trello: no reemplaza el tablero de trabajo diario del equipo.
- Un portal de clientes (al menos en v1): es una herramienta interna de Nova.

Esta frontera es una regla de diseño: cada funcionalidad propuesta que empuje hacia CRM o ERP se rechaza o se difiere explícitamente. El mayor riesgo del producto es el scope creep hacia esas categorías.

## 3. Los 5 pilares

| Pilar | Pregunta que responde |
|---|---|
| **Memoria** | ¿Qué tiene este proyecto, cómo está hecho y qué se necesita para continuarlo? |
| **Activos** | ¿Qué es propiedad de Nova (dominios, hostings, herramientas, licencias) y dónde está en uso? |
| **Operación** | ¿Qué proyectos y clientes están activos, en qué estado y con quién? |
| **Recurrencia** | ¿Qué servicios se cobran o vencen, cuándo y por cuánto? |
| **Alertas** | ¿Qué requiere acción en los próximos 90/60/30/15 días? |

## 4. Arquitectura técnica

Stack confirmado por conocimiento previo del equipo — no se introduce tecnología nueva en v1:

- **Frontend:** Next.js (App Router) desplegado en **Vercel**.
- **Backend/datos:** **Supabase** — Postgres, Auth, Row Level Security, Storage (documentación adjunta) y Edge Functions.
- **Jobs programados:** `pg_cron` de Supabase o Vercel Cron para el barrido diario de vencimientos que genera alertas.
- **Notificaciones:** email transaccional (Resend o similar) en v1; WhatsApp/Telegram como automatización de v2+.
- **IA (v3):** API de Anthropic u OpenAI consultando la base vía RAG sobre fichas técnicas e historial. La IA lee, no escribe: es capa de consulta, nunca de mutación de datos.

Principios de arquitectura: una sola fuente de verdad (Postgres), RLS desde el día uno aunque los usuarios iniciales sean pocos, soft-delete en todas las entidades (la memoria no se borra, se archiva), y auditoría automática vía triggers que alimentan el historial sin depender de disciplina manual.

## 5. Modelo de datos v1 (borrador para especificación)

Este es el esqueleto a validar en el próximo paso (Modelo Funcional y de Datos). Nombres tentativos:

| Tabla | Propósito | Campos clave |
|---|---|---|
| `clients` | Clientes (Senderos, agencia de viajes, etc.) | nombre, tipo (interno/externo), contacto, estado |
| `projects` | Proyectos por cliente | cliente_id, nombre, tipo (landing/e-commerce/sistema), estado, url_producción, repositorio |
| `project_tech_profiles` | Ficha Técnica 360 (1:1 con proyecto) | stack, infraestructura, integraciones, decisiones técnicas, requisitos para continuar |
| `assets` | Activos de Nova, independientes del proyecto | tipo (dominio/hosting/herramienta/licencia), proveedor, identificador, costo, fecha_vencimiento, propiedad (Nova/cliente) |
| `asset_assignments` | Vínculo activo↔proyecto (N:M) | asset_id, project_id, fecha_desde, fecha_hasta |
| `recurring_services` | Servicios recurrentes | proyecto_id o cliente_id, concepto, monto, moneda, frecuencia, fecha_próximo_cobro, fecha_vencimiento |
| `alerts` | Alertas generadas | origen (asset/servicio), umbral (90/60/30/15), estado (pendiente/vista/resuelta/pospuesta), acción_sugerida |
| `project_events` | Historial/timeline por proyecto | proyecto_id, tipo_evento, descripción, autor, timestamp |
| `documents` | Documentación adjunta (Storage) | entidad vinculada, tipo, url, versión |
| `profiles` | Usuarios internos + roles | rol (admin/operador/lectura) |

Decisiones deliberadas del modelo: los **activos viven separados de los proyectos** y se vinculan por asignación — así se sabe qué es de Nova aunque el proyecto termine. Y las **recurrencias distinguen cobro de vencimiento**: son dos fechas y dos flujos distintos (uno es ingreso, el otro es riesgo de caída de servicio).

## 6. Roadmap: 9 etapas en 3 releases

### Release 1 — MVP (Etapas 0, 1)
**Objetivo:** dejar de tener los proyectos en la cabeza.

- Etapa 0: este documento cerrado + Modelo Funcional y de Datos aprobado.
- Etapa 1 — Núcleo: auth con roles, CRUD de clientes y proyectos, grilla filtrable, dashboard básico (conteos por estado).
- **Criterio de salida:** el 100% de los proyectos reales de Nova (Senderos, agencia, psicólogos, abogados, transporte) cargados y consultables por cualquier usuario autorizado.

### Release 2 — Memoria y dinero (Etapas 2, 3, 4, 5, 6)
**Objetivo:** que el sistema avise antes de que algo venza y recuerde cómo está hecho cada proyecto.

- Etapa 2 — Ficha Técnica 360 por proyecto.
- Etapa 3 — Catálogo de activos + asignaciones.
- Etapa 4 — Servicios recurrentes con montos, fechas de cobro y vencimiento.
- Etapa 5 — Motor de alertas: job diario que evalúa umbrales 90/60/30/15 y genera alertas con acción clara (renovar, cobrar, migrar, dar de baja); notificación por email.
- Etapa 6 — Historial automático por proyecto (triggers) + eventos manuales.
- **Criterio de salida:** cero vencimientos sorpresa durante un ciclo completo de 30 días; toda renovación conocida con ≥15 días de anticipación.

### Release 3 — Automatización e inteligencia (Etapas 7, 8, 9)
**Objetivo:** que el sistema trabaje solo y responda preguntas.

- Etapa 7 — Automatizaciones: recordatorios multicanal, escalamiento de alertas ignoradas, generación de resúmenes semanales.
- Etapa 8 — IA: consultas en lenguaje natural ("¿qué tiene el proyecto de la agencia y qué se necesita para continuarlo?") vía RAG sobre fichas, activos e historial.
- Etapa 9 — Dashboard ejecutivo: proyectos activos, renovaciones próximas, cobros previstos del mes, alertas abiertas, documentación pendiente.
- **Criterio de salida:** una consulta de continuidad de proyecto respondida por la IA con precisión validada contra la ficha real.

## 7. Sistema de alertas (diseño funcional)

Un job diario compara `fecha_vencimiento` y `fecha_próximo_cobro` de activos y servicios contra los umbrales 90, 60, 30 y 15 días. Cada cruce de umbral genera **una** alerta (idempotencia: nunca duplicar la misma alerta del mismo umbral). Toda alerta nace con una acción sugerida y un responsable, y transita estados: pendiente → vista → resuelta (o pospuesta con nueva fecha). Una alerta de 15 días no resuelta escala: notificación adicional y prioridad en dashboard. La métrica de éxito del sistema entero es simple: **cantidad de vencimientos que sorprendieron a Nova = 0**.

## 8. Capa de IA (v3) — alcance acotado

La IA entra última, cuando ya hay datos limpios que consultar. Casos de uso definidos: (1) consulta de continuidad — qué tiene un proyecto, cómo está hecho, qué se necesita para retomarlo; (2) resumen de estado de cliente o cartera; (3) asistencia para completar fichas técnicas sugiriendo campos faltantes. Fuera de alcance: que la IA modifique datos, tome decisiones de cobro o hable con clientes.

## 9. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Scope creep hacia CRM/ERP | Regla de Etapa 0: toda feature nueva se contrasta contra "qué NO es" antes de entrar al backlog |
| Datos desactualizados = sistema muerto | Historial por triggers (automático), carga inicial completa como criterio de salida del MVP, y responsable asignado por proyecto |
| Credenciales sensibles en la base | Las credenciales NO se almacenan en texto en el Hub: se registra *dónde* están (gestor de secretos, vault) y quién tiene acceso |
| Construir la IA antes de tener datos | Orden de releases inamovible: la IA es Release 3, sin excepciones |
| Un solo desarrollador / bus factor | El Hub es en sí mismo la mitigación: la ficha 360 es el plan de continuidad de cada proyecto |

## 10. Próximo paso inmediato

Escribir el **Modelo Funcional y de Datos**: tomar el borrador de la sección 5 y convertirlo en especificación ejecutable — definición exacta de tablas Supabase (tipos, constraints, FKs), políticas RLS por rol, reglas de negocio de alertas y recurrencias, y wireframe de las 4 pantallas del MVP (login, grilla de proyectos, detalle de proyecto, dashboard). Con ese documento aprobado, la Etapa 1 se construye directo sobre Next.js + Supabase sin decisiones pendientes.
