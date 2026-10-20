# Named switchLink with a typed call option (human)

- Human, 2026-10-15 (issues review Q9): "Also it'd be nice to have some sort of ability to have a split link (or switch link?) that can force which link to choose down that path for the ending ones", "The switch link can have a name", then "Yes" to:

  ```ts twoslash
  // @errors: 2322
  // ---cut-start---
  import {
    createTrpcClient,
    httpLink,
    routerType,
    switchLink,
    wsLink,
  } from '@trpc12/trpc/client';
  import type { AppRouter } from './server.ts';
  declare const url: string;
  declare const wsUrl: string;
  // ---cut-end---
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [
      switchLink({
        name: 'transport',
        links: {
          http: httpLink({ url, batch: true }),
          ws: wsLink({ url: wsUrl }),
        },
        pick: (op) => (op.type === 'subscription' ? 'ws' : 'http'),
      }),
    ],
  });
  await client.post.byId.query({ id: '1' }, { transport: 'http' });
  // Doesn't compile: the call option takes the links' names
  await client.post.byId.query({ id: '1' }, { transport: 'sse' });
  ```

- `name` is a required string literal. The link declares `{ [name]?: keyof links }` as a call option, so a call can force a branch.
- Reserved names are type errors (`signal`, `lastEventId`, `init`, `headers`, `reconnect`), and so are two switch links with the same name.
- Branches can be chains (arrays of links). `splitLink` stays.
- Lost: nothing; `splitLink` covers the two-way case.
- Lives in: `packages/trpc/src/client/links/switch.ts`.
