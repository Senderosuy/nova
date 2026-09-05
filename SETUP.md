# Setup — Nova Tech Hub (GitHub + Supabase + Vercel)

Checklist de arranque. Orden recomendado: repo → Supabase → proyecto local → Vercel.

## 1. Repositorio GitHub

1. Crear repo privado `nova-tech-hub` en la organización/cuenta de Latam Nova (web de GitHub o `gh repo create nova-tech-hub --private`).
2. Rama principal: `main`. Trabajo por ramas `feat/...` con merge a `main`.
3. `.gitignore` de Next.js desde el inicio — debe incluir `.env*`, `node_modules/`, `.next/`.
4. Regla innegociable: **nunca** commitear `.env`, `*.key`, `*.pem`. Revisar `git status` antes de cada `git add`.

## 2. Proyecto Supabase

1. Crear proyecto en supabase.com → nombre `nova-tech-hub`, región `South America (São Paulo)` (menor latencia desde Uruguay).
2. Guardar en gestor de secretos (no en el repo): Project URL, anon key, service_role key, contraseña de la base.
3. Instalar CLI: `npm i -D supabase`, luego `npx supabase login` y `npx supabase link --project-ref <ref>`.
4. Migraciones versionadas en el repo desde el día uno: `npx supabase migration new init_schema` → el SQL vive en `supabase/migrations/` y se commitea. Nada de tocar el schema solo desde el dashboard.
5. Activar RLS en toda tabla nueva apenas se crea.

## 3. Proyecto local (Next.js)

1. `npx create-next-app@latest nova-tech-hub` → TypeScript, App Router, Tailwind, ESLint.
2. `npm i @supabase/supabase-js @supabase/ssr`
3. Crear `.env.local` con `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` (la service_role **no** va en variables `NEXT_PUBLIC_`; solo en server si hiciera falta).
4. Crear `.env.example` con las claves vacías — este sí se commitea.
5. Primer commit + `git push -u origin main`.

## 4. Vercel

1. Importar el repo de GitHub en vercel.com → framework autodetectado (Next.js).
2. Cargar las variables de entorno en Vercel (Production y Preview).
3. Deploy automático: push a `main` = producción; ramas = preview deployments.

## 5. Estructura inicial del repo

```
nova-tech-hub/
├── CLAUDE.md              ← identidad del proyecto (Capa 2)
├── PLAN-MAESTRO.md        ← este spec
├── supabase/migrations/   ← schema versionado
├── src/app/               ← Next.js App Router
├── .env.example
└── .env.local             ← ignorado por git
```

## 6. Criterio de "setup terminado"

Repo en GitHub con primer commit, proyecto Supabase linkeado con al menos una migración aplicada, `npm run dev` corriendo local conectado a Supabase, y deploy en Vercel funcionando. Recién ahí arranca la Etapa 1 del Plan Maestro.
