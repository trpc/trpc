import { Lazy, unlazy } from './lazy'

describe('lazy', () => {
  const meta = { title: 'test' }
  const loader = async () => ({ default: 'hello' })
  const lazy = new Lazy({ meta, loader })

  describe('instanceof', () => {
    it('support both instanceof and structural check', async () => {
      expect(lazy).toBeInstanceOf(Lazy)
      expect({ '~orpc': lazy['~orpc'] }).toBeInstanceOf(Lazy)

      expect(null).not.toBeInstanceOf(Lazy)
      expect(undefined).not.toBeInstanceOf(Lazy)
      expect({}).not.toBeInstanceOf(Lazy)
      expect({ '~orpc': {} }).not.toBeInstanceOf(Lazy)
      expect({ '~orpc': { ...lazy['~orpc'], meta: 'invalid' } }).not.toBeInstanceOf(Lazy)
      expect({ '~orpc': { ...lazy['~orpc'], loader: 'invalid' } }).not.toBeInstanceOf(Lazy)
      expect({ '~orpc': { ...lazy['~orpc'], metaPlugins: 'invalid' } }).not.toBeInstanceOf(Lazy)

      expect({
        '~orpc': {
          ...lazy['~orpc'],
          metaPlugins: [{ name: 'test', apply: () => {} }],
        },
      }).toBeInstanceOf(Lazy)
    })

    it('not support structural for extended class', () => {
      class ExtendedLazy extends Lazy<any> {}

      const extendedLazy = new ExtendedLazy({ meta, loader })

      expect(extendedLazy).toBeInstanceOf(Lazy)
      expect(extendedLazy).toBeInstanceOf(ExtendedLazy)

      expect({ '~orpc': extendedLazy['~orpc'] }).toBeInstanceOf(Lazy)
      expect({ '~orpc': extendedLazy['~orpc'] }).not.toBeInstanceOf(ExtendedLazy)
    })
  })
})

describe('unlazy', () => {
  it('with non-lazy value', async () => {
    const val = { foo: 'bar' }
    await expect(unlazy(val)).resolves.toEqual({ default: val })
  })

  it('with lazy value', async () => {
    const loader = vi.fn().mockResolvedValue({ default: 'hello' })
    const lazy = new Lazy({ meta: {}, loader })
    await expect(unlazy(lazy)).resolves.toEqual({ default: 'hello' })
    expect(loader).toHaveBeenCalledTimes(1)
  })
})
