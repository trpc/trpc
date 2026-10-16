# Server Actions and React Server Components

Nothing here is Next-specific: it works with any React Server Components setup.

## Server Actions

`createAction` from `trpcdev/actions` makes a factory that sets the ctx, layer and result mode once. `action(procedure)` is then an async function that takes the input or a form's `FormData`:

```ts
'use server';
import { createAction } from 'trpcdev/actions';

const action = createAction({ ctx: async () => ({ user: await auth() }) });

export const createPost = action(appRouter.post.create);
```

```tsx
<form action={createPost}>
  <input name="title" />
  <input name="tags[]" value="news" />
</form>;

const [post, error] = await createPost({ title, tags: [] });
```

- `FormData` is parsed with bracket notation (`tags[]=a`, `author[name]=alex`) and coerced from the input's JSON Schema (`'40'` becomes `40` where the schema wants a number). Framework fields such as Next's `$ACTION_ID_…` are dropped.
- `result: 'safe'` (the default) returns the `[data, error]` / `{ data, error }` result of `safe()`. `result: 'throw'` returns the data and throws `TrpcError`.
- Results reach the browser, so unexpected errors are masked outside development, as in handlers. `onError` sees them first.
- A factory whose ctx or layer can't satisfy a procedure is a type error, and so is wrapping a subscription.
- Next's `redirect()`, `notFound()` and dynamic-API errors thrown in a procedure or `ctx` are rethrown as they are, not returned as errors, so Next can act on them. Any error with a string `digest` counts. The same holds for `call()`, `createRouterClient()` and `localLink`.

`createCallable` is the same factory for direct calls with typed input (no `FormData`), from server components, loaders or scripts:

```ts
const callable = createCallable({ ctx: createContext, result: 'throw' });
const post = await callable(appRouter.post.byId)({ id: '1' });
```

## React Server Components

`createTrpcRsc` from `@trpcdev/tanstack-react-query/rsc` gives server components query helpers over the router itself, a per-request query client, and a server `HydrationBoundary`:

```ts
// trpc/server.ts
import 'server-only';
import { createTrpcRsc } from '@trpcdev/tanstack-react-query/rsc';

export const { trpc, caller, getQueryClient, prefetch, HydrationBoundary } =
  createTrpcRsc({
    router: appRouter,
    ctx: createContext, // called once per request
  });
```

```tsx
// app/post/[id]/page.tsx
export default async function Page({ params }) {
  prefetch(trpc.post.byId.queryOptions({ input: { id: params.id } }));
  return (
    <HydrationBoundary>
      <Post id={params.id} /> {/* a client component using useQuery */}
    </HydrationBoundary>
  );
}
```

- `ctx` and the query client are memoized per request with React's `cache()`.
- `HydrationBoundary` dehydrates the request's queries, pending ones included, so they stream in. The browser's `QueryClient` needs `defaultOptions: hydrationOptions({ client })`. If the router declares a [serializer](./serializers.md), `createTrpcRsc` requires the same one as `serializer`, so `Date`s and custom types survive.
- `await getQueryClient().fetchQuery(…)` reads data in the server component itself. `caller` calls the router without the cache.
- A pending query that later fails is redacted in the dehydrated state, unless its error has a `digest`: Next has to see those to detect dynamic rendering. Set `dehydrate.shouldRedactErrors` on your `makeQueryClient` to change that.

## Next.js data cache

`cacheTags(key)` from `@trpcdev/tanstack-query` (re-exported by the framework packages) turns a query key into data-cache tags, broad to narrow: `trpc`, each path prefix (`trpc:post`, `trpc:post.byId`), then the path with its input (`trpc:post.byId:{"id":"1"}`, keys sorted). `revalidationTag(key)` is the one tag that covers a key, so revalidating works like `invalidateQueries`:

```ts
import { cacheTag, revalidateTag } from 'next/cache';
import { cacheTags, revalidationTag } from '@trpcdev/tanstack-react-query';

async function getPost(id: string) {
  'use cache';
  cacheTag(...cacheTags(trpc.post.byId.queryKey({ input: { id } })));
  return caller.post.byId({ id });
}

// in a Server Action, after a write
revalidateTag(revalidationTag(trpc.post.byId.queryKey({ input: { id } }))); // that post
revalidateTag(revalidationTag(trpc.post.pathKey())); // every post.* call
```

An input whose tag would be longer than Next's 256 characters gets no tag of its own; it revalidates with its path.
