FROM node:20-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

ARG DATABASE_URL
ENV DATABASE_URL=$DATABASE_URL

FROM base AS build
COPY . /app
WORKDIR /app

# Generate a partial monorepo with a pruned lockfile for a target workspace.
RUN pnpm install -g turbo
RUN turbo prune examples-next-prisma-websockets-starter --docker

FROM base as installer
WORKDIR /app
COPY --from=build /app/out/full/ .
COPY --from=build /app/out/pnpm-lock.yaml ./pnpm-lock.yaml

# Some other stuff we need to build trpc packages
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY --from=build /app/tsconfig.build.json ./tsconfig.build.json
COPY --from=build /app/scripts/ ./scripts/


RUN pnpm install --frozen-lockfile
RUN pnpm turbo build --filter=examples-next-prisma-websockets-starter...


FROM base AS runner
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
USER nextjs

COPY --from=installer /app/examples/next-prisma-websockets-starter/next.config.js .
COPY --from=installer /app/examples/next-prisma-websockets-starter/package.json .

COPY --from=installer --chown=nextjs:nodejs /app/examples/next-prisma-websockets-starter/.next/standalone ./
COPY --from=installer --chown=nextjs:nodejs /app/examples/next-prisma-websockets-starter/.next/static ./examples/next-prisma-websockets-starter/.next/static

ENV PORT=3000 HOSTNAME=0.0.0.0 NODE_ENV=production
EXPOSE 3000
CMD node examples/next-prisma-websockets-starter/server.js