# SSR query integration

Register QueryClient teardown at SSR attachment, before loading/dehydration can fail. The transport subscribes after initial dehydration. Render completion flushes pending queries, unsubscribes, and closes the stream. Request cleanup also clears the QueryClient, including canceled streams and late dehydration results; preserve these distinct lifecycles in `tests/index.test.ts`.

For query retention or cleanup changes, enable the GC tests that normal unit runs skip. `RUN_SSR_GC_TESTS=1` configures forked workers with exposed GC. Bypass Nx cache so a previous run with the gate disabled cannot count as validation.

```sh
RUN_SSR_GC_TESTS=1 CI=1 NX_DAEMON=false pnpm nx run @tanstack/router-ssr-query-core:test:unit --outputStyle=stream --skipRemoteCache --skipNxCache -- tests/index.test.ts
```
