import { expect, test } from 'vite-plus/test';
import { deepEqual } from './equal.ts';

test('plain data compares by content, objects in any key order', () => {
  expect(
    deepEqual({ a: 1, b: { c: [1, 2] } }, { b: { c: [1, 2] }, a: 1 }),
  ).toBe(true);
  expect(deepEqual([1, 2], [2, 1])).toBe(false);
  expect(deepEqual({ a: 1, b: undefined }, { a: 1 })).toBe(false);
  const holey: unknown[] = [];
  holey[0] = 1;
  holey[2] = 3;
  expect(deepEqual(holey, [1, undefined, 3])).toBe(false);
  expect(deepEqual(0, -0)).toBe(false);
  expect(deepEqual(Number.NaN, Number.NaN)).toBe(true);
  expect(deepEqual(1n, 1n)).toBe(true);
  expect(
    deepEqual(Object.assign(Object.create(null), { a: 1 }), { a: 1 }),
  ).toBe(false);
});

test('built-in types compare by content', () => {
  expect(deepEqual(new Date(1), new Date(1))).toBe(true);
  expect(deepEqual(new Date(1), new Date(2))).toBe(false);
  expect(
    deepEqual(new Map([['a', { n: 1 }]]), new Map([['a', { n: 1 }]])),
  ).toBe(true);
  expect(deepEqual(new Map([['a', 1]]), new Map([['a', 2]]))).toBe(false);
  expect(deepEqual(new Set([1, 2]), new Set([2, 1]))).toBe(true);
  expect(
    deepEqual(new URL('https://a.example/x'), new URL('https://a.example/x')),
  ).toBe(true);
  expect(deepEqual(/a/g, /a/g)).toBe(true);
  expect(deepEqual(/a/g, /a/i)).toBe(false);
  expect(deepEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2]))).toBe(true);
  expect(deepEqual(new Uint8Array([1]), new Int8Array([1]))).toBe(false);
  expect(
    deepEqual(new Headers({ 'X-A': '1' }), new Headers([['x-a', '1']])),
  ).toBe(true);
  expect(
    deepEqual(new URLSearchParams('a=1'), new URLSearchParams('a=2')),
  ).toBe(false);
});

test('sizes and lengths that differ never match', () => {
  expect(deepEqual(null, {})).toBe(false);
  expect(deepEqual([1], [1, 2])).toBe(false);
  expect(deepEqual(new Uint8Array([1]), new Uint8Array([1, 2]))).toBe(false);
  expect(
    deepEqual(new Uint8Array([1]).buffer, new Uint8Array([1]).buffer),
  ).toBe(true);
  expect(deepEqual(new Map([['a', 1]]), new Map())).toBe(false);
  expect(deepEqual(new Set([1]), new Set())).toBe(false);
  const shared: { n: number } = { n: 1 };
  expect(deepEqual([shared, shared], [{ n: 1 }, { n: 1 }])).toBe(true);
});

test('anything else equals only itself', () => {
  class Money {
    readonly cents: number;
    constructor(cents: number) {
      this.cents = cents;
    }
  }
  const file = new File(['a'], 'a.txt');
  expect(deepEqual(file, file)).toBe(true);
  expect(deepEqual(file, new File(['a'], 'a.txt'))).toBe(false);
  expect(deepEqual(new Money(1), new Money(1))).toBe(false);
  expect(deepEqual({ f: () => 1 }, { f: () => 1 })).toBe(false);
  expect(deepEqual(new Set([{ id: 1 }]), new Set([{ id: 1 }]))).toBe(false);
});

test('cycles compare without looping', () => {
  const a: Record<string, unknown> = { n: 1 };
  a['self'] = a;
  const b: Record<string, unknown> = { n: 1 };
  b['self'] = b;
  expect(deepEqual(a, b)).toBe(true);
  b['n'] = 2;
  expect(deepEqual(a, b)).toBe(false);
});
