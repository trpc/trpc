enum Test {
  A = 1,
  B = 2,
  C = 'C',
  D = 'D',
}

/**
 * The data types that oRPC/rpc guarantees to be supported.
 */
export const builtInRPCSupportDataTypes: { name: string, value: unknown, expected: unknown }[] = [
  {
    name: 'enum',
    value: Test.B,
    expected: Test.B,
  },
  {
    name: 'string',
    value: 'some-string',
    expected: 'some-string',
  },
  {
    name: 'number',
    value: 123,
    expected: 123,
  },
  {
    name: 'NaN',
    value: Number.NaN,
    expected: Number.NaN,
  },
  {
    name: 'Infinity',
    value: Number.POSITIVE_INFINITY,
    expected: Number.POSITIVE_INFINITY,
  },
  {
    name: '-Infinity',
    value: Number.NEGATIVE_INFINITY,
    expected: Number.NEGATIVE_INFINITY,
  },
  {
    name: 'true',
    value: true,
    expected: true,
  },
  {
    name: 'false',
    value: false,
    expected: false,
  },
  {
    name: 'null',
    value: null,
    expected: null,
  },
  {
    name: 'undefined',
    value: undefined,
    expected: undefined,
  },
  {
    name: 'date',
    value: new Date('2023-01-01'),
    expected: new Date('2023-01-01'),
  },
  {
    name: 'Invalid Date',
    value: new Date('Invalid'),
    expected: new Date('Invalid'),
  },
  {
    name: 'BigInt',
    value: 99999999999999999999999999999n,
    expected: 99999999999999999999999999999n,
  },
  {
    name: 'URL',
    value: new URL('https://dinwwwh.com'),
    expected: new URL('https://dinwwwh.com'),
  },
  {
    name: 'object',
    value: { a: 1, b: 2, c: 3 },
    expected: { a: 1, b: 2, c: 3 },
  },
  {
    name: 'array',
    value: [1, 2, 3],
    expected: [1, 2, 3],
  },
  {
    name: 'map',
    value: new Map([[1, 2], [3, 4]]),
    expected: new Map([[1, 2], [3, 4]]),
  },
  {
    name: 'set',
    value: new Set([1, 2, 3]),
    expected: new Set([1, 2, 3]),
  },
  {
    name: 'blob',
    value: new Blob(['blob'], { type: 'text/plain' }),
    expected: expect.toSatisfy((file: any) => {
      expect(file).toBeInstanceOf(Blob)
      expect(file.type).toBe('text/plain')
      expect(file.size).toBe(4)

      return true
    }),
  },
  {
    name: 'file',
    value: new File(['"name"'], 'file.json', { type: 'application/json' }),
    expected: expect.toSatisfy((file: any) => {
      expect(file).toBeInstanceOf(File)
      expect(file.name).toBe('file.json')
      expect(file.type).toBe('application/json')
      expect(file.size).toBe(6)

      return true
    }),
  },
]
