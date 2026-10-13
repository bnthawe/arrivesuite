FROM node:20-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

# argon2 (via @arrivesuite/db) compiles a native binding with node-gyp.
FROM base AS deps
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY services/worker/package.json services/worker/
COPY packages/db/package.json packages/db/
RUN pnpm install --filter @arrivesuite/worker... --frozen-lockfile
RUN apt-get remove --purge -y python3 make g++ && rm -rf /var/lib/apt/lists/*

FROM base AS runtime
ENV NODE_ENV=production
RUN useradd -m -u 1000 node && chown -R node:node /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/services/worker/node_modules ./services/worker/node_modules
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules
COPY pnpm-workspace.yaml package.json ./
COPY services/worker/package.json services/worker/
COPY services/worker/src services/worker/src
COPY packages/db/package.json packages/db/
COPY packages/db/src packages/db/src
WORKDIR /app/services/worker
USER node
EXPOSE 3001
CMD ["pnpm", "start"]
