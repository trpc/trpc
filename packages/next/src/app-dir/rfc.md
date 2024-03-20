Heya there, I got some unsolicited API-suggestions here. I hope that's fine 🙏

The tl;dr of what I want here is to **decouple `Payload` from the `State` returned from the action handler**:

I'd like the hook to return a tuple (or object) with:

- `dispatch`: the method to call to dispatch the wrapped action
- `payload` (🆕): the last payload sent to the server
- `state`: the last state the action returned
- `pending`: the pending state of the action and any state updates contained

## Motivation

One of the big selling points for me of `useFormState`/`useActionState()` and `<form action={action}>` are isomorphic/universal forms that gracefully degrade without JS.

Currently, the API is lacking a bit of nuance in order to support isomorphic forms:

**1. It's hard to make abstractions that gracefully degrades due to easy of access to form data:**

Since submitted values has to be explicitly returned by the action handler it makes it hard to make good abstractions for forms that gracefully degrades.

In PHP as an analogy, you have the magical `$_POST`-object to easily access form data anywhere.

I'd like `Payload` to be as easily accessible as `$_POST`.

**2. Behavior is different between no-JS and JS**

When you post a form without JS, all the inputs clears, but this isn't the behavior now when JS.

> I'm not sure I'd want this behavior as a default for React: the chance of you filling out a full form before JS is loaded feels quite slim - but it's worth noting (maybe it could be a sort of strict mode thing?)

However, as a library author, I'd like to rely on a primitive that would enable me to make isomorphic forms without forcing the server actions to return a specific shape.

## Current API suggestion

```ts
function useActionState<State>(
  action: (state: Awaited<State>) => State | Promise<State>,
  initialState: Awaited<State>,
  permalink?: string,
): [state: Awaited<State>, dispatch: () => void, pending: boolean];
```

### Problems with the current API

I'd like all my uncontrolled form inputs to be something of the like of

```tsx
<input type="text" name="title" defaultValue={payload?.get('title')}>
```

If I was to make a custom `<Input>`-component that supported this now, I couldn't rely on React giving me access to the payload, without forcing a specific envelope on the server:

## Idea

```ts
function useActionState<State, Payload>(
  action: (state: Awaited<State>, payload: Payload) => State,
  initialState: Awaited<State>,
  permalink?: string,
): [
  state: State,
  dispatch: (payload: Payload) => Promise<State>,
  payload: null | Payload,
  pending: boolean;
];
```

The hook returns a tuple or object with:

- `dispatch`: the method to call to dispatch the wrapped action
- `payload`: the last payload sent to the server
- `state`: the last state the action returned
- `pending`: the pending state of the action and any state updates contained

### How it could work

- When JS is loaded, we should have access to the `Payload` through the latest dispatch
- When JS isn't loaded, we should have access to the `Payload` through the incoming `Request`

Another benefit is that having every API handler to return the `FormData` adds unnecessary payload on every "SPA-request".

> A possible drawback(?) could be that I guess the GC couldn't delete `FormData` until a full render has been done in "no-JS-mode".

### Rendering several `useActionState()`

If you render several forms with a `useActionState()`, you can simply keep track of it based on an id:

> An assumption here is that React can keep track of `useActionState(A)` is different from `useActionState(B)` and not return the same result. Nonetheless, if you have UUIDs as ids por similar, it'd work the same

```tsx

async function UserList() {
  const users = await db.users.find();

  return (
    <ul>
      {users.map((it) => (
        <li key={it.id}>
          {it.username}
          <details>
            <summary>Edit</summary>

            <EditUser user={props.user}>
          </details>
        </li>
      )}
    <ul>
  )
}
```

```tsx
'use client'

import { editUser } from './_actions'

function EditUser(props: {
  user: User
}) {
  const [dispatch, state, _payload] = useActionState(editUser);

  // ensure the last payload associates to this user
  const payload = _payload.get('id') === props.user.id ? _payload : null;


  const user
  return (
    <form action={dispatch}>
      <input type="hidden" name="id" value={props.user.id} />

      <input type="text" name="username" defaultValue={payload?.get('username') ?? props.user.username} />

      {/* ...... */}
    </form>
  );
}
```
