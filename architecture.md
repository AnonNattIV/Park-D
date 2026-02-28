# Park-D Architecture (Current State)

Last updated: 2026-02-27

## 1. Overview

Park-D is currently a Next.js App Router project with a login/register UI and two mock authentication APIs. The root route redirects users to `/login`.

## 2. Tech Stack

- Framework: Next.js 14 (`app` directory, standalone build output)
- UI: React 18 + Tailwind CSS
- Language: TypeScript (strict mode)
- Auth utilities available: `bcryptjs`, `jsonwebtoken`
- DB driver available: `mysql2`
- Containerization: Docker + Docker Compose

## 3. Codebase Layout

- `src/app/layout.tsx`: global layout + metadata
- `src/app/page.tsx`: redirect `/` -> `/login`
- `src/app/login/page.tsx`: client-side login form UI (animated)
- `src/app/register/page.tsx`: client-side registration form UI (animated)
- `src/app/api/auth/login/route.ts`: mock login endpoint
- `src/app/api/auth/register/route.ts`: mock register endpoint
- `src/lib/auth.ts`: password/JWT/email validation helpers
- `src/lib/db/prisma.ts`: commented templates for Prisma/Mongo/Supabase/pg
- `lib/db.js`: active MySQL pool helper using env vars
- `db.json`: JSON schema model for core domain tables
- `docs/AUTH_STORAGE_GUIDE.md`: storage/auth options and guidance

## 4. Runtime Architecture

### Frontend

- `/login` and `/register` are client components with local form state and UI validation.
- Form submit handlers currently log to console; API integration is not implemented.

### Backend API

- `POST /api/auth/login`
  - Validates `username` and `password`.
  - Returns a mock user object.
- `POST /api/auth/register`
  - Validates required fields, email format, password match, and minimum length.
  - Returns a mock created user object.
- No real DB read/write, no session/cookie flow, and no token issuance in active route code.

### Auth Layer

- `src/lib/auth.ts` provides:
  - password hash/verify
  - JWT sign/verify
  - email/password/username validation helpers
- These helpers are currently not wired into the API routes.

### Data Layer

- `lib/db.js` defines a MySQL connection pool requiring:
  - `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- `src/lib/db/prisma.ts` is a template-only file (all options commented out).
- `db.json` defines schema-level structure for:
  - `users`, `owner_profiles`, `parking_lots`, `bookings`, `payments`, `reviews`
- No migrations, ORM schema, or repository/service layer is currently active.

## 5. Deployment Architecture

- `next.config.mjs` uses `output: 'standalone'`.
- `Dockerfile` is multi-stage (`deps -> builder -> runner`) and runs as non-root user.
- `docker-compose.yml` exposes port `3000` and injects env from `.env`.
- Secrets workflow uses `git-secret`:
  - `.env` is ignored
  - `.env.secret` is encrypted and tracked

## 6. Current Build/Quality State

- `npm run lint`: passes with no ESLint issues.
- `npm run build`: succeeds (static routes for `/`, `/login`, `/register`; dynamic API routes under `/api/auth/*`).
- No automated test suite is configured yet.

## 7. Current Gaps

- Login/register UI is not connected to backend APIs.
- Auth endpoints are mock-only (no persistence, no real credential verification).
- Two DB approaches coexist (`lib/db.js` and template-based `src/lib/db/prisma.ts`) without one selected implementation.
- `.env.example` documents `JWT_SECRET` and `DATABASE_URL`, while active MySQL helper expects `DB_*` variables.
- `README.md` still says the repo only contains deployment files, which no longer matches the codebase.
