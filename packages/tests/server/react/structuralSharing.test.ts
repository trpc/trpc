import { replaceEqualDeep } from '@trpc/react-query';
import { parse, stringify } from 'superjson';

test('identical plain object', async () => {
  const data = { a: 1, b: 2 };
  const oldResult = parse(stringify(data));
  const newResult = parse(stringify(data));

  expect(replaceEqualDeep(oldResult, newResult)).toBe(oldResult);
});

test('different plain objects', async () => {
  const oldResult = parse(stringify({ a: 1, b: 2 }));
  const newResult = parse(stringify({ a: 1, b: 'a' }));

  expect(replaceEqualDeep(oldResult, newResult)).not.toBe(oldResult);
});

test('nested plain objects - fully identical', async () => {
  const oldResult = parse<{ a: number; b: { c: number } }>(
    stringify({ a: 1, b: { c: 2 } }),
  );
  const newResult = parse<{ a: number; b: { c: number } }>(
    stringify({ a: 1, b: { c: 2 } }),
  );

  expect(replaceEqualDeep(oldResult, newResult)).toBe(oldResult);
});

test('nested plain objects - same nested object', async () => {
  const oldResult = parse<{ a: number; b: { c: number } }>(
    stringify({ a: 1, b: { c: 3 } }),
  );
  const newResult = parse<{ a: number; b: { c: number } }>(
    stringify({ a: 2, b: { c: 3 } }),
  );

  expect(replaceEqualDeep(oldResult, newResult)).not.toBe(oldResult);
  expect(replaceEqualDeep(oldResult, newResult).b).toBe(oldResult.b);
});

test('stable for dates - identical', async () => {
  const date = new Date('2024-04-01');
  const oldResult = parse(stringify({ a: date }));
  const newResult = parse(stringify({ a: date }));

  expect(replaceEqualDeep(oldResult, newResult)).toBe(oldResult);
});

test('stable for dates - different', async () => {
  const unchangedObj = { nested: { value: 42 } };
  const oldResult = parse<{ a: Date; b: { nested: { value: number } } }>(
    stringify({ a: new Date('2024-04-01'), b: unchangedObj }),
  );
  const newResult = parse<{ a: Date; b: { nested: { value: number } } }>(
    stringify({ a: new Date('2024-04-02'), b: unchangedObj }),
  );

  expect(replaceEqualDeep(oldResult, newResult)).not.toBe(oldResult);
  expect(replaceEqualDeep(oldResult, newResult).b).toBe(oldResult.b);
});

test('stable for maps - identical', async () => {
  const map = new Map<unknown, unknown>([
    ['a', 1],
    [3, 'foo'],
  ]);
  const oldResult = parse(stringify({ a: map }));
  const newResult = parse(stringify({ a: map }));

  expect(replaceEqualDeep(oldResult, newResult)).toBe(oldResult);
});

test('stable for maps - different order is still equal', async () => {
  const map = new Map<unknown, unknown>([
    ['a', 1],
    [3, 'foo'],
  ]);
  const oldResult = parse(stringify({ a: map }));
  const newResult = parse(
    stringify({
      a: new Map<unknown, unknown>([
        [3, 'foo'],
        ['a', 1],
      ]),
    }),
  );

  expect(replaceEqualDeep(oldResult, newResult)).toBe(oldResult);
});

test('stable for maps - different keys are not equal', async () => {
  const unchangedObj = { nested: { value: 42 } };
  const oldResult = parse<{
    a: Map<string, number>;
    b: { nested: { value: number } };
  }>(stringify({ a: new Map([['a', 1]]), b: unchangedObj }));
  const newResult = parse<{
    a: Map<string, number>;
    b: { nested: { value: number } };
  }>(stringify({ a: new Map([['b', 1]]), b: unchangedObj }));

  expect(replaceEqualDeep(oldResult, newResult)).not.toBe(oldResult);
  expect(replaceEqualDeep(oldResult, newResult).b).toBe(oldResult.b);
});

test('stable for sets - identical', async () => {
  const set = new Set([1, 2, 3]);
  const oldResult = parse(stringify({ a: set }));
  const newResult = parse(stringify({ a: set }));

  expect(replaceEqualDeep(oldResult, newResult)).toBe(oldResult);
});

test('stable for sets - different order is still equal', async () => {
  const set = new Set([1, 2, 3]);
  const oldResult = parse(stringify({ a: set }));
  const newResult = parse(stringify({ a: new Set([3, 2, 1]) }));

  expect(replaceEqualDeep(oldResult, newResult)).toBe(oldResult);
});

test('stable for sets - different values are not equal', async () => {
  const unchangedObj = { nested: { value: 42 } };
  const oldResult = parse<{ a: Set<number>; b: { nested: { value: number } } }>(
    stringify({ a: new Set([1]), b: unchangedObj }),
  );
  const newResult = parse<{ a: Set<number>; b: { nested: { value: number } } }>(
    stringify({ a: new Set([2]), b: unchangedObj }),
  );

  expect(replaceEqualDeep(oldResult, newResult)).not.toBe(oldResult);
  expect(replaceEqualDeep(oldResult, newResult).b).toBe(oldResult.b);
});

test('stable for BigInts - identical', async () => {
  const oldResult = parse(stringify({ a: BigInt(1) }));
  const newResult = parse(stringify({ a: BigInt(1) }));

  expect(replaceEqualDeep(oldResult, newResult)).toBe(oldResult);
});

test('stable for BigInts - different values are not equal', async () => {
  const unchangedObj = { nested: { value: 42 } };
  const oldResult = parse<{ a: bigint; b: { nested: { value: number } } }>(
    stringify({ a: BigInt(1), b: unchangedObj }),
  );
  const newResult = parse<{ a: bigint; b: { nested: { value: number } } }>(
    stringify({ a: BigInt(2), b: unchangedObj }),
  );

  expect(replaceEqualDeep(oldResult, newResult)).not.toBe(oldResult);
  expect(replaceEqualDeep(oldResult, newResult).b).toBe(oldResult.b);
});
