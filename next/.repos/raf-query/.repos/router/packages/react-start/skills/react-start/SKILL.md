---
name: react-start
description: >-
  React bindings for TanStack Start: createStart, StartClient,
  StartServer, React-specific imports, re-exports from
  @tanstack/react-router, full project setup with React, useServerFn
  hook.
metadata:
  type: framework
  library: tanstack-start
  library_version: '1.168.32'
  framework: react
requires:
  - start-core
sources:
  - TanStack/router:packages/react-start/src
  - TanStack/router:docs/start/framework/react/build-from-scratch.md
---

# React Start (`@tanstack/react-start`)

This is the React Start entry skill. Use the workflow below, then load only the package skill that owns the boundary you are changing. Do not read `start-core`, Router Core, and React Router manuals in full before starting.

For React Server Components patterns, see [react-start/server-components](./server-components/SKILL.md).

> **CRITICAL**: All code is ISOMORPHIC by default. Loaders run on BOTH server and client. Use `createServerFn` for server-only logic.

> **CRITICAL**: Do not confuse `@tanstack/react-start` with Next.js or Remix. They are completely different frameworks with different APIs.

> **CRITICAL**: Types are FULLY INFERRED. Never cast, never annotate inferred values.

## Full-Stack Workflow

1. Define the route and component with `createFileRoute`.
2. Put private or server-only reads and writes in `createServerFn`; call reads directly from loaders.
3. Use `useServerFn` for component mutations, then invalidate the router or query cache after the write resolves.
4. Enforce auth in every private server function or server route. Add `beforeLoad` separately for navigation UX.
5. Run the initial SSR path, client navigation, mutation plus reload, direct anonymous endpoint request, runtime response assertion, type tests, and production build.

Load `start-core/server-routes` instead of `server-functions` only when a raw HTTP endpoint is required. Load `router-core/*` only for the specific routing concern involved, such as params or search validation.

## Package API Surface

`@tanstack/react-start` re-exports everything from `@tanstack/start-client-core` plus:

- `useServerFn` — React hook for calling server functions from components

All core APIs (`createServerFn`, `createMiddleware`, `createStart`, `createIsomorphicFn`, `createServerOnlyFn`, `createClientOnlyFn`) are available from `@tanstack/react-start`.

Server utilities (`getRequest`, `getRequestHeader`, `setResponseHeader`, `setResponseHeaders`, `setResponseStatus`) are imported from `@tanstack/react-start/server`.

## Full Project Setup

### 1. Install Dependencies

```bash
npm i @tanstack/react-start @tanstack/react-router react react-dom
npm i -D vite @vitejs/plugin-react typescript @types/react @types/react-dom
```

### 2. package.json

```json
{
  "type": "module",
  "scripts": {
    "dev": "vite dev",
    "build": "vite build",
    "start": "node .output/server/index.mjs"
  }
}
```

### 3. tsconfig.json

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "moduleResolution": "Bundler",
    "module": "ESNext",
    "target": "ES2022",
    "skipLibCheck": true,
    "strictNullChecks": true
  }
}
```

### 4. vite.config.ts

```ts
import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    tanstackStart(), // MUST come before react()
    viteReact(),
  ],
})
```

### 5. Router Factory (src/router.tsx)

```tsx
import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  const router = createRouter({
    routeTree,
    scrollRestoration: true,
  })
  return router
}
```

### 6. Root Route (src/routes/\_\_root.tsx)

```tsx
import type { ReactNode } from 'react'
import {
  Outlet,
  createRootRoute,
  HeadContent,
  Scripts,
} from '@tanstack/react-router'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'My TanStack Start App' },
    ],
  }),
  component: RootComponent,
})

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  )
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
```

### 7. Index Route (src/routes/index.tsx)

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'

const getGreeting = createServerFn({ method: 'GET' }).handler(async () => {
  return 'Hello from TanStack Start!'
})

export const Route = createFileRoute('/')({
  loader: () => getGreeting(),
  component: HomePage,
})

function HomePage() {
  const greeting = Route.useLoaderData()
  return <h1>{greeting}</h1>
}
```

## useServerFn Hook

Use `useServerFn` to call server functions from React components with proper integration:

```tsx
import { createServerFn, useServerFn } from '@tanstack/react-start'

const updatePost = createServerFn({ method: 'POST' })
  .validator((data: { id: string; title: string }) => data)
  .handler(async ({ data }) => {
    await db.posts.update(data.id, { title: data.title })
    return { success: true }
  })

function EditPostForm({ postId }: { postId: string }) {
  const updatePostFn = useServerFn(updatePost)
  const [title, setTitle] = useState('')

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        await updatePostFn({ data: { id: postId, title } })
      }}
    >
      <input value={title} onChange={(e) => setTitle(e.target.value)} />
      <button type="submit">Save</button>
    </form>
  )
}
```

## Global Start Configuration (src/start.ts)

```tsx
import { createStart, createMiddleware } from '@tanstack/react-start'

const requestLogger = createMiddleware().server(async ({ next, request }) => {
  console.log(`${request.method} ${request.url}`)
  return next()
})

export const startInstance = createStart(() => ({
  requestMiddleware: [requestLogger],
}))
```

## React-Specific Components

All routing components from `@tanstack/react-router` work in Start:

- `<RouterProvider>` — not needed in Start (handled automatically)
- `<Outlet>` — renders matched child route
- `<Link>` — type-safe navigation
- `<Navigate>` — declarative redirect
- `<HeadContent>` — renders head tags (must be in `<head>`)
- `<Scripts>` — renders body scripts (must be in `<body>`)
- `<Await>` — renders deferred data with Suspense
- `<ClientOnly>` — renders children only after hydration
- `<CatchBoundary>` — error boundary

## Hooks Reference

All hooks from `@tanstack/react-router` work in Start:

- `useRouter()` — router instance
- `useRouterState()` — subscribe to router state
- `useNavigate()` — programmatic navigation
- `useSearch({ from })` — validated search params
- `useParams({ from })` — path params
- `useLoaderData({ from })` — loader data
- `useMatch({ from })` — full route match
- `useRouteContext({ from })` — route context
- `Route.useLoaderData()` — typed loader data (preferred in route files)
- `Route.useSearch()` — typed search params (preferred in route files)

## Common Mistakes

### 1. CRITICAL: Importing from wrong package

```tsx
// WRONG — this is the SPA router, NOT Start
import { createServerFn } from '@tanstack/react-router'

// CORRECT — server functions come from react-start
import { createServerFn } from '@tanstack/react-start'

// CORRECT — routing APIs come from react-router (re-exported by Start too)
import { createFileRoute, Link } from '@tanstack/react-router'
```

### 2. HIGH: Using React hooks in beforeLoad or loader

```tsx
// WRONG — beforeLoad/loader are NOT React components
beforeLoad: () => {
  const auth = useAuth() // React hook, cannot be used here
}

// CORRECT — pass state via router context
const rootRoute = createRootRouteWithContext<{ auth: AuthState }>()({})
```

### 3. HIGH: Missing Scripts component

Without `<Scripts />` in the root route's `<body>`, client JavaScript doesn't load and the app won't hydrate.

## Cross-References

- [start-core](../../../start-client-core/skills/start-core/SKILL.md) — core Start concepts
- [router-core](../../../router-core/skills/router-core/SKILL.md) — routing fundamentals
- [react-router](../../../react-router/skills/react-router/SKILL.md) — React Router hooks and components
