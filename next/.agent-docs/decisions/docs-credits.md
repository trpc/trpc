# The docs credit Zodios, trpc-openapi, ts-rest and oRPC (human asked)

- Human, 2026-10-18: "Make sure to credit orpc and maybe (trpc-openapi) where credit is due on the website".
- Human, 2026-10-18: "i think some other frameworks (like zodios??) originally pioneered the schema first design".
- Human, 2026-10-18: "also credit orpc at the end on all the integrations we slop forked etc on the docs pages".
- Human, 2026-10-18: "also we don't need the credits of projects on the homepage... we have them in the docs anyaway". The home page's Credits section (`/#credits`) and the footer's link to it are gone.
- (agent) The docs pages credit the projects where their ideas are used, in the order the projects came:
  - Zodios, by ecyrbe (2022): pioneered schema-first APIs in TypeScript, one definition of every endpoint, with zod schemas, for the client and the server. Credited on Contract-first.
  - trpc-openapi, by James Berry (2022): REST routes and OpenAPI documents from procedure meta, which v12's `route` meta carries on; trpc-to-openapi, by Mario Campa, maintains it for v11. Credited on the OpenAPI overview.
  - ts-rest, by Oliver Butler (2022): a contract router that the server implements, the client calls and OpenAPI documents. oRPC's README credits it for its contract-first design. Credited on Contract-first.
  - oRPC, by Định Lê and middleapi (2024): its feature table is v12's parity target ([`orpc-v2-parity.md`](./orpc-v2-parity.md)), and contracts with `implement()`, OpenAPI from the same router, declared errors with `safe()`, lifecycle hooks, rate limits, locks and hibernating Durable Objects follow its designs. It didn't originate contract-first, so the site doesn't say it did.
- (agent) Every docs page whose feature was built to match oRPC's ([`../reference/orpc-parity.md`](../reference/orpc-parity.md)) ends with a "Credits" section linking the oRPC docs page it follows: Contract-first (after Zodios and ts-rest), Errors, Validating on the client, Errors without try/catch, lifecycle hooks, rate limiting, locks, the publisher and its backends, Durable Objects, message ports, every OpenAPI page (the overview also credits trpc-openapi), TanStack Query (the Vue, Solid, Svelte and Angular adapters), Server Actions (`FormData` actions), NestJS, AI SDK and Better Auth. A credit names only what follows oRPC: Server Actions' `useActionState` and optimistic UI don't, so they aren't credited. Not credited: tracing (Effect's `Tracer`, not oRPC's shape) and middleware dedupe (the page doesn't cover it).
- Why: v12 took these ideas from them, and readers who know them should see where.
- Lost: a page listing every project credited; the credits are only on the pages that use their ideas.
- Lives in: the `## Credits` sections in `next/www/docs/**/*.md`.
