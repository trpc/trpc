# Response headers and status: a handle, and an Effect service over it (human)

- Human, 2026-10-15 (decisions round 3, Q6 = proposal 04 Q4.2): "C".
- Promise resolvers and middleware keep the mutable `response` handle (`response.headers.set(…)`, `response.status = 201`).
- Effect code uses a service over the same handle: `yield* Response.setHeader('cache-control', 'max-age=60')`, `Response.setStatus(201)`, `Response.appendHeader('set-cookie', …)`.
- In a batch, headers merge (`set-cookie` appends) and each call's status stays in its own line.
- Why: Effect code reads its dependencies from services, matching [`internals-use-effect.md`](./internals-use-effect.md) and the `effect/http` core ([`http-core-on-effect-http.md`](./http-core-on-effect-http.md)); Promise code keeps the simple handle.
- Lost: a return-value wrapper (`withResponse(value, …)`), which tests more easily but stops middleware from adding headers.
- (agent) The root provides the service, so procedures using it don't add a layer requirement.
- Lives in: `packages/trpcdev/src/server/response.ts`, `src/server/execute.ts`, `src/server/middleware.ts`; tests in `test/integration/http-core.test.ts`.
