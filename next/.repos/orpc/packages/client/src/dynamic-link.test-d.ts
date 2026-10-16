import type { ClientLink } from './types'
import { DynamicLink } from './dynamic-link'

describe('dynamicLink', () => {
  it('pass correct context', () => {
    void new DynamicLink<{ batch?: boolean }>(({ context }, path, input) => {
      expectTypeOf(context).toEqualTypeOf<{ batch?: boolean }>()

      return {} as any
    })
  })

  it('required return a valid link', () => {
    void new DynamicLink(() => ({} as ClientLink<any>))
    void new DynamicLink<{ batch?: boolean }>(() => ({} as ClientLink<{ batch?: boolean }>))
    // @ts-expect-error - context is mismatch
    void new DynamicLink<{ batch?: boolean }>(() => ({} as ClientLink<{ batch?: string }>))
    // @ts-expect-error - must return a ClientLink
    void new DynamicLink<{ batch?: boolean }>(() => ({}))
  })
})
