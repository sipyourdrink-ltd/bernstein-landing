FROM node:20-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN apk add --no-cache libc6-compat

FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci --prefer-offline --no-audit --no-fund

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# GIT_SHA is injected by the GH Actions build workflow via
# `--build-arg GIT_SHA=${{ github.sha }}`. Surfaced into the running
# container as BUILD_SHA so /api/health can report which image the
# blue/green deploy script is talking to.
ARG GIT_SHA=""
ENV BUILD_SHA=${GIT_SHA}
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
# Probe /api/health rather than `/`. /api/health is a one-chunk JSON
# response that does not trip the RSC TransformStream race that probing
# `/` exposes under cold-start.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -q --spider "http://127.0.0.1:3000/api/health" || exit 1
CMD ["node", "server.js"]
