ARG BUN_VERSION=1.3

FROM oven/bun:${BUN_VERSION} AS build
WORKDIR /app

COPY package.json bun.lock* ./

# Use ignore-scripts to avoid building node modules like better-sqlite3
RUN bun install --frozen-lockfile --ignore-scripts

# Copy the entire project
COPY . .

RUN bun --bun run build

# Copy production dependencies and source code into final image
FROM oven/bun:${BUN_VERSION} AS production
WORKDIR /app

# Only `.output` folder is needed from the build stage
COPY --from=build /app/.output /app

# Run the app
EXPOSE 3000/tcp
ENTRYPOINT [ "bun", "--bun", "run", "/app/server/index.mjs" ]