import type { Public } from '@orpc/shared'
import type { SharedUtils } from './shared-utils'
import { ref } from 'vue'

describe('SharedUtils', () => {
  const utils = {} as Public<SharedUtils<{ a: { b: { c: number } } }>>

  it('.key', () => {
    utils.key()
    utils.key({})
    utils.key({ type: 'mutation' })
    // unlike tanstack-query, mutation keys can contain input
    utils.key({ type: 'mutation', input: {} })
    utils.key({ input: {}, type: 'query' })
    utils.key({ input: {}, type: 'streamed', fnOptions: { refetchMode: 'append' } })
    utils.key({ input: {} })
    utils.key({ input: { a: {} } })
    utils.key({ input: { a: { b: {} } } })
    utils.key({ input: { a: { b: { c: 1 } } } })

    // @ts-expect-error invalid input
    utils.key({ input: 123 })
    // @ts-expect-error invalid input
    utils.key({ input: { a: { b: { c: '1' } } } })

    // @ts-expect-error not allow ref
    utils.key({ input: { a: { b: ref({ c: 1 }) } } })

    // @ts-expect-error invalid type
    utils.key({ type: 'ddd' })

    // @ts-expect-error fnOptions is only allowed for streamed type
    utils.key({ type: 'infinite', fnOptions: { refetchMode: 'append' } })
  })
})
