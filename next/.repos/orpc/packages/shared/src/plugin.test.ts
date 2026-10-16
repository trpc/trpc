import type { OrderablePlugin } from './plugin'
import { sortPlugins } from './plugin'

describe('sortPlugins', () => {
  it('should handle empty array and single plugin', () => {
    expect(sortPlugins([])).toEqual([])
    expect(sortPlugins([{ name: 'a' }])).toEqual([{ name: 'a' }])
  })

  it('should preserve order when no dependencies', () => {
    const plugins = [{ name: 'a' }, { name: 'b' }, { name: 'c' }]
    expect(sortPlugins(plugins)).toEqual(plugins)
  })

  it('should sort with simple before/after constraints', () => {
    const withBefore = [{ name: 'b' }, { name: 'a', before: ['b'] }, { name: 'c' }]
    expect(sortPlugins(withBefore)).toEqual([withBefore[1], withBefore[0], withBefore[2]])

    const withAfter = [{ name: 'c' }, { name: 'b', after: ['a'] }, { name: 'a' }]
    expect(sortPlugins(withAfter)).toEqual([withAfter[0], withAfter[2], withAfter[1]])
  })

  it('should handle multiple before/after constraints', () => {
    const multipleBefore = [{ name: 'c' }, { name: 'b' }, { name: 'a', before: ['b', 'c'] }]
    expect(sortPlugins(multipleBefore)).toEqual([multipleBefore[2], multipleBefore[0], multipleBefore[1]])

    const multipleAfter = [{ name: 'c', after: ['a', 'b'] }, { name: 'a' }, { name: 'b' }]
    expect(sortPlugins(multipleAfter)).toEqual([multipleAfter[1], multipleAfter[2], multipleAfter[0]])
  })

  it('should handle mixed before and after constraints', () => {
    const plugins = [
      { name: 'logging', after: ['handler'] },
      { name: 'handler' },
      { name: 'auth', before: ['handler'] },
    ]
    expect(sortPlugins(plugins)).toEqual([plugins[2], plugins[1], plugins[0]])
  })

  it('should handle complex middleware-style pipeline', () => {
    const plugins = [
      { name: 'auth', before: ['handler'] },
      { name: 'handler' },
      { name: 'validation', before: ['handler'] },
      { name: 'logging', after: ['handler'] },
      { name: 'cors', before: ['auth', 'validation'] },
    ]
    expect(sortPlugins(plugins)).toEqual([plugins[4], plugins[0], plugins[2], plugins[1], plugins[3]])
  })

  it('should handle diamond dependency pattern', () => {
    const plugins = [
      { name: 'd', after: ['b', 'c'] },
      { name: 'b', after: ['a'] },
      { name: 'c', after: ['a'] },
      { name: 'a' },
    ]
    const result = sortPlugins(plugins)
    expect(result).toEqual([plugins[3], plugins[1], plugins[2], plugins[0]])
  })

  it('should handle chain dependencies', () => {
    const plugins = [
      { name: 'e', after: ['d'] },
      { name: 'd', after: ['c'] },
      { name: 'c', after: ['b'] },
      { name: 'b', after: ['a'] },
      { name: 'a' },
    ]
    expect(sortPlugins(plugins)).toEqual([plugins[4], plugins[3], plugins[2], plugins[1], plugins[0]])
  })

  it('should handle partial ordering with independent groups', () => {
    const plugins = [
      { name: 'b' },
      { name: 'a', before: ['b'] },
      { name: 'y' },
      { name: 'x', before: ['y'] },
      { name: 'z' },
    ]
    const result = sortPlugins(plugins)
    expect(result).toEqual([plugins[1], plugins[0], plugins[3], plugins[2], plugins[4]])
  })

  it('should handle star/hub pattern (one plugin depends on many)', () => {
    const plugins = [
      { name: 'final', after: ['a', 'b', 'c', 'd'] },
      { name: 'a' },
      { name: 'b' },
      { name: 'c' },
      { name: 'd' },
    ]
    const result = sortPlugins(plugins)
    expect(result).toEqual([plugins[1], plugins[2], plugins[3], plugins[4], plugins[0]])
  })

  it('should handle reverse star pattern (many plugins depend on one)', () => {
    const plugins = [
      { name: 'init' },
      { name: 'a', after: ['init'] },
      { name: 'b', after: ['init'] },
      { name: 'c', after: ['init'] },
      { name: 'd', after: ['init'] },
    ]
    const result = sortPlugins(plugins)
    expect(result).toEqual(plugins)
  })

  it('should ignore unknown plugin ids without throwing', () => {
    const plugins = [
      { name: 'a', before: ['unknown1'], after: ['unknown2'] },
      { name: 'b' },
    ]
    expect(() => sortPlugins(plugins)).not.toThrow()
  })

  it('should preserve custom plugin properties', () => {
    interface CustomPlugin extends OrderablePlugin {
      metadata?: { value: number }
    }
    const plugins: CustomPlugin[] = [
      { name: 'b', metadata: { value: 1 } },
      { name: 'a', metadata: { value: 2 }, before: ['b'] },
    ]
    const result = sortPlugins(plugins)
    expect(result[0]!.metadata).toEqual({ value: 2 })
    expect(result[1]!.metadata).toEqual({ value: 1 })
  })

  it('should support a plugin used multiple times', () => {
    const plugin1 = { name: 'plugin1' }
    const plugins = [
      plugin1,
      { name: 'plugin2', before: ['plugin1'] },
      plugin1,
    ]

    const result = sortPlugins(plugins)
    expect(result).toEqual([plugins[1], plugins[0], plugins[2]])
  })

  it('should keep registration order among plugins with no relative constraints', () => {
    const declaredOutOfOrder = [{ name: 'c', after: ['b', 'a'] }, { name: 'a' }, { name: 'b' }]
    expect(sortPlugins(declaredOutOfOrder)).toEqual([declaredOutOfOrder[1], declaredOutOfOrder[2], declaredOutOfOrder[0]])

    const beforeDeclaredOutOfOrder = [{ name: 'a' }, { name: 'b' }, { name: 'c', before: ['b', 'a'] }]
    expect(sortPlugins(beforeDeclaredOutOfOrder)).toEqual([beforeDeclaredOutOfOrder[2], beforeDeclaredOutOfOrder[0], beforeDeclaredOutOfOrder[1]])

    const unrelatedAfterMovedPlugin = [{ name: 'b' }, { name: 'c' }, { name: 'a', before: ['b'] }, { name: 'd' }]
    expect(sortPlugins(unrelatedAfterMovedPlugin)).toEqual([unrelatedAfterMovedPlugin[1], unrelatedAfterMovedPlugin[2], unrelatedAfterMovedPlugin[0], unrelatedAfterMovedPlugin[3]])
  })

  it('should not depend on where an unrelated plugin sits in the array', () => {
    const tracing = { name: 'tracing' }
    const optOut = { name: 'opt-out', after: ['tracing'] }
    const plain = { name: 'plain' }

    expect(sortPlugins([plain, optOut, tracing]).map(p => p.name)).toEqual(['plain', 'tracing', 'opt-out'])
    expect(sortPlugins([optOut, plain, tracing]).map(p => p.name)).toEqual(['plain', 'tracing', 'opt-out'])
  })

  it('should detect circular dependencies', () => {
    const directCircle = [
      { name: 'a', before: ['b'] },
      { name: 'b', before: ['a'] },
    ]
    expect(() => sortPlugins(directCircle)).toThrow(/circular dependency/i)

    const indirectCircle = [
      { name: 'a', before: ['b'] },
      { name: 'b', before: ['c'] },
      { name: 'c', before: ['a'] },
    ]
    expect(() => sortPlugins(indirectCircle)).toThrow(/circular dependency/i)

    const selfReference = [{ name: 'a', before: ['a'] }]
    expect(() => sortPlugins(selfReference)).toThrow(/circular dependency/i)
  })

  it('should detect subtle circular dependencies', () => {
    const plugins = [
      { name: 'a', before: ['b'], after: ['c'] },
      { name: 'b', before: ['c'] },
      { name: 'c', after: ['b'] }, // Creates: a->b->c and c->b (circular)
    ]
    expect(() => sortPlugins(plugins)).toThrow(/circular dependency/i)
  })

  it('should name a plugin that is part of the cycle, not one merely waiting on it', () => {
    const plugins = [
      { name: 'bystander', after: ['a'] },
      { name: 'a', before: ['b'] },
      { name: 'b', before: ['a'] },
    ]

    expect(() => sortPlugins(plugins)).toThrow(/"a"|"b"/)
    expect(() => sortPlugins(plugins)).not.toThrow(/bystander/)
  })
})
