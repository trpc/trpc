# Playwright E2E Inference (Modes + Shards)

Use `scripts/nx/playwright-plugin.ts` to infer Playwright e2e targets from
`package.json` metadata.

The plugin supports two metadata styles:

- `nx.metadata.playwrightModes` (recommended)
- `nx.metadata.playwrightShards` (legacy, still supported)

When `playwrightModes` is present, it takes precedence.

## 1. Configure `playwrightModes` in `package.json`

```json
{
  "name": "tanstack-react-start-e2e-basic",
  "nx": {
    "metadata": {
      "playwrightModes": [
        { "toolchain": "vite", "mode": "ssr" },
        { "toolchain": "vite", "mode": "spa", "shards": 4 },
        { "toolchain": "vite", "mode": "prerender", "shards": 4 },
        { "toolchain": "vite", "mode": "preview" }
      ]
    }
  }
}
```

Supported modes:

- `ssr`
- `spa`
- `prerender`
- `preview`

`shards` is optional and defaults to `1`.

Supported toolchains:

- `vite`

## 2. What targets are generated

For each `{ toolchain, mode }` entry, the plugin generates:

- `build:<toolchain>:<mode>`
- `test:e2e--<toolchain>-<mode>`

If `shards > 1`, it also generates:

- `test:e2e--<toolchain>-<mode>--shard-1-of-N` ... `--shard-N-of-N`
- `test:e2e--<toolchain>-<mode>` as a parent noop target depending on all shards

Finally, it generates:

- `test:e2e` as a parent noop target depending on every mode target

## 3. Environment variables injected by inferred targets

Each inferred `build:<toolchain>:<mode>` and `test:e2e--<toolchain>-<mode>` target sets:

- `MODE=<mode>`
- `TOOLCHAIN=<toolchain>`
- `E2E_TOOLCHAIN=<toolchain>`
- `E2E_DIST=dist-<toolchain>-<mode>`
- `E2E_DIST_DIR=dist-<toolchain>-<mode>`

## 4. Build behavior and webServer command

Each inferred e2e target depends on the inferred `build:<toolchain>:<mode>`
target. It runs `vite build && tsc --noEmit` or
`rsbuild build && tsc --noEmit`, selecting the toolchain explicitly. Ordinary
package build scripts do not need to know about E2E mocking.

The React, Solid, and Vue basic examples preload the same MSW handlers in
Nx prerender builds (through mode metadata) and Playwright application servers
with Node's native option:
`NODE_OPTIONS='--import=@tanstack/router-e2e-utils/mock-api'`.
The handlers return canned posts and users at `https://jsonplaceholder.typicode.com` inside
each Node process, including prerendering. No API listener or fixture port is
needed. Playwright starts only the application server. A cached build uses the
same URL when started by a fresh process with the preload enabled. Ordinary
`pnpm dev`, builds, and standalone servers use the public API without MSW.
Application code uses the public URL in both cases; test setup enables mocking.

The inferred build target uses standard production inputs and explicit mode-
specific outputs (`dist-<toolchain>-<mode>`). Mode env values are passed through
the target command env, so they do not need to be duplicated as target input
env hashes.

Because of this, Playwright `webServer.command` should only start the app.

Good:

```ts
webServer: {
  command: `PORT=${PORT} pnpm start`,
  wait: appServerReady,
}
```

For preview mode, pass the inferred dist folder:

```ts
const distDir = process.env.E2E_DIST_DIR ?? 'dist'

webServer: {
  command: `pnpm preview --outDir ${distDir} --port ${PORT}`,
  wait: appServerReady,
}
```

Avoid:

```ts
webServer: {
  command: `MODE=spa pnpm build && PORT=${PORT} pnpm start`,
  wait: appServerReady,
}
```

## 5. Let each server bind its own port

Use port `0` in server commands. The OS chooses a free port while binding the
listening socket. Do not reserve ports, write port files, or restore ports from
Nx outputs.

Playwright's `webServer.wait` captures the address printed after listening.
It exports named capture groups to subsequent servers and test workers. The
shared `appServerReady` pattern captures `E2E_APP_PORT`; configs read that value
when reloaded in workers to configure `use.baseURL`.

```ts
import { appServerReady } from '@tanstack/router-e2e-utils'

const baseURL = `http://localhost:${process.env.E2E_APP_PORT ?? 0}`

// Inside defineConfig:
use: { baseURL },
webServer: {
  command: 'pnpm preview --port 0',
  wait: appServerReady,
  reuseExistingServer: false,
},
```

Canned posts/users requests use `https://jsonplaceholder.typicode.com`. Node builds and
servers preload `@tanstack/router-e2e-utils/mock-api` through `NODE_OPTIONS`.
Browser API suites import `apiTest as test` from the E2E utilities. That fixture
uses the official MSW Playwright adapter with the same handlers. Opt in only
where the API is needed: Playwright routing disables the browser HTTP cache.

External-navigation tests use another hostname on the existing app listener,
with a static HTML asset when the test needs a distinct destination document.
No API server, fixture-port environment variable, or build launcher is needed.

Custom servers must print their actual `server.address().port`, not the
requested port. SPA servers bind their backend first and use its actual port
for proxying. Playwright owns server shutdown.

## 6. Run inferred targets

Examples:

```sh
pnpm nx run tanstack-react-start-e2e-basic:test:e2e--vite-ssr
pnpm nx run tanstack-react-start-e2e-basic:test:e2e--vite-spa--shard-1-of-4
pnpm nx run tanstack-react-start-e2e-basic:test:e2e
```

## Legacy fallback: `playwrightShards`

If `playwrightModes` is not configured, the plugin still supports:

```json
{
  "nx": {
    "metadata": {
      "playwrightShards": 6
    }
  }
}
```

This generates legacy shard targets under `test:e2e--shard-...` plus a parent
`test:e2e` target.
