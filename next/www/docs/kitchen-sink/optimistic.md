---
title: Optimistic updates with TanStack Query
label: Optimistic updates
description: A todo list that shows each change before the server has it, rolls it back through the typed query key when the call fails, and says why with `matchError()`.
section: Kitchen sink
order: 2
experiment: kitchen-sink
---

The demo is a todo list on `@trpc12/tanstack-react-query`. Adding or ticking a todo changes the list in the cache at once, before the request is sent. When the call succeeds, the list refetches from the server; when it fails, the list goes back to what it was, and the app says why.

```demo
optimistic
```

Things to try:

- Set the network to **Slow** and add a todo. It shows at once, marked as saving, and the request is still pending in the requests panel.
- Press **Fail next request**, then add a todo or tick one. It shows, then the call fails with `NETWORK_ERROR` and the change is taken back.
- Add a todo longer than 30 characters. Only the server checks it, so it shows, and then the procedure's `BAD_REQUEST` takes it back with the schema's message.
- Add two todos quickly on **Slow**. The list refetches once, after the last one, so neither disappears while the other is saving.

## The procedures

The client picks each new todo's id, so the row it shows is the one the server keeps. The text's limits are in the procedure's input only, so an optimistic row can be one the server rejects:

```sample title="server.ts"
kitchen-sink-optimistic/src/server.ts#router
```

## Update, roll back, settle

`addTodoOptions()` returns the mutation's options, with TanStack's three callbacks:

- `onMutate` cancels a refetch that could land on top of the change, keeps the list as it was, and writes the new todo into it. `trpc.todo.list.queryKey()` is typed with the procedure's output, so `setQueryData`'s updater gets and returns `Todo[]`.
- `onError` puts the list back. It gets what `onMutate` returned, typed, so `result?.previous` is the list as it was.
- `onSettled` invalidates the list once no other todo mutation is in flight (`isMutating()` with the router's `pathKey()`), and the server's list replaces the optimistic one.

```sample title="optimistic.ts"
kitchen-sink-optimistic/src/optimistic.ts#add
```

## Why it was taken back

The form's `mutate()` call takes an `onError` of its own, for the message. Its `err` is the procedure's error union, so `matchError()` takes a handler for each way the call can fail, all required ([Handling every error](../client/errors.md#handling-every-error)):

```sample title="todos.tsx"
kitchen-sink-optimistic/src/todos.tsx#submit
```

- `BAD_REQUEST` is the input's, with the schema's issues in `data.issues`.
- `NETWORK_ERROR` and `BAD_RESPONSE` are `httpLink`'s: every call through it can fail with them.
- `unexpected` takes the rest, such as a crash on the server.

Each row reads whether its todo is still being added with `useIsMutating(trpc.todo.add.mutationFilter({ predicate }))`: the filter types the mutation's variables, so the predicate compares `variables?.id` without a cast ([Query keys and filters](../integrations/tanstack-query/keys.md)).
