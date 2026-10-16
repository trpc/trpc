# One `.use()` for middleware, plugins and extensions

- **Date:** 2026-10-16
- **Question:** the human's composition answer: "C (or it could just be `use` everywhere too with overloads? Spike that)". Can `.use()` take a middleware function, a plugin builder and, on the root, an extension, with the same inference and errors as `.use()` plus `.concat()`?
- **Feeds:** [root-extensions](../decisions/root-extensions.md), [keep-t-object](../decisions/keep-t-object.md).
- **Code:** [`next/spikes/use-overloads/`](../../spikes/use-overloads/).
  - `core.ts` is the `declare`-only builder from [`concat-plugins`](./concat-plugins.md), with `concat` folded into `use` overloads, and a root with `use(extension)` and `use(middleware)`.
  - `use-overloads.test-d.ts` (7 type tests) runs in `pnpm test`.
- **Versions:** TypeScript 7.0.2.

```ts
const t = initTrpc<{ ctx: Ctx }>().use(openapi).use(auditPlugin);
authed.use(tracedPlugin).use(async ({ ctx, next }) => next());
```

## Results

- **Inference holds.** An inline middleware is still contextually typed (`ctx`, `meta`), a plugin's ctx and inputs flow on, middleware after a plugin sees its ctx, and root extensions add meta keys.
- **Runtime dispatch is unambiguous.** A middleware is a function, an Effect middleware has `'~effectMiddleware'`, and a builder has `'~trpc'` and no call signature.
- **Errors depend on overload order.** When no overload matches, TypeScript says "No overload matches this call" and explains only the last overload:

  ```text
  error TS2769: No overload matches this call.
    The last overload gave the following error.
      … is missing the following properties from type
      'TypeError<"use: the plugin needs ctx this procedure does not have", "user">'
  ```

  With the plugin overload last, a plugin's missing ctx key is named, as with `.concat()`. With middleware last (the spike's first root), the error explains the middleware signature and hides the extension's. Errors inside an inline middleware's body (`ctx.nope`) are reported directly either way, since they don't fail overload selection.

## Cost on the real builder

The real `.use()` already has two overloads: a middleware function, then an Effect middleware. Putting a plugin overload last would explain plugin errors and hide the Effect middleware's (`NeedsCheck`, which names missing ctx). Either the plugin's or the Effect middleware's errors lose their explanation.

## Outcome

Human, 2026-10-16 (decision round): "A". `.concat()` stays for plugins and extensions, and `.use()` for middleware. Nothing from this spike ships.
