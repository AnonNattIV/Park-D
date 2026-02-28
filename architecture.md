# Park-D Architecture (Current State)

Last updated: 2026-03-01

## 1. Project Summary

Park-D is a Next.js App Router application for:

- browsing approved parking lots from a public homepage
- registering and logging in with MySQL-backed accounts
- viewing and editing a user profile
- requesting owner access
- viewing an owner parking dashboard

The current app is a mix of live data features and mock UI:

- the public homepage, login/register, profile page, owner request flow, and owner parking table are connected to the database
- the admin dashboard is still mock-only
- the owner add/manage parking pages are still client-side mock forms and do not persist changes yet

The root route `/` is now the public homepage. It no longer redirects to `/login`.

## 2. Runtime Stack

- Framework: Next.js 14.2 (`app` directory, `output: 'standalone'`)
- UI: React 18.3 + Tailwind CSS 3.4
- Language: TypeScript 5.5 (`strict: true`)
- Auth: `bcryptjs`, `jsonwebtoken`
- Database: `mysql2/promise`
- Object storage: `@aws-sdk/client-s3`
- Icons: `@heroicons/react`
- Image support: `sharp` is installed in `package.json` (not imported directly in app code, but useful for Next.js production image handling)
- Tooling: ESLint, PostCSS, Autoprefixer
- Deployment: Docker + Docker Compose

## 3. What To Install / External Services

### Local tools

- Node.js 20.x or newer
- npm (bundled with Node.js)
- Optional: Docker Desktop if you want to run the containerized build

### JavaScript packages

Install project dependencies with one of:

- `npm install`
- `npm ci` (preferred when using the committed lockfile)

### External services required by the current code

- A MySQL-compatible database with the Park-D schema
- An S3-compatible object storage bucket for profile images

The profile image feature depends on object storage. Without the AWS/S3 variables below, the app can still run, but `POST /api/profile-image`, `DELETE /api/profile-image`, and `GET /api/profile-image/[...key]` will fail.

### Required environment variables

Authentication:

- `JWT_SECRET`

Database:

- `DB_HOST`
- `DB_PORT`
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`
- `DB_SSL` (optional, defaults to enabled unless set to `false`)

Object storage:

- `AWS_S3_BUCKET_NAME`
- `AWS_ENDPOINT_URL`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_DEFAULT_REGION` (optional, defaults to `auto`)

Important notes:

- `.env.example` currently documents only JWT + DB settings. It does not include the AWS/S3 variables used by the profile image routes.
- `docker-compose.yml` loads `.env`, not `.env.local`.

## 4. Current Route Map

### Public pages

- `/`
  - public homepage
  - renders `ParkingHomePage`
  - fetches live parking lot data from `GET /api/parking-lots`
  - shows pricing only when a valid local auth state exists

- `/login`
  - login form
  - posts to `POST /api/auth/login`
  - stores `auth_token` and `auth_user` in `localStorage`
  - redirects by resolved role:
    - `admin` -> `/admin`
    - `owner` -> `/owner/home`
    - default -> `/`

- `/register`
  - registration form
  - posts to `POST /api/auth/register`
  - redirects to `/login` on success

### Authenticated pages

- `/aboutme`
  - client-side auth check using `localStorage`
  - loads profile data and booking history via `GET /api/USER/[id]`
  - updates profile via `PUT /api/USER/[id]`
  - uploads/deletes profile images via `/api/profile-image`

- `/owner/home`
  - client-side auth check using `localStorage`
  - if role is `owner` or `admin`, loads live parking lot system data from `GET /api/parking-lots/system`
  - if role is `user`, shows owner request UI and calls `PATCH /api/USER/[id]` with `REQUEST_OWNER`

- `/admin`
  - client-side auth check using `localStorage`
  - only allows users whose stored role is `admin`
  - still uses mock summary data and a local-only owner verification queue
  - does not call the backend approval API yet

### Redirect / compatibility route

- `/user/home`
  - immediately redirects to `/`
  - kept as a compatibility alias for older navigation code

### Owner mock pages (not wired to backend yet)

- `/owner/parkingspace`
  - client-only add parking form
  - currently validates locally, shows an alert, and redirects back to `/owner/home`
  - no API call is made

- `/owner/parkingmanage`
  - client-only parking edit/delete form
  - currently edits mock local state only
  - no API call is made

## 5. API Surface

### `POST /api/auth/login`

- reads a user by `username` or `email`
- checks `u_status = 'ACTIVE'`
- verifies `password_hash` with bcrypt
- resolves app role from `users.roles`, `owner_profiles`, and `owner_request_status`
- returns:
  - `token`
  - `user.id`
  - `user.username`
  - `user.email`
  - `user.role`
  - `user.ownerRequestStatus`

### `POST /api/auth/register`

- validates username, email, password, and confirm password
- enforces:
  - email format
  - minimum password length 8
  - at least one uppercase letter
  - at least one number
- rejects duplicate `username` or `email`
- inserts a new row into `users`
- sets:
  - `name = username`
  - `u_status = 'ACTIVE'`
  - `owner_request_status = NULL`
- does not explicitly set `roles`, so the database default is still relied on

### `GET /api/USER/[id]`

- requires `Authorization: Bearer <token>`
- allows:
  - self access
  - admin access
  - approved owner management access
- returns:
  - normalized user profile
  - latest booking history (up to 10 rows)

### `PUT /api/USER/[id]`

- requires `Authorization: Bearer <token>`
- allows:
  - self updates
  - admin updates
- updates:
  - `name`
  - `surname`
  - `gender`
  - `age`
  - `email`
  - `phone`
- enforces unique email across users

### `PATCH /api/USER/[id]`

Supported actions:

- `REQUEST_OWNER`
- `APPROVE_OWNER`
- `REJECT_OWNER`

Behavior:

- `REQUEST_OWNER`
  - self only
  - sets `owner_request_status = 'PENDING'`

- `APPROVE_OWNER`
  - requires admin or approved owner access
  - requires `citizenId` in the request body
  - sets `owner_request_status = 'APPROVED'`
  - inserts or updates `owner_profiles`

- `REJECT_OWNER`
  - requires admin or approved owner access
  - sets `owner_request_status = 'REJECTED'`

Important limitation:

- approval/rejection does not update the `users.roles` SET to add or remove `OWNER`

### `GET /api/parking-lots`

- public endpoint
- returns approved and active parking lots for the homepage
- supports optional `?location=...` filtering
- data is built from `parking_lots`, `users`, and active `bookings`

### `GET /api/parking-lots/system`

- requires `Authorization: Bearer <token>`
- only allows `owner` or `admin`
- `admin` receives all lots
- `owner` receives only lots where `parking_lots.owner_user_id = requester user id`

### `POST /api/profile-image`

- requires `Authorization: Bearer <token>`
- accepts a multipart `file`
- accepts image files only
- limits size to 5 MB
- uploads to S3-compatible storage
- stores the proxied URL in `users.profile_image_url`

### `DELETE /api/profile-image`

- requires `Authorization: Bearer <token>`
- clears `users.profile_image_url`
- deletes the previously stored object from S3-compatible storage

### `GET /api/profile-image/[...key]`

- public proxy endpoint for profile images
- reads the object from S3-compatible storage
- streams bytes back through Next.js with a short cache header

## 6. Auth and Session Model

- JWTs are generated and verified in `src/lib/auth.ts`
- client auth state is stored in `localStorage`:
  - `auth_token`
  - `auth_user`
- client components listen for `parkd-auth-changed` to refresh UI auth state
- API routes manually parse `Authorization: Bearer <token>`
- there is no cookie session layer
- there is no Next.js middleware-based route protection
- page protection is currently client-side and inconsistent across routes

## 7. Data Model Used by the Current App

The database export in `db.json` is still the broad schema reference, but the current code actively uses only part of it.

### Tables used by the current app code

- `users`
- `owner_profiles`
- `parking_lots`
- `bookings`

### Tables present in the schema but not used by current route code

- `payments`
- `reviews`

### Key user fields used in code

- `user_id`
- `username`
- `email`
- `password_hash`
- `name`
- `surname`
- `gender`
- `age`
- `phone`
- `profile_image_url`
- `u_status`
- `roles`
- `owner_request_status`

### Key owner fields used in code

- `owner_profiles.user_id`
- `owner_profiles.o_citizen_id`
- `owner_profiles.earning`

### Key parking lot fields used in code

- `lot_id`
- `owner_user_id`
- `location`
- `description`
- `total_slot`
- `price`
- `p_status`
- `is_approve`
- `address_line`
- `street_number`
- `district`
- `amphoe`
- `subdistrict`
- `province`
- `latitude`
- `longitude`

### Key booking fields used in code

- `b_id`
- `user_id`
- `lot_id`
- `booking_time`
- `checkin_datetime`
- `checkout_datetime`
- `total_time_minutes`
- `b_status`

## 8. Role Resolution

Application roles are derived from database state, not from a single column alone.

Current mapping in `src/lib/roles.ts`:

- `ADMIN` in `users.roles` -> app role `admin`
- approved owner state with an `owner_profiles` row -> app role `owner`
- otherwise -> app role `user`

Owner state is considered active when:

- `owner_request_status = 'APPROVED'`
- `owner_profiles` contains a row for the user

Current inconsistency:

- a user can resolve to `owner` even if `users.roles` does not contain `OWNER`
- this happens because the resolver trusts owner profile state and approval status
- `PATCH /api/USER/[id]` does not synchronize the `users.roles` flag

## 9. Code Layout

### App routes

- `src/app/*`: Next.js pages and API routes
- `src/app/api/*`: route handlers for auth, user data, parking lots, and profile images

### Shared libraries

- `src/lib/auth.ts`: password hashing, token signing, validation helpers
- `src/lib/auth-client.ts`: `localStorage` auth helpers for client components
- `src/lib/roles.ts`: database-to-app role mapping
- `src/lib/db/mysql.ts`: primary MySQL pool factory
- `src/lib/parking-lots.ts`: SQL queries and response shaping for home and owner parking lists
- `src/lib/storage.ts`: S3-compatible upload, fetch, and delete helpers

### Components

- `src/components/ParkingHomePage.tsx`: public parking discovery page
- `src/components/Tabbar.tsx`: shared top navigation with auth-aware state
- `src/components/*`: owner cards, booking cards, and parking image UI helpers

### Legacy / reference files

- `lib/db.js`: older MySQL pool helper that duplicates current connection logic
- `src/lib/db/prisma.ts`: commented template/reference file, not active runtime code

## 10. Current Behavior Notes

- The homepage search UI has a `timeRange` input, but that value is not used by the API yet.
- The homepage "Book" button is UI-only and does not start a booking flow.
- The admin page approve/reject buttons mutate local React state only.
- The admin page cannot currently approve a real owner request because it does not call `PATCH /api/USER/[id]`, and the API requires a `citizenId` for approval.
- The owner add/manage pages do not call any parking create/update/delete API.
- `README.md` is outdated and still says the repo only contains deployment files.
- Secret-related files (`.env.secret`, `db.json.secret`, `db.png.secret`) are present alongside local plaintext artifacts.

## 11. Deployment

- `next.config.mjs` uses `output: 'standalone'`
- `Dockerfile` uses a multi-stage build:
  - `deps`
  - `builder`
  - `runner`
- production runs as a non-root `nextjs` user inside the container
- `docker-compose.yml`:
  - builds the Next.js image
  - exposes port `3000`
  - loads environment variables from `.env`

