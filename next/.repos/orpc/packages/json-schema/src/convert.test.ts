import type { JsonSchemaConverter } from './convert'
import { type } from '@orpc/contract'
import z from 'zod'
import { DelegatingJsonSchemaConverter } from './convert'

describe('delegatingJsonSchemaConverter', () => {
  it('uses the first matching custom converter', () => {
    const schema = z.object({ value: z.string() })

    const firstConverter: JsonSchemaConverter = {
      condition: vi.fn().mockReturnValue(true),
      convert: vi.fn().mockReturnValue([{ type: 'string' }, false]),
    }

    const secondConverter: JsonSchemaConverter = {
      condition: vi.fn().mockReturnValue(true),
      convert: vi.fn().mockReturnValue([{ type: 'number' }, true]),
    }

    const converter = new DelegatingJsonSchemaConverter([firstConverter, secondConverter])

    expect(converter.convert(schema, 'input')).toEqual([{ type: 'string' }, false])
    expect(firstConverter.condition).toHaveBeenCalledWith(schema, 'input')
    expect(firstConverter.convert).toHaveBeenCalledWith(schema, 'input')
    expect(secondConverter.condition).not.toHaveBeenCalled()
    expect(secondConverter.convert).not.toHaveBeenCalled()
  })

  it('returns an unconstrained optional schema without validating when no converter matches', () => {
    const map = vi.fn((input: number) => input.toString())
    const validate = vi.fn()

    const converter = new DelegatingJsonSchemaConverter([])

    expect(converter.convert(undefined, 'input')).toEqual([{}, true])
    expect(converter.convert(type<number, string>(map), 'input')).toEqual([{}, true])
    expect(converter.convert({ '~standard': { vendor: 'custom', version: 1, validate } }, 'output')).toEqual([{}, true])
    expect(converter.convert(z.string(), 'input')).toEqual([{}, true])

    expect(map).not.toHaveBeenCalled()
    expect(validate).not.toHaveBeenCalled()
  })
})
