---
title: Server Actions
description: Turn procedures into React Server Actions that take typed input or `FormData`, with `useActionState` and optimistic updates.
section: Integrations
parent: integrations/react
order: 2
v11: client/nextjs/server-actions
---

Nothing here is Next-specific: it works with any React Server Components setup.

`experimental_createAction(t, opts)` from `@trpc12/trpc/actions` makes a factory that sets the `ctx`, runtime and result mode once, checked against `t`'s root `ctx`. `action(procedure)` is then an async function that takes the input or a form's `FormData`:

```ts twoslash
'use server';
import { experimental_createAction } from '@trpc12/trpc/actions';
// ---cut-start---
import { appRouter, t, type User } from './server.ts';
declare function auth(): Promise<User | null>;
// ---cut-end---

const action = experimental_createAction(t, {
  ctx: async () => ({ user: await auth() }),
});

export const createPost = action(appRouter.post.create);
```

```tsx twoslash
// ---cut-start---
import { experimental_createAction } from '@trpc12/trpc/actions';
import { z } from 'zod';
import { authed, db, t } from './server.ts';
const action = experimental_createAction(t, { ctx: { user: null } });
const createPost = action(
  authed
    .input(z.object({ title: z.string(), tags: z.array(z.string()) }))
    .mutation((opts) =>
      db.post.create({ title: opts.input.title, author: opts.ctx.user.name }),
    ),
);
declare const title: string;
// ---cut-end---
<form
  action={async (form) => {
    await createPost(form);
  }}
>
  <input name="title" />
  <input name="tags[]" value="news" />
</form>;

const result = await createPost({ title, tags: [] });
if (result.error) console.log(result.error.code, result.error.message);
else console.log(result.data.title);
```

- `FormData` is parsed with bracket notation (`tags[]=a`, `author[name]=ada`) and coerced from the input's JSON Schema (`'40'` becomes `40` where the schema wants a number). Framework fields such as Next's `$ACTION_ID_…` are dropped.
- `result: 'safe'` (the default) returns `{ data }` or `{ error }`. Both are plain objects, because React sends an action's result to the browser: there an `Error` arrives without its class or `data`, and an array without extra fields, so the result is not `safe()`'s `[data, error]` ([Errors without try/catch](../client/errors.md)). `error` holds the `TrpcError`'s `code`, `message`, `defined` and `data` (defined errors only), and narrows on `code` and `defined` the same way. `result: 'throw'` returns the data and throws `TrpcError`.
- Results reach the browser, so unexpected errors are masked outside development, as in handlers. `onError` sees them first.
- A factory whose `ctx` doesn't satisfy `t`'s root `ctx` and the keys a procedure's middleware needs, or whose `runtime` can't provide its services, is a type error, and so is wrapping a subscription.
- Procedures that need Effect services get them from `runtime`, a `ManagedRuntime` you own, as with `createRouterClient` ([Server-side calls](../server/server-side-calls.md)): make it once with `ManagedRuntime.make(layer)`, share it between factories, and dispose it when the app stops, which runs the layer's finalizers.
- Next's `redirect()`, `notFound()` and dynamic-API errors thrown in a procedure or `ctx` are rethrown as they are, not returned as errors, so Next can act on them. Any error with a string `digest` counts. The same holds for `t.call()`, `createRouterClient()` and `localLink` ([Server-side calls](../server/server-side-calls.md)).

## Form state and optimistic updates

An action also takes React's `useActionState` call (the previous state, then the input or `FormData`), so React's own hooks give pending state and optimistic UI; there is no `useServerAction`:

```tsx twoslash
// ---cut-start---
// @filename: actions.ts
'use server';
import { experimental_createAction } from '@trpc12/trpc/actions';
import { z } from 'zod';
import { t } from './server.ts';
const titles: string[] = [];
const appRouter = t.router({
  title: {
    add: t.procedure.input(z.object({ title: z.string() })).mutation((opts) => {
      titles.push(opts.input.title);
      return [...titles];
    }),
  },
});
const action = experimental_createAction(t, { ctx: { user: null } });
export const addTitle = action(appRouter.title.add);
// @filename: titles.tsx
// ---cut-end---
('use client');
import { useActionState, useOptimistic } from 'react';
import { addTitle } from './actions'; // action(appRouter.title.add)

function Titles() {
  const [result, submit, isPending] = useActionState(addTitle, undefined);
  const [shown, addShown] = useOptimistic(
    result?.data ?? [],
    (list: string[], title: string) => [...list, title],
  );
  return (
    <form
      action={(form) => {
        addShown(form.get('title') as string);
        submit(form);
      }}
    >
      <input name="title" />
      {shown.map((title) => (
        <p key={title}>{title}</p>
      ))}
      {isPending ? 'Saving…' : result?.error?.code}
    </form>
  );
}
```

- The state starts `undefined` and is then the last result (`{ data }` or `{ error }` with `result: 'safe'`). The previous state isn't sent to the procedure.
- The optimistic value shows until the action settles, then falls back to `result`.

## Direct calls

`experimental_createCallable` is the same factory for direct calls with typed input (no `FormData`), from server components, loaders or scripts. Its results stay on the server, so `result: 'safe'` returns `safe()`'s `[data, error]`, with the `TrpcError` itself:

```ts twoslash
// ---cut-start---
import { experimental_createCallable } from '@trpc12/trpc/actions';
import { appRouter, t, type Context } from './server.ts';
declare function createContext(): Promise<Context>;
// ---cut-end---
const callable = experimental_createCallable(t, {
  ctx: createContext,
  result: 'throw',
});
const post = await callable(appRouter.post.byId)({ id: '1' });
```

## Credits

Actions that take `FormData` follow [oRPC's form actions](https://orpc.dev/docs/integrations/next).
