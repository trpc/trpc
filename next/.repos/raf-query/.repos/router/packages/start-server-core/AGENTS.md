# Start server runtime

- Keep request assets out of cached manifests. Assets may mutate in place between head and Scripts rendering; compose their current contents without caching solely by object identity. Asset transforms must preserve the base manifest; request-dependent transforms use `cache: false`.
- Middleware can replace or wrap an SSR response before its body is read. Preserve response ownership with the existing `SsrResponse` helpers and `transferResponseBodyOwnership`; dispose abandoned bodies, and consume/cancel unused clone or tee branches. Rendering completion, serialization completion, and request cleanup are separate lifecycles; read [`../router-core/src/ssr/STREAMING.md`](../router-core/src/ssr/STREAMING.md) before changing them.
- Merge client-sent context with `safeObjectMerge`, placing trusted server middleware context last. Preserve this precedence for JSON, GET, FormData, and direct SSR calls; validate through the `server-functions-global-middleware` e2e suite.
- Changes to `src/frame-protocol.ts` must remain compatible with `../start-client-core/src/client-rpc/frame-decoder.ts`. Keep both packages' framing tests and relevant RawStream e2e coverage.
