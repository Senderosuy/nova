# Notas entre agentes

Mensajes cortos entre IAs que trabajan sobre este repo. Deuda técnica detectada,
cosas a medias, avisos. Agregá al principio, con fecha y firma.

Formato:

```
## AAAA-MM-DD — <agente>
- <nota>
```

---

## 2026-09-07 — claude-opus — CIERRE DE SESIÓN CON AUDITORÍA

### Resultado de la auditoría
- `tsc` limpio, `eslint` limpio (se corrigió un `setState` en `useEffect` del nav).
- Integridad referencial: 0 huérfanos, 0 asignaciones a archivados, 0 contradicciones.
- **Coherencia entre vistas verificada**: costo por `project_line_items`, `project_annual_costs`
  y `cash_movements` coincide en todos los proyectos. Aporte del socio (4.865,33) coincide
  con la suma de egresos no pagados por clientes.
- RLS en todas las tablas. Sin secretos en git. Crons corriendo (alertas, roll, docs).
- Todas las rutas redirigen a login sin sesión. `/api/cron` con secreto responde 401 sin él.

### LO QUE NO CUADRA — resolver primero mañana
1. **El trabajo por horas está fuera del flujo de caja.** `work_assignments` y `time_entries`
   no entran en `cash_movements`. El costo de desarrollo —la línea principal— no impacta
   Finanzas, ni el margen del proyecto, ni la inversión de Fotolink, ni el aporte del socio.
   Decisiones que hay que tomar con Cristian antes de tocar código:
   - ¿El costo entra al registrar la hora o al pagarla?
   - ¿Las horas no pagadas de los socios son deuda de Nova hacia ellos (como el aporte)?
   - ¿Un entregable entra a la fecha de entrega o de creación?
   Al resolverlo, aplicar TODAS las reglas de exclusión del SPEC §3 en `cash_movements`
   y verificar coherencia con la query de auditoría.
2. **Repo `Senderosuy/nova` sigue PÚBLICO.** Pasar a privado (GitHub → Settings →
   Change visibility). Es el código del sistema interno.
3. **`spend_by_payment_method` no muestra tarjetas de clientes** (usa `cash_movements`,
   que las excluye). Decidir si el reporte "por método" debe mostrar todo lo que pasa por
   una tarjeta o solo lo de Nova. Hoy: solo Nova.

### Carga pendiente del usuario (no requiere código)
- Tarifas por hora de Cristian y Never en Colaboradores (hoy null: bloquea asignaciones).
- Vencimiento real de Santander Visa ····8029 (para la alerta de tarjeta).
- Ficha técnica de José Calisto (heredado, carga manual).
- 4 cargos "Desarrollo de landing" en USD 0: completar o borrar.
- 11 dominios .uy sin fecha de alta: seguir sincronizando nic.com.uy (de a 3).
- 17 activos sin causa de gasto (chip "Sin causa" en Activos).
- Gasto del estudio contable (llega en octubre).
- Cliente Molha e Safie Ltda con sus proyectos (Sabor Uruguai y Sistema de Gestión Brasil
  ya existen; verificar que cuelguen de esa entidad y tengan marca "Senderos Uruguai").
- Confirmar anualidades de los 4 clientes (botón "Confirmó") a medida que respondan.

### Roadmap corto
- Email de alertas (Resend). Sin urgencia: primer vencimiento 22/01/2027.
- Código legible de proyecto (`PRJ-2026-0014`) para presupuestos y facturas.
- Cuando haya un cliente pidiendo acceso: vistas públicas + API keys con alcance.
- Paginación y CSV en `/finanzas/movimientos` cuando superen ~500 filas.
- Materializar `cash_movements` si con cientos de clientes se pone lenta.
- `parent_client_id` cuando las entidades legales sean 5+.
- Pantalla de usuarios y roles (hoy por SQL).

### Trampas de esta sesión, para no repetir
- **Cada regla nueva de "esto no es costo de Nova" obliga a revisar TODAS las vistas que
  suman dinero.** Falló 3 veces hoy. Lista en SPEC §3. Correr la query de coherencia
  después de cualquier cambio en vistas financieras.
- **Datos creados antes de una regla nueva quedan con el default y mienten en silencio.**
  Pasó con `direction` (Google Workspace en cero), con ingresos de Fotolink (egresos
  contados como ingreso) y con la sustentabilidad (anualidades no confirmadas). Al agregar
  una columna con default, revisar los registros existentes.
- **Reemplazos por script sobre JSX**: 3 fallos silenciosos por patrones que no matchearon.
  Verificar visualmente después, no solo el build. Un `<th>` faltante compila igual.
- `create or replace view` no intercala columnas: las nuevas al final.
- Windows: `/tmp` en Node no es `/tmp` de Git Bash. Usar rutas del proyecto.
- No hay Python en la máquina: usar Node para scripts.

## 2026-09-07 — claude-opus

- **Cloudflare quedó conectado del todo.** El token tiene tres políticas: zonas
  (Zone Read, alcance "All zones from an account"), cuenta (Registrar Domains Read) y
  las originales. Sin la política de zonas separada, `/zones` devolvía `[]` sin error.
  El conector ahora lee registrador + zonas y evita duplicar un dominio que tenga ambos.
- **Pendiente de carga del usuario, bloquea reportes:** 0 métodos de pago y 0 gastos de
  estructura. Hasta que existan, "Gasto por método de pago" y el overhead en Finanzas
  están vacíos, y 32 activos no tienen medio de pago asociado.
- **4 cargos "Desarrollo de landing" en USD 0** repartidos entre proyectos: completar el
  importe o borrarlos, hoy no computan ingreso.
- **Ficha Técnica 360 sigue sin UI.** Es lo único del plan maestro original que nunca se
  construyó y es el pilar de memoria del producto. Siguiente en la fila.
- **Trampa de Postgres:** `create or replace view` no deja intercalar columnas nuevas en
  el medio (error 42P16). Agregarlas al final o hacer drop+recreate en cascada.
- **Ojo con los reemplazos por script** sobre JSX ya modificado: varias veces el patrón
  buscado había cambiado y el cierre `</div>` no se insertó, rompiendo el build. Si
  automatizás ediciones, verificá con `npm run build` inmediatamente después.

## 2026-09-06 — claude-opus (sesión inicial)

- **Pendiente de acción humana:** al token de Cloudflare le faltan los permisos
  `Zone → Zone → Read` y `Account → Domain Registrar → Read`. Sin ellos la API
  devuelve lista vacía **sin error** y `fotolinkmedia.com` se cargó a mano.
- **Sin UI todavía:** `project_tech_profiles` (Ficha Técnica 360) y
  `recurring_services`. Las tablas existen y tienen datos cargados por SQL. Son las
  dos próximas piezas del roadmap.
- **Deuda menor:** el filtrado de las listas ocurre en memoria (JS) porque los
  volúmenes son chicos (28 activos). Si el inventario supera ~500 filas, mover el
  filtro a la consulta SQL con `ilike`.
- **Ojo con:** `payments_in_year()` proyecta ±40 ciclos desde la fecha ancla. Alcanza
  para ciclos mensuales y anuales en un horizonte de ±3 años. Si se agregan ciclos
  más cortos, revisar el rango.
- **Oportunidad de negocio detectada:** Cloudflare Registrar cobra USD 10,46 por un
  `.com` contra USD 20,19 de Hostinger. Hay 5 `.com` en Hostinger migrables al vencer.
