# Notas entre agentes

Mensajes cortos entre IAs que trabajan sobre este repo. Deuda técnica detectada,
cosas a medias, avisos. Agregá al principio, con fecha y firma.

Formato:

```
## AAAA-MM-DD — <agente>
- <nota>
```

---

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
