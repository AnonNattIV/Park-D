# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Park-D is a Parking Management System built with Next.js 14, React 18, TypeScript, and Tailwind CSS. The application features a modern UI with authentication pages (login/register) and is containerized for deployment.

## Development Commands

```bash
# Install dependencies
npm install

# Start development server (localhost:3000)
npm run dev

# Build for production
npm run build

# Start production server
npm run start

# Lint code
npm run lint
```

### Docker Deployment

```bash
# Build and run with Docker Compose (exposed on port 3002)
docker compose up --build

# Or with plain Docker
docker build -t park-d-nextjs .
docker run -p 3000:3000 park-d-nextjs
```

## Architecture

### Project Structure

```
src/
├── app/
│   ├── api/auth/
│   │   ├── login/route.ts      # Login API endpoint (mock auth)
│   │   └── register/route.ts   # Registration API endpoint (mock auth)
│   ├── login/page.tsx          # Login page with animated UI
│   ├── register/page.tsx       # Registration page with animated UI
│   ├── layout.tsx              # Root layout
│   ├── page.tsx                # Home page
│   └── globals.css             # Global styles
├── lib/
│   ├── auth.ts                 # Auth utilities (hash, verify, JWT, validation)
│   └── db/
│       └── prisma.ts           # Database client options (commented out)
```

### Next.js App Router Structure

- Uses **Next.js 14 App Router** with the `/src/app` directory
- Each page is a Server Component by default, marked `'use client'` for interactivity
- API routes follow the convention `src/app/api/[path]/route.ts` and export async named handlers (GET, POST, etc.)

### Authentication Architecture

The auth system is currently in **mock mode** and needs to be connected to a real database. The codebase provides multiple database options in `src/lib/db/prisma.ts`:

1. **Prisma** (PostgreSQL/MySQL) - Default option, uncomment to use
2. **MongoDB** with Mongoose
3. **Supabase**
4. **PostgreSQL** with `pg`
5. **Firebase Auth**

To enable a database:
1. Uncomment the appropriate section in `src/lib/db/prisma.ts`
2. Install required dependencies
3. Add environment variables (e.g., `DATABASE_URL`, `MONGODB_URI`)
4. Update API routes (`src/app/api/auth/*/route.ts`) to use real auth instead of mock responses

### Auth Utilities (`src/lib/auth.ts`)

- `hashPassword()` - Hash passwords using bcrypt
- `verifyPassword()` - Compare passwords with hash
- `generateToken()` - Create JWT tokens (requires `JWT_SECRET` env var)
- `verifyToken()` - Verify JWT tokens
- `isValidEmail()` - Email validation
- `validatePassword()` - Password strength validation (min 8 chars, uppercase, number)
- `sanitizeUsername()` - Sanitize username input

### UI/UX Patterns

- **Color Scheme**: Primary blue `#5B7CFF` and `#4a7bff` (gradient variants)
- **Tailwind CSS** for all styling
- **Animations**: Uses CSS transitions with `willChange` hints for performance
- **Client Components**: Login and register pages use `'use client'` with React hooks for form state and animations
- **Responsive Design**: Desktop uses split layout (45%/55%), mobile stacks vertically

### Docker Configuration

- **Multi-stage build**: `deps` → `builder` → `runner`
- Uses Node 20 Alpine for minimal image size
- `next.config.mjs` sets `output: 'standalone'` for Docker
- Exposed on port 3000 (internal) / 3002 (docker-compose external)

### TypeScript Configuration

- Path alias: `@/*` maps to `./src/*`
- Strict mode enabled
- Target: ES2017

### Environment Variables Required (for production)

```
JWT_SECRET=<your-secret-key>
DATABASE_URL=<your-database-connection-string> # If using PostgreSQL/MySQL
MONGODB_URI=<your-mongodb-uri> # If using MongoDB
NEXT_PUBLIC_SUPABASE_URL=<your-supabase-url> # If using Supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-supabase-key> # If using Supabase
```

## Key Implementation Notes

1. **Authentication API routes are currently using mock data** - Uncomment and implement real database connections in `src/app/api/auth/*/route.ts`

2. **Social login is not implemented** - The UI has placeholder buttons for Google, Facebook, GitHub, LinkedIn but `handleSocialLogin()` is a TODO stub

3. **Password strength validation** requires at least 8 characters, one uppercase letter, and one number (defined in `src/lib/auth.ts`)

4. **Prisma/Mongoose models** need to be created when connecting to a database
