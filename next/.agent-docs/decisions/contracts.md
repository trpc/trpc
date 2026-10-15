# Contracts use resolver-less terminals (human)

- Alex, 2026-10-09 (Q9.1): "first". Contract procedures use the procedure builder's verbs with a terminal that takes no resolver: `c.input(ById).output(Post).query()`.
- Why: the verbs tRPC users already know, not a second syntax. The spike ([`../notes/contracts-and-routers-typing.md`](../notes/contracts-and-routers-typing.md)) showed it gives the same types as an options bag.
- Lost: the options bag `contract.procedure({ type, input, output })`.
- (agent) `contract.create<{ meta }>()` has `.input()`, `.output()`, `.errors()`, `.route()`, `.meta()` and `.query()` / `.mutation()` / `.subscription({ tracked? })`. A contract procedure is an ordinary `Procedure` with `resolver: undefined`, so clients, `generateOpenAPI` and `toContract` accept contracts and routers alike. The builder has its own small runtime, so a contract package doesn't load server execution code.
- (agent) `subscription({ tracked: true })`: a tracked event is `{ id, data }` on the wire, so the contract has to say so for clients to be typed correctly.
- (agent, Q9.2) The mirror tree. `t.implement(contract)` returns builders pre-loaded with each leaf's input, output, errors and route; leaves offer only `.use()`, `.provide()` and the contract's terminal.
  - `impl.router()` checks completeness at the type level and at runtime: missing keys, extra keys, wrong procedure types.
  - It is generic so each procedure's services reach the handler. A non-generic one (the spike's suggestion) would drop them and the handler's `layer` would go unchecked; a manual `ExactRouter` check restores the excess-key error.
  - A top-level contract key named `router` would shadow `impl.router()`, so `t.implement()` throws on one.
- (agent, Q9.3) No undeclared errors: resolvers and middleware may only return errors the contract declares. Thrown errors are never typed, so they are still allowed.
- (agent, Q9.4) `toContract(router)` emits `{ version: 1, procedures: { [path]: { type, route?, input?, output?, errors? } } }` with JSON Schemas, branded with the router's client type, so `createTRPCClient({ router: contractJSON })` is typed. `inferContract<typeof router>` gives the same client types as `typeof router`.
- Open: no implementer-wide `.use()` (middleware is per leaf), and the contract's meta type isn't checked against `t`'s.
- Lives in: `packages/trpcdev/src/contract/index.ts`, `src/server/implement.ts`, `test/integration/contract.test.ts`.
