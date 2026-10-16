---
title: "Migrating from tRPC"
description: "Migrate an existing tRPC app to oRPC step by step. Most tRPC concepts map directly, so routers, procedures, and middleware feel familiar."
---

:::info
If you want to add oRPC features to an existing tRPC app without a full migration, see [tRPC Integration](/docs/integrations/trpc).
:::

## Core Concepts Comparison

| Concept               | tRPC                         | oRPC                |
| --------------------- | ---------------------------- | ------------------- |
| **Router**            | `t.router()`                 | plain object        |
| **Procedure**         | `t.procedure`                | `os`                |
| **Context**           | `t.context()`                | `os.$context()`     |
| **Create Middleware** | `t.middleware()`             | `os.middleware()`   |
| **Use Middleware**    | `t.procedure.use()`          | `os.use()`          |
| **Input Validation**  | `t.procedure.input(schema)`  | `os.input(schema)`  |
| **Output Validation** | `t.procedure.output(schema)` | `os.output(schema)` |
| **Error Handling**    | `TRPCError`                  | `ORPCError`         |
| **Serializer**        | `superjson`                  | built-in            |

:::info
See [oRPC vs tRPC Comparison](/docs/comparison) for a broader comparison.
:::

## Step-by-Step Migration

### 1. Installation

Remove the tRPC packages and install the oRPC replacements:

<CodeGroup>

```sh npm
npm uninstall @trpc/server @trpc/client @trpc/tanstack-react-query
npm install @orpc/server@beta @orpc/client@beta @orpc/tanstack-query@beta
```

```sh yarn
yarn remove @trpc/server @trpc/client @trpc/tanstack-react-query
yarn add @orpc/server@beta @orpc/client@beta @orpc/tanstack-query@beta
```

```sh pnpm
pnpm remove @trpc/server @trpc/client @trpc/tanstack-react-query
pnpm add @orpc/server@beta @orpc/client@beta @orpc/tanstack-query@beta
```

```sh bun
bun remove @trpc/server @trpc/client @trpc/tanstack-react-query
bun add @orpc/server@beta @orpc/client@beta @orpc/tanstack-query@beta
```

```sh deno
deno remove npm:@trpc/server npm:@trpc/client npm:@trpc/tanstack-react-query
deno add npm:@orpc/server@beta npm:@orpc/client@beta npm:@orpc/tanstack-query@beta
```

</CodeGroup>

### 2. Initialize

Initialization is optional in oRPC. You can use `os` directly, but creating shared base procedures makes context and middleware easier to reuse.

<CodeGroup>

```ts orpc/base.ts
import { ORPCError, os } from '@orpc/server'

export async function createORPCContext(opts: { headers: Headers }) {
  const session = await auth()

  return {
    headers: opts.headers,
    session,
  }
}

const o = os.$context<Awaited<ReturnType<typeof createORPCContext>>>()

const timingMiddleware = o.middleware(async ({ next, path }) => {
  const start = Date.now()

  try {
    return await next()
  }
  finally {
    console.log(`[oRPC] ${path} took ${Date.now() - start}ms to execute`)
  }
})

export const publicProcedure = o.use(timingMiddleware)

export const protectedProcedure = publicProcedure.use(({ context, next }) => {
  if (!context.session?.user) {
    throw new ORPCError('UNAUTHORIZED')
  }

  return next({
    context: {
      session: { ...context.session, user: context.session.user }
    }
  })
})
```

```ts trpc/base.ts
import { initTRPC, TRPCError } from '@trpc/server'
import superjson from 'superjson'

export async function createTRPCContext(opts: { headers: Headers }) {
  const session = await auth()

  return {
    headers: opts.headers,
    session,
  }
}

const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
})

export const createTRPCRouter = t.router

const timingMiddleware = t.middleware(async ({ next, path }) => {
  const start = Date.now()

  const result = await next()

  const end = Date.now()
  console.log(`[tRPC] ${path} took ${end - start}ms to execute`)

  return result
})

export const publicProcedure = t.procedure.use(timingMiddleware)

export const protectedProcedure = t.procedure
  .use(timingMiddleware)
  .use(({ ctx, next }) => {
    if (!ctx.session?.user) {
      throw new TRPCError({ code: 'UNAUTHORIZED' })
    }

    return next({
      ctx: {
        session: { ...ctx.session, user: ctx.session.user },
      },
    })
  })
```

</CodeGroup>

:::info
Learn more about oRPC [Context](/docs/context) and [Middleware](/docs/middleware).
:::

### 3. Procedures

oRPC does not split procedures into `.query`, `.mutation`, and `.subscription`. Use `.handler` for all procedure types.

<CodeGroup>

```ts orpc/routers/planet.ts
export const planetRouter = {
  list: publicProcedure
    .input(z.object({ cursor: z.number().int().default(0) }))
    .handler(({ input }) => {
      // Logic here

      return {
        planets: [
          {
            name: 'Earth',
            distanceFromSun: 149.6,
          }
        ],
        nextCursor: input.cursor + 1,
      }
    }),

  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      distanceFromSun: z.number().positive()
    }))
    .handler(async ({ context, input }) => {
      // Logic here
    }),
}
```

```ts trpc/routers/planet.ts
export const planetRouter = createTRPCRouter({
  list: publicProcedure
    .input(z.object({ cursor: z.number().int().default(0) }))
    .query(({ input }) => {
      // Logic here

      return {
        planets: [
          {
            name: 'Earth',
            distanceFromSun: 149.6,
          }
        ],
        nextCursor: input.cursor + 1,
      }
    }),

  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      distanceFromSun: z.number().positive()
    }))
    .mutation(async ({ ctx, input }) => {
      // Logic here
    }),
})
```

</CodeGroup>

:::info
Learn more about oRPC [Procedures](/docs/procedure).
:::

### 4. App Router

The overall router structure stays similar. In oRPC, you do not wrap routers in a `.router` call. A plain object is enough.

<CodeGroup>

```ts orpc/routers/index.ts
import { planetRouter } from './planet'

export const appRouter = {
  planet: planetRouter,
}
```

```ts trpc/routers/index.ts
import { planetRouter } from './planet'

export const appRouter = createTRPCRouter({
  planet: planetRouter,
})
```

</CodeGroup>

:::info
Learn more about oRPC [Router](/docs/router).
:::

### 5. Error Handling

Error handling is similar, but `ORPCError` takes the error code as its first argument.

<CodeGroup>

```ts orpc
throw new ORPCError('BAD_REQUEST', {
  message: 'Invalid input',
  data: 'some data',
  cause: validationError
})
```

```ts trpc
throw new TRPCError({
  code: 'BAD_REQUEST',
  message: 'Invalid input',
  data: 'some data',
  cause: validationError
})
```

</CodeGroup>

:::info
Learn more about oRPC [Error Handling](/docs/error-handling).
:::

### 6. Server Setup

This example uses [Next.js](https://nextjs.org/). If you use another framework, see [oRPC HTTP Adapters](/docs/adapters/fetch-api).

<CodeGroup>

```ts app/api/orpc/[[...rest ]/route.ts]
import { RPCHandler } from '@orpc/server/fetch'

const handler = new RPCHandler(appRouter, {
  interceptors: [
    async ({ next, path }) => {
      try {
        return await next()
      }
      catch (error) {
        console.error(`❌ oRPC failed on ${path.join('.')}: `, error)
        throw error
      }
    }
  ]
})

async function handleRequest(request: Request) {
  const { response } = await handler.handle(request, {
    prefix: '/api/orpc',
    context: await createORPCContext({ headers: request.headers })
  })

  return response ?? new Response('Not found', { status: 404 })
}

export const GET = handleRequest
export const POST = handleRequest
```

```ts app/api/trpc/[trpc /route.ts]
import { fetchRequestHandler } from '@trpc/server/adapters/fetch'

function handler(req: Request) {
  return fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: () => createTRPCContext({ headers: req.headers }),
    onError: ({ path, error }) => {
      console.error(
        `❌ tRPC failed on ${path ?? '<no-path>'}: ${error.message}`
      )
    }
  })
}

export { handler as GET, handler as POST }
```

</CodeGroup>

### 7. Client Setup

Create a transport link, then use it to build a typed client.

<CodeGroup>

```ts orpc/client.ts
import { createORPCClient, onError } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import { RouterClient } from '@orpc/server'

const link = new RPCLink({
  origin: 'http://localhost:3000',
  url: '/api/orpc',
  interceptors: [
    onError((error) => {
      console.error(error)
    })
  ],
})

export const client: RouterClient<typeof appRouter> = createORPCClient(link)

// ---------------- Usage ----------------

const { planets } = await client.planet.list({ cursor: 0 })
```

```ts trpc/client.ts
import { createTRPCProxyClient, httpLink } from '@trpc/client'

export const client = createTRPCProxyClient<typeof appRouter>({
  links: [
    httpLink({
      url: 'http://localhost:3000/api/trpc'
    })
  ]
})

// ---------------- Usage ----------------

const { planets } = await client.planet.list.query({ cursor: 0 })
```

</CodeGroup>

:::info
Learn more about oRPC [Client-Side Clients](/docs/client/client-side), [Batch Plugin](/docs/plugins/batch), and [Dedupe Plugin](/docs/plugins/dedupe).
:::

### 8. TanStack Query (React) Integration

The TanStack Query integration feels similar to tRPC, but it is lighter. You can use the generated `orpc` utilities directly without a React provider or custom hooks.

<CodeGroup>

```ts orpc/tanstack-query.ts
import { createTanstackQueryUtils } from '@orpc/tanstack-query'

export const orpc = createTanstackQueryUtils(client)

// ---------------- Usage in React Components ----------------

const query = useQuery(orpc.planet.list.queryOptions({
  input: { cursor: 0 },
}))

const infinite = useInfiniteQuery(orpc.planet.list.infiniteOptions({
  input: (page: number) => ({ cursor: page }),
  initialPageParam: 0,
  getNextPageParam: lastPage => lastPage.nextCursor,
}))

const mutation = useMutation(orpc.planet.create.mutationOptions())
```

```ts trpc/tanstack-query.ts
import { createTRPCContext } from '@trpc/tanstack-react-query'

export const { TRPCProvider, useTRPC, useTRPCClient } = createTRPCContext<typeof appRouter>()

// ---------------- Usage in React Components ----------------

const trpc = useTRPC()

const query = useQuery(trpc.planet.list.queryOptions({ cursor: 0 }))

const infinite = useInfiniteQuery(trpc.planet.list.infiniteQueryOptions(
  {},
  {
    initialCursor: 0,
    getNextPageParam: lastPage => lastPage.nextCursor,
  }
))

const mutation = useMutation(trpc.planet.create.mutationOptions())
```

</CodeGroup>

:::info
Learn more about oRPC [TanStack Query Integration](/docs/integrations/tanstack-query).
:::
