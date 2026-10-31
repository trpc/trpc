# Build from the repository root:
#
#   docker build -f packages/tools/eventlog-server/Dockerfile .

# The bundle is plain JavaScript, so build it on the native platform and only
# copy it into the target platform's image.
FROM --platform=$BUILDPLATFORM node:26-slim AS build
# Install and bundle inside a writable mount of the build context, so only the
# bundle ends up in a layer.
RUN --mount=type=bind,target=/repo,rw \
  --mount=type=cache,target=/root/.local/share/pnpm/store \
  cd /repo \
  && npm install -g "pnpm@$(node -p "require('./package.json').packageManager.split('@')[1]")" \
  && pnpm install --frozen-lockfile --ignore-scripts --filter "@effect/eventlog-server..." \
  && pnpm --filter @effect/eventlog-server bundle \
  && mkdir /out /data \
  && cp packages/tools/eventlog-server/build/main.js /out/main.js

FROM node:26-slim
WORKDIR /app
COPY --from=build /out/main.js ./main.js
COPY --from=build --chown=node:node /data /data
ENV NODE_ENV=production
ENV PORT=8080
ENV DATABASE_PATH=/data/eventlog.db
VOLUME /data
EXPOSE 8080
USER node
HEALTHCHECK CMD ["node", "-e", "fetch(`http://localhost:${process.env.PORT}/health`).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "main.js"]
