# 15 — Server-side calls and server actions

| Status     | Area   | Depends on | oRPC parity rows       |
| ---------- | ------ | ---------- | ---------------------- |
| `proposed` | server | 03, 07, 08 | Server Actions support |

## Summary

Decide how procedures are called in-process (tests, RSC, scripts, server-to-server) and how they become framework server actions. The [brief](../decisions/brief.md) makes RSC callers opt-in.

**Recommendation:**

- `createRouterClient()` with direct-call ergonomics.
- `call()` for single procedures.
- Opt-in `callable()` and `action()` wrappers, with no builder methods.
- Actions return typed results instead of throwing.

## Today (v11)

- **Router callers:** `t.createCallerFactory(router)(ctx)` gives `caller.post.byId(input)`. `router.createCaller(ctx)` is deprecated-ish.
- **Server actions:** `t.procedure.experimental_caller(experimental_nextAppDirCaller({ createContext }))` makes a procedure callable as a function (server actions); experimental.
- **Internal call path:** `callTRPCProcedure` is the internal path. `unstable_localLink` gives a client that calls a router in-process, with serialization.
- **TanStack:** `createTRPCOptionsProxy({ router, ctx })` supports server-side prefetching.

## Goals

- One obvious way to call a router in-process.
- Server actions with typed inputs, outputs _and errors_ that survive the RSC boundary.
- Opt-in: none of this lives on the core builder.
- Framework control-flow errors (Next's `redirect()`, `notFound()`) pass through untouched.

## Decision areas

### (a) Router clients

```ts
const caller = createRouterClient(appRouter, {
  ctx: async () => createContext({ headers: await headers() }),
});
const post = await caller.post.byId({ id: '1' }); // SC-A: direct call
```

- **SC-A — Direct calls** (v11 `createCaller`, and oRPC's `createRouterClient`): `caller.post.byId(input)`.
- **SC-B — Remote-client shape:** `caller.post.byId.query(input)`. The same type as `createTRPCClient`, so code can switch between local and remote.
  - ❌ More verbose for the common server case. `localLink` (17) already covers "remote shape, in-process".

  ```ts
  // SC-B
  const caller = createRouterClient(appRouter, { ctx: createContext });
  const post = await caller.post.byId.query({ id: '1' });
  await caller.post.create.mutate({ title: 'Hello' });

  // what localLink gives under SC-A: the remote shape, in-process, with serialization
  const local = createTRPCClient<AppRouter>({
    links: [localLink({ router: appRouter, createContext })],
  });
  ```

### (b) Single procedures

```ts
await call(byId, { id: '1' }, { ctx });
```

### (c) `callable()` and `action()` wrappers

```ts
// any server code
export const getPost = callable(byId, { ctx: createContext }); // (input) => Promise<Post>

// Next.js / React server actions
('use server');
export const createPost = action(createPostProcedure, {
  ctx: createContext,
  rethrow: isNextControlFlowError, // redirect(), notFound()
});

// client component
const result = await createPost({ title }); // { data: Post } | { error: TypedError }
```

- Wrappers instead of `.experimental_caller()` or `.actionable()`. This keeps the builder closed (03) and makes the features tree-shakeable.

  ```ts
  // Q15.2 builder method (oRPC's .actionable() style), for comparison
  export const createPost = t.procedure.input(NewPost).mutation(…).actionable({ ctx: createContext });
  ```

- `action()` accepts an input object _or_ `FormData`. FormData is parsed with bracket notation, the same parser as OpenAPI (18).

  ```tsx
  // client component: the same action, called with FormData
  <form
    action={async (formData) => {
      const result = await createPost(formData); // validated by createPostProcedure's .input()
      if ('error' in result) setError(result.error);
    }}
  >
    <input name="title" />
    <input type="checkbox" name="tags[]" value="news" />{' '}
    {/* bracket notation: { title, tags: ['news', …] } */}
    <input type="checkbox" name="tags[]" value="ts" />
  </form>
  ```

- Errors are **returned** in a serializable result so their types survive the RSC boundary, as in [#5554](https://github.com/trpc/trpc/pull/5554) and [#5569](https://github.com/trpc/trpc/pull/5569). Unexpected errors are masked (07).

  ```ts
  // Q15.3 result shapes, on the client
  const result = await createPost({ title }); // { data } | { error }
  const [post, error] = await createPost({ title }); // tuple matching safe() (07 Q7.3)
  const post = await createPost({ title }); // throw: the error type is lost across the RSC boundary
  ```

### (d) Framework specifics

- Next.js: `isNextControlFlowError` and a `headers()`-aware context helper. They could live in a tiny `@trpcdev/next` package or in documentation (Q15.4).

  ```ts
  // Q15.4 package
  import { isNextControlFlowError } from '@trpcdev/next';

  // Q15.4 docs: a snippet users copy (digest check as in v11's rethrowNextErrors)
  const isNextControlFlowError = (error: unknown) =>
    typeof error === 'object' &&
    error !== null &&
    'digest' in error &&
    typeof error.digest === 'string' &&
    /^NEXT_(REDIRECT|NOT_FOUND|HTTP_ERROR_FALLBACK)\b/.test(error.digest);
  ```

- React hooks for actions (`useAction`, optimistic updates) belong to 20.

## Recommendation

- **SC-A** `createRouterClient`.
- `call()`.
- `callable()` and `action()` wrappers returning `{ data } | { error }`, with the result shape aligned to 07's `safe()` decision.
- Framework helpers in docs first; add a package only if the helpers grow.

## Questions

- **Q15.1** Router client shape: direct calls (SC-A) or remote-client shape (SC-B)?
- **Q15.2** `callable()`/`action()` wrappers instead of builder methods?
- **Q15.3** Action result shape: `{ data } | { error }`, a tuple matching `safe()`, or throw?
- **Q15.4** Next.js helpers: a `@trpcdev/next` package, or documented snippets?

## Decision

- **Q15.1:** [x] both: SC-A and `localLink` → [server-side-calls](../decisions/server-side-calls.md)
- **Q15.2:** [x] wrappers · [ ] builder methods → [actions-and-rsc](../decisions/actions-and-rsc.md)
- **Q15.3:** [x] configurable on a `createAction({ ctx, result })` factory, `safe()`-style by default → [actions-and-rsc](../decisions/actions-and-rsc.md)
- **Q15.4:** [x] neither: `trpcdev/actions` plus `@trpcdev/tanstack-react-query/rsc` → [actions-and-rsc](../decisions/actions-and-rsc.md)
- **Notes:**
