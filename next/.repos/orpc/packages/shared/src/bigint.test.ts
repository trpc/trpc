import { parseBigIntString } from './bigint'

it('parseBigIntString', () => {
  expect(parseBigIntString('0', 10)).toBe(0n)

  // `BigInt()` accepts these, but `bigint.toString()` never produces them
  for (const value of ['0x10', '0o7', '0b1', '', ' ', ' 1 ', '1\n', '+1', '01', '-', '1e3', '1.0', '1n']) {
    expect(parseBigIntString(value, 10)).toBeUndefined()
  }

  // the leading `-` does not count as a digit
  expect(parseBigIntString('999', 3)).toBe(999n)
  expect(parseBigIntString('-999', 3)).toBe(-999n)
  expect(parseBigIntString('1000', 3)).toBeUndefined()
  expect(parseBigIntString('-1000', 3)).toBeUndefined()

  expect(parseBigIntString('9'.repeat(10_000), Number.POSITIVE_INFINITY)).toBe(BigInt('9'.repeat(10_000)))
})
