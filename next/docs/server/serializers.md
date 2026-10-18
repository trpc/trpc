---
title: Serializers
description: Plain JSON by default; danSON or superjson-style serializers keep Dates, Maps and files, and client types follow.
section: Server
order: 11
v11: server/data-transformers
---

The serializer turns inputs and outputs into JSON on the wire. The default is plain JSON. To keep more types, pass the same serializer to the handler and to every link:

| Serializer                        | Keeps                                                        |
| --------------------------------- | ------------------------------------------------------------ |
| `jsonSerializer`, the default     | plain JSON                                                   |
| `createSerializer()`, danSON      | `Date`, `Map`, `Set`, `bigint`, `undefined`, `URL`, files, … |
| `createSyncSerializer(superjson)` | what the transformer knows (superjson, devalue, your own)    |

Every serializer streams deferred values: a procedure can return promises, generators and `ReadableStream`s at any depth, and each value goes through the serializer as it settles.

## Choosing one

The serializer lives on the handler and the links, not on `initTrpc`:

```ts twoslash
// ---cut-start---
import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
import { createFetchHandler, initTrpc } from '@trpc12/trpc/server';
const t = initTrpc();
const router = { health: t.procedure.query(() => 'ok') };
type AppRouter = typeof router;
declare const url: string;
// ---cut-end---
import { createSerializer } from '@trpc12/trpc/serializer';

export const serializer = createSerializer();

createFetchHandler({ router, serializer });
const client = createTrpcClient({
  router: routerType<AppRouter>(),
  links: [httpLink({ url, serializer })],
});
```

`wsLink` and `localLink` take `serializer` the same way. With superjson or devalue, list the types the transformer rebuilds:

```ts twoslash
// ---cut-start---
import { createSyncSerializer } from '@trpc12/trpc/serializer';
import superjson from 'superjson';
// ---cut-end---
export const serializer = createSyncSerializer<
  Date | Map<any, any> | Set<any> | bigint | undefined
>(superjson);
// devalue: createSyncSerializer({ serialize: devalue.stringify, deserialize: devalue.parse })
```

If the two ends disagree, calls fail with `UNSUPPORTED_PROTOCOL`, with a message naming both serializers. Over HTTP the handler names its serializer in the `trpc-serializer` response header and `httpLink` checks it, after the server ran the call. `wsLink` names its own in the connection's `init` message: the server answers with its own and runs none of that connection's calls on a mismatch.

## Client types follow the link

The first link in the chain that has a serializer types the results. A type the serializer doesn't keep arrives in its JSON form, and the client's types say so:

```ts twoslash
// ---cut-start---
import { t } from './server.ts';
// ---cut-end---
import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
import { createSerializer } from '@trpc12/trpc/serializer';

const router = {
  getPost: t.procedure.query(() => ({
    at: new Date(),
    tags: new Set(['a']),
    draft: undefined,
  })),
};

const json = createTrpcClient({
  router: routerType<typeof router>(),
  links: [httpLink({ url: '/trpc' })],
});
const plain = await json.getPost.query();
//    ^?

const danson = createTrpcClient({
  router: routerType<typeof router>(),
  links: [httpLink({ url: '/trpc', serializer: createSerializer() })],
});
const rich = await danson.getPost.query();
//    ^?
```

`Date` (and anything with `toJSON`) becomes what `toJSON` returns, `Map`, `Set` and other objects without own keys become `{}`, `undefined` keys are dropped and `undefined` array items become `null`. Types that are already JSON are kept as written, so recursive and branded JSON types survive. `JsonOf<T, Keeps>` is that transform, for your own types.

A typed error's `data` goes through the same serializer: `new TrpcError({ code: 'EXPIRED', data: { at: new Date() } })` reaches a plain-JSON client as `data: { at: string }`.

In-process callers (`createRouterClient`, `createTrpcRsc`, `localLink({ serializer: false })`) pass values by reference, so they keep native types whatever the serializer.

## Files

A root `File` or `Blob` output of an unbatched HTTP call is the response body, with any serializer. On a batching chain, plain JSON can't batch it, so such calls take `{ batch: false }` (a type error otherwise). Files anywhere else, and files in inputs, need danSON; the other serializers fail before sending.

## Query URLs

Query inputs go in the URL as `?input=<JSON>`, with object keys sorted (array order is kept), so equal inputs make the same URL and hit the same HTTP cache entry. A serializer that makes refs (danSON's `$n` markers) adds `&refs=`. Long inputs fall back to `POST` ([Links](../client/links/http.md#query-urls)).

## Custom types with danSON

```ts twoslash
// ---cut-start---
import { createSerializer, type CustomType } from '@trpc12/trpc/serializer';
declare class Decimal {
  constructor(value: string);
}
// ---cut-end---
const decimal: CustomType<Decimal, string> = {
  is: (v) => v instanceof Decimal,
  serialize: (v) => v.toString(),
  deserialize: (s) => new Decimal(s),
};
export const serializer = createSerializer({ types: { Decimal: decimal } });
```

The [`examples/media-pipeline`](../../examples/media-pipeline/README.md) app keeps a `Money` class this way, and with superjson's `registerCustom` on a second endpoint, in query URLs and outputs.

## Hydration

`hydrationOptions({ client })` serializes TanStack Query data with the client's serializer (the first link that has one), so server-rendered data hydrates with the same types the client sees. Type the query context from the client, and it takes the links' form too:

```ts twoslash
// ---cut-start---
import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
import { createSerializer } from '@trpc12/trpc/serializer';
import { createTrpcContext } from '@trpc12/tanstack-react-query';
import type { AppRouter } from './server.ts';
const serializer = createSerializer();
declare const url: string;
// ---cut-end---
const makeClient = () =>
  createTrpcClient({
    router: routerType<AppRouter>(),
    links: [httpLink({ url, serializer })],
  });
export const [TrpcProvider, useTrpc] = createTrpcContext<typeof makeClient>();
```

A router type alone (`createTrpcContext<AppRouter>()`) has no links, so it types the default JSON form.

See [Hydration](../integrations/tanstack-query/hydration.md).
