# `effect` is a regular dependency (human)

- Alex, 2026-10-09 (Q1.1): "can be a dependency instead on ^4.0.0". `trpcdev` has `"dependencies": { "effect": "^4.0.0" }`, against proposal 01's peer-dependency recommendation.
- Why: nothing for Promise users to install or think about, and no peer warnings. A caret range lets package managers dedupe against an app's own `effect@4.x`.
- Lost: an app on an `effect` outside `^4.0.0` (a future v5) gets a second copy, and values crossing between copies (Effects, Schemas, service keys) may not interoperate. A peer dependency would have surfaced that at install time.
- Open: a CI job that runs against the latest `effect@4` minor, since users get whatever `^4.0.0` resolves to.
- Lives in: `packages/trpcdev/package.json`. Integration packages follow the same rule.
