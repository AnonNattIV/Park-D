# Park-D Architecture (Current State)

Last updated: 2026-02-27

## 1. Overview

Park-D is a Next.js App Router application with:

- DB-backed authentication against the `users` table
- JWT-based auth for API access
- a shared mock homepage for renter and owner users at `/user`
- a separate mock homepage for admin users at `/admin`
- an owner request workflow exposed through `PATCH /api/USER/{id}`

The root route redirects to `/login`.

## 2. Tech Stack

- Framework: Next.js 14 (`app` directory, standalone build output)
- UI: React 18 + Tailwind CSS
- Language: TypeScript (`strict: true`)
- Auth libraries: `bcryptjs`, `jsonwebtoken`
- Database driver: `mysql2`
- Deployment: Docker + Docker Compose

## 3. Source of Truth

The current source of truth for schema design is [db.json](C:\Users\natta\Documents\univer\year3\PM\Park-D\db.json).

`db.json` is now a database structure export, not the older hand-written JSON schema. It describes the current Railway database layout.

Current tables:

- `users`
- `owner_profiles`
- `parking_lots`
- `bookings`
- `payments`
- `reviews`

Current relationship model:

- `owner_profiles.user_id` -> `users.user_id`
- `parking_lots.owner_user_id` -> `owner_profiles.user_id`
- `bookings.user_id` -> `users.user_id`
- `bookings.lot_id` -> `parking_lots.lot_id`
- `payments.b_id` -> `bookings.b_id`
- `reviews.b_id` -> `bookings.b_id`

There is no separate `admins` table in the current schema.

## 4. Role Model

Application roles are derived from the `users` table.

Relevant columns:

- `users.roles`: MySQL `SET('RENTER','OWNER','ADMIN')`
- `users.owner_request_status`: `PENDING | APPROVED | REJECTED | NULL`
- `users.u_status`: `ACTIVE | INACTIVE | BANNED`

Runtime role mapping:

- `ADMIN` in `users.roles` -> app role `admin`
- approved owner state -> app role `owner`
- otherwise -> app role `user` (used as renter in the UI)

Owner is treated as active when:

- `owner_request_status = 'APPROVED'`
- `owner_profiles` row exists

The current resolver also treats approved owner state as `owner` even if the `OWNER` flag is not present in `users.roles`, so DB role flags and owner profile state can drift.

## 5. Codebase Layout

- `src/app/layout.tsx`: root layout and metadata
- `src/app/page.tsx`: redirects `/` to `/login`
- `src/app/login/page.tsx`: login UI, calls login API, stores token, redirects by role
- `src/app/register/page.tsx`: registration UI, calls register API
- `src/app/user/page.tsx`: shared mock page for renter and owner
- `src/app/admin/page.tsx`: separate mock page for admin only
- `src/app/api/auth/login/route.ts`: DB-backed login
- `src/app/api/auth/register/route.ts`: DB-backed registration
- `src/app/api/USER/[id]/route.ts`: user read/update and owner request workflow
- `src/lib/auth.ts`: bcrypt/JWT/validation helpers
- `src/lib/auth-client.ts`: client-side localStorage auth helpers
- `src/lib/roles.ts`: app role resolver from `users.roles`
- `src/lib/db/mysql.ts`: primary MySQL pool used by API routes
- `lib/db.js`: legacy MySQL pool helper still present, not the preferred path for new code
- `src/lib/db/prisma.ts`: commented template/reference file, not active runtime code

## 6. Frontend Flow

### Login

- The login page posts to `POST /api/auth/login`
- On success:
  - stores JWT in `localStorage` as `auth_token`
  - stores user payload in `localStorage` as `auth_user`
  - redirects `admin` to `/admin`
  - redirects all other users (`owner` and renter) to `/user`
- For non-admin users, the client also fetches `GET /api/USER/{id}` after login to refresh the stored user payload

### Registration

- The registration page posts to `POST /api/auth/register`
- On success it redirects back to `/login`

### Mock Homepages

- `/user`
  - shared for renter and owner
  - blocks admin users and redirects them to `/admin`
  - currently displays mock booking summary data

- `/admin`
  - allows only admin users
  - redirects non-admin users to `/user`
  - currently displays mock moderation metrics and a local-only owner verification queue

## 7. Backend API

### `POST /api/auth/login`

- Reads a user by `username` or `email` from `users`
- Verifies `password_hash` with bcrypt
- Rejects non-`ACTIVE` accounts
- Resolves app role from `users.roles`, `owner_request_status`, and `owner_profiles`
- Returns:
  - `token`
  - basic user payload (`id`, `username`, `email`, `role`, `ownerRequestStatus`)

### `POST /api/auth/register`

- Validates required fields
- Validates email format
- Validates password strength
- Rejects duplicate username/email
- Inserts into `users`
- Sets:
  - `username`
  - `email`
  - `password_hash`
  - `name = username`
  - `u_status = 'ACTIVE'`
  - `owner_request_status = NULL`
- Does not explicitly set `roles`, so the DB default (`RENTER`) is relied on

### `GET /api/USER/{id}`

- Loads user data from `users`
- Left joins `owner_profiles`
- Returns normalized user payload with resolved app role
- Access rules:
  - self access allowed
  - admin access allowed
  - approved owner management access allowed

### `PATCH /api/USER/{id}`

Supported actions:

- `REQUEST_OWNER`
- `APPROVE_OWNER`
- `REJECT_OWNER`

Behavior:

- `REQUEST_OWNER`
  - only the user can request for themselves
  - sets `users.owner_request_status = 'PENDING'`

- `APPROVE_OWNER`
  - requires admin or approved owner access
  - sets `users.owner_request_status = 'APPROVED'`
  - inserts or updates `owner_profiles`

- `REJECT_OWNER`
  - requires admin or approved owner access
  - sets `users.owner_request_status = 'REJECTED'`

The endpoint currently updates owner approval state, but it does not update the `users.roles` SET to add or remove `OWNER`.

## 8. Auth and Session Model

- JWTs are generated in `src/lib/auth.ts`
- API routes use `Authorization: Bearer <token>`
- Client auth state is stored in browser `localStorage`
- There is no cookie-based session layer
- There is no server-side route guard or middleware yet; access checks are implemented inside pages and API routes

## 9. Data Access Layer

Primary runtime DB access is through [src/lib/db/mysql.ts](C:\Users\natta\Documents\univer\year3\PM\Park-D\src\lib\db\mysql.ts).

Required env vars:

- `DB_HOST`
- `DB_PORT`
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`

Optional env var:

- `DB_SSL` (defaults to enabled unless set to `false`)

The pool is created once and reused.

## 10. Deployment

- `next.config.mjs` uses `output: 'standalone'`
- `Dockerfile` uses multi-stage build (`deps`, `builder`, `runner`)
- Production container runs as a non-root user
- `docker-compose.yml`:
  - builds the Next.js image
  - exposes port `3000`
  - loads variables from `.env`

## 11. Secrets and Repository State

Current secret handling:

- `.env` is local and ignored
- `.env.secret` is tracked via `git-secret`
- `db.json.secret` and `db.png.secret` are also tracked encrypted artifacts

The plaintext files `db.json` and `db.png` may exist locally for reference, but the encrypted `.secret` files are the tracked secret-safe versions.

## 12. Current Verified Build State

Verified on 2026-02-27:

- `npm run lint`: passes
- `npm run build`: passes

Current app routes:

- `/`
- `/login`
- `/register`
- `/user`
- `/admin`
- `/api/auth/login`
- `/api/auth/register`
- `/api/USER/[id]`

## 13. Current Gaps

- `/user` and `/admin` are still mock dashboards, not real feature pages
- the admin page approve/reject buttons currently mutate only local page state and do not call `PATCH /api/USER/{id}`
- owner approval state and `users.roles` can become inconsistent because `PATCH /api/USER/{id}` does not maintain the `OWNER` flag
- registration currently captures only username/email/password and uses `name = username`; richer user profile fields are not collected yet
- `lib/db.js` duplicates connection logic that now also exists in `src/lib/db/mysql.ts`
- `README.md` and some older docs still describe an earlier project state
