---
title: Server Actions
description: Turn procedures into React Server Actions that take typed input or FormData, with useActionState and optimistic updates.
section: Integrations
order: 2
v11: client/nextjs/server-actions
---

Nothing here is Next-specific: it works with any React Server Components setup.

`experimental_createAction` from `@trpc12/trpc/actions` makes a factory that sets the ctx, layer and result mode once. `action(procedure)` is then an async function that takes the input or a form's `FormData`:

```ts
'use server';
import { experimental_createAction } from '@trpc12/trpc/actions';

const action = experimental_createAction({
  ctx: async () => ({ user: await auth() }),
});

export const createPost = action(appRouter.post.create);
```

```tsx
<form action={createPost}>
  <input name="title" />
  <input name="tags[]" value="news" />
</form>;

const [post, error] = await createPost({ title, tags: [] });
```

- `FormData` is parsed with bracket notation (`tags[]=a`, `author[name]=ada`) and coerced from the input's JSON Schema (`'40'` becomes `40` where the schema wants a number). Framework fields such as Next's `$ACTION_ID_…` are dropped.
- `result: 'safe'` (the default) returns the `[data, error]` / `{ data, error }` result of `safe()` ([Errors without try/catch](../client/errors.md)). `result: 'throw'` returns the data and throws `TrpcError`.
- Results reach the browser, so unexpected errors are masked outside development, as in handlers. `onError` sees them first.
- A factory whose ctx or layer can't satisfy a procedure is a type error, and so is wrapping a subscription.
- Next's `redirect()`, `notFound()` and dynamic-API errors thrown in a procedure or `ctx` are rethrown as they are, not returned as errors, so Next can act on them. Any error with a string `digest` counts. The same holds for `call()`, `createRouterClient()` and `localLink` ([Server-side calls](../server/server-side-calls.md)).

## Form state and optimistic updates

An action also takes React's `useActionState` call (the previous state, then the input or `FormData`), so React's own hooks give pending state and optimistic UI; there is no `useServerAction`:

```tsx
'use client';
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

- The state starts `undefined` and is then the last result (`{ data, error }` with `result: 'safe'`). The previous state isn't sent to the procedure.
- The optimistic value shows until the action settles, then falls back to `result`.

## Direct calls

`experimental_createCallable` is the same factory for direct calls with typed input (no `FormData`), from server components, loaders or scripts:

```ts
const callable = experimental_createCallable({
  ctx: createContext,
  result: 'throw',
});
const post = await callable(appRouter.post.byId)({ id: '1' });
```
