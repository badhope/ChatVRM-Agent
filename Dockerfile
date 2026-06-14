# =============================================================================
# ChatVRM Agent — multi-stage Docker image
# =============================================================================
# Build:   docker build -t chatvrm-agent .
# Run:     docker run --rm -p 3000:3000 --env-file .env chatvrm-agent
# =============================================================================

# ---- 1. Dependencies -------------------------------------------------------
FROM node:18-bullseye-slim AS deps
WORKDIR /app

# Install OS deps that some npm packages need to build native modules
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund


# ---- 2. Build --------------------------------------------------------------
FROM node:18-bullseye-slim AS builder
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build


# ---- 3. Production runtime -------------------------------------------------
FROM node:18-bullseye-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Non-root user
RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

USER nextjs

EXPOSE 3000

CMD ["npm", "run", "start"]
