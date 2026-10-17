# Stream items are validated with `stream()`; subscriptions accept either form (human)

- Human, 2026-10-15 (decisions round 3, Q13 = proposal 14 Q14.3): "A but B should work too specifically for subscriptions (allow that to have either or)".
- Subscriptions: `.output(Post)` and `.output(stream(Post))` both validate each event (the `data` of `tracked()` events).
- Streamed queries and mutations: `.output(stream(Item, Return?))` validates each yielded item and the generator's return value. The client sees `AsyncIterable<Item>` or `AsyncGenerator<Item, Return>`.
- (agent) A plain `.output(Item)` on a query or mutation whose resolver returns a generator or `Stream` is a type error pointing to `stream()`.
- (agent) A bad item fails the stream with `INTERNAL_SERVER_ERROR` after the items before it are delivered, like a bad output today. `{ validate: false }` types items without checking them.
- (agent) Streams nested inside an object output are not validated in v1; schema libraries can't hold a `stream()` field.
- (agent) Deserialized async iterables now end with the stream's return value, so `iterator.next()` gives `{ done: true, value: summary }`; the client type keeps the return type when it isn't `void` or `any`.
- (agent) A `stream()` output's OpenAPI document describes the item schema.
- Why: the common subscription case stays short, the ambiguous cases are explicit, and return values get a schema.
- Lost: one rule for every kind.
- Lives in: `packages/trpc/src/server/stream-schema.ts`, `src/server/execute.ts` (`validateItems`), `src/server/builder.ts` (`StreamOutputCheck`), `src/contract/index.ts`, `src/serializer/stream.ts` (return values); `packages/trpc/src/server/stream-output.test.ts`.
