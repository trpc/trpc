import { loadBytes, toStringOrBytes } from './buffer'

it('loadBytes', async () => {
  const blob = new Blob(['test'], { type: 'text/plain' })

  expect(new TextDecoder().decode(await loadBytes(blob))).toBe('test')
  expect(new TextDecoder().decode(await loadBytes(new Proxy(blob, {
    get: (target, prop) => {
      if (prop === 'bytes') {
        return undefined
      }
      return Reflect.get(target, prop)
    },
  })))).toBe('test')

  expect(new TextDecoder().decode(await loadBytes((new Response(blob) as any)))).toBe('test')
})

describe('toStringOrBytes', () => {
  it('string passthrough', () => {
    expect(toStringOrBytes('test')).toBe('test')
  })

  it('arrayBuffer', () => {
    const input = new TextEncoder().encode('test').buffer
    const result = toStringOrBytes(input)
    expect(result).toBeInstanceOf(Uint8Array)
    expect(new TextDecoder().decode(result as Uint8Array)).toBe('test')
  })

  it('uint8Array passthrough', () => {
    const input = new Uint8Array([0, 1, 2, 3])
    const result = toStringOrBytes(input)
    expect(result).toBe(input) // should be the same instance
  })

  it('uint8Array view-like input', () => {
    const bytes = new Uint8Array([0, 1, 2, 3]).subarray(1, 3)
    const input: Pick<Uint8Array<ArrayBuffer>, 'buffer' | 'byteOffset' | 'byteLength'> = {
      buffer: bytes.buffer,
      byteOffset: bytes.byteOffset,
      byteLength: bytes.byteLength,
    }

    const result = toStringOrBytes(input)
    expect(result).toBeInstanceOf(Uint8Array)
    expect(result).not.toBe(bytes) // should be a different view, not the original input
    expect(result).toEqual(bytes)
  })

  describe('array input', () => {
    it('all-string array concatenates to bytes (UTF-8 encoded)', () => {
      const result = toStringOrBytes(['te', 'st'])
      expect(result).toBeInstanceOf(Uint8Array)
      expect(new TextDecoder().decode(result as Uint8Array)).toBe('test')
    })

    it('single-string array concatenates to bytes', () => {
      const result = toStringOrBytes(['solo'])
      expect(result).toBeInstanceOf(Uint8Array)
      expect(new TextDecoder().decode(result as Uint8Array)).toBe('solo')
    })

    it('empty array returns empty Uint8Array', () => {
      const result = toStringOrBytes([])
      expect(result).toBeInstanceOf(Uint8Array)
      expect((result as Uint8Array).byteLength).toBe(0)
    })

    it('array of ArrayBuffers concatenates to bytes', () => {
      const a = new TextEncoder().encode('ab').buffer
      const b = new TextEncoder().encode('cd').buffer
      const result = toStringOrBytes([a, b])
      expect(result).toBeInstanceOf(Uint8Array)
      expect(new TextDecoder().decode(result as Uint8Array)).toBe('abcd')
    })

    it('array of Uint8Arrays concatenates to bytes', () => {
      const a = new Uint8Array([1, 2])
      const b = new Uint8Array([3, 4])
      const result = toStringOrBytes([a, b])
      expect(result).toBeInstanceOf(Uint8Array)
      expect(result).toEqual(new Uint8Array([1, 2, 3, 4]))
    })

    it('array of byte-view-like objects concatenates to bytes', () => {
      const source = new Uint8Array([9, 8, 7, 6])
      const view: Pick<Uint8Array<ArrayBuffer>, 'buffer' | 'byteOffset' | 'byteLength'> = {
        buffer: source.buffer,
        byteOffset: 1,
        byteLength: 2,
      }
      const result = toStringOrBytes([view])
      expect(result).toBeInstanceOf(Uint8Array)
      expect(result).toEqual(new Uint8Array([8, 7]))
    })

    it('mixed array (strings + bytes) concatenates to bytes, UTF-8 encoding strings', () => {
      const result = toStringOrBytes(['te', new Uint8Array([0x73, 0x74])]) // 'st'
      expect(result).toBeInstanceOf(Uint8Array)
      expect(new TextDecoder().decode(result as Uint8Array)).toBe('test')
    })

    it('mixed array preserves item order across all byte-like variants', () => {
      const strPart = 'a' // 1 byte
      const bufPart = new TextEncoder().encode('b').buffer // 1 byte
      const u8Part = new Uint8Array([0x63]) // 'c', 1 byte
      const source = new Uint8Array([0x64, 0x65]) // 'd', 'e'
      const viewPart: Pick<Uint8Array<ArrayBuffer>, 'buffer' | 'byteOffset' | 'byteLength'> = {
        buffer: source.buffer,
        byteOffset: 0,
        byteLength: 1,
      } // 'd'

      const result = toStringOrBytes([strPart, bufPart, u8Part, viewPart])
      expect(new TextDecoder().decode(result as Uint8Array)).toBe('abcd')
    })

    it('mixed array with multi-byte UTF-8 string encodes correctly', () => {
      const result = toStringOrBytes(['€', new Uint8Array([0x21])]) // '€' is 3 bytes in UTF-8, then '!'
      const expectedBytes = new Uint8Array([...new TextEncoder().encode('€'), 0x21])
      expect(result).toEqual(expectedBytes)
    })
  })
})
