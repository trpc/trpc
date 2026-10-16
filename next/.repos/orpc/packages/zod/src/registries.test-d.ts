import * as z from 'zod'
import { JSON_SCHEMA_INPUT_REGISTRY, JSON_SCHEMA_OUTPUT_REGISTRY, JSON_SCHEMA_REGISTRY } from './registries'

const user = z.object({
  name: z.string(),
  age: z.string().transform(v => Number(v)),
})

describe('JSON_SCHEMA_REGISTRY', () => {
  it('accepts both input and output shapes', () => {
    JSON_SCHEMA_REGISTRY.add(user, { examples: [{ name: 'John', age: '20' }] })
    JSON_SCHEMA_REGISTRY.add(user, { examples: [{ name: 'John', age: 20 }] })
    JSON_SCHEMA_REGISTRY.add(user, { default: { name: 'John', age: '20' } })
    JSON_SCHEMA_REGISTRY.add(user, { default: { name: 'John', age: 20 } })

    // @ts-expect-error --- age must match input or output type
    JSON_SCHEMA_REGISTRY.add(user, { examples: [{ name: 'John', age: true }] })
    // @ts-expect-error --- age is required
    JSON_SCHEMA_REGISTRY.add(user, { default: { name: 'John' } })
  })
})

describe('JSON_SCHEMA_INPUT_REGISTRY', () => {
  it('only accepts input shapes', () => {
    JSON_SCHEMA_INPUT_REGISTRY.add(user, { examples: [{ name: 'John', age: '20' }] })
    JSON_SCHEMA_INPUT_REGISTRY.add(user, { default: { name: 'John', age: '20' } })

    // @ts-expect-error --- age must be the input type (string)
    JSON_SCHEMA_INPUT_REGISTRY.add(user, { examples: [{ name: 'John', age: 20 }] })
    // @ts-expect-error --- age must be the input type (string)
    JSON_SCHEMA_INPUT_REGISTRY.add(user, { default: { name: 'John', age: 20 } })
  })
})

describe('JSON_SCHEMA_OUTPUT_REGISTRY', () => {
  it('only accepts output shapes', () => {
    JSON_SCHEMA_OUTPUT_REGISTRY.add(user, { examples: [{ name: 'John', age: 20 }] })
    JSON_SCHEMA_OUTPUT_REGISTRY.add(user, { default: { name: 'John', age: 20 } })

    // @ts-expect-error --- age must be the output type (number)
    JSON_SCHEMA_OUTPUT_REGISTRY.add(user, { examples: [{ name: 'John', age: '20' }] })
    // @ts-expect-error --- age must be the output type (number)
    JSON_SCHEMA_OUTPUT_REGISTRY.add(user, { default: { name: 'John', age: '20' } })
  })
})
