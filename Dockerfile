FROM node:20-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# --- Dependencies ---
FROM base AS deps
COPY package*.json ./
RUN npm ci

# --- Builder ---
FROM base AS builder
ARG NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
ENV NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=$NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# --- Runner (production) ---
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy public assets
COPY --from=builder /app/public ./public

# Copy standalone output (includes server.js + minimal node_modules)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
# Copy static files (.next/static is NOT included in standalone)
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
