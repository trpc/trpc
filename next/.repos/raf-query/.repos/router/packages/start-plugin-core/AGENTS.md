# Start compiler and bundler integration

- Virtual prefixes and query parameters can be part of a module's identity. Preserve them in resolution, loading, and module-cache keys; use `cleanId` only for physical-file matching, diagnostics, and file invalidation. Load compiler dependencies through the bundler host.
- For import-protection changes, read the [shared internals](src/import-protection/INTERNALS.md) and [Vite lifecycle](src/vite/import-protection-plugin/INTERNALS.md). Preserve adapter-specific deferral and survival checks; development has no build-time tree-shaking, and Vite's error/mock modes differ. Cover actual leaks and safe boundaries in cold/warm development and builds.
- Compiler output must match runtime contracts in `start-client-core`, `start-fn-stubs`, and `start-server-core`. For `createServerFn`, cover client, SSR caller, and server-provider output separately in [`tests/createServerFn/createServerFn.test.ts`](tests/createServerFn/createServerFn.test.ts).
- Use a built Start e2e app to validate generated imports and runtime behavior together; compiler snapshots alone do not exercise that integration.
- The shared compiler serves both Vite and Rsbuild. For shared compiler changes, check the relevant adapter suites in `tests/vite/` and `tests/rsbuild/`, plus affected Start e2e modes for build, server-function, or HMR behavior.
