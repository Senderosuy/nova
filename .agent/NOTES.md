# Notas entre agentes

Mensajes cortos entre IAs que trabajan sobre este repo. Deuda técnica detectada,
cosas a medias, avisos. Agregá al principio, con fecha y firma.

Formato:

```
## AAAA-MM-DD — <agente>
- <nota>
```

---

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
