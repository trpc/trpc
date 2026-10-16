import type { ORPCError } from './error'
import type { Client, ClientContext, InferClientBodyInputs, InferClientBodyOutputs, InferClientContext, InferClientError, InferClientErrors, InferClientInputs, InferClientOutputs } from './types'

describe('client', () => {
  const client: Client<{ cache?: boolean }, string, number, Error | ORPCError<'OVERRIDE', unknown>> = async (...args) => {
    const [input, options] = args

    expectTypeOf(input).toEqualTypeOf<string>()
    expectTypeOf(options).toExtend<{ context?: { cache?: boolean }, signal?: AbortSignal } | undefined>()

    return 123
  }

  it('just a function', () => {
    expectTypeOf(client).toExtend<(input: string, options: { context?: ClientContext, signal?: AbortSignal }) => Promise<number>>()
  })

  it('infer correct input', () => {
    expectTypeOf(client).parameter(0).toEqualTypeOf<string>()

    // @ts-expect-error - input is required
    client()
  })

  it('optional undefinedable input', () => {
    const client = {} as Client<ClientContext, { val: string } | undefined, { val: number }, Error>

    expectTypeOf(client).parameter(0).toEqualTypeOf<{ val: string } | undefined>()

    client(undefined)
    client()
  })

  it('accept signal', () => {
    client('123', { signal: new AbortSignal() })
    // @ts-expect-error - invalid signal
    client('123', { signal: 1234 })
  })

  describe('context', () => {
    it('can accept context', () => {
      const client = {} as Client<{ userId: string }, { val: string }, { val: number }, Error>

      client({ val: '123' }, { context: { userId: '123' } })
      // @ts-expect-error - invalid context
      client({ val: '123' }, { context: { userId: 123 } })
      // @ts-expect-error - context is required
      client({ val: '123' })
    })

    it('optional options when context is optional', () => {
      const client = {} as Client<{ userId?: string }, { val: string }, { val: number }, Error>

      client({ val: '123' })
      client({ val: '123' }, { context: { userId: '123' } })
    })

    it('can call without args when both input and context are optional', () => {
      const client = {} as Client<{ userId?: string }, undefined | { val: string }, { val: number }, Error>

      client()
      client({ val: 'string' })
      client({ val: 'string' }, { context: { userId: '123' } })
      // @ts-expect-error - input is invalid
      client({ val: 123 }, { context: { userId: '123' } })
      // @ts-expect-error - context is invalid
      client({ val: '123' }, { context: { userId: 123 } })
    })
  })

  it('infer correct output', async () => {
    expectTypeOf(await client('123')).toEqualTypeOf<number>()
  })

  it('can reverse infer', () => {
    expectTypeOf<
      typeof client extends Client<infer C, infer I, infer O, infer E> ? [C, I, O, E] : never
    >().toEqualTypeOf<[{ cache?: boolean }, string, number, Error | ORPCError<'OVERRIDE', unknown>]>()
  })
})

describe('infer utilities', () => {
  type ORPC = {
    ping: Client<{ cache?: boolean }, string, number, Error | ORPCError<'PING', unknown>>
    pong: Client<{ cache?: boolean }, { body: number }, { body: string }, Error>
    nested: {
      ping: Client<{ cache?: boolean }, string, number, Error | ORPCError<'NESTED_PING', unknown>>
      pong: Client<{ cache?: boolean }, { body: number }, { body: string }, Error>
    }
  }

  it('InferClientContext', () => {
    expectTypeOf<InferClientContext<ORPC>>().toEqualTypeOf<{ cache?: boolean }>()
  })

  it('InferClientInputs', () => {
    expectTypeOf<InferClientInputs<ORPC>>().toEqualTypeOf<{
      ping: string
      pong: { body: number }
      nested: {
        ping: string
        pong: { body: number }
      }
    }>()
  })

  it('InferClientBodyInputs', () => {
    expectTypeOf<InferClientBodyInputs<ORPC>>().toEqualTypeOf<{
      ping: string
      pong: number
      nested: {
        ping: string
        pong: number
      }
    }>()
  })

  it('InferClientOutputs', () => {
    expectTypeOf<InferClientOutputs<ORPC>>().toEqualTypeOf<{
      ping: number
      pong: { body: string }
      nested: {
        ping: number
        pong: { body: string }
      }
    }>()
  })

  it('InferClientBodyOutputs', () => {
    expectTypeOf<InferClientBodyOutputs<ORPC>>().toEqualTypeOf<{
      ping: number
      pong: string
      nested: {
        ping: number
        pong: string
      }
    }>()
  })

  it('InferClientErrors', () => {
    expectTypeOf<InferClientErrors<ORPC>>().toEqualTypeOf<{
      ping: Error | ORPCError<'PING', unknown>
      pong: Error
      nested: {
        ping: Error | ORPCError<'NESTED_PING', unknown>
        pong: Error
      }
    }>()
  })

  it('InferClientError', () => {
    expectTypeOf<InferClientError<ORPC>>().toEqualTypeOf<Error | ORPCError<'PING', unknown> | ORPCError<'NESTED_PING', unknown>>()
  })
})
