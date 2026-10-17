import { structuralSharing } from '@trpc12/tanstack-query';
import { expect, test } from 'vite-plus/test';

const make = () => ({
  at: new Date(0),
  tags: new Set(['a', 'b']),
  scores: new Map([['x', { n: 1 }]]),
  url: new URL('https://trpc.io'),
  bytes: new Uint8Array([1, 2]),
  list: [{ id: 1, at: new Date(1) }],
});

test('equal rich values keep their references', () => {
  const prev = make();
  expect(structuralSharing(prev, make())).toBe(prev);
});

test('only what changed gets a new reference', () => {
  const prev = make();
  const next: typeof prev = { ...make(), at: new Date(5) };
  next.list.push({ id: 2, at: new Date(2) });
  const shared = structuralSharing(prev, next);
  expect(shared).not.toBe(prev);
  expect(shared.at).toBe(next.at);
  expect(shared.tags).toBe(prev.tags);
  expect(shared.scores).toBe(prev.scores);
  expect(shared.url).toBe(prev.url);
  expect(shared.bytes).toBe(prev.bytes);
  expect(shared.list).not.toBe(prev.list);
  expect(shared.list[0]).toBe(prev.list[0]);
  expect(shared).toEqual(next);
});

test('changed maps and sets, and class instances, are replaced', () => {
  class Money {
    readonly cents: number;
    constructor(cents: number) {
      this.cents = cents;
    }
  }
  const prev = { m: new Map([['x', 1]]), s: new Set([1]), money: new Money(1) };
  const next: typeof prev = {
    m: new Map([['x', 2]]),
    s: new Set([2]),
    money: new Money(1),
  };
  const shared = structuralSharing(prev, next);
  expect(shared.m).toBe(next.m);
  expect(shared.s).toBe(next.s);
  expect(shared.money).toBe(next.money);
});

test('nulls, URLs, RegExps, typed arrays, sizes and null-prototype objects', () => {
  const bare = Object.assign(Object.create(null) as object, { a: 1 });
  const prev = {
    gone: { a: 1 } as { a: number } | null,
    url: new URL('https://a.example'),
    re: /a/g,
    flags: /a/g,
    bytes: new Uint8Array([1, 2]),
    longer: new Uint8Array([1]),
    kind: new Uint8Array([1]) as ArrayBufferView,
    m: new Map([['x', 1]]),
    s: new Set([1]),
    bare,
  };
  const next: typeof prev = {
    gone: null,
    url: new URL('https://b.example'),
    re: /a/g,
    flags: /a/i,
    bytes: new Uint8Array([1, 3]),
    longer: new Uint8Array([1, 2]),
    kind: new Int8Array([1]) as ArrayBufferView,
    m: new Map([
      ['x', 1],
      ['y', 2],
    ]),
    s: new Set([1, 2]),
    bare: Object.assign(Object.create(null) as object, { a: 1 }),
  };
  const shared = structuralSharing(prev, next);
  expect(shared.gone).toBeNull();
  expect(shared.url).toBe(next.url);
  expect(shared.re).toBe(prev.re);
  expect(shared.flags).toBe(next.flags);
  expect(shared.bytes).toBe(next.bytes);
  expect(shared.longer).toBe(next.longer);
  expect(shared.kind).toBe(next.kind);
  expect(shared.m).toBe(next.m);
  expect(shared.s).toBe(next.s);
  expect(shared.bare).toBe(prev.bare);
  expect(structuralSharing(null, { a: 1 })).toEqual({ a: 1 });
  expect(structuralSharing({ a: 1 }, 'text')).toBe('text');
});
