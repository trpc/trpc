import { createLazyRoute } from '../../src'

export function Route(id: string) {
  return createLazyRoute(id)({
    component: () => <div>About route content</div>,
    errorComponent: ({ error }) => (
      <div>
        Lazy Error: {error instanceof Error ? error.message : String(error)}
      </div>
    ),
  })
}
