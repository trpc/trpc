import type { ORPCError } from '@orpc/client'
import type { ErrorMap, ORPCErrorFromErrorMap } from './error'
import type { ORPCErrorConstructorMap, ORPCErrorFactory } from './error-factory'
import type { Schema } from './schema'
import z from 'zod'
import { error } from './error-factory'

describe('error factory', () => {
  const TestError = error('TEST', {
    message: 'default message',
    data: z.object({ value: z.number() }),
  })

  const SimpleError = error('SIMPLE')

  const OptionalError = error('OPTIONAL', {
    data: z.object({ value: z.number() }).optional(),
  })

  it('infers the factory type from the options', () => {
    expectTypeOf(TestError).toEqualTypeOf<ORPCErrorFactory<'TEST', { value: number }>>()
    expectTypeOf(SimpleError).toEqualTypeOf<ORPCErrorFactory<'SIMPLE', unknown>>()
    expectTypeOf(OptionalError).toEqualTypeOf<ORPCErrorFactory<'OPTIONAL', { value: number } | undefined>>()
  })

  it('creates a class that constructs typed ORPCError instances', () => {
    expectTypeOf(new TestError({ data: { value: 1 } })).toEqualTypeOf<ORPCError<'TEST', { value: number }>>()
    expectTypeOf(new SimpleError()).toEqualTypeOf<ORPCError<'SIMPLE', unknown>>()

    // @ts-expect-error - data is required
    void new TestError()
    // @ts-expect-error - data is required
    void new TestError({})
    // @ts-expect-error - invalid data
    void new TestError({ data: { value: 'invalid' } })
    // @ts-expect-error - message must be a string
    void new TestError({ data: { value: 1 }, message: 123 })
  })

  it('options can be omitted when the data schema allows undefined', () => {
    expectTypeOf(new OptionalError()).toEqualTypeOf<ORPCError<'OPTIONAL', { value: number } | undefined>>()
    expectTypeOf(new OptionalError({ data: { value: 1 } })).toEqualTypeOf<ORPCError<'OPTIONAL', { value: number } | undefined>>()
  })

  it('exposes typed static code, message, and data', () => {
    expectTypeOf(TestError.code).toEqualTypeOf<'TEST'>()
    expectTypeOf(TestError.message).toEqualTypeOf<string | undefined>()
    expectTypeOf(TestError.data).toEqualTypeOf<Schema<{ value: number }>>()

    expectTypeOf(SimpleError.code).toEqualTypeOf<'SIMPLE'>()
    expectTypeOf(SimpleError.data).toEqualTypeOf<Schema<unknown>>()
  })

  it('narrows unknown values via instanceof', () => {
    const e = {} as unknown

    if (e instanceof TestError) {
      expectTypeOf(e).toEqualTypeOf<ORPCError<'TEST', { value: number }>>()
    }
  })

  it('can be used as an error map item with its own code', () => {
    const errorMap = {
      [TestError.code]: TestError,
      [SimpleError.code]: SimpleError,
    } satisfies ErrorMap

    expectTypeOf<
      ORPCErrorFromErrorMap<typeof errorMap>
    >().toEqualTypeOf<
      | ORPCError<'TEST', { value: number }>
      | ORPCError<'SIMPLE', unknown>
    >()
  })
})

describe('ORPCErrorConstructorMap', () => {
  const errorMap = {
    BASE: {
      data: z.object({ output: z.number() }),
    },
    OVERRIDE: {
      data: z.object({ output: z.number() }).optional(),
    },
  } satisfies ErrorMap

  const constructors = {} as ORPCErrorConstructorMap<typeof errorMap>

  it('constructs typed ORPCError instances', () => {
    expectTypeOf(constructors.BASE({ data: { output: 123 } })).toEqualTypeOf<ORPCError<'BASE', { output: number }>>()
    expectTypeOf(constructors.BASE({ data: { output: 123 }, message: 'custom', cause: 'cause' })).toEqualTypeOf<ORPCError<'BASE', { output: number }>>()

    // @ts-expect-error - invalid data
    constructors.BASE({ data: { output: '123' } })
    // @ts-expect-error - missing data
    constructors.BASE()
    // @ts-expect-error - code not defined in the map
    constructors.NOT_DEFINED()
  })

  it('options can be omitted when the data schema allows undefined', () => {
    expectTypeOf(constructors.OVERRIDE()).toEqualTypeOf<ORPCError<'OVERRIDE', { output: number } | undefined>>()
    expectTypeOf(constructors.OVERRIDE({ data: { output: 123 } })).toEqualTypeOf<ORPCError<'OVERRIDE', { output: number } | undefined>>()
  })

  it('uses the map key as the error code for error factory items', () => {
    const FactoryError = error('FACTORY', {
      data: z.object({ output: z.number() }),
    })

    const factoryErrorMap = {
      [FactoryError.code]: FactoryError,
    } satisfies ErrorMap

    const factoryConstructors = {} as ORPCErrorConstructorMap<typeof factoryErrorMap>

    expectTypeOf(factoryConstructors.FACTORY({ data: { output: 123 } })).toEqualTypeOf<ORPCError<'FACTORY', { output: number }>>()
  })
})
