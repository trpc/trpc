---
title: "Next.js Integration"
description: "Use oRPC in Next.js applications with server functions, form actions, and React hooks for optimistic updates and typesafe error handling."
sidebar:
  label: "Next.js"
---

## Installation

```package-install
npm install @orpc/next@beta
```

## Server Functions

Use `createServerFunction` to turn a [procedure](/docs/procedure) into a [server function](https://nextjs.org/docs/app/api-reference/directives/use-server). It accepts the same options as [server-side clients](/docs/client/server-side#router-clients), and the returned function accepts the same input as the original procedure.

```ts twoslash
'use server'

import { os } from '@orpc/server'
import { createServerFunction } from '@orpc/next'

const procedure = os.handler(async () => 'Hello from oRPC + Next.js!')

export const serverFunction = createServerFunction(procedure, {
  context: async () => { // <- provide initial context if needed
    return { user: { id: '123', name: 'Alice' } }
  },
  interceptors: [] // <- add interceptors if needed
})
```

You can call the returned `serverFunction` from a client component.

```tsx
'use client'

import { serverFunction } from './path/to/server/function'

export default function Page() {
  const handleClick = async () => {
    const [error, message] = await serverFunction()

    if (!error) {
      console.log({ message })
    }
  }

  return (
    <div>
      <button onClick={handleClick}>Call Server Function</button>
    </div>
  )
}
```

Special Next.js errors such as [redirect](https://nextjs.org/docs/app/api-reference/functions/redirect) and [notFound](https://nextjs.org/docs/app/api-reference/functions/not-found) are rethrown so Next.js handles them normally. All other errors are serialized to `ORPCErrorJSON` and returned as the first element of the tuple.

### Typesafe Errors

[Typesafe errors](/docs/error-handling#typesafe-errors) are supported as well. Because errors are serialized before they reach the client, use the `defined` field to distinguish errors.

<CodeGroup>

```tsx client
'use client'

import { serverFunction } from './path/to/server/function'

export default function Page() {
  const handleClick = async () => {
    const [error, message] = await serverFunction()

    if (error) {
      if (error.defined) {
        // handle typesafe error
      }
      else {
        // handle unknown error
      }
    }
    else {
      // handle success case
    }
  }

  return (
    <div>
      <button onClick={handleClick}>Call Server Function</button>
    </div>
  )
}
```

```ts server
'use server'

const procedure = os
  .errors({
    NOT_FOUND: {
      message: 'The resource was not found',
    },
  })
  .handler(async ({ errors }) => {
    throw errors.NOT_FOUND()
  })

export const serverFunction = createServerFunction(procedure)
```

</CodeGroup>

### `createServerFunctionable`

If you reuse the same options across multiple server functions, `createServerFunctionable` creates a preconfigured helper. The helper takes a procedure and returns a value that works as both a server function and the original [procedure](/docs/procedure) on the server.

```ts
import { createServerFunctionable } from '@orpc/next'

const functionable = createServerFunctionable({
  context: async () => { // <- provide initial context if needed
    return { user: { id: '123', name: 'Alice' } }
  },
})

// Works as both a server function and a procedure.
export const functionableProcedure = functionable(
  os.handler(async () => 'Hello from oRPC + Next.js!')
)
```

### `.actionable` Extension

Import `@orpc/next/extensions/actionable` from a module that always runs during initialization, such as the file where you define your base builder. This adds an `.actionable` method to decorated procedures. Like `createServerFunctionable`, it returns a value that works as both a server function and a [procedure](/docs/procedure).

<CodeGroup>

```ts usage
export const functionableProcedure = base
  .handler(async () => 'Hello from oRPC + Next.js!')
  .actionable({
    context: async () => { // <- provide initial context if needed
      return { user: { id: '123', name: 'Alice' } }
    },
  })
```

```ts setup
import '@orpc/next/extensions/actionable'

import { os } from '@orpc/server'

export const base = os
```

</CodeGroup>

### Hooks

This integration also includes React hooks for server functions. `useServerFunction` executes a server function and tracks its status. `useOptimisticServerFunction` does the same, with optimistic updates. Unlike direct server function calls, hook errors are deserialized into native `ORPCError` instances instead of plain JSON (`ORPCErrorJSON`) for a more natural developer experience.

<CodeGroup>

```tsx useServerFunction
'use client'

import { isDefinedError } from '@orpc/client'
import {
  getIssueMessage,
  onErrorDeferred,
  parseFormData,
} from '@orpc/next'
import { useServerFunction } from '@orpc/next/hooks'

export function MyComponent() {
  const { execute, data, error, status } = useServerFunction(serverFunction, {
    interceptors: [
      onErrorDeferred((error) => {
        if (isDefinedError(error)) {
          console.error(error.data)
          //                   ^ Typed error data
        }
      }),
    ],
  })

  return (
    <form action={form => execute(parseFormData(form))}>
      <input type="text" name="name" required />
      <span>{getIssueMessage(error, 'name')}</span>

      <button type="submit">Submit</button>
      {status === 'pending' && <p>Loading...</p>}
    </form>
  )
}
```

```tsx useOptimisticServerFunction
'use client'

import { useOptimisticServerAction } from '@orpc/next/hooks'
import {
  getIssueMessage,
  onSuccessDeferred,
  parseFormData,
} from '@orpc/next'

export function MyComponent() {
  const [todos, setTodos] = useState<Todo[]>([])
  const { execute, optimisticState } = useOptimisticServerAction(someAction, {
    optimisticPassthrough: todos,
    optimisticReducer: (currentState, newTodo) => [...currentState, newTodo],
    interceptors: [
      onSuccessDeferred(({ data }) => {
        setTodos(prevTodos => [...prevTodos, data])
      }),
    ],
  })

  return (
    <div>
      <ul>
        {optimisticState.map(todo => (
          <li key={todo.todo}>{todo.todo}</li>
        ))}
      </ul>
      <form action={form => execute(parseFormData(form))}>
        <input type="text" name="todo" required />
        <span>{getIssueMessage(error, 'todo')}</span>

        <button type="submit">Add Todo</button>
      </form>
    </div>
  )
}
```

</CodeGroup>

:::info
Besides hooks, this integration also re-exports [form-data helpers](/docs/helpers/form-data) for working with `FormData`, as well as deferred interceptors for updating UI states: `onStartDeferred`, `onSuccessDeferred`, `onErrorDeferred`, and `onFinishDeferred`.
:::

:::info
You can use [`safe` and `isDefinedError`](/docs/client/error-handling#using-safe-and-isdefinederror) together for typesafe error handling in interceptors.
:::

## Server Form Functions

Use `createServerFormFunction` to turn a procedure into a form action for `<form action={...}>`. Unlike `createServerFunction`, the returned function accepts `FormData` instead of the procedure input. It deserializes that data using [Bracket Notation](/docs/openapi/bracket-notation), then passes the result to the procedure.

<CodeGroup>

```tsx client
export default function Page() {
  return (
    <form action={serverFormFunction}>
      <input name="name" />
      <button type="submit">Submit</button>
    </form>
  )
}
```

```ts server
'use server'

import { redirect } from 'next/navigation'

const procedure = os
  .input(z.object({ name: z.string() }))
  .handler(async ({ input }) => {
    // do something
  })

export const serverFormFunction = createServerFormFunction(procedure, {
  interceptors: [
    async ({ next }) => {
      await next()
      redirect('/thank-you') // redirect on success
    }
  ]
})
```

</CodeGroup>

### `createServerFormFunctionable`

If you reuse the same options across multiple form actions, `createServerFormFunctionable` creates a preconfigured helper. Like [`createServerFunctionable`](#createserverfunctionable), it takes a procedure and returns a value that works as both a server form function and the original [procedure](/docs/procedure).

```ts
import { createServerFormFunctionable } from '@orpc/next'

const formFunctionable = createServerFormFunctionable({
  context: async () => { // <- provide initial context if needed
    return { user: { id: '123', name: 'Alice' } }
  },
})

// Works as both a server form function and a procedure.
export const formFunctionableProcedure = formFunctionable(
  os.handler(async () => 'Hello from oRPC + Next.js!')
)
```
