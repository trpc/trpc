import { override } from './proxy'

describe('override', () => {
  it('should combine properties from both target and overlay (overlay takes precedence)', () => {
    const target = { a: 1, b: 2, c: 3 }
    const overlay = { a: 10, d: 40 }
    const proxy = override(target, overlay)

    expect(proxy.a).toBe(10) // from overlay (overridden)
    expect(proxy.b).toBe(2) // from target
    expect(proxy.c).toBe(3) // from target
    expect(proxy.d).toBe(40) // from overlay

    expect('a' in proxy).toBe(true)
    expect('b' in proxy).toBe(true)
    expect('c' in proxy).toBe(true)
    expect('d' in proxy).toBe(true)
    expect('not_exists' in proxy).toBe(false)

    expect(Object.keys(proxy)).toEqual(['a', 'b', 'c'])
    expect(Object.getPrototypeOf(proxy)).toBe(Object.getPrototypeOf(target))
  })

  it('should handle method overriding correctly', () => {
    const target = {
      name: 'target',
      getName1() { return `target: ${this.name}` },
      getName2() { return `target: ${this.name}` },
    }
    const overlay = {
      name: 'overlay',
      getName2() { return `overlay: ${this.name}` },
    }
    const proxy = override(target, overlay)

    expect(proxy.getName1()).toBe('target: target')
    expect(proxy.getName2()).toBe('overlay: overlay')
  })

  it('usable for async generator', async () => {
    // async generator require .bind method to make it usable

    const target = (async function* () {
      yield 1
      yield 2
    }())

    ;(target as any)[Symbol.for('TEST')] = true

    const proxy = override(target, (async function* () {
      yield 3
      yield 4
    }()))

    expect((proxy as any)[Symbol.for('TEST')]).toBe(true)
    expect(await proxy.next()).toEqual({ done: false, value: 3 })
    expect(await proxy.next()).toEqual({ done: false, value: 4 })
    expect(await proxy.next()).toEqual({ done: true, value: undefined })
  })

  describe('lazy target', () => {
    it('should combine properties from both target and overlay (overlay takes precedence)', () => {
      const target = vi.fn(() => ({ a: 1, b: 2, c: 3 }))
      const overlay = { a: 10, d: 40 }
      const proxy = override(target, overlay)

      expect(proxy.a).toBe(10) // from overlay (overridden)
      expect(proxy.b).toBe(2) // from target
      expect(proxy.c).toBe(3) // from target
      expect(proxy.d).toBe(40) // from overlay

      expect('a' in proxy).toBe(true)
      expect('b' in proxy).toBe(true)
      expect('c' in proxy).toBe(true)
      expect('d' in proxy).toBe(true)
      expect('not_exists' in proxy).toBe(false)

      expect(target).toHaveBeenCalledTimes(5)
      target.mockReturnValue({ e: 50 } as any)

      expect(proxy.a).toBe(10) // from overlay (overridden)
      expect((proxy as any).e).toBe(50) // from target
      expect('b' in proxy).toBe(false)
      expect('c' in proxy).toBe(false)
    })

    it('should handle method overriding correctly', () => {
      const target = vi.fn(() => ({
        name: 'target',
        getName1() { return `target: ${this.name}` },
        getName2() { return `target: ${this.name}` },
      }))
      const overlay = {
        name: 'overlay',
        getName2() { return `overlay: ${this.name}` },
      }
      const proxy = override(target, overlay)

      expect(proxy.getName1()).toBe('target: target')
      expect(proxy.getName2()).toBe('overlay: overlay')

      expect(target).toHaveBeenCalledTimes(1)
      target.mockReturnValue({
        name: 'target2',
        getName1() { return `target: ${this.name}` },
        getName2() { return `target: ${this.name}` },
      })

      expect(proxy.getName1()).toBe('target: target2')
      expect(proxy.getName2()).toBe('overlay: overlay')
    })

    it('target can be dynamic', () => {
      const target = vi.fn(() => ({ a: 1 }))
      const overlay = { b: 10 }
      const proxy = override(target, overlay)

      expect(proxy.a).toBe(1)
      expect(proxy.b).toBe(10)
      expect(target).toHaveBeenCalledTimes(1)

      target.mockReturnValue({ a: 2 })
      expect(proxy.a).toBe(2)
      expect(proxy.b).toBe(10)
      expect(target).toHaveBeenCalledTimes(2)
    })
  })
})
