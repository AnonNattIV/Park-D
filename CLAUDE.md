# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Park-D is a containerized Next.js web deployment project. The repository currently contains only Docker deployment infrastructure - the actual Next.js application files (`package.json`, source code, etc.) need to be added to the project root.

## Development Commands

### Docker Development

Build and run the application:
```bash
docker compose up --build
```

Or using plain Docker:
```bash
docker build -t park-d-nextjs .
docker run -p 3000:3000 park-d-nextjs
```

The application will be available at `http://localhost:3000`.

### Standard Next.js Commands (when app files are added)

```bash
npm install          # Install dependencies
npm run dev          # Start development server (localhost:3000)
npm run build        # Build for production
npm run start        # Start production server
```

## Architecture

### Docker Build Stages

The Dockerfile uses a multi-stage build process:

1. **deps** - Installs production dependencies via `npm ci`
2. **builder** - Copies source and builds the Next.js app via `npm run build`
3. **runner** - Creates minimal production image with:
   - Pruned dependencies (`npm prune --omit=dev`)
   - Built `.next` output directory
   - Static `public` assets

### Environment Variables

- `NODE_ENV` - Set to `production` in runner stage
- `PORT` - Application port (default: 3000)
- `NEXT_TELEMETRY_DISABLED=1` - Disables Next.js telemetry

### Deployment Files

- `Dockerfile` - Multi-stage Next.js production build using Node 20 Alpine
- `docker-compose.yml` - Simple compose service exposing port 3000
- `.dockerignore` - Excludes git, node_modules, logs, env files, and Docker files from build context

## Adding Application Files

For the Docker build to work, add your Next.js application files in the project root:
- `package.json` (and `package-lock.json`)
- Next.js source code (`app/`, `pages/`, or `src/` directory)
- `public/` directory for static assets
- `next.config.js` or `next.config.mjs` if needed
