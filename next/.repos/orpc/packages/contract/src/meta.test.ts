import type { AnyMetaPlugin } from './meta'
import { getHiddenMetaPlugins, setHiddenMetaPlugins } from './meta'

describe('getHiddenMetaPlugins', () => {
  const metaPlugins: AnyMetaPlugin[] = [
    {
      name: 'plugin',
      init: meta => ({ ...meta, enabled: true }),
    },
  ]

  it('returns undefined for non-typescript objects', () => {
    expect(getHiddenMetaPlugins(undefined)).toBeUndefined()
    expect(getHiddenMetaPlugins(null)).toBeUndefined()
    expect(getHiddenMetaPlugins('value')).toBeUndefined()
    expect(getHiddenMetaPlugins(123)).toBeUndefined()
    expect(getHiddenMetaPlugins(true)).toBeUndefined()
  })

  it('returns previously assigned hidden meta plugins', () => {
    const container = {}

    setHiddenMetaPlugins(container, metaPlugins)

    expect(getHiddenMetaPlugins(container)).toBe(metaPlugins)
  })
})
