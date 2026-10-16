import type { MergedContext, MergedInitialContext } from './context'
import { expectTypeOf, it } from 'vitest'

describe('MergedInitialContext', () => {
  it('no extra', () => {
    expectTypeOf<MergedInitialContext<{ db: string }, { user: number }, { db: string, user: number }>>().toEqualTypeOf<{ db: string }>()
    expectTypeOf<MergedInitialContext<{ db: string }, { user: number }, { db: string }>>().toEqualTypeOf<{ db: string }>()
    expectTypeOf<MergedInitialContext<{ db: string }, { user: number }, { user: number }>>().toEqualTypeOf<{ db: string }>()
  })

  it('with extra', () => {
    expectTypeOf<MergedInitialContext<{ db: string }, object, { db: string, user: number }>>().toEqualTypeOf<{ db: string } & { user: number }>()
    expectTypeOf<MergedInitialContext<object, object, { db: string }>>().toEqualTypeOf<object & { db: string }>()
    expectTypeOf<MergedInitialContext<{ db: string }, { user: number }, { extra: boolean }>>().toEqualTypeOf<{ db: string } & { extra: boolean }>()
  })

  it('conflict keys (type check is not performed here, just key check)', () => {
    expectTypeOf<MergedInitialContext<{ db: string }, object, { db: number }>>().toEqualTypeOf<{ db: string }>()
  })

  it('keeps unions and known keys of index signatures', () => {
    expectTypeOf<MergedInitialContext<object, object, { kind: 'a', a: string } | { kind: 'b' }>>().toEqualTypeOf<object & ({ kind: 'a', a: string } | { kind: 'b' })>()
    expectTypeOf<MergedInitialContext<object, object, { a: string } | { b: number }>>().toEqualTypeOf<object & ({ a: string } | { b: number })>()
    expectTypeOf<MergedInitialContext<object, object, { [k: string]: unknown, db: string }>>().toEqualTypeOf<object & { [k: string]: unknown, db: string }>()
  })
})

describe('MergedContext', () => {
  it('merges new context', () => {
    expectTypeOf<MergedContext<{ db: string }, { user: number }>>().toEqualTypeOf<{ db: string } & { user: number }>()
    expectTypeOf<MergedContext<object, { user: number }>>().toEqualTypeOf<object & { user: number }>()
  })

  it('overrides existing context', () => {
    expectTypeOf<MergedContext<{ db: string, user: string }, { user: number }>>().toEqualTypeOf<{ db: string } & { user: number }>()
    expectTypeOf<MergedContext<{ user: string }, { user: number }>>().toEqualTypeOf<Omit<object, 'user'> & { user: number }>()
  })

  it('returns current if no new context', () => {
    expectTypeOf<MergedContext<{ db: string }, object>>().toEqualTypeOf<{ db: string }>()
  })

  it('keeps unions and known keys of index signatures', () => {
    expectTypeOf<MergedContext<{ kind: 'a', a: string, user: string } | { kind: 'b', user: string }, { user: number }>>().toEqualTypeOf<({ kind: 'a', a: string } | { kind: 'b' }) & { user: number }>()
    expectTypeOf<MergedContext<{ [k: string]: unknown, db: string }, { user: number }>>().toEqualTypeOf<{ [k: string]: unknown, db: string } & { user: number }>()
  })
})
