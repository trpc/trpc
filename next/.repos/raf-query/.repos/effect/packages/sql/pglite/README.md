# @effect/sql-pglite

An Effect SQL client for [PGlite](https://pglite.dev), a WASM build of PostgreSQL that runs in the browser, Node.js, and Bun.

## Installation

```sh
npm install effect @effect/sql-pglite
```

## Links

- [Website](https://effect.website): documentation, guides, and news.
- [Reference](https://effect.website/docs/v4/api/sql-pglite): API documentation for this package.
- [Discord](https://discord.gg/effect-ts): ask questions, share what you're building, and talk to the core team.
- [Community](https://effect.website/community-hub): meetups and events, or bring Effect to your own.
- [Issues](https://github.com/Effect-TS/effect/issues): bug reports and feature requests.

## Let's talk

Whether your team is considering Effect, rolling it out, or already running it in production, we'd love to hear from you: what you're building, what works, and what you need from Effect next.

- **Talk to the maintainers.** Introduce your team on [Discord](https://discord.gg/effect-ts) or email [contact@effectful.co](mailto:contact@effectful.co). We're happy to connect privately on Slack or Discord for feedback and help with adoption.
- **Production support.** We're exploring how to better support teams running Effect in production. If your organization has specific support needs, let's discuss them.
- **Adoption help.** Our [adoption partners](https://effect.website/adoption-partners) offer implementation, consulting, team extension, training, and commercial support.

## LISTEN / NOTIFY

`listen` is a scoped subscription that returns after the listener is installed.
It exposes notifications through a queue and keeps the subscription active for
the surrounding scope:

```ts
import { PgliteClient } from "@effect/sql-pglite"
import { Effect, Queue } from "effect"

const program = Effect.gen(function*() {
  const sql = yield* PgliteClient.PgliteClient
  const notifications = yield* sql.listen("events")

  yield* sql.notify("events", "ready")
  return yield* Queue.take(notifications)
})
```
