---
title: React Server Components (Next.js)
description: Start queries in server components, send them to client components with HydrationBoundary, and refetch from the browser. For the Next.js App Router and other RSC frameworks.
section: Integrations
order: 2
---

With [React Server Components](https://react.dev/reference/rsc/server-components), server components play the part of loaders: they start queries and pass handles to client components. `QueryProvider` and `HydrationBoundary`, both from `@raf-query/react`, connect them.

The samples use the [Next.js App Router](https://nextjs.org/docs/app). Other RSC frameworks work the same way: the integration needs only a bundler that resolves the `react-server` export condition, which React itself needs too. It's tested on [Vite's RSC plugin](https://github.com/vitejs/vite-plugin-react/tree/main/packages/plugin-rsc), which Waku and React Router's RSC mode build on. Navigation, request headers and server actions are the framework's own, so those sections show the Next.js APIs.

## Setup

A query client per request for server components, scoped by React's [`cache()`](https://react.dev/reference/react/cache):

```sample
nextjs/src/query-client.ts
```

`QueryProvider` in the root layout, for client components:

```sample
nextjs/src/app/layout.tsx
```

`QueryProvider` creates one client per server render and one per browser tab. Its `config` must be serializable, since it crosses from the server component layout to the client.

Mount DevTools only when `process.env.NODE_ENV !== "production"` so the bundler drops the panel from production builds. The [example app](./examples.md) always renders it, so the panel stays available in the deployed demo.

## Pages

A server component starts queries, and wraps what it renders in a `HydrationBoundary` that sends the request client's entries to the browser:

```sample
nextjs/src/app/(blog)/posts/[slug]/page.tsx
```

```sample
nextjs/src/app/(blog)/components/post.tsx#component
```

```sample
nextjs/src/app/(blog)/components/comments.tsx#component
```

- Render a `HydrationBoundary` in each server component that starts queries for client components. Entries already sent in this request are skipped, so nesting them is fine.
- `client` works only in server components. The bundler resolves `@raf-query/react` with the `react-server` [export condition](https://nodejs.org/api/packages.html#conditional-exports) there, which picks the `HydrationBoundary` that dehydrates the client. Client components get the one that takes a dehydrated `state`, as in [React Router](./react-router.md).
- Pending entries stream as promises through the RSC payload: the page's shell renders while `comments` loads.
- `await qc.fetch(...)` returns a handle with the `data`: render `post.data` in the server component, and pass `post` to client components that read the query: typed `QueryHandleWithData`, they get the data from `useQuery` without a promise. The data crosses once: the RSC payload references the `HydrationBoundary`'s copy.
- Use `prefetch` and `fetch` in server components, not `ensure`. Each request's client starts empty, so `ensure` waits for the request every time, exactly like `fetch`. See [Starting queries](./starting-queries.md#server-only-code).

## Pending UI

While a link navigation is loading the next RSC payload, show pending state with the framework's router — not [`useIsFetching`](./background-fetching-indicators.md#useisfetching). In Next.js, render [`useLinkStatus`](https://nextjs.org/docs/app/api-reference/functions/use-link-status) as a child of the `Link` it tracks:

```sample
nextjs/src/docs/nextjs.tsx#pending-ui
```

Per-query background refetches after the page has rendered use `controls.isFetching`. See [Background fetching indicators](./background-fetching-indicators.md).

## Search params

Read [`searchParams`](https://nextjs.org/docs/app/api-reference/file-conventions/page#searchparams-optional) in the page, validate them, and pass them as the input:

```sample
nextjs/src/app/issues/page.tsx#page
```

Changing search params with [`<Link>`](https://nextjs.org/docs/app/api-reference/components/link) or [`router.push`](https://nextjs.org/docs/app/api-reference/functions/use-router) renders the page again on the server with the new input. See [URL state and pagination](./url-state-and-pagination.md) for what to show while it loads.

## Queries that start in the browser

`QueryProvider`'s server render starts no requests. A client component reading a query that no `HydrationBoundary` sent renders its Suspense fallback on the server, and the query loads in the browser. This is what happens with [`useWaterfall`](./request-waterfalls.md#render-time-inputs-usewaterfall) in a client component. That boundary renders in the browser through React's error recovery, with the digest Next.js uses for `ssr: false`, so Next.js doesn't report it. Other RSC frameworks see a recoverable error.

## Server and browser requests

A factory's `queryFn` runs in two places, and has to reach the same data as the same user in both:

|                     | Server components                                                                                 | Browser                   |
| ------------------- | ------------------------------------------------------------------------------------------------- | ------------------------- |
| When                | The page request                                                                                  | Refetches and later pages |
| `fetch("/api/...")` | Fails: there is no page origin to resolve it                                                      | Works                     |
| The user's cookies  | Yours to forward, from [`headers()`](https://nextjs.org/docs/app/api-reference/functions/headers) | Sent by the browser       |

Client components' server render starts no request, so it isn't a third place.

### An API in the same app

Have the API read the session from the request's cookies, and give factories one `apiFetch` with two files behind it: on the server it calls the API's handler in the process with the page request's cookies, and in the browser it's `fetch`. A [subpath import](https://nodejs.org/api/packages.html#subpath-imports) picks the file. The bundler resolves the `react-server` condition in server components, so the server file can import the request's headers (`next/headers` in Next.js) and your API, and neither reaches the browser bundle:

```json title="package.json"
{
	"imports": {
		"#api-fetch": {
			"react-server": "./src/api-fetch.server.ts",
			"default": "./src/api-fetch.ts"
		}
	}
}
```

```sample
nextjs/src/api-fetch.server.ts
```

```sample
nextjs/src/api-fetch.ts
```

```sample
nextjs/src/queries.ts#api-fetch
```

- The API sees the same request from both sides, so it authenticates the same way. Forward only what it reads (`cookie`, `authorization`), not every header.
- Nothing needs the app's own origin, and server rendering doesn't open a second connection to itself.
- A typed client works the same way. [`examples/nextjs`](https://github.com/KATT/raf-query/tree/main/examples/nextjs) gives a Hono client the page request's cookies in `src/forwarded-headers.server.ts`.
- Reading `headers()` renders the page per request, as a page with per-user data must.

### An API on another origin

The server can call the same URL as the browser, but the browser's cookies belong to your origin, not the API's:

- **In server components**, forward the credentials it needs: read your session with [`cookies()`](https://nextjs.org/docs/app/api-reference/functions/cookies) and send, for example, an `Authorization` header.
- **In the browser**, either proxy it through a [Route Handler](https://nextjs.org/docs/app/api-reference/file-conventions/route), so the request carries your cookies and the handler adds the same credentials, or send [`credentials: "include"`](https://developer.mozilla.org/en-US/docs/Web/API/RequestInit#credentials) to an API that allows your origin with [CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS) and sets its own cookies.

Pick the two implementations with the same `react-server` condition.

### Server actions

Factories can call [server actions](https://react.dev/reference/rsc/server-functions), and get both sides for free: server components call the function in the page request, and the browser posts to it with its cookies. Validate their arguments, since anyone can call them.

The browser runs a page's server actions one at a time, so refetches wait for each other and for any pending mutation. For parallel requests, call your API instead.

## Mutations

Write with a server action, then invalidate in the browser:

```sample
nextjs/src/components/update-issue-form.tsx#form
```

If the action also calls [`revalidatePath`](https://nextjs.org/docs/app/api-reference/functions/revalidatePath) or [`refresh()`](https://nextjs.org/docs/app/api-reference/functions/refresh), server components render again and send their entries, and the browser keeps whichever copy is newest.

## Server-only queries

A factory that imports server-only code (a database client) can't be imported by a client component, so it can't be read with `useQuery`. Render its data in a server component, or pass a plain promise prop and `use()` it on the client. Refresh it with [`router.refresh()`](https://nextjs.org/docs/app/api-reference/functions/use-router).

To read it from client components too, put the server-only code behind an API, and reach that from the factory as in [An API in the same app](#an-api-in-the-same-app).

## Example

[`examples/nextjs`](https://github.com/KATT/raf-query/tree/main/examples/nextjs) is the same issue tracker as the TanStack Start example, built on the Next.js App Router, so the two integrations can be compared side by side.
