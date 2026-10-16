import type { SharedUtils } from './shared-utils'

describe('SharedUtils', () => {
  const utils = {} as SharedUtils<{ a: { b: { c: number } } }>

  it('.key', () => {
    utils.key()
    utils.key({})
    utils.key({ type: 'mutation' })
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

    // @ts-expect-error invalid input
    utils.key({ type: 'ddd' })

    // @ts-expect-error input is not allowed when type is mutation
    utils.key({ type: 'mutation', input: {} })
    // @ts-expect-error fnOptions is not allowed when type not streamed
    utils.key({ type: 'infinite', fnOptions: { refetchMode: 'append' } })
  })
})
