---
id: RouteMatchType
title: RouteMatch type
---

The `RouteMatch` type represents a route match in TanStack Router.

```tsx
interface RouteMatch {
  id: string
  routeId: string
  pathname: string
  params: Route['allParams']
  status: 'pending' | 'success' | 'error' | 'notFound'
  isFetching: false | 'beforeLoad' | 'loader'
  error: unknown
  paramsError: unknown
  searchError: unknown
  updatedAt: number
  loaderData?: Route['loaderData']
  context: Route['allContext']
  search: Route['fullSearchSchema']
  abortController: AbortController
  cause: 'preload' | 'enter' | 'stay'
  ssr?: boolean | 'data-only'
}
```

`status` describes the match's render state. `isFetching` independently exposes
active `beforeLoad` or loader work. In particular, a successful match can report
`isFetching: 'loader'` while stale data remains visible during a background
reload.

The router state can contain matches below the pending, error, or not-found
boundary. Those matches remain observable as part of the structurally matched
lane even though the route renderer stops at the boundary.
