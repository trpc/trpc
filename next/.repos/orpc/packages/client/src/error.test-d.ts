import { ORPCError } from './error'

describe('ORPCError', () => {
  it('constructor', () => {
    const _error11: ORPCError<'CODE', undefined | 'optional'> = new ORPCError('CODE')
    const _error12: ORPCError<'CODE', undefined | 'optional'> = new ORPCError('CODE', { data: 'optional' })
    // @ts-expect-error - data is invalid
    const _error13: ORPCError<'CODE', undefined | 'optional'> = new ORPCError('CODE', { data: 'invalid' })

    // @ts-expect-error - data is required
    const _error21: ORPCError<'CODE', 'required'> = new ORPCError('CODE')
    const _error22: ORPCError<'CODE', 'required'> = new ORPCError('CODE', { data: 'required' })
    // @ts-expect-error - data is invalid
    const _error23: ORPCError<'CODE', 'required'> = new ORPCError('CODE', { data: 'invalid' })
  })

  it('not allow write .defined property', () => {
    const error = new ORPCError('CODE')
    // @ts-expect-error - not allow write
    error.defined = true as any
  })
})
