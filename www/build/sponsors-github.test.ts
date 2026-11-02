import { describe, expect, it } from '@effect/vitest';
import { Effect, Predicate, Redacted, Result } from 'effect';

import {
  activityNode,
  connectionPage,
  fakeGithub,
  paymentNode,
  sponsorshipNode,
} from './fake-github.ts';
import {
  type Activity,
  fetchLifetimeValues,
  fetchSponsorships,
  graphqlUrl,
  paidFromActivities,
  type SponsoredAccount,
} from './sponsors-github.ts';

const katt: SponsoredAccount = { kind: 'user', login: 'KATT' };
const trpc: SponsoredAccount = { kind: 'organization', login: 'trpc' };
const token = Redacted.make('test-token');

function failureMessage<A, E extends { readonly message: string }>(
  result: Result.Result<A, E>,
) {
  return Result.isFailure(result) ? result.failure.message : undefined;
}

describe('fetchSponsorships', () => {
  it.effect("follows the pages of the account's sponsorships", () => {
    const github = fakeGithub((sent) =>
      sent.variables.cursor === null
        ? {
            body: connectionPage(
              [
                sponsorshipNode('first', {
                  createdAt: '2024-05-06T07:08:09Z',
                  sponsorEntity: {
                    avatarUrl: 'https://avatars.githubusercontent.com/u/1?v=4',
                    login: 'first',
                    name: 'First Co',
                    websiteUrl: 'first.dev',
                  },
                  tier: { isOneTime: false, monthlyPriceInDollars: 100 },
                }),
              ],
              'page-2',
            ),
          }
        : {
            body: connectionPage([
              sponsorshipNode('second', { privacyLevel: 'PRIVATE' }),
              sponsorshipNode('once', {
                tier: { isOneTime: true, monthlyPriceInDollars: 6000 },
              }),
            ]),
          },
    );
    return Effect.gen(function* () {
      const sponsorships = yield* fetchSponsorships(trpc, token);
      expect(sponsorships).toEqual([
        {
          avatarUrl: 'https://avatars.githubusercontent.com/u/1?v=4',
          createdAt: Date.parse('2024-05-06T07:08:09Z'),
          isPublic: true,
          login: 'first',
          monthlyDollars: 100,
          name: 'First Co',
          websiteUrl: 'first.dev',
        },
        expect.objectContaining({ isPublic: false, login: 'second' }),
        expect.objectContaining({ login: 'once', monthlyDollars: 0 }),
      ]);
      expect(github.sent.map((sent) => sent.variables)).toEqual([
        { cursor: null, login: 'trpc' },
        { cursor: 'page-2', login: 'trpc' },
      ]);
      const first = github.sent[0];
      expect(first?.url).toBe(graphqlUrl);
      expect(first?.authorization).toBe('Bearer test-token');
      expect(first?.query).toContain('account: organization(login: $login)');
      expect(first?.query).toContain(
        'connection: sponsorshipsAsMaintainer(first: 100, after: $cursor, includePrivate: true)',
      );
    }).pipe(Effect.provide(github.layer));
  });

  it.effect('skips sponsors whose account was deleted', () => {
    const github = fakeGithub(() => ({
      body: connectionPage([
        sponsorshipNode('ghost', { sponsorEntity: null }),
        sponsorshipNode('here'),
      ]),
    }));
    return Effect.gen(function* () {
      const sponsorships = yield* fetchSponsorships(katt, token);
      expect(sponsorships.map((sponsorship) => sponsorship.login)).toEqual([
        'here',
      ]);
      expect(github.sent[0]?.query).toContain('account: user(login: $login)');
    }).pipe(Effect.provide(github.layer));
  });

  it.effect(
    "fails when the tiers are hidden, as they are from a token that isn't the owner's",
    () => {
      const github = fakeGithub(() => ({
        body: connectionPage([sponsorshipNode('someone', { tier: null })]),
      }));
      return Effect.gen(function* () {
        const user = yield* Effect.result(fetchSponsorships(katt, token));
        expect(failureMessage(user)).toBe(
          "GitHub, for user KATT: someone's tier is hidden: SPONSORS_SYNC_GITHUB_TOKEN has to be KATT's own token",
        );
        const org = yield* Effect.result(fetchSponsorships(trpc, token));
        expect(failureMessage(org)).toBe(
          "GitHub, for organization trpc: someone's tier is hidden: SPONSORS_SYNC_GITHUB_TOKEN has to be a token of an admin of trpc",
        );
        if (Result.isFailure(org)) {
          expect(org.failure).toSatisfy(
            Predicate.isTagged('SponsorsSyncError'),
          );
        }
      }).pipe(Effect.provide(github.layer));
    },
  );

  it.effect("fails with GitHub's GraphQL errors", () => {
    const github = fakeGithub(() => ({
      body: {
        data: { account: null },
        errors: [
          { message: "Could not resolve to a User with the login of 'KATT'." },
          { message: 'And another.' },
        ],
      },
    }));
    return Effect.gen(function* () {
      const result = yield* Effect.result(fetchSponsorships(katt, token));
      expect(failureMessage(result)).toBe(
        "GitHub, for user KATT: Could not resolve to a User with the login of 'KATT'.; And another.",
      );
    }).pipe(Effect.provide(github.layer));
  });

  it.effect('fails on an HTTP error, with its body', () => {
    const github = fakeGithub(() => ({
      body: { message: 'Bad credentials' },
      status: 401,
    }));
    return Effect.gen(function* () {
      const result = yield* Effect.result(fetchSponsorships(katt, token));
      expect(failureMessage(result)).toBe(
        'GitHub, for user KATT: HTTP 401: {"message":"Bad credentials"}',
      );
    }).pipe(Effect.provide(github.layer));
  });

  it.effect('fails on a response it does not expect', () => {
    const github = fakeGithub(() => ({
      body: connectionPage([{ createdAt: 'yesterday' }]),
    }));
    return Effect.gen(function* () {
      const result = yield* Effect.result(fetchSponsorships(katt, token));
      expect(failureMessage(result)).toMatch(
        /^GitHub, for user KATT: unexpected sponsorship: /,
      );
    }).pipe(Effect.provide(github.layer));
  });

  it.effect('fails on an account GitHub does not have', () => {
    const github = fakeGithub(() => ({ body: { data: { account: null } } }));
    return Effect.gen(function* () {
      const result = yield* Effect.result(fetchSponsorships(katt, token));
      expect(failureMessage(result)).toBe(
        'GitHub, for user KATT: no such account',
      );
    }).pipe(Effect.provide(github.layer));
  });
});

describe('fetchLifetimeValues', () => {
  it.effect('lists what each sponsor has paid, following the pages', () => {
    const github = fakeGithub((sent) => ({
      body:
        sent.variables.cursor === null
          ? connectionPage([paymentNode('a', 12_345), null], 'next')
          : connectionPage([paymentNode('b', 500)]),
    }));
    return Effect.gen(function* () {
      expect(yield* fetchLifetimeValues(katt, token)).toEqual([
        { cents: 12_345, login: 'a' },
        { cents: 500, login: 'b' },
      ]);
      expect(github.sent[0]?.query).toContain(
        'connection: sponsorsActivities(first: 100, after: $cursor, period: ALL, includePrivate: true, orderBy: { field: TIMESTAMP, direction: ASC })',
      );
      expect(github.sent).toHaveLength(2);
    }).pipe(Effect.provide(github.layer));
  });

  it.effect('fails on an activity it does not expect', () => {
    const github = fakeGithub(() => ({
      body: connectionPage([{ action: 'NEW_SPONSORSHIP' }]),
    }));
    return Effect.gen(function* () {
      const result = yield* Effect.result(fetchLifetimeValues(trpc, token));
      expect(failureMessage(result)).toMatch(
        /^GitHub, for organization trpc: unexpected activity: /,
      );
    }).pipe(Effect.provide(github.layer));
  });
});

describe('paidFromActivities', () => {
  const at = (date: string) => `${date}T00:00:00Z`;
  const paid = (
    activities: ReadonlyArray<ReturnType<typeof activityNode> | object>,
    now: string,
  ) =>
    Object.fromEntries(
      paidFromActivities(
        activities as ReadonlyArray<Activity>,
        Date.parse(at(now)),
      ).map((value) => [value.login, value.cents / 100]),
    );

  it('charges every month a tier is held, at its price then', () => {
    expect(
      paid(
        [
          activityNode('a', 'NEW_SPONSORSHIP', {
            dollars: 50,
            timestamp: at('2024-01-01'),
          }),
          activityNode('a', 'TIER_CHANGE', {
            dollars: 150,
            timestamp: at('2024-04-01'),
          }),
          activityNode('a', 'PENDING_CHANGE', { timestamp: at('2024-05-20') }),
          activityNode('a', 'CANCELLED_SPONSORSHIP', {
            dollars: 150,
            timestamp: at('2024-06-01'),
          }),
        ],
        '2026-01-01',
      ),
    ).toEqual({ a: 3 * 50 + 2 * 150 });
  });

  it('charges a current sponsor up to now, and a new one a month', () => {
    expect(
      paid(
        [
          activityNode('current', 'NEW_SPONSORSHIP', {
            dollars: 10,
            timestamp: at('2025-01-15'),
          }),
          activityNode('new', 'NEW_SPONSORSHIP', {
            dollars: 25,
            timestamp: at('2025-12-31'),
          }),
        ],
        '2026-01-01',
      ),
    ).toEqual({ current: 12 * 10, new: 25 });
  });

  it('counts one-time payments once and takes back refunds', () => {
    expect(
      paid(
        [
          activityNode('once', 'NEW_SPONSORSHIP', {
            dollars: 6000,
            isOneTime: true,
            timestamp: at('2023-07-01'),
          }),
          activityNode('once', 'CANCELLED_SPONSORSHIP', {
            dollars: 6000,
            isOneTime: true,
            timestamp: at('2023-07-17'),
          }),
          activityNode('refunded', 'NEW_SPONSORSHIP', {
            dollars: 20,
            isOneTime: true,
          }),
          activityNode('refunded', 'REFUND', { dollars: 20, isOneTime: true }),
        ],
        '2026-01-01',
      ),
    ).toEqual({ once: 6000, refunded: 0 });
  });

  it('skips deleted sponsors', () => {
    expect(
      paid(
        [
          {
            action: 'NEW_SPONSORSHIP',
            sponsor: null,
            sponsorsTier: { isOneTime: true, monthlyPriceInDollars: 5 },
            timestamp: at('2025-01-01'),
          },
        ],
        '2026-01-01',
      ),
    ).toEqual({});
  });
});
