# FoodHub POS

POS + tienda online multi-tenant para restaurantes. UI en español.

## Stack
- Vite 8 + React 19 (JS/JSX, no TypeScript), react-router-dom 7, Tailwind 4, componentes estilo shadcn.
- Supabase: Postgres + Auth + Edge Functions (Deno) en `supabase/functions/`.
- Deploy en Vercel (`vercel.json`, `middleware.ts` para previews sociales por tenant).
- `python-server/`: servicio local de impresión de tickets (Flask), independiente del frontend.

## Comandos
- `npm run dev` · `npm run build` · `npm run lint` (oxlint)
- Tests: `npm run test:ui` y `node --test tests/*.test.mjs`

## Estructura
- `src/App.jsx`: rutas. `src/main.jsx`: entrada.
- `src/pages/`: una vista por pantalla (Pos, Kitchen, Dashboard, Settings, SuperAdmin, Subscription…).
- `src/components/<área>/`: componentes por dominio (pos, catalog, admin, public, reports…).
- `src/components/ui/`: primitivas compartidas (`button`, `IconButton`, `Modal`, `PageHeader`…). Reusarlas antes de crear nuevas.
- `src/services/*Service.js`: todo acceso a Supabase y APIs externas va acá, no en componentes.
- `src/lib/supabase.js`: cliente. `src/utils/tenant.js`: resolución de tenant por subdominio de `foodhub.work`.
- Pagos: Klap (checkout) y Flow (suscripciones). Delivery: Uber Direct. Mensajería: WhatsApp.

## Convenciones
- Botones e iconos: seguir `docs/buttons-and-icons.md`.
- Nuevas migraciones: `supabase/migrations/<timestamp>_<nombre>.sql`. Para entender el esquema actual leer solo las migraciones recientes, no las 88.
- Commits directo en `main`, solo cuando se pida.

## Ahorro de contexto
- No leer: `package-lock.json`, `dist/`, `public/`, `src/assets/`, `klap_api.yml`, `python-server/FoodHubPrint.app/`.
- `scripts/scratch/` contiene pruebas manuales viejas; ignorar salvo que se pidan.
- Varias páginas superan las 1000 líneas (`SuperAdminView`, `CreateProductView`, `SettingsView`, `CheckoutForm`, `PosView`…): buscar con grep la sección relevante y leer por rangos, no el archivo entero.
