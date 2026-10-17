# Custom error codes default to status 400 (human)

- Human, 2026-10-15 (decisions round 3, Q14 = proposal 07 Q7.4): "B".
- Any string is a valid error code. The 21 built-in codes keep their mapped HTTP status; a custom code without an explicit `status` gets **400**.
- A status declared in `.errors({ CODE: { status } })` or on a `TrpcError.Tagged` class wins. `error({ … })` no longer takes `status` ([`errors.md`](./errors.md), error status "C").
- (agent) Unknown thrown errors still become `INTERNAL_SERVER_ERROR` (500), so a 5xx keeps meaning "something broke".
- Why: a returned or declared custom code is an expected domain outcome (out of stock, quota hit), not a server failure; 5xx alerts and dashboards stay meaningful.
- Lost: a typo'd or accidental code no longer looks like a server error.
- Lives in: `packages/trpc/src/internal/error.ts`; `packages/trpc/src/server/errors.test.ts`.
