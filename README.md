# Park-D

Park-D is a Next.js 14 parking platform prototype with:

- a public parking lot discovery homepage
- MySQL-backed registration and login
- JWT-based API authentication
- profile editing with booking history
- owner access requests and an owner dashboard

Some features are live against the database, while others are still mock UI.

## Current Status

Live / connected:

- public homepage at `/`
- login and registration
- profile page at `/aboutme`
- owner request flow
- owner dashboard parking lot table
- profile image upload through S3-compatible storage

Still mock / not fully wired:

- admin dashboard at `/admin`
- owner add parking page at `/owner/parkingspace`
- owner parking management page at `/owner/parkingmanage`
- booking action from the homepage cards

## Tech Stack

- Next.js 14 (App Router)
- React 18
- TypeScript
- Tailwind CSS
- MySQL via `mysql2`
- `bcryptjs` + `jsonwebtoken`
- S3-compatible object storage via `@aws-sdk/client-s3`
- Docker / Docker Compose

## Prerequisites

- Node.js 20+
- npm
- A MySQL-compatible database with the Park-D schema
- An S3-compatible bucket if you want profile image upload to work

## Installation

Install dependencies:

```bash
npm ci
```

If you do not want to use the lockfile, `npm install` also works.

## Environment Variables

For local development:

- use `.env.local`

For Docker Compose:

- use `.env`

You can start from `.env.example`, then add the missing storage variables used by the profile image feature.

### Required app variables

```env
JWT_SECRET=change-me-in-production-use-a-long-random-string

DB_HOST=your-db-host
DB_PORT=3306
DB_USER=your-db-user
DB_PASSWORD=your-db-password
DB_NAME=your-db-name
DB_SSL=true
```

### Additional variables for profile image upload

```env
AWS_S3_BUCKET_NAME=your-bucket-name
AWS_ENDPOINT_URL=https://your-s3-endpoint
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_DEFAULT_REGION=auto
```

If the `AWS_*` variables are missing, the app can still run, but profile image upload, delete, and fetch endpoints will fail.

## Run Locally

Start the development server:

```bash
npm run dev
```

Open:

- `http://localhost:3000`

Other scripts:

```bash
npm run lint
npm run build
npm run start
```

## Docker

Run with Docker Compose:

```bash
docker compose up --build
```

Or with plain Docker:

```bash
docker build -t park-d-nextjs .
docker run -p 3000:3000 --env-file .env park-d-nextjs
```

The container serves the app on port `3000`.

## Main Routes

- `/` public homepage with live parking lot data
- `/login` login page
- `/register` registration page
- `/aboutme` authenticated profile page
- `/owner/home` owner dashboard / owner request page
- `/user/home` compatibility redirect to `/`
- `/admin` admin mock dashboard

## Project Notes

- Auth state is stored in browser `localStorage` (`auth_token` and `auth_user`).
- API routes expect `Authorization: Bearer <token>` for protected endpoints.
- The root route is the homepage now; it no longer redirects to `/login`.
- `lib/db.js` is a legacy MySQL helper. New code should use `src/lib/db/mysql.ts`.

## Documentation

- Architecture overview: [architecture.md](architecture.md)
- API / DB / git-secret notes: [API_DB_GIT_SECRET.md](API_DB_GIT_SECRET.md)
