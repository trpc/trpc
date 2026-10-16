---
id: useMatchRouteHook
title: useMatchRoute hook
---

The `useMatchRoute` hook returns a `matchRoute` function that can be used to match a route against either the current or pending location. The hook subscribes the component to changes in the router state used for matching, making it useful when the match result affects what the component renders.

The `matchRoute` function's identity changes when that router state changes. For an imperative check, such as one performed in an event handler, use [`useRouter`](./useRouterHook.md) and call `router.matchRoute` instead. The router instance is stable, and this avoids subscribing the component to router state that it does not use while rendering.

## useMatchRoute returns

- A `matchRoute` function that can be used to match a route against either the current or pending location.

## matchRoute function

The `matchRoute` function is a function that can be used to match a route against either the current or pending location.

### matchRoute function options

The `matchRoute` function accepts a single argument, an `options` object.

- Type: [`UseMatchRouteOptions`](./UseMatchRouteOptionsType.md)

### matchRoute function returns

- The matched route's params or `false` if no route was matched

## Examples

Use `useMatchRoute` when the result determines the rendered output:

```tsx
import { useMatchRoute } from '@tanstack/react-router'

// Current location: /posts/123
function Component() {
  const matchRoute = useMatchRoute()
  const params = matchRoute({ to: '/posts/$postId' })
  //    ^ { postId: '123' }

  return params ? <Post postId={params.postId} /> : <NotFound />
}
```

For a check made at the time of an event, call `router.matchRoute` directly:

```tsx
import { useRouter } from '@tanstack/react-router'

function Component() {
  const router = useRouter()

  return (
    <button
      onClick={() => {
        const params = router.matchRoute({ to: '/posts/$postId' })
        //    ^ { postId: '123' }
      }}
    >
      Check current route
    </button>
  )
}
```

Additional matching examples:

```tsx
import { useMatchRoute } from '@tanstack/react-router'

// Current location: /posts/123
function Component() {
  const matchRoute = useMatchRoute()
  const params = matchRoute({ to: '/posts' })
  //    ^ false
}

// Current location: /posts/123
function Component() {
  const matchRoute = useMatchRoute()
  const params = matchRoute({ to: '/posts', fuzzy: true })
  //    ^ {}
}

// Current location: /posts
// Pending location: /posts/123
function Component() {
  const matchRoute = useMatchRoute()
  const params = matchRoute({ to: '/posts/$postId', pending: true })
  //    ^ { postId: '123' }
}

// Current location: /posts/123/foo/456
function Component() {
  const matchRoute = useMatchRoute()
  const params = matchRoute({ to: '/posts/$postId/foo/$fooId' })
  //    ^ { postId: '123', fooId: '456' }
}

// Current location: /posts/123/foo/456
function Component() {
  const matchRoute = useMatchRoute()
  const params = matchRoute({
    to: '/posts/$postId/foo/$fooId',
    params: { postId: '123' },
  })
  //    ^ { postId: '123', fooId: '456' }
}

// Current location: /posts/123/foo/456
function Component() {
  const matchRoute = useMatchRoute()
  const params = matchRoute({
    to: '/posts/$postId/foo/$fooId',
    params: { postId: '789' },
  })
  //    ^ false
}

// Current location: /posts/123/foo/456
function Component() {
  const matchRoute = useMatchRoute()
  const params = matchRoute({
    to: '/posts/$postId/foo/$fooId',
    params: { fooId: '456' },
  })
  //    ^ { postId: '123', fooId: '456' }
}

// Current location: /posts/123/foo/456
function Component() {
  const matchRoute = useMatchRoute()
  const params = matchRoute({
    to: '/posts/$postId/foo/$fooId',
    params: { postId: '123', fooId: '456' },
  })
  //    ^ { postId: '123', fooId: '456' }
}

// Current location: /posts/123/foo/456
function Component() {
  const matchRoute = useMatchRoute()
  const params = matchRoute({
    to: '/posts/$postId/foo/$fooId',
    params: { postId: '789', fooId: '456' },
  })
  //    ^ false
}
```
