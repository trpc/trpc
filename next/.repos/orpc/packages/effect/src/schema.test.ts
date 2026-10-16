import { getHiddenMetaPlugins, setHiddenMetaPlugins } from '@orpc/contract'
import { Schema } from 'effect'
import { toStandardSchema } from './schema'

describe('toStandardSchema', () => {
  it('convert to standard schema', () => {
    expect(toStandardSchema(Schema.Number)['~standard'].vendor).toBe('effect')
  })

  it('keep meta plugins', () => {
    const schema = Schema.Number
    const plugin = { name: 'plugin1' }
    setHiddenMetaPlugins(schema, [plugin])

    const converted = toStandardSchema(schema)
    expect(converted['~standard'].vendor).toBe('effect')
    expect(getHiddenMetaPlugins(converted)).toEqual([plugin])
  })
})
