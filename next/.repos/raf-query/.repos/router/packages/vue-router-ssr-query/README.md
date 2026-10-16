<div align="center">
  <picture>
    <source
      media="(prefers-color-scheme: dark)"
      srcset="https://tanstack.com/api/readme/router.png?title=TanStack%20Vue%20Router&theme=dark"
    />
    <source
      media="(prefers-color-scheme: light)"
      srcset="https://tanstack.com/api/readme/router.png?title=TanStack%20Vue%20Router"
    />
    <img
      src="https://tanstack.com/api/readme/router.png?title=TanStack%20Vue%20Router"
      alt="TanStack Vue Router"
      width="900"
    />
  </picture>
</div>
# @tanstack/vue-router-ssr-query

SSR Query integration for TanStack Vue Router.

## Installation

```bash
npm install @tanstack/vue-router-ssr-query
```

## Usage

```ts
import { setupRouterSsrQueryIntegration } from '@tanstack/vue-router-ssr-query'
import { QueryClient } from '@tanstack/vue-query'

const queryClient = new QueryClient()

setupRouterSsrQueryIntegration({
  router,
  queryClient,
})
```
