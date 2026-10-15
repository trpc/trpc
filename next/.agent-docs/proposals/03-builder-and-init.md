# 03 — Builder, `init` and the generic core

| Status     | Area   | Depends on | oRPC parity rows                                              |
| ---------- | ------ | ---------- | ------------------------------------------------------------- |
| `proposed` | server | 01, 02     | With contract-first approach, Without contract-first approach |

## Summary

Decide what `initTRPC` looks like, how builder state is typed, and whether the "generic builder" from `ideas.md` is a public extension API or an internal foundation.

**Recommendation:**

- `initTRPC<{ ctx; meta }>()` with an option-bag generic and no `.create()` (decided, [root-init-option-bag](../decisions/root-init-option-bag.md)).
- One options-bag type parameter for builder state.
- A **closed** public builder built on an internal generic core.
- Opt-in callers through wrapper functions.
- A data model that keeps the contract separate from the implementation.

## Today (v11)

```ts
const t = initTRPC.context<Context>().meta<Meta>().create({ transformer, errorFormatter, isServer, … });
t.procedure; // ProcedureBuilder<TContext, TMeta, TContextOverrides, TInputIn, TInputOut, TOutputIn, TOutputOut, TCaller, TErrorShape>
```

- Nine positional generics. Every new feature adds one, and every addition touches every method signature.
- `create()` mixes definition-time config (meta, context types) with transport config (transformer, error formatting, SSE/JSONL options). That forces one transport config per router.
- `experimental_caller` bolts an alternative terminal onto the same builder.
- Procedures are created only by terminals (`.query(fn)`) and always contain the resolver. There is no handler-less procedure, so contracts cannot exist.

## Goals

- "The basic procedure builder API stays the same": `t.procedure.input().use().query()` must look familiar.
- Option bags over positional arguments, in type parameters too.
- Adding builder state (errors, route metadata, services) must not require touching every signature.
- Contract-first and implementation-first share one data model (09).
- "RSC callers are opt-in" (`ideas.md`).

## Decision areas

### (a) Root initialisation

- **I-A — Option-bag generic:**

  ```ts
  const t = initTRPC<{
    ctx: Context;
    meta: Meta;
    services?: Db | Mailer;
  }>();
  ```

- **I-B — Keep chained builders:** `initTRPC.context<Context>().meta<Meta>().create()`.

  ```ts
  const t = initTRPC
    .context<Context>()
    .meta<Meta>()
    .services<Db | Mailer>() // name TBD
    .create();
  ```

- **I-C — oRPC style, no `t`:**

  ```ts
  const base = trpc.$context<Context>().$meta<Meta>({});
  export const publicProcedure = base;
  ```

`create()` keeps only definition-time options, such as `defaultMeta` (or that moves to `.meta()` on a base procedure).

- **Decided ([root-init-option-bag](../decisions/root-init-option-bag.md)):** I-A without `.create()`: `const t = initTRPC<{ ctx: Context; meta: Meta }>()`. Definition-time runtime options, if any remain, go in the call: `initTRPC<{ … }>({ … })`. Root extensions are Q3.6.

```ts
// v11
const t = initTRPC
  .context<Context>()
  .create({ transformer: superjson, errorFormatter, isServer: true });

// vNext: definition-time only; transport options move to the handler
const t = initTRPC<{ ctx: Context; meta: Meta }>();
export const publicProcedure = t.procedure.meta({ auth: false }); // replaces defaultMeta (04 (f))
createHandler({
  router: appRouter,
  createContext,
  serializer: rich(),
  onError,
}); // 11, 12
```

Moving transport options out of the root:

| Option              | Moves to |
| ------------------- | -------- |
| transformer         | 11       |
| errorFormatter      | 07       |
| isDev / sse / jsonl | 12       |
| isServer            | deleted  |

### (b) Builder state typing

- **G-A — One options-bag type parameter.** This is what [#6027](https://github.com/trpc/trpc/pull/6027) called "1 generic to rule them all":

  ```ts
  interface BuilderDef {
    ctx: object;
    ctxOverrides: object;
    meta: object;
    services: unknown;
    inputIn: unknown;
    inputOut: unknown;
    outputIn: unknown;
    outputOut: unknown;
    errors: unknown;
    route: RouteDef;
    kind: 'builder' | 'contract';
  }
  declare class ProcedureBuilder<TDef extends BuilderDef> {
    /* methods return ProcedureBuilder<Overwrite<TDef, {...}>> */
  }
  ```

  - ✅ Adding state is local; signatures are readable; hovers can be prettified.
  - ❌ Must be benchmarked. Intersections and overwrites can be slower than positional generics. Do a tsgo trace on a 1k-procedure fixture before committing.

- **G-B — Positional generics.** Status quo.

  ```ts
  declare class ProcedureBuilder<
    TCtx,
    TCtxOverrides,
    TMeta,
    TServices,
    TInputIn,
    TInputOut,
    TOutputIn,
    TOutputOut,
    TErrors,
    TRoute,
  > {
    input<$In, $Out>(
      schema: StandardSchemaV1<$In, $Out>,
    ): ProcedureBuilder<
      TCtx,
      TCtxOverrides,
      TMeta,
      TServices,
      $In,
      $Out,
      TOutputIn,
      TOutputOut,
      TErrors,
      TRoute
    >;
    // every method repeats the full list; adding state adds a parameter to each
  }
  ```

> **Spike (2026-10-09):** [`notes/builder-generics-typeperf.md`](../notes/builder-generics-typeperf.md). On 1k procedures, bags cost +15–25% check time and scale linearly. A flat mapped patch keeps hovers flat; `Omit & Patch` nests one layer per call.

### (c) The "generic builder" from `ideas.md`

`ideas.md` says: "a generic builder becomes the basis of tRPC as a standalone package, which also makes RSC callers opt-in."

- **E-A — Public extension API.** Third parties can add terminals or builder methods, via a module registry ([#6027](https://github.com/trpc/trpc/pull/6027)) or a class `extend()`.
  - ❌ This is where #6027 died: type complexity, and global augmentation leaking between packages.

  ```ts
  // E-A, library author: register a terminal (augmentation form; #6027 also tried a module registry)
  declare module 'trpcdev/server' {
    interface BuilderModules<TDef extends BuilderDef> {
      action: (resolver: Resolver<TDef>) => ActionProcedure<TDef>; // names TBD
    }
  }

  // E-A, user: the new terminal appears on every builder
  export const createPost = t.procedure
    .input(NewPost)
    .action(async ({ input }) => db.post.create(input));
  ```

- **E-B — Internal generic core, closed public builder.**
  - Internally, a flavour-agnostic `ProcedureBuilder` (state + middleware + validation) plus a small set of _terminals_ (`query`, `mutation`, `subscription`, `handler`).
  - Variants are _wrappers_ around a finished procedure: `callable(proc)`, `action(proc)` and `t.contract`. They are not builder methods.
  - ✅ No type-level plugin system. RSC and caller variants are opt-in imports, and tree-shakeable.
  - ❌ Third parties cannot add builder methods. They can still write wrappers and middleware.

  ```ts
  // E-B: the builder only has the built-in terminals; variants wrap a finished procedure (15)
  const createPostProcedure = t.procedure
    .input(NewPost)
    .mutation(async ({ input }) => db.post.create(input));

  export const createPost = action(createPostProcedure, { ctx: createContext });
  export const getPost = callable(byId, { ctx: createContext });
  ```

- **E-C — Standalone middleware/builder package** (`@trpcdev/procedure`?) that tRPC itself builds on. This goes against `ideas.md`'s single `trpcdev` package, unless it is only a subpath (`trpcdev/procedure`).
  - Reuse outside tRPC.
  - ❌ Another package to version; benefit unclear without concrete consumers.

  ```ts
  // E-C: a non-RPC library (for example RSC-only) builds on the core directly
  import { createBuilder } from 'trpcdev/procedure'; // or @trpcdev/procedure; name TBD

  const base = createBuilder<{ ctx: { user: User } }>().use(authed);
  export const createPost = base
    .input(NewPost)
    .handler(async ({ ctx, input }) => db.post.create(ctx.user, input));

  // trpcdev/server's t.procedure is the same core plus query/mutation/subscription terminals
  ```

### (d) Data model: contract versus implementation

This is parity-critical (contract-first, OpenAPI link, NestJS).

```ts
interface ProcedureContract {
  '~trpc': {
    kind: 'query' | 'mutation' | 'subscription';
    inputSchema?: StandardSchemaV1;
    outputSchema?: StandardSchemaV1;
    errors?: ErrorMap;
    meta: object;
    route: RouteDef;
  };
}
interface Procedure extends ProcedureContract {
  '~trpc': ProcedureContract['~trpc'] & {
    middlewares: Middleware[];
    resolver: Resolver;
  };
}
```

- The `'~trpc'` key replaces `_def` and follows the Standard Schema `~standard` convention: hidden from autocomplete and namespaced.
- A procedure _is_ a contract plus an implementation. `t.contract…` builds just the contract (09), and `implement(contract)` attaches the implementation.

```ts
appRouter.post.byId['~trpc'].kind; // 'query' (v11: appRouter._def.procedures['post.byId']._def.type)
appRouter.post.byId['~trpc'].route; // { method: 'GET', path: '/posts/{id}' }, read by the OpenAPI generator (18)
```

### (e) Base procedure ergonomics

- Keep `t.procedure` as the base. `t.router` stays optional (08).
- `t.middleware(fn)` stays for reusable middleware.
- `publicProcedure`/`protectedProcedure` remain a user convention; docs show them.

```ts
const t = initTRPC<{ ctx: Context; meta: Meta }>();

const isAuthed = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user) return error({ code: 'UNAUTHORIZED' }); // 07
  return next({ ctx: { user: ctx.user } });
});

export const publicProcedure = t.procedure;
export const protectedProcedure = t.procedure.use(isAuthed);

export const appRouter = {
  me: protectedProcedure.query(({ ctx }) => ctx.user), // plain object, no t.router() needed (08)
};
```

## Recommendation

- **I-A** (decided, [root-init-option-bag](../decisions/root-init-option-bag.md)) + **G-A** (gated on the benchmark in (b)).
- **E-B**: closed builder on an internal generic core, with opt-in wrapper variants.
- **(d)** as described, with the `'~trpc'` key.
- If the G-A benchmark loses, keep positional generics internally but expose a `ProcedureDef<…>`-style bag in all public helper types.

## Questions for Alex

- **Q3.1** Root init: option-bag generic (I-A), chained builders (I-B) or oRPC style (I-C)?
- **Q3.2** Single options-bag builder generic (G-A, after benchmark) or positional (G-B)?
- **Q3.3** Generic builder: public extension API (E-A), internal core with a closed public builder (E-B), or a standalone package (E-C)?
- **Q3.4** Rename `_def` to `'~trpc'`?
- **Q3.5** Keep the `t` object idiom (`t.procedure`, `t.router`, `t.middleware`), or move to top-level imports (`import { procedure } from …`)?
- **Q3.6** Root extensions that add to the bag from values (ctx, meta keys, errors, services), for example `t.with(openapi())`: in v1, later, or never? Bespoke `$` methods per extension would need E-A's module augmentation; one generic `.with(ext)` on `t` would not. Values can't go in `initTRPC<{ … }>()` itself, because TypeScript has no partial type-argument inference. Not spiked yet.

## Decision

- **Q3.1:** [x] I-A, without `.create()` · [ ] I-B · [ ] I-C → [root-init-option-bag](../decisions/root-init-option-bag.md)
- **Q3.2:** [ ] G-A · [ ] G-B
- **Q3.3:** [ ] E-A · [ ] E-B · [ ] E-C
- **Q3.4:** [x] yes · [ ] no → [trpc-definition-key](../decisions/trpc-definition-key.md)
- **Q3.5:** [x] keep `t` (standalone plugin packages must work through `.concat()`) · [ ] top-level imports · [ ] both → [keep-t-object](../decisions/keep-t-object.md)
- **Q3.6:** [ ] v1 · [ ] later · [ ] never
- **Notes:**
