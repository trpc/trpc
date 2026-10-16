import type { Public } from '@orpc/shared'
import type { SharedUtils } from './shared-utils'
import { mutate } from 'swr'

describe('sharedUtils', () => {
  const optionalUtils = {} as Public<SharedUtils<{ nested: { value1: string, value2?: number } } | undefined>>
  const requiredUtils = {} as Public<SharedUtils<{ nested: { value1: string, value2?: number } }>>

  describe('.matcher & mutate', () => {
    it('support partial input if strategy=partial', () => {
      optionalUtils.matcher({ input: { nested: { value1: 'test' } } })
      optionalUtils.matcher({ input: { nested: {} } })
      optionalUtils.matcher({ input: { } })

      requiredUtils.matcher({ input: { nested: { value1: 'test' } } })
      requiredUtils.matcher({ input: { nested: {} } })
      requiredUtils.matcher({ input: {} })
    })

    it('require exact input if strategy=exact', () => {
      optionalUtils.matcher({ strategy: 'exact' })
      optionalUtils.matcher({ strategy: 'exact', input: { nested: { value1: 'test' } } })

      requiredUtils.matcher({ strategy: 'exact', input: { nested: { value1: 'test' } } })
      // @ts-expect-error - missing nested field
      requiredUtils.matcher({ strategy: 'exact', input: { } })
      // @ts-expect-error - missing input field
      requiredUtils.matcher({ strategy: 'exact' })
    })

    it('can be used for mutating', () => {
      mutate(optionalUtils.matcher())
      mutate(requiredUtils.matcher({ strategy: 'exact', input: { nested: { value1: 'test' } } }))
    })
  })
})
