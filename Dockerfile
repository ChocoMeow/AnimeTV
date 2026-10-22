# syntax=docker/dockerfile:1
ARG BUN_VERSION=1.4

# Build Nuxt/Nitro on the host arch only. `.output` is plain JS and runs on amd64 + arm64;
# building under QEMU for linux/arm64 routinely stalls for 30+ min on "Bundling server".
FROM --platform=$BUILDPLATFORM oven/bun:${BUN_VERSION} AS build
WORKDIR /app

# Placeholders only — NOT your real project keys.
# Real NUXT_PUBLIC_SUPABASE_* belong at container runtime (docker run / compose).
# Needed so @nuxtjs/supabase does not crash during Nitro prerender of /offline.
ENV NUXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co \
    NUXT_PUBLIC_SUPABASE_KEY=placeholder-anon-key

# Build identity (baked into shared/buildInfo.js — not runtime-overridable)
ARG APP_VERSION=
ARG APP_CHANNEL=development
ARG GIT_SHA=local
ENV APP_VERSION=$APP_VERSION \
    APP_CHANNEL=$APP_CHANNEL \
    GIT_SHA=$GIT_SHA

COPY package.json bun.lock* ./

# Use ignore-scripts to avoid building node modules like better-sqlite3
RUN bun install --frozen-lockfile --ignore-scripts

# Copy the entire project
COPY . .

RUN bun scripts/build-version.mjs write && bun --bun run build

# Runtime image is per-target arch (native bun binary); app code comes from the build stage.
FROM oven/bun:${BUN_VERSION} AS production
WORKDIR /app

# Only `.output` folder is needed from the build stage
COPY --from=build /app/.output /app

# Persist daily JSON logs: mount a volume at /app/logs (NUXT_LOG_MAX_DAYS, default 30).
RUN mkdir -p /app/logs

# Run the app
EXPOSE 3000/tcp
ENTRYPOINT [ "bun", "--bun", "run", "/app/server/index.mjs" ]
