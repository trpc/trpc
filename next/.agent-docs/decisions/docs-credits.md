# The site credits oRPC and trpc-openapi (human asked)

- Human, 2026-10-18: "Make sure to credit orpc and maybe (trpc-openapi) where credit is due on the website".
- (agent) The home page ends with a Credits section (`/#credits`, linked from the footer on every page). oRPC, by Định Lê and middleapi: its feature table is v12's parity target ([`orpc-v2-parity.md`](./orpc-v2-parity.md)), and contracts, OpenAPI from the same router, declared errors with `safe()`, lifecycle hooks, rate limits, locks and hibernating Durable Objects follow its designs. trpc-openapi, by James Berry: REST routes and OpenAPI documents from procedure meta, which v12's `route` meta carries on; trpc-to-openapi, by Mario Campa, maintains it for v11.
- (agent) The pages that owe the most say so in a closing "Credits" section: the OpenAPI overview (trpc-openapi for route meta; oRPC for the zero-configuration REST mapping, `.route({ spec })` and OpenAPI-to-contract) and Contract-first (oRPC).
- Why: v12 took these ideas from them, and readers who know them should see where.
- Lives in: `next/www/src/routes/index.tsx` (`credits`), `next/www/src/components/site-footer.tsx`, `next/docs/openapi/overview.md`, `next/docs/server/contract-first.md`.
