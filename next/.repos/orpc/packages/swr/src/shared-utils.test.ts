import { SharedUtils } from './shared-utils'

describe('sharedUtils', () => {
  const utils = new SharedUtils(['test', 'path'], {})

  describe('.matcher', () => {
    it('strategy=partial', () => {
      expect(utils.matcher()([['test', 'path'], { input: { value1: 'test' } }])).toBe(true)
      expect(utils.matcher()([['test', 'path'], {}])).toBe(true)
      expect(utils.matcher()([['invalid'], { input: { value1: 'test' } }])).toBe(false)

      expect(utils.matcher({ input: { value1: true } })([['test', 'path'], { input: { value1: true, value2: true } }])).toBe(true)
      expect(utils.matcher({ input: { value1: true } })([['test', 'path'], { input: { value1: false, value2: true } }])).toBe(false)
    })

    it('strategy=exact', () => {
      expect(utils.matcher({ strategy: 'exact', input: { value1: 'test' } })([['test', 'path'], { input: { value1: 'test' } }])).toBe(true)
      expect(utils.matcher({ strategy: 'exact' })([['test', 'path'], { input: { value1: 'test' } }])).toBe(false)
      expect(utils.matcher({ strategy: 'exact', input: { value1: 'test' } })([['invalid'], { input: { value1: 'test' } }])).toBe(false)
    })

    it('matches dates in the input by time', () => {
      const key = [['test', 'path'], { input: { since: new Date('2024-01-01') } }]

      expect(utils.matcher({ input: { since: new Date('2024-01-01') } })(key)).toBe(true)
      expect(utils.matcher({ strategy: 'exact', input: { since: new Date('2024-01-01') } })(key)).toBe(true)
      expect(utils.matcher({ input: { since: new Date('2024-01-02') } })(key)).toBe(false)
    })

    it('with prefix', () => {
      const prefixedUtils = new SharedUtils(['test', 'path'], { prefix: '__prefix__' })

      expect(prefixedUtils.matcher()(['__prefix__', ['test', 'path'], { input: { value1: 'test' } }])).toBe(true)
      expect(prefixedUtils.matcher()([['test', 'path'], { input: { value1: 'test' } }])).toBe(false)
      expect(prefixedUtils.matcher()(['__invalid__', ['test', 'path'], { input: { value1: 'test' } }])).toBe(false)

      expect(prefixedUtils.matcher({ strategy: 'exact', input: { value1: 'test' } })(['__prefix__', ['test', 'path'], { input: { value1: 'test' } }])).toBe(true)
      expect(prefixedUtils.matcher({ strategy: 'exact' })(['__prefix__', ['test', 'path'], { input: { value1: 'test' } }])).toBe(false)
    })
  })
})
