# ---- deps ----
FROM node:22-slim AS deps
WORKDIR /app
# Prisma's `postinstall` (triggered by `pnpm install`) needs libssl to detect
# the right engine, and needs prisma/schema.prisma to exist — both must be
# in place *before* the install step runs, not just before `prisma generate`.
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY prisma ./prisma
# The real fix for ERR_PNPM_IGNORED_BUILDS lives in pnpm-workspace.yaml
# (dangerouslyAllowAllBuilds / allowBuilds — pnpm 11+ moved these out of
# .npmrc). This env var is kept as a harmless extra layer but is not load-
# bearing; do not rely on it alone.
ENV npm_config_dangerously_allow_all_builds=true
RUN pnpm install --frozen-lockfile

# ---- builder ----
FROM node:22-slim AS builder
WORKDIR /app
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN pnpm build

# ---- runner (also used as the worker image, see docker-compose) ----
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
# The query engine binary also needs libssl present at *runtime*, not just
# at generate-time — omitting this here is a common cause of the container
# crashing on its first Prisma query even though the build succeeded.
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
RUN groupadd -r nodejs && useradd -r -g nodejs nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma

# Writable directory for the auto-generated AUTH_SECRET (see
# docker-entrypoint.sh). Created and chowned here, before USER switches
# to nextjs, so that when docker-compose mounts an empty named volume
# over this path, Docker copies this directory's ownership into the new
# volume on first use.
RUN mkdir -p /app/data && chown nextjs:nodejs /app/data
COPY --chown=nextjs:nodejs docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

# Under pnpm, Prisma's generated client and query-engine binaries live
# inside pnpm's virtual store (node_modules/.pnpm/@prisma+client@.../...),
# not in a top-level node_modules/.prisma folder the way npm/yarn hoisting
# would produce. Next's standalone tracing also doesn't reliably capture
# Prisma's dynamically-loaded engine binaries. Rather than hardcode a pnpm
# internal path that can shift with a lockfile update, overlay the full
# real node_modules from the builder stage on top of standalone's pruned
# copy — larger image, but doesn't depend on guessing pnpm's layout.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
