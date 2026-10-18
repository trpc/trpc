# The site credits Zodios, trpc-openapi, ts-rest and oRPC (human asked)

- Human, 2026-10-18: "Make sure to credit orpc and maybe (trpc-openapi) where credit is due on the website".
- Human, 2026-10-18: "i think some other frameworks (like zodios??) originally pioneered the schema first design".
- (agent) The home page ends with a Credits section (`/#credits`, linked from the footer on every page), in the order the projects came:
  - Zodios, by ecyrbe (2022): pioneered schema-first APIs in TypeScript, one definition of every endpoint, with zod schemas, for the client and the server.
  - trpc-openapi, by James Berry (2022): REST routes and OpenAPI documents from procedure meta, which v12's `route` meta carries on; trpc-to-openapi, by Mario Campa, maintains it for v11.
  - ts-rest, by Oliver Butler (2022): a contract router that the server implements, the client calls and OpenAPI documents. oRPC's README credits it for its contract-first design.
  - oRPC, by Định Lê and middleapi (2024): its feature table is v12's parity target ([`orpc-v2-parity.md`](./orpc-v2-parity.md)), and contracts with `implement()`, OpenAPI from the same router, declared errors with `safe()`, lifecycle hooks, rate limits, locks and hibernating Durable Objects follow its designs. It didn't originate contract-first, so the site doesn't say it did.
- (agent) The pages that owe the most say so in a closing "Credits" section: the OpenAPI overview (trpc-openapi for route meta; oRPC for the zero-configuration REST mapping, `.route({ spec })` and OpenAPI-to-contract) and Contract-first (Zodios and ts-rest for the idea, oRPC for the shape of v12's contracts and `t.implement()`).
- Why: v12 took these ideas from them, and readers who know them should see where.
- Lives in: `next/www/src/routes/index.tsx` (`credits`), `next/www/src/components/site-footer.tsx`, `next/docs/openapi/overview.md`, `next/docs/server/contract-first.md`.
