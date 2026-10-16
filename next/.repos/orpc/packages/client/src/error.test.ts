import { NullProtoObj } from '@orpc/shared'
import { MalformedResponseError, ORPCError } from './error'

describe('oRPCError', () => {
  it('works', () => {
    const error = new ORPCError('BAD_GATEWAY', {
      message: 'message',
      data: 'data',
      cause: 'cause',
    })
    expect(error.defined).toBe(false)
    expect(error.code).toBe('BAD_GATEWAY')
    expect(error.message).toBe('message')
    expect(error.data).toBe('data')
    expect(error.cause).toBe('cause')
    expect(Object.getPrototypeOf(error).constructor.name).toBe('ORPCError')
  })

  it('can fallback message', () => {
    const error = new ORPCError('BAD_GATEWAY')
    expect(error.message).toBe('Bad Gateway')
  })

  it('can force write .defined', () => {
    const error = new ORPCError('BAD_GATEWAY')

    expect(error.defined).toBe(false)

    ;(error.defined as any) = true

    expect(error.defined).toBe(true)
  })

  it('.toJSON', () => {
    const error = new ORPCError('BAD_GATEWAY', { message: 'message', data: 'data', cause: 'cause' })
    expect(error.toJSON()).toEqual({
      defined: false,
      code: 'BAD_GATEWAY',
      message: 'message',
      data: 'data',
    })
  })

  it('instanceof should behave as normal', () => {
    class ExtendedORPCError extends ORPCError<any, any> {}
    class NotRelated {}

    const orpcError = new ORPCError('test')
    const extendedError = new ExtendedORPCError('test')
    const pureError = new Error('test')
    const notRelated = new NotRelated()
    const nullProtoObj = new NullProtoObj()

    expect(orpcError instanceof ORPCError).toBe(true)
    expect(extendedError instanceof ORPCError).toBe(true)
    expect(pureError instanceof ORPCError).toBe(false)
    expect(notRelated instanceof ORPCError).toBe(false)
    expect(nullProtoObj instanceof ORPCError).toBe(false)

    expect(orpcError instanceof ExtendedORPCError).toBe(false)
    expect(extendedError instanceof ExtendedORPCError).toBe(true)
    expect(pureError instanceof ExtendedORPCError).toBe(false)
    expect(notRelated instanceof ExtendedORPCError).toBe(false)
    expect(nullProtoObj instanceof ExtendedORPCError).toBe(false)

    expect(orpcError instanceof Error).toBe(true)
    expect(extendedError instanceof Error).toBe(true)
    expect(pureError instanceof Error).toBe(true)
    expect(notRelated instanceof Error).toBe(false)
    expect(nullProtoObj instanceof Error).toBe(false)

    expect(orpcError instanceof NotRelated).toBe(false)
    expect(extendedError instanceof NotRelated).toBe(false)
    expect(pureError instanceof NotRelated).toBe(false)
    expect(notRelated instanceof NotRelated).toBe(true)
    expect(nullProtoObj instanceof NotRelated).toBe(false)
  })

  it('instanceof matches cross-context ORPCError instances', ({ onTestFinished }) => {
    /**
     * Stands in for an ORPCError constructor from a separate dependency graph:
     * unrelated prototype chain, but registered in the shared global WeakSet.
     */
    class CrossContextORPCError extends Error {}
    class ExtendedCrossContextORPCError extends CrossContextORPCError {}

    expect(new Error('message') instanceof ORPCError).toBe(false)
    expect(new CrossContextORPCError() instanceof ORPCError).toBe(false)
    expect(new ExtendedCrossContextORPCError() instanceof ORPCError).toBe(false)
    expect(new ORPCError('test') instanceof CrossContextORPCError).toBe(false)
    expect(new ORPCError('test') instanceof ExtendedCrossContextORPCError).toBe(false)

    const constructors: WeakSet<object> = (globalThis as any)[Symbol.for('ORPC_ERROR_CONSTRUCTORS')]
    constructors.add(CrossContextORPCError)
    onTestFinished(() => {
      constructors.delete(CrossContextORPCError)
    })

    expect(new Error('message') instanceof ORPCError).toBe(false)
    expect(new CrossContextORPCError() instanceof ORPCError).toBe(true)
    expect(new ExtendedCrossContextORPCError() instanceof ORPCError).toBe(true)
    expect(new ORPCError('test') instanceof CrossContextORPCError).toBe(false)
    expect(new ORPCError('test') instanceof ExtendedCrossContextORPCError).toBe(false)

    // same-graph instances still match while multiple graphs exist
    class ExtendedORPCError extends ORPCError<any, any> {}
    expect(new ORPCError('test') instanceof ORPCError).toBe(true)
    expect(new ExtendedORPCError('test') instanceof ORPCError).toBe(true)
    expect(new ExtendedORPCError('test') instanceof ExtendedORPCError).toBe(true)
    expect(new ORPCError('test') instanceof ExtendedORPCError).toBe(false)
  })
})

describe('malformedResponseError', () => {
  it('works', () => {
    const response = { status: 500, headers: { 'x-header': 'value' }, body: { something: 'unexpected' } }
    const cause = new Error('deserialize failed')
    const error = new MalformedResponseError({ message: 'Invalid RPC response format.', response, cause })

    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(ORPCError)
    expect(error.name).toBe('MalformedResponseError')
    expect(error.message).toBe('Invalid RPC response format.')
    expect(error.response).toBe(response)
    expect(error.cause).toBe(cause)
  })

  it('infers message from a string body', () => {
    const error = new MalformedResponseError({ response: { status: 500, headers: {}, body: 'upstream exploded' } })

    expect(error.message).toBe('upstream exploded')
  })

  it('infers message from body.message', () => {
    const error = new MalformedResponseError({ response: { status: 500, headers: {}, body: { message: 'upstream exploded', detail: 'ignored' } } })

    expect(error.message).toBe('upstream exploded')
  })

  it('infers message from a common error code matching the status', () => {
    expect(new MalformedResponseError({ response: { status: 404, headers: {}, body: { detail: 'no message here' } } }).message).toBe('Not Found')
    expect(new MalformedResponseError({ response: { status: 503, headers: {}, body: undefined } }).message).toBe('Service Unavailable')
    expect(new MalformedResponseError({ response: { status: 411, headers: {}, body: undefined } }).message).toBe('Length Required')
  })

  it.each([
    ['empty string body', ''],
    ['empty body.message', { message: '' }],
    ['oversized string body', 'x'.repeat(257)],
    ['oversized body.message', { message: 'x'.repeat(257) }],
    ['non-string body.message', { message: 42 }],
    ['non-object body', 42],
  ])('falls back to the default message when the status is uncommon and the body has no message (%s)', (_, body) => {
    const error = new MalformedResponseError({ response: { status: 599, headers: {}, body } })

    expect(error.message).toBe('Malformed oRPC Response')
  })
})
