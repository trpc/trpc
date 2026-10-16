import type { Client, ORPCError } from '@orpc/client'
import type { RouterContractClient } from '@orpc/contract'
import type { AsyncIteratorClass } from '@orpc/shared'
import type { JsonifiedClient, JsonifiedValue, OpenAPIDocument, OpenAPIV3_0, OpenAPIV3_1, OpenAPIV3_2 } from './types'
import { asyncIteratorObject, oc } from '@orpc/contract'
import z from 'zod'

describe('OpenAPIDocument', () => {
  it('resolves the document type of a version, patch segment ignored', () => {
    expectTypeOf<OpenAPIDocument<'3.0.0'>>().toEqualTypeOf<OpenAPIV3_0.OpenAPIObject>()
    expectTypeOf<OpenAPIDocument<'3.0.4'>>().toEqualTypeOf<OpenAPIV3_0.OpenAPIObject>()
    expectTypeOf<OpenAPIDocument<'3.1.0'>>().toEqualTypeOf<OpenAPIV3_1.OpenAPIObject>()
    expectTypeOf<OpenAPIDocument<'3.1.2'>>().toEqualTypeOf<OpenAPIV3_1.OpenAPIObject>()
    expectTypeOf<OpenAPIDocument<'3.2.0'>>().toEqualTypeOf<OpenAPIV3_2.OpenAPIObject>()
    expectTypeOf<OpenAPIDocument<'3.2.7'>>().toEqualTypeOf<OpenAPIV3_2.OpenAPIObject>()
  })
})

describe('JsonifiedValue', () => {
  it('flat', () => {
    expectTypeOf<JsonifiedValue<string>>().toEqualTypeOf<string>()
    expectTypeOf<JsonifiedValue<number>>().toEqualTypeOf<number>()
    expectTypeOf<JsonifiedValue<boolean>>().toEqualTypeOf<boolean>()
    expectTypeOf<JsonifiedValue<null>>().toEqualTypeOf<null>()
    expectTypeOf<JsonifiedValue<undefined>>().toEqualTypeOf<undefined>()
    expectTypeOf<JsonifiedValue<Date>>().toEqualTypeOf<string>()
    expectTypeOf<JsonifiedValue<bigint>>().toEqualTypeOf<string>()
    expectTypeOf<JsonifiedValue<URL>>().toEqualTypeOf<string>()
    expectTypeOf<JsonifiedValue<File>>().toEqualTypeOf<File>()
    expectTypeOf<JsonifiedValue<Blob>>().toEqualTypeOf<Blob>()
    expectTypeOf<JsonifiedValue<Map<string, number>>>().toEqualTypeOf<[string, number][]>()
    expectTypeOf<JsonifiedValue<Set<number>>>().toEqualTypeOf<number[]>()
    expectTypeOf<JsonifiedValue<Array<number>>>().toEqualTypeOf<number[]>()
    expectTypeOf<JsonifiedValue<ReadonlyMap<string, Date>>>().toEqualTypeOf<[string, string][]>()
    expectTypeOf<JsonifiedValue<ReadonlySet<Date>>>().toEqualTypeOf<string[]>()
    expectTypeOf<JsonifiedValue<readonly Date[]>>().toEqualTypeOf<string[]>()
    expectTypeOf<JsonifiedValue<readonly [Date, undefined]>>().toEqualTypeOf<[string, null]>()
    expectTypeOf<JsonifiedValue<{ a: number, b: Date }>>().toEqualTypeOf<{ a: number, b: string }>()
    expectTypeOf<JsonifiedValue<AsyncIteratorClass<Date, Date>>>().toEqualTypeOf<AsyncIteratorClass<string, string>>()
    expectTypeOf<JsonifiedValue<AsyncGenerator<Date, Date>>>().toEqualTypeOf<AsyncGenerator<string, string>>()
    expectTypeOf<JsonifiedValue<AsyncIteratorObject<Date, Date>>>().toEqualTypeOf<AsyncIteratorObject<string, string>>()

    expectTypeOf<JsonifiedValue<DateConstructor>>().toEqualTypeOf<unknown>()
  })

  it('complex', () => {
    expectTypeOf<
      JsonifiedValue<Set<{ a: number, b: Date, c: [Date, 1, 2, 3, ...Date[]], g: DateConstructor }>>
    >().toEqualTypeOf<
      { a: number, b: string, c: [string, 1, 2, 3, ...string[]], g: unknown }[]
    >()
  })

  it('interface', () => {
    interface User { id: number, createdAt: Date, tags?: Set<string> }
    interface Callable { (): void, a: number }

    expectTypeOf<JsonifiedValue<User>>().toEqualTypeOf<{ id: number, createdAt: string, tags?: string[] }>()
    expectTypeOf<JsonifiedValue<{ user: User, users: User[] }>>().toEqualTypeOf<{
      user: { id: number, createdAt: string, tags?: string[] }
      users: { id: number, createdAt: string, tags?: string[] }[]
    }>()
    expectTypeOf<JsonifiedValue<Callable>>().toEqualTypeOf<unknown>()
  })
})

describe('JsonifiedClient', () => {
  it('leaf-level', () => {
    expectTypeOf<JsonifiedClient<
      Client<{ cache?: boolean }, { now: Date }, { b: Set<Date> }, Error | ORPCError<string, { a: Date }>>
    >>().toEqualTypeOf<
      Client<{ cache?: boolean }, { now: Date }, { b: string[] }, Error | ORPCError<string, { a: string }>>
    >()
  })

  it('interface output', () => {
    interface Output { now: Date }

    expectTypeOf<JsonifiedClient<
      Client<{ cache?: boolean }, { now: Date }, Output, Error>
    >>().toEqualTypeOf<
      Client<{ cache?: boolean }, { now: Date }, { now: string }, Error>
    >()
  })

  it('preserves event iterator yield/return types', () => {
    const contract = oc.output(asyncIteratorObject(z.date(), z.date()))

    expectTypeOf<
      Awaited<ReturnType<JsonifiedClient<RouterContractClient<typeof contract>>>>
    >().toEqualTypeOf<AsyncIteratorClass<string, string>>()
  })

  it('nested', () => {
    expectTypeOf<JsonifiedClient<{
      ping: Client<{ cache?: boolean }, { now: Date }, { b: Set<Date> }, Error | ORPCError<string, { a: Date }>>
      planet: {
        find: Client<{ cache?: boolean }, { now: Date }, { b: Set<Date> }, Error | ORPCError<string, { a: Date }>>
      }
    }>>().toEqualTypeOf<{
      ping: Client<{ cache?: boolean }, { now: Date }, { b: string[] }, Error | ORPCError<string, { a: string }>>
      planet: {
        find: Client<{ cache?: boolean }, { now: Date }, { b: string[] }, Error | ORPCError<string, { a: string }>>
      }
    }>()
  })
})
