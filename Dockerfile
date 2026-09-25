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
# Belt-and-suspenders: set this directly as a build ENV rather than relying
# solely on .npmrc, so the build can't fail with ERR_PNPM_IGNORED_BUILDS
# even if that file is ever missing, stale, or excluded from the repo.
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
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

USER nextjs
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]
