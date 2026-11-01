---
title: Transformers
description: Plain JSON by default; progressive JSON or superjson-style transformers keep Dates, Maps and files, and client types follow.
section: Server
order: 11
v11: server/data-transformers
---

The transformer turns inputs and outputs into JSON on the wire. The default is plain JSON. To keep more types, pass the same transformer to the handler and to every link:

| Transformer                                              | Keeps                                                        |
| -------------------------------------------------------- | ------------------------------------------------------------ |
| `jsonTransformer`, the default                           | plain JSON                                                   |
| `experimental_createProgressiveJson()`, progressive JSON | `Date`, `Map`, `Set`, `bigint`, `undefined`, `URL`, files, … |
| `createSyncTransformer(superjson)`                       | what the library knows (superjson, devalue, your own)        |

Progressive JSON is experimental: it [might change or go away in any release](../packages.md#experimental). It sends a value's head first and fills in its promises and streams as they settle, as in Dan Abramov's [Progressive JSON](https://overreacted.io/progressive-json/).

Every transformer streams deferred values: a procedure can return promises, generators and `ReadableStream`s at any depth, and each value goes through the transformer as it settles.

## Choosing one

The transformer lives on the handler and the links, not on `initTrpc`:

```ts twoslash
// ---cut-start---
import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
import { createFetchHandler, initTrpc } from '@trpc12/trpc/server';
const t = initTrpc();
const router = t.router({ health: t.procedure.query(() => 'ok') });
type AppRouter = typeof router;
declare const url: string;
// ---cut-end---
import { experimental_createProgressiveJson } from '@trpc12/trpc/transformer';

export const transformer = experimental_createProgressiveJson();

createFetchHandler({ router, transformer });
const client = createTrpcClient({
  router: routerType<AppRouter>(),
  links: [httpLink({ url, transformer })],
});
```

`wsLink` and `localLink` take `transformer` the same way. With superjson or devalue, list the types the transformer rebuilds:

```ts twoslash
// ---cut-start---
import { createSyncTransformer } from '@trpc12/trpc/transformer';
import superjson from 'superjson';
// ---cut-end---
export const transformer = createSyncTransformer<
  Date | Map<any, any> | Set<any> | bigint | undefined
>(superjson);
// devalue: createSyncTransformer({ serialize: devalue.stringify, deserialize: devalue.parse })
```

If the two ends disagree, calls fail with `UNSUPPORTED_PROTOCOL`, with a message naming both transformers. Over HTTP the handler names its transformer in the `trpc-transformer` response header and `httpLink` checks it, after the server ran the call. `wsLink` names its own in the connection's `init` message: the server answers with its own and runs none of that connection's calls on a mismatch.

## Client types follow the link

The first link in the chain that has a transformer types the results. A type the transformer doesn't keep arrives in its JSON form, and the client's types say so:

```ts twoslash
// ---cut-start---
import { t } from './server.ts';
// ---cut-end---
import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
import { experimental_createProgressiveJson } from '@trpc12/trpc/transformer';

const router = t.router({
  getPost: t.procedure.query(() => ({
    at: new Date(),
    tags: new Set(['a']),
    draft: undefined,
  })),
});

const json = createTrpcClient({
  router: routerType<typeof router>(),
  links: [httpLink({ url: '/trpc' })],
});
const plain = await json.getPost.query();
//    ^?

const progressiveJson = createTrpcClient({
  router: routerType<typeof router>(),
  links: [
    httpLink({
      url: '/trpc',
      transformer: experimental_createProgressiveJson(),
    }),
  ],
});
const rich = await progressiveJson.getPost.query();
//    ^?
```

`Date` (and anything with `toJSON`) becomes what `toJSON` returns, `Map`, `Set` and other objects without own keys become `{}`, `undefined` keys are dropped and `undefined` array items become `null`. Types that are already JSON are kept as written, so recursive and branded JSON types survive. `JsonOf<T, Keeps>` is that transform, for your own types.

`inferRouterOutputs<typeof json>` and `inferRouterOutputs<typeof progressiveJson>` name those results by path. A router type has no links, so `inferRouterOutputs<typeof router>` is the plain JSON form ([Inferring types](../client/overview.md#inferring-types)).

A typed error's `data` goes through the same transformer: `new TrpcError({ code: 'EXPIRED', data: { at: new Date() } })` reaches a plain-JSON client as `data: { at: string }`.

In-process callers (`createRouterClient`, `createTrpcRsc`, `localLink({ transformer: false })`) pass values by reference, so they keep native types whatever the transformer.

## Files

A root `File` or `Blob` output of an unbatched HTTP call is the response body, with any transformer. On a batching chain, plain JSON can't batch it, so such calls take `{ batch: false }` (a type error otherwise). Files anywhere else, and files in inputs, need progressive JSON; the other transformers fail before sending.

## Query URLs

Query inputs go in the URL as `?input=<JSON>`, with object keys sorted (array order is kept), so equal inputs make the same URL and hit the same HTTP cache entry. A transformer that makes refs (progressive JSON's `$n` markers) adds `&refs=`. Long inputs fall back to `POST` ([Links](../client/links/http.md#query-urls)).

## Custom types with progressive JSON

```ts twoslash
// ---cut-start---
import {
  experimental_createProgressiveJson,
  type CustomType,
} from '@trpc12/trpc/transformer';
declare class Decimal {
  constructor(value: string);
}
// ---cut-end---
const decimal: CustomType<Decimal, string> = {
  is: (v) => v instanceof Decimal,
  serialize: (v) => v.toString(),
  deserialize: (s) => new Decimal(s),
};
export const transformer = experimental_createProgressiveJson({
  types: { Decimal: decimal },
});
```

The [`examples/media-pipeline`](../../../examples/media-pipeline/README.md) app keeps a `Money` class this way, and with superjson's `registerCustom` on a second endpoint, in query URLs and outputs.

## Hydration

`hydrationOptions({ client })` serializes TanStack Query data with the client's transformer (the first link that has one), so server-rendered data hydrates with the same types the client sees. Type the query context from the client, and it takes the links' form too:

```ts twoslash
// ---cut-start---
import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
import { experimental_createProgressiveJson } from '@trpc12/trpc/transformer';
import { createTrpcContext } from '@trpc12/tanstack-react-query';
import type { AppRouter } from './server.ts';
const transformer = experimental_createProgressiveJson();
declare const url: string;
// ---cut-end---
const makeClient = () =>
  createTrpcClient({
    router: routerType<AppRouter>(),
    links: [httpLink({ url, transformer })],
  });
export const [TrpcProvider, useTrpc] = createTrpcContext<typeof makeClient>();
```

A router type alone (`createTrpcContext<AppRouter>()`) has no links, so it types the default JSON form.

See [Hydration](../integrations/tanstack-query/hydration.md).
