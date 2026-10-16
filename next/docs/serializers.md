# Serializers

The serializer turns inputs and outputs into JSON on the wire. Pass the same one to the handler and to every link.

| Kind      | Make it with                       | Keeps                                                                 |
| --------- | ---------------------------------- | --------------------------------------------------------------------- |
| Streaming | the default, or `createSerializer` | `Date`, `Map`, `Set`, `bigint`, files, nested promises and generators |
| Sync      | `createSyncSerializer(superjson)`  | what the transformer knows, plus root generators and promises         |
| None      | `jsonSerializer`                   | plain JSON, plus root generators and promises                         |

The default is a port of danSON. It may change before the final release.

## Choosing one

Declare it on `initTrpc` by type, so client types follow it, then give it to the handler and links:

```ts
import superjson from 'superjson';
import { createSyncSerializer } from 'trpcdev/serializer';

export const serializer = createSyncSerializer<
  Date | Map<any, any> | Set<any> | bigint | undefined
>(superjson);

const t = initTrpc<{ ctx: Context; serializer: typeof serializer }>();

createFetchHandler({ router, serializer }); // required, and checked against the router
const client = createTrpcClient({
  router: routerType<AppRouter>(),
  links: [httpLink({ url, serializer })],
});
```

The type argument of `createSyncSerializer` lists the types the transformer rebuilds. devalue works the same way: `createSyncSerializer({ serialize: devalue.stringify, deserialize: devalue.parse })`.

With no serializer at all:

```ts
const t = initTrpc<{ serializer: typeof jsonSerializer }>();
createFetchHandler({ router, serializer: jsonSerializer });
httpLink({ url, serializer: jsonSerializer });
```

## Client types follow the serializer

A type the serializer doesn't keep arrives in its JSON form, and the client's types say so:

```ts
const getPost = t.procedure.query(() => ({
  at: new Date(),
  tags: new Set(['a']),
  draft: undefined,
}));

// jsonSerializer
const post = await client.getPost.query();
//    ^? { at: string; tags: Record<string, never> }
```

`Date` (and anything with `toJSON`) becomes what `toJSON` returns, `Map`, `Set` and other objects without own keys become `{}`, `undefined` keys are dropped and `undefined` array items become `null`. `JsonOf<T, Keeps>` is that transform, for your own types.

In-process callers (`createRouterClient`, `createTrpcRsc`) pass values by reference, so they keep native types whatever the serializer.

## What a sync serializer can't carry

The transport frames a procedure that returns a generator, a `ReadableStream` or a promise: each item goes through the serializer on its own, in JSONL lines, SSE events or socket messages. Subscriptions work the same way.

A sync serializer (or none) can't carry these nested in other values, and can't carry `File` or `Blob`:

- A nested promise or generator arrives as `{}`; its type says `Record<string, never>`.
- A `File` or `Blob` input fails before sending. A root file output can still be a raw response on an unbatched HTTP call (see [Responses](./procedures.md#responses)).

Query inputs are sent as `?input=<serialized JSON>` instead of the default's readable params. Inputs are deserialized by the transformer as they are; it decides what's safe to accept from a client.

## Custom types with the default

```ts
const decimal: CustomType<Decimal, string> = {
  is: (v) => v instanceof Decimal,
  serialize: (v) => v.toString(),
  deserialize: (s) => new Decimal(s),
};
export const serializer = createSerializer({ types: { Decimal: decimal } });
```

## Hydration

`hydrationOptions({ client })` serializes TanStack Query data with the client's serializer (the first link that has one), so server-rendered data hydrates with the same types the client sees. See [TanStack Query](./tanstack-query.md#hydration).
