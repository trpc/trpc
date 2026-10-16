import * as arktype from 'arktype'
import * as v from 'valibot'
import z from 'zod'
import { isSchemaIssue, type } from './schema-utils'

describe('type', async () => {
  it('without map', async () => {
    const schema = type()
    const val = {}
    expect((await schema['~standard'].validate(val) as any).value).toBe(val)
  })

  it('with map', async () => {
    const val = {}
    const check = vi.fn().mockReturnValueOnce('__mapped__')
    const schema = type(check)
    expect((await schema['~standard'].validate(val) as any).value).toBe('__mapped__')
    expect(check).toHaveBeenCalledWith(val)
  })
})

describe('isSchemaIssue', async () => {
  it('works', () => {
    expect(isSchemaIssue({ message: 'hi' })).toBe(true)
    expect(isSchemaIssue({ message: 'hi', path: [] })).toBe(true)
    expect(isSchemaIssue({ message: 'hi', path: ['a', 1] })).toBe(true)
    expect(isSchemaIssue({ message: 'hi', path: [{ key: 'a' }, { key: 1 }] })).toBe(true)
    expect(isSchemaIssue({ message: 'hi', path: [{ key: 'a' }, 'b'] })).toBe(true)

    expect(isSchemaIssue({})).toBe(false)
    expect(isSchemaIssue({ message: 123 })).toBe(false)
    expect(isSchemaIssue({ message: 'hi', path: 'invalid' })).toBe(false)
    expect(isSchemaIssue({ message: 'hi', path: [{}] })).toBe(false)
  })

  it.each([
    ['zod', z.object({ a: z.number() })],
    ['valibot', v.object({ a: v.number() })],
    ['arktype', arktype.type({ a: 'number' })],
  ])('with schema: $0', async (name, schema) => {
    const { issues } = await schema['~standard'].validate({ a: 'invalid' })
    expect(issues?.every(isSchemaIssue)).toBe(true)
  })
})
