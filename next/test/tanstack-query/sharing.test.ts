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
  const next = { ...make(), at: new Date(5) };
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
  const next = { m: new Map([['x', 2]]), s: new Set([2]), money: new Money(1) };
  const shared = structuralSharing(prev, next);
  expect(shared.m).toBe(next.m);
  expect(shared.s).toBe(next.s);
  expect(shared.money).toBe(next.money);
});
