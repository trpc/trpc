import { resolveFriendlyStandardHandlerHandleOptions } from './utils'

describe('resolveFriendlyStandardHandlerHandleOptions', () => {
  it('defaults context to empty object', () => {
    expect(resolveFriendlyStandardHandlerHandleOptions({})).toEqual({ context: {} })
  })

  it('keeps a context function as is', () => {
    const context = () => ({ userId: 'u_123' })

    expect(resolveFriendlyStandardHandlerHandleOptions({ context })).toEqual({ context })
  })

  it('preserves provided context and prefix', () => {
    expect(resolveFriendlyStandardHandlerHandleOptions({
      prefix: '/api/v1',
      context: { userId: 'u_123' },
    })).toEqual({
      prefix: '/api/v1',
      context: { userId: 'u_123' },
    })
  })
})
