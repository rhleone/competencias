# Competencias Deportivas

Plataforma web oficial de **Competencias Deportivas**. Permite gestionar ediciones, disciplinas, equipos, fixture y resultados en tiempo real.

## Stack

| Tecnología | Uso |
|---|---|
| Next.js 14 (App Router) | Framework frontend + SSR |
| TypeScript | Tipado estático |
| Tailwind CSS | Estilos utilitarios |
| shadcn/ui | Componentes de UI |
| Supabase | Base de datos (PostgreSQL) + Auth + Realtime |
| TanStack Query | Cache y sincronización de estado del servidor |
| Zod | Validación de esquemas |

## Estructura del proyecto

```
src/
├── app/
│   ├── (admin)/admin/        # Panel de administración (protegido)
│   ├── (operator)/operator/  # Carga de resultados (protegido)
│   ├── (public)/resultados/  # Resultados públicos
│   ├── auth/login/           # Página de login
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── admin/                # Componentes del panel admin
│   ├── public/               # Componentes públicos
│   ├── ui/                   # Componentes shadcn/ui
│   └── providers.tsx         # TanStack Query provider
├── hooks/                    # Custom React hooks
├── lib/
│   ├── supabase/
│   │   ├── client.ts         # Cliente browser
│   │   ├── server.ts         # Cliente server-side
│   │   └── middleware.ts     # Middleware de sesión
│   └── scheduling/
│       └── engine.ts         # Motor de generación de fixtures
├── middleware.ts              # Middleware Next.js (protección de rutas)
└── types/
    └── database.ts           # Tipos TypeScript del schema de Supabase
supabase/
└── migrations/
    └── 001_initial_schema.sql  # Schema completo de la base de datos
```

## Roles de usuario

- **admin**: acceso completo — crear ediciones, disciplinas, equipos, generar fixtures
- **operator**: solo puede cargar resultados de partidos del día

## Cómo correr localmente

### Prerrequisitos

- Node.js 18+
- Una cuenta en [Supabase](https://supabase.com) (gratuita)

### 1. Clonar e instalar dependencias

```bash
git clone <repo-url>
cd belgraneanos
npm install
```

### 2. Configurar variables de entorno

Copiá el archivo de ejemplo y completá con tus credenciales de Supabase:

```bash
cp .env.example .env.local
```

Editá `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 3. Correr el servidor de desarrollo

```bash
npm run dev
```

Abrí [http://localhost:3000](http://localhost:3000).

## Configurar Supabase

### 1. Crear un proyecto nuevo

1. Ingresá a [app.supabase.com](https://app.supabase.com)
2. Hacé clic en **New Project**
3. Elegí organización, nombre (`belgraneanos`), contraseña y región (South America)
4. Esperá a que el proyecto se inicialice (~2 minutos)

### 2. Obtener las credenciales

En el dashboard de Supabase: **Settings → API**

- `NEXT_PUBLIC_SUPABASE_URL` → Project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` → `anon` `public` key
- `SUPABASE_SERVICE_ROLE_KEY` → `service_role` key (nunca expongas esta en el cliente)

### 3. Ejecutar la migración SQL

1. Ir a **SQL Editor** en el dashboard de Supabase
2. Copiar y pegar el contenido de `supabase/migrations/001_initial_schema.sql`
3. Ejecutar con **Run**

Esto creará todas las tablas, la vista `standings`, las políticas de RLS y los triggers.

### 4. Crear el primer usuario admin

En **Authentication → Users**, crea un usuario. Luego en **SQL Editor**:

```sql
update public.profiles
set role = 'admin'
where email = 'tu@email.com';
```

## Desplegar en Vercel

### 1. Preparar el repositorio

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/tu-usuario/belgraneanos.git
git push -u origin main
```

### 2. Importar en Vercel

1. Ir a [vercel.com/new](https://vercel.com/new)
2. Importar el repositorio de GitHub
3. En **Environment Variables**, agregar las tres variables del `.env.local`
4. Hacer clic en **Deploy**

### 3. Configurar dominio personalizado (opcional)

En el dashboard de Vercel → **Settings → Domains**, agregar tu dominio.

## Motor de Scheduling

El archivo `src/lib/scheduling/engine.ts` implementa:

- `generateRoundRobinPairs()` — algoritmo circular (polygon method) para generar todos los enfrentamientos de un grupo
- `generateAvailableSlots()` — genera todos los turnos disponibles dado el rango de fechas y configuración de la disciplina
- `scheduleMatches()` — asignación greedy con regla de no-conflicto de género (dos disciplinas del mismo género no pueden jugar en el mismo horario)

## Scripts disponibles

```bash
npm run dev      # Servidor de desarrollo
npm run build    # Build de producción
npm run start    # Servidor de producción
npm run lint     # ESLint
```
