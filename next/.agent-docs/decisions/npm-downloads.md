# v12's download count adds `@trpc/server`'s and `@trpc12/trpc`'s (human)

- Human, 2026-11-02: "for v12, npm downloads should count as a sum of `@trpc/server` + `@trpcdev/trpc` as that makes more sense", then "ah i meant `@trpc12`". The `@trpc12` package is the core, `@trpc12/trpc`, v12's `@trpc/server` ([`npm-names.md`](./npm-names.md)).
- (agent) The one download count on the site is the home page's social card (`/og/index.png`), drawn on request ([`og-images.md`](./og-images.md)). Where v12 is offered (v12.trpc.io, and trpc.io once `v12.hidden` is `false`) it shows last week's downloads of `@trpc/server` and `@trpc12/trpc` added up. trpc.io keeps `@trpc/server`'s alone while v12 is hidden.
- (agent) The core's name is read from `next/packages/trpc/package.json`, so the sum follows the 12.0.0 rename to `trpc`.
- (agent) npm answers 404 for a package it doesn't have: one not published yet counts as 0, so until `@trpc12/trpc` is published the sum is `@trpc/server`'s. Any other failure leaves the number off the card, which is then cached ten minutes instead of a day, as before.
- Why: v12 is the next tRPC, so its count is everyone on tRPC's server, the current major's and v12's.
- Lost: one number on both hosts; the README's shields.io badge stays `@trpc/server`'s, since a badge can't add two packages.
- Lives in: `www/src/og/live.ts` (`downloadPackages`, `fetchStats`), `www/src/og/live.test.ts`.
