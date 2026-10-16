import { AbortError } from '@standard-server/shared'
import { isAbortError } from './error'

describe('isAbortError', () => {
  it('returns true for AbortError', () => {
    const error = new AbortError('error')
    expect(isAbortError(error)).toBe(true)
  })

  it('returns true when the error name contains Abort', () => {
    const error = new Error('aborted')
    error.name = 'RequestAbortError'

    expect(isAbortError(error)).toBe(true)
  })

  it('returns false for other Error instances', () => {
    expect(isAbortError(new Error('boom'))).toBe(false)
  })

  it('returns false when Abort casing differs', () => {
    const error = new Error('aborted')
    error.name = 'aborted'

    expect(isAbortError(error)).toBe(false)
  })

  it('returns false for non-Error values', () => {
    expect(isAbortError(null)).toBe(false)
    expect(isAbortError(undefined)).toBe(false)
    expect(isAbortError('AbortError')).toBe(false)
    expect(isAbortError({ name: 'AbortError' })).toBe(false)
  })

  it('returns true for any Error whose name contains Abort', () => {
    const error = new Error('test')
    error.name = 'NotReallyAnAbortButContainsAbort'

    expect(isAbortError(error)).toBe(true)
  })
})
