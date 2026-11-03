import { describe, expect, it } from '@effect/vitest';
import { Effect, Result } from 'effect';
import { TestClock } from 'effect/testing';

import {
  fakeOpenCollective,
  memberNode,
  openCollectiveData,
  orderNode,
} from './fake-opencollective.ts';
import {
  fetchBackers,
  githubLoginOf,
  openCollectiveUrl,
} from './sponsors-opencollective.ts';

const now = Date.parse('2026-11-03');
const day = 24 * 60 * 60 * 1000;

function failureMessage<A, E extends { readonly message: string }>(
  result: Result.Result<A, E>,
) {
  return Result.isFailure(result) ? result.failure.message : undefined;
}

describe('githubLoginOf', () => {
  it.each([
    ['https://github.com/KATT', 'KATT'],
    ['https://www.github.com/trpc/trpc', 'trpc'],
    ['github.com/KATT/', 'KATT'],
    ['https://gitlab.com/KATT', null],
    ['https://github.com/', null],
    ['not a url', null],
  ])('%s is %s', (url, login) => {
    expect(githubLoginOf(url)).toBe(login);
  });
});

describe('fetchBackers', () => {
  it.effect(
    'lists each backer, in dollars, and whether they back it now',
    () => {
      const fake = fakeOpenCollective(
        openCollectiveData({
          members: [
            memberNode('venue-ink', {
              account: {
                imageUrl:
                  'https://images.opencollective.com/venue-ink/49dbae6/logo.png',
                name: 'Venue.ink',
                website: 'https://www.venue.ink',
              },
              since: '2026-05-27T13:49:48Z',
              totalDonations: { currency: 'SEK', valueInCents: 150_000 },
            }),
            memberNode('yearly', {
              account: {
                socialLinks: [
                  { type: 'TWITTER', url: 'https://twitter.com/yearly' },
                  { type: 'GITHUB', url: 'https://github.com/Yearly' },
                  { type: 'WEBSITE', url: 'https://yearly.dev' },
                ],
                website: 'https://old.yearly.dev',
              },
            }),
            memberNode('gone', { account: { githubHandle: 'gone-gh' } }),
            memberNode('once-lately', { account: { imageUrl: null } }),
            memberNode('once-long-ago'),
          ],
          orders: [
            orderNode('venue-ink', {
              amount: { currency: 'SEK', valueInCents: 25_000 },
            }),
            orderNode('yearly', {
              amount: { currency: 'USD', valueInCents: 120_000 },
              frequency: 'YEARLY',
            }),
            orderNode('gone', { status: 'CANCELLED' }),
            orderNode('once-lately', {
              createdAt: new Date(now - 40 * day).toISOString(),
              frequency: 'ONETIME',
              processedAt: new Date(now - 20 * day).toISOString(),
              status: 'PAID',
            }),
            orderNode('once-long-ago', {
              createdAt: new Date(now - 31 * day).toISOString(),
              frequency: 'ONETIME',
              status: 'PAID',
            }),
          ],
          rates: { SEK: 0.1 },
        }),
      );
      return Effect.gen(function* () {
        yield* TestClock.setTime(now);
        const backers = yield* fetchBackers('trpc');
        expect(backers).toEqual([
          {
            avatarUrl:
              'https://images.opencollective.com/venue-ink/49dbae6/logo.png',
            createdAt: Date.parse('2026-05-27T13:49:48Z'),
            githubLogin: null,
            isCurrent: true,
            monthlyDollars: 25,
            name: 'Venue.ink',
            paidCents: 15_000,
            slug: 'venue-ink',
            websiteUrl: 'https://www.venue.ink',
          },
          expect.objectContaining({
            githubLogin: 'Yearly',
            isCurrent: true,
            monthlyDollars: 100,
            websiteUrl: 'https://yearly.dev',
          }),
          expect.objectContaining({
            githubLogin: 'gone-gh',
            isCurrent: false,
            monthlyDollars: 0,
          }),
          expect.objectContaining({
            avatarUrl:
              'https://images.opencollective.com/once-lately/avatar.png',
            isCurrent: true,
            monthlyDollars: 0,
          }),
          expect.objectContaining({ isCurrent: false, slug: 'once-long-ago' }),
        ]);
        expect(fake.sent.map((sent) => sent.url)).toEqual(
          Array(3).fill(openCollectiveUrl),
        );
        const [members, orders, rates] = fake.sent;
        expect(members?.query).toContain(
          'connection: members(limit: 100, offset: $offset, role: [BACKER])',
        );
        expect(members?.variables).toEqual({ offset: 0, slug: 'trpc' });
        expect(orders?.query).toContain(
          'connection: orders(limit: 100, offset: $offset, filter: INCOMING, status: [ACTIVE, PAID])',
        );
        expect(rates?.variables.requests).toEqual([
          { fromCurrency: 'SEK', toCurrency: 'USD' },
        ]);
      }).pipe(Effect.provide(fake.layer));
    },
  );

  it.effect(
    'leaves out the incognito, and lists one listed per tier once',
    () => {
      const fake = fakeOpenCollective(
        openCollectiveData({
          members: [
            memberNode('incognito-1', { account: { isIncognito: true } }),
            memberNode('twice', {
              since: '2025-03-01T00:00:00Z',
              totalDonations: { currency: 'USD', valueInCents: 5_000 },
            }),
            memberNode('twice', {
              since: '2025-01-01T00:00:00Z',
              totalDonations: { currency: 'USD', valueInCents: 3_000 },
            }),
          ],
          orders: [orderNode('incognito-1'), orderNode('twice')],
        }),
      );
      return Effect.gen(function* () {
        const backers = yield* fetchBackers('trpc');
        expect(backers).toEqual([
          expect.objectContaining({
            createdAt: Date.parse('2025-01-01T00:00:00Z'),
            paidCents: 5_000,
            slug: 'twice',
          }),
        ]);
        expect(fake.sent).toHaveLength(2);
      }).pipe(Effect.provide(fake.layer));
    },
  );

  it.effect('follows the pages', () => {
    const fake = fakeOpenCollective(
      openCollectiveData({
        members: Array.from({ length: 150 }, (_, index) =>
          memberNode(`backer-${index}`),
        ),
      }),
    );
    return Effect.gen(function* () {
      const backers = yield* fetchBackers('trpc');
      expect(backers).toHaveLength(150);
      expect(
        fake.sent
          .filter((sent) => sent.query.includes('connection: members'))
          .map((sent) => sent.variables.offset),
      ).toEqual([0, 100]);
    }).pipe(Effect.provide(fake.layer));
  });

  it.effect("fails without an exchange rate for a backer's currency", () => {
    const fake = fakeOpenCollective(
      openCollectiveData({
        members: [
          memberNode('kr', {
            totalDonations: { currency: 'SEK', valueInCents: 100 },
          }),
        ],
      }),
    );
    return Effect.gen(function* () {
      const result = yield* Effect.result(fetchBackers('trpc'));
      expect(failureMessage(result)).toBe(
        'Open Collective, for trpc: no exchange rate to USD for SEK',
      );
    }).pipe(Effect.provide(fake.layer));
  });

  it.effect("fails with Open Collective's GraphQL errors", () => {
    const fake = fakeOpenCollective(() => ({
      body: {
        data: { account: null },
        errors: [{ message: 'Account Not Found' }],
      },
    }));
    return Effect.gen(function* () {
      const result = yield* Effect.result(fetchBackers('nope'));
      expect(failureMessage(result)).toBe(
        'Open Collective, for nope: Account Not Found',
      );
    }).pipe(Effect.provide(fake.layer));
  });

  it.effect('fails on an HTTP error, with its body', () => {
    const fake = fakeOpenCollective(() => ({
      body: { error: 'Rate limit exceeded' },
      status: 429,
    }));
    return Effect.gen(function* () {
      const result = yield* Effect.result(fetchBackers('trpc'));
      expect(failureMessage(result)).toBe(
        'Open Collective, for trpc: HTTP 429: {"error":"Rate limit exceeded"}',
      );
    }).pipe(Effect.provide(fake.layer));
  });

  it.effect('fails on a response it does not expect', () => {
    const fake = fakeOpenCollective(
      openCollectiveData({ members: [{ since: 'yesterday' }] }),
    );
    return Effect.gen(function* () {
      const result = yield* Effect.result(fetchBackers('trpc'));
      expect(failureMessage(result)).toMatch(
        /^Open Collective, for trpc: unexpected backer: /,
      );
    }).pipe(Effect.provide(fake.layer));
  });

  it.effect('fails on an account Open Collective does not have', () => {
    const fake = fakeOpenCollective(() => ({
      body: { data: { account: null } },
    }));
    return Effect.gen(function* () {
      const result = yield* Effect.result(fetchBackers('nope'));
      expect(failureMessage(result)).toBe(
        'Open Collective, for nope: no such account',
      );
    }).pipe(Effect.provide(fake.layer));
  });
});
