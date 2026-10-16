import { expectTypeOf, test } from 'vitest'
import { CatchBoundary, createRootRoute, createRouter } from '../src'
import type { ErrorComponentProps } from '../src'

test('Solid boundary errors default to Error', () => {
  expectTypeOf<ErrorComponentProps['error']>().toEqualTypeOf<Error>()
  expectTypeOf<ErrorComponentProps<unknown>['error']>().toEqualTypeOf<unknown>()
  ;<CatchBoundary
    getResetKey={() => 0}
    onCatch={(error) => {
      expectTypeOf(error).toEqualTypeOf<Error>()
    }}
    errorComponent={({ error }) => {
      expectTypeOf(error).toEqualTypeOf<Error>()
      return null
    }}
  >
    <div />
  </CatchBoundary>
  const routeTree = createRootRoute({
    errorComponent: ({ error }) => {
      expectTypeOf(error).toEqualTypeOf<Error>()
      return null
    },
    onCatch: (error) => {
      expectTypeOf(error).toEqualTypeOf<Error>()
    },
    onError: (error) => {
      expectTypeOf(error).toBeAny()
    },
  })
  createRouter({
    routeTree,
    defaultErrorComponent: ({ error }) => {
      expectTypeOf(error).toEqualTypeOf<Error>()
      return null
    },
    defaultOnCatch: (error) => {
      expectTypeOf(error).toEqualTypeOf<Error>()
    },
  })
})
