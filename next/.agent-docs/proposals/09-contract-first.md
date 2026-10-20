# 09 — Contract-first

| Status     | Area                     | Depends on     | oRPC parity rows                                                       |
| ---------- | ------------------------ | -------------- | ---------------------------------------------------------------------- |
| `proposed` | server, client, contract | 03, 05, 07, 08 | **With contract-first approach**, Nest.js integration, OpenAPI support |

## Summary

Decide how to define an API contract separately from its implementation, how implementations are checked against it, and how clients consume contracts at runtime.

**Recommendation:**

- A contract builder that reuses the procedure builder's definition methods.
- `implement(contract)` gives a builder whose terminals are type-checked against the contract.
- Routers can also be _reduced_ to contracts: at the type level (`inferContract`), and at runtime as minified JSON.

## Today (v11)

There is no contract-first support; a procedure only exists once it has a resolver. The usual workaround is `export type AppRouter`, which leaks server types into the client and causes TS2742 in monorepos (01). oRPC lists tRPC as 🛑 for this row.

## Goals

- Define the API (inputs, outputs, errors, meta, routes) in a package with no server dependencies, and share it with clients, servers, other languages (OpenAPI) and other teams.
- An implementation is checked against the contract: missing procedures, wrong outputs or undeclared errors are type errors and runtime errors.
- Implementation-first users get the same benefits (a client-visible contract type, OpenAPI) without writing a contract.

## Proposed API

```ts
// contract package: depends only on @trpc12/trpc/contract + a schema library
import { contract } from '@trpc12/trpc/contract';

const c = contract.create<{ meta: Meta }>();

export const postContract = {
  byId: c
    .route({ method: 'GET', path: '/posts/{id}' })
    .input(z.object({ id: z.string() }))
    .output(Post)
    .errors({ NOT_FOUND: { data: z.object({ id: z.string() }) } })
    .query(), // terminal without a resolver = contract procedure
  create: c.input(NewPost).output(Post).mutation(),
};
export const appContract = { post: postContract };
```

```ts
// server package
const impl = t.implement(appContract);

export const appRouter = impl.router({
  post: {
    byId: impl.post.byId.use(authed).query(async ({ input, errors }) => {
      const post = await db.post.find(input.id);
      if (!post) throw errors.NOT_FOUND({ data: { id: input.id } });
      return post;
    }),
    create: impl.post.create.mutation(({ input }) => db.post.create(input)),
  },
});
```

```ts
// client package: no server types involved
const client = createTRPCClient<typeof appContract>({
  links: [httpLink({ url })],
});
```

### Design notes

- **Terminal without a resolver.** `.query()` with no argument produces a contract procedure. This reuses the familiar verbs instead of introducing oRPC's `oc` and `.handler()`. The alternative is a separate `contract.procedure({ type: 'query', input, output })` options bag (see Q9.1).

  ```ts
  // Q9.1, options bag
  export const postContract = {
    byId: contract.procedure({
      type: 'query',
      input: z.object({ id: z.string() }),
      output: Post,
    }),
    create: contract.procedure({
      type: 'mutation',
      input: NewPost,
      output: Post,
    }),
  };
  ```

- **`implement()`:**
  - Returns a mirror of the contract tree. Each leaf is a builder pre-loaded with the contract's input, output, errors, meta and route.
  - Allowed: `.use()` (middleware, which may add typed errors only if they are declared in the contract; **open**) and the matching terminal.
  - Not allowed: `.input()` / `.output()`.
  - `impl.router()` checks completeness at the type level and at runtime.

  ```ts
  impl.post.byId.input(z.object({ slug: z.string() })); // type error: input comes from the contract

  // Q9.3: TOO_MANY_REQUESTS is not declared in appContract
  const rateLimited = t.middleware(async ({ ctx, next }) =>
    (await overLimit(ctx)) ? error({ code: 'TOO_MANY_REQUESTS' }) : next(),
  );
  impl.post.create.use(rateLimited).mutation(…); // allowed, or a type error?
  ```

  The alternative in Q9.2 attaches one contract procedure at a time to an ordinary builder:

  ```ts
  // Q9.2, .implements()
  export const appRouter = {
    post: {
      byId: t.procedure
        .implements(appContract.post.byId)
        .use(authed)
        .query(async ({ input }) => db.post.find(input.id)),
    },
  };
  ```

- **Router to contract:**
  - Type level: `inferContract<typeof appRouter>` strips `ctx`, middleware and services.
  - Runtime: `toContract(router)` emits a minified, JSON-serializable contract (paths, types, routes, JSON Schemas). The OpenAPI link (18), client-side validation and codegen use it.

  ```ts
  export type AppContract = inferContract<typeof appRouter>; // no ctx, middleware or services
  export const appContract = toContract(appRouter); // JSON-serializable (Q9.4)

  createTRPCClient<AppContract>({ links: [httpLink({ url })] });
  createTRPCClient<AppContract>({
    links: [openAPILink({ url, contract: appContract })],
  }); // 18
  ```

- **Runtime enforcement:** `impl.router()` throws if a contract procedure is missing or has the wrong type. Output and error data are validated against contract schemas by the normal output validation (04).
- **NestJS and other frameworks:** these become a thin adapter over contracts plus `implement`, as in oRPC.

## Options

- **K-A** (as above): contract builder sharing the procedure builder's methods, plus `implement`.
- **K-B:** oRPC-style separate `oc` builder with `.handler()`.
  - ❌ Unfamiliar for tRPC users. It duplicates the builder.

  ```ts
  // K-B
  import { oc } from '@trpc12/trpc/contract';

  export const postContract = {
    byId: oc.input(z.object({ id: z.string() })).output(Post),
    create: oc.input(NewPost).output(Post),
  };

  const impl = t.implement({ post: postContract });
  impl.post.byId.handler(async ({ input }) => db.post.find(input.id));
  ```

- **K-C:** no dedicated contract builder; contracts are _only_ derived from routers (type-level and `toContract`).
  - ✅ Less API.
  - ❌ Not real contract-first: you cannot write a contract before the implementation. This fails parity.

  ```ts
  // K-C: no contract package; the router comes first and clients use what is derived from it
  import type { AppContract } from '@acme/server'; // inferContract<typeof appRouter>

  createTRPCClient<AppContract>({ links: [httpLink({ url })] });
  ```

> **Spike (2026-10-09):** [`notes/contracts-and-routers-typing.md`](https://github.com/trpc/trpc/blob/d5c34c43000547776ca234ac47edafd48370e6fd/next/.agent-docs/notes/contracts-and-routers-typing.md).
>
> - The Q9.1 terminal and options-bag forms produce identical types.
> - `t.implement()` leaves expose only `.use()` and the matching terminal.
> - A non-generic `impl.router()` catches missing procedures (TS2741), extra keys at any depth (TS2353) and wrong outputs. A generic one would lose the extra-key check.
> - `inferContract<typeof implRouter>` equals the contract.
> - Q9.2 (b) `.implements()` needs a separate `satisfies` for completeness.
> - Contract-first costs about 30–35% more type-checking than implementation-first and scales linearly.

## Recommendation

**K-A**, with `inferContract` and `toContract`. Contract types are what clients and integrations accept (01, rule 3).

> ⚠️ **Parity:** this row depends on 03 (d). If procedures cannot exist without a resolver, contract-first, the OpenAPI link and NestJS integration are all blocked.

## Questions

- **Q9.1** Contract syntax: resolver-less terminals (`.query()`), or an options-bag `contract.procedure({ type, input, output })`?
- **Q9.2** Implementation API: `t.implement(contract)` mirror tree (recommended), or `t.procedure.implements(contract.post.byId)`?
- **Q9.3** May implementations add errors not declared in the contract (they would be typed on implementation-first clients but missing from the contract)?
- **Q9.4** Ship `toContract()` (runtime minified contract) in v1?

## Decision

- **Q9.1:** [x] resolver-less terminals · [ ] options bag → [contracts](../decisions/contracts.md)
- **Q9.2:** [ ] mirror tree · [ ] `.implements()`
- **Q9.3:** [ ] yes · [ ] no
- **Q9.4:** [ ] yes · [ ] later
- **Notes:**
