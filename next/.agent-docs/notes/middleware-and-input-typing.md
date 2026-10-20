# Middleware and input typing (05 (b)/(c), 06 (c)/(d))

- **Date:** 2026-10-09
- **Question:** Can 05's `type<T>()` and input chaining (C-A), and 06's standalone dependency-declaring middleware, `mapInput` and `ok()` short-circuit, be typed with readable errors?
- **Feeds:** [05 — Validation](../proposals/05-validation-and-schemas.md) (Q5.2, Q5.3), [06 — Context and middleware](../proposals/06-context-and-middleware.md) (Q6.2, Q6.3).
- **Code:** [`next/spikes/middleware-typing/`](../../spikes/middleware-typing/). `core.ts` is a `declare`-only prototype using the proposals' names. It is not an API proposal. `middleware-typing.test-d.ts` (13 type tests) ran in `pnpm test` until the feature shipped; git has it.

## Results

All of it types. Each failure case is pinned by a `@ts-expect-error` test. The error text below is from TypeScript 7.0.2.

- **`type<T>()`** is just a Standard Schema whose `types` are `T`. There is nothing to decide at the type level.
- **C-A chaining.** Object inputs merge, and the client input is built from each schema's _input_ type. The resolver's parsed input is built from the _output_ types. Middleware sees only the inputs declared before it, and `undefined` before the first `.input()`. Non-object schemas and conflicting keys can be rejected on the offending `.input()` with a branded message:

  ```text
  Argument of type 'StandardSchemaV1<{ id: number; }, …>' is not assignable to parameter of type
  'StandardSchemaV1<…> & TypeError<"input chaining: keys with incompatible types", "id">'.
  ```

  The conflict check is shallow: `{ a: { b: string } }` and `{ a: { b: number } }` merge to `a: { b: never }` without an error.

- **Standalone middleware needs no special `.use()` overload.** `middleware<{ ctx; input; meta }>()(fn)` only gives `fn` contextual types and returns `fn` unchanged. `.use()` takes `(opts: MiddlewareOpts<TCtx, TInput, TMeta>) => …`, so a middleware that needs more is rejected by ordinary parameter contravariance. The error says what is missing:

  ```text
  Types of parameters 'opts' and 'opts' are incompatible.
    Type 'MiddlewareOpts<{ db: Db; user?: … }, { id: string; }, …>' is not assignable to type 'MiddlewareOpts<{ db: Db; }, { orgId: string; }, {}>'.
      Property 'orgId' is missing in type '{ id: string; }' but required in type '{ orgId: string; }'.
  ```

  The same holds for a missing `ctx.db`, and for "used before `.input()`" (`Type 'undefined' is not assignable to type '{ orgId: string; }'`).

- **`mapInput`** is an arity overload: `.use(mw, (input) => ({ orgId: input.id }))`. A wrong mapping gives TS2741 on the mapper's return.
- **`ok(data)` short-circuit.**
  - Middleware runs before the resolver exists, so `ok` can't be typed against the output at the call site. It is generic (`<D>(data: D) => ShortCircuit<D>`). The builder collects every `D` and checks at the terminal that each one is assignable to the procedure's output (the declared `.output()` if present, otherwise the resolver's return).
  - The error lands on the resolver:

    ```text
    Type 'Promise<Post>' is not assignable to type 'Promise<Post> & TypeError<"a middleware short-circuits with a value this procedure does not output", { cached: boolean; }>'.
    ```

  - This also means a reusable cache middleware (`middleware()(… ok(hit) …)`) is checked against every procedure it's used on.
  - Using `<const D>` on `ok` is wrong: arrays become readonly tuples and are then rejected against `string[]` outputs. A test pins this.
  - The client's output type is unchanged (the resolver's or the declared output).

## Implications

- Q6.3 (standalone middleware, `mapInput`): yes is cheap. The factory is identity at runtime, and the requirement check comes for free from function types.
- Q6.2 (`ok()`): feasible, with the caveat that the error shows up at the terminal rather than in the middleware.
- Q5.3 (C-A vs C-B): C-A is easy to type. What's left to decide is the semantics: a shallow merge, and middleware seeing partial input.
