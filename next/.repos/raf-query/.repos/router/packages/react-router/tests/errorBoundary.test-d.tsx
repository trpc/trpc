import { expectTypeOf, test } from 'vitest'
import { createRootRoute, createRouter } from '../src'
import type { ErrorComponentProps } from '../src'

test('only boundary errors default to unknown', () => {
  expectTypeOf<ErrorComponentProps['error']>().toEqualTypeOf<unknown>()
  expectTypeOf<ErrorComponentProps<Error>['error']>().toEqualTypeOf<Error>()
  const routeTree = createRootRoute({
    errorComponent: ({ error }) => {
      expectTypeOf(error).toEqualTypeOf<unknown>()
      return null
    },
    onCatch: (error) => {
      expectTypeOf(error).toEqualTypeOf<unknown>()
    },
    onError: (error) => {
      expectTypeOf(error).toBeAny()
    },
  })
  createRouter({
    routeTree,
    defaultErrorComponent: ({ error }) => {
      expectTypeOf(error).toEqualTypeOf<unknown>()
      return null
    },
    defaultOnCatch: (error) => {
      expectTypeOf(error).toEqualTypeOf<unknown>()
    },
  })
})
