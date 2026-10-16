---
name: start-server-core
description: >-
  Server-side runtime for TanStack Start: createStartHandler,
  request/response utilities (getRequest, setResponseHeader,
  setCookie, getCookie, useSession), three-phase request handling,
  AsyncLocalStorage context.
metadata:
  type: core
  library: tanstack-start
  library_version: '1.169.17'
sources:
  - TanStack/router:packages/start-server-core/src
  - TanStack/router:docs/start/framework/react/guide/server-entry-point.md
---

# Start Server Core (`@tanstack/start-server-core`)

Server-side runtime for TanStack Start. Provides the request handler, request/response utilities, cookie management, and session management. All utilities are available anywhere in the call stack during a request via AsyncLocalStorage.

> **CRITICAL**: These utilities are SERVER-ONLY. Import them from `@tanstack/<framework>-start/server`, not from the main entry point. They throw if called outside a server request context.
>
> **CRITICAL**: Types are FULLY INFERRED. Never cast, never annotate inferred values.
>
> **CRITICAL**: Read cookies, headers, request URLs, and runtime environment values inside the active request. Do not capture them at module scope; edge runtimes may inject them per request, and concurrent requests must never share request-derived state.

## `createStartHandler`

Creates the main request handler that processes all incoming requests through three phases: server functions, server routes, then app SSR.

```ts
// src/server.ts
// Use @tanstack/<framework>-start for your framework (react, solid, vue)
import { createStartHandler } from '@tanstack/react-start/server'
import { defaultStreamHandler } from '@tanstack/react-start/server'

export default createStartHandler({
  handler: defaultStreamHandler,
})
```

With asset URL transforms (CDN):

```ts
export default createStartHandler({
  handler: defaultStreamHandler,
  transformAssets: 'https://cdn.example.com',
})
```

## Request Utilities

All imported from `@tanstack/<framework>-start/server`. Available anywhere during request handling — no parameter passing needed.

### Reading Request Data

```ts
// Use @tanstack/<framework>-start for your framework (react, solid, vue)
import { createServerFn } from '@tanstack/react-start'
import {
  getRequest,
  getRequestHeaders,
  getRequestHeader,
  getRequestIP,
  getRequestHost,
  getRequestUrl,
  getRequestProtocol,
} from '@tanstack/react-start/server'

const serverFn = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest()
  const headers = getRequestHeaders()
  const auth = getRequestHeader('authorization')
  const ip = getRequestIP({ xForwardedFor: true })
  const host = getRequestHost()
  const url = getRequestUrl()
  const protocol = getRequestProtocol()

  return { ip, host }
})
```

### Setting Response Data

```ts
// Use @tanstack/<framework>-start for your framework (react, solid, vue)
import { createServerFn } from '@tanstack/react-start'
import {
  setResponseHeader,
  setResponseHeaders,
  setResponseStatus,
  getResponseHeaders,
  getResponseHeader,
  getResponseStatus,
  removeResponseHeader,
  clearResponseHeaders,
} from '@tanstack/react-start/server'

const serverFn = createServerFn({ method: 'POST' }).handler(async () => {
  setResponseStatus(201)
  setResponseHeader('x-custom', 'value')
  setResponseHeaders({ 'cache-control': 'no-store' })

  return { created: true }
})
```

## Cookie Management

```ts
// Use @tanstack/<framework>-start for your framework (react, solid, vue)
import { createServerFn } from '@tanstack/react-start'
import {
  getCookies,
  getCookie,
  setCookie,
  deleteCookie,
} from '@tanstack/react-start/server'

const serverFn = createServerFn({ method: 'POST' }).handler(async () => {
  const allCookies = getCookies()
  const token = getCookie('session-token')

  setCookie('preference', 'dark', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/',
  })

  deleteCookie('old-cookie')
})
```

## Session Management

Encrypted sessions stored in cookies. Requires a password for encryption.

```ts
// Use @tanstack/<framework>-start for your framework (react, solid, vue)
import { createServerFn } from '@tanstack/react-start'
import {
  useSession,
  getSession,
  updateSession,
  clearSession,
} from '@tanstack/react-start/server'

type SessionData = {
  userId?: string
}

function getSessionConfig() {
  const password = process.env.SESSION_SECRET
  if (!password || password.length < 32) {
    throw new Error('SESSION_SECRET must be at least 32 characters')
  }

  return {
    password,
    name: 'my-app-session',
    maxAge: 60 * 60 * 24 * 7,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      path: '/',
    },
  }
}

function getDummyPasswordHash() {
  // Precompute this with the same algorithm and cost as real password hashes.
  const hash = process.env.DUMMY_PASSWORD_HASH
  if (!hash) {
    throw new Error('DUMMY_PASSWORD_HASH is required')
  }
  return hash
}

// Full session manager
const getUser = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await useSession<SessionData>(getSessionConfig())
  if (!session.data.userId) {
    return null
  }
  return db.users.findById(session.data.userId)
})

// Update session
const login = createServerFn({ method: 'POST' })
  .validator((data: unknown) => {
    if (
      typeof data !== 'object' ||
      data === null ||
      !('email' in data) ||
      typeof data.email !== 'string' ||
      data.email.trim().length === 0 ||
      !('password' in data) ||
      typeof data.password !== 'string' ||
      data.password.length === 0
    ) {
      throw new Error('Invalid credentials')
    }
    return {
      email: data.email.trim().toLowerCase(),
      password: data.password,
    }
  })
  .handler(async ({ data }) => {
    const user = await db.users.findByEmail(data.email)
    const passwordHash = user?.passwordHash ?? getDummyPasswordHash()
    const passwordMatches = await verifyPassword(data.password, passwordHash)
    if (!user || !passwordMatches) {
      throw new Error('Invalid credentials')
    }

    await updateSession<SessionData>(getSessionConfig(), {
      userId: user.id,
    })
    return { success: true }
  })

// Clear session
const logout = createServerFn({ method: 'POST' }).handler(async () => {
  await clearSession(getSessionConfig())
  return { success: true }
})
```

### Session Config

| Option     | Type                     | Default     | Description       |
| ---------- | ------------------------ | ----------- | ----------------- |
| `password` | `string`                 | required    | Encryption key    |
| `name`     | `string`                 | `'start'`   | Cookie name       |
| `maxAge`   | `number`                 | `undefined` | Expiry in seconds |
| `cookie`   | `false \| CookieOptions` | `undefined` | Cookie settings   |

### Session Manager Methods

```ts
const session = await useSession<{ userId: string }>(config)

session.id // Session ID (string | undefined)
session.data // Session data (typed)
await session.update({ userId: '123' }) // Persist session data
await session.clear() // Clear session data
```

### Production Session Rules

- Keep cookie session data small and non-sensitive. Store a stable session or user ID, then load current permissions and account state from the authoritative store on each protected request.
- Use a server-side session record when you need revocation, device tracking, large data, or immediate role changes. Put only its opaque ID in the cookie.
- Rotate the session after login, privilege changes, password changes, and logout.
- Use `HttpOnly`, `SameSite`, `Path=/`, and `Secure` in production. Use a `__Host-` cookie name in production only when `Secure`, no `Domain`, and `Path=/` are all enforced.
- Use the same cookie name and path when clearing a session. Test login, authenticated refresh, expiry, logout, and a replay of the old cookie.

## Query Validation

Validate query string parameters using a Standard Schema:

```ts
// Use @tanstack/<framework>-start for your framework (react, solid, vue)
import { getValidatedQuery } from '@tanstack/react-start/server'
import { z } from 'zod'

const serverFn = createServerFn({ method: 'GET' }).handler(async () => {
  const query = await getValidatedQuery(
    z.object({
      page: z.coerce.number().default(1),
      limit: z.coerce.number().default(20),
    }),
  )

  return { page: query.page }
})
```

> Note: `getValidatedQuery` accepts a Standard Schema validator, not a callback function.

## How Request Handling Works

`createStartHandler` processes requests in three phases:

1. **Server Function Dispatch** — If URL matches the server function prefix (`/_serverFn`), deserializes the payload, runs global request middleware, executes the server function, and returns the serialized result.

2. **Server Route Handler** — For non-server-function requests, matches the URL against routes with `server.handlers`. Runs route middleware, then the matched HTTP method handler. Handlers can return a `Response` or call `next()` to fall through to SSR.

3. **App Router SSR** — Loads all route loaders, dehydrates state for client hydration, and calls the handler callback (e.g., `defaultStreamHandler`) to render HTML.

## Common Mistakes

### 1. CRITICAL: Importing server utilities in client code

Server utilities use AsyncLocalStorage and only work during server request handling. Importing them in client code causes build errors or runtime crashes.

```ts
// WRONG — importing in a component file that runs on client
import { getCookie } from '@tanstack/react-start/server'

function MyComponent() {
  const token = getCookie('auth') // crashes on client
}

// CORRECT — use inside server functions only
// Use @tanstack/<framework>-start for your framework (react, solid, vue)
import { createServerFn } from '@tanstack/react-start'
import { getCookie } from '@tanstack/react-start/server'

const getAuth = createServerFn({ method: 'GET' }).handler(async () => {
  return getCookie('auth')
})
```

### 2. HIGH: Forgetting session password for most session operations

`useSession`, `getSession`, `updateSession`, and `sealSession` all require a `password` field for encryption. Missing it throws at runtime. `clearSession` accepts `Partial<SessionConfig>`, so password is optional for clearing.

### 3. MEDIUM: Using session without HTTPS in production

Session cookies should use `secure: true` in production. The default cookie options may not enforce this.

### 4. CRITICAL: Capturing request or environment state at module scope

Do not create session config from `process.env` at module load or cache `getRequest()`, headers, cookies, or session data in a module variable. Create config and read request state inside the handler or middleware callback. This is required for per-request edge environments and prevents cross-request data leaks.

## Cross-References

- [start-core/server-functions](../../../start-client-core/skills/start-core/server-functions/SKILL.md) — creating server functions that use these utilities
- [start-core/middleware](../../../start-client-core/skills/start-core/middleware/SKILL.md) — request middleware
- [start-core/server-routes](../../../start-client-core/skills/start-core/server-routes/SKILL.md) — server route handlers
