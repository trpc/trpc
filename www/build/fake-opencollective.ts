/**
 * A stand-in for Open Collective's GraphQL API in the sponsors tests: an
 * `HttpClient` that answers each request with `respond`, and records what
 * was sent; `openCollectiveData` answers like the API would, from a list
 * of backers and contributions.
 */
import { Effect, Layer, Predicate } from 'effect';
import { HttpClient, HttpClientResponse } from 'effect/http';

import type { FakeReply } from './fake-github.ts';

export interface SentOpenCollectiveQuery {
  readonly query: string;
  readonly url: string;
  readonly variables: {
    readonly offset?: number;
    readonly requests?: ReadonlyArray<{ readonly fromCurrency: string }>;
    readonly slug?: string;
  };
}

/** A backer, as `members(role: BACKER)` lists them. */
export function memberNode(
  slug: string,
  overrides: {
    readonly account?: Record<string, unknown>;
    readonly since?: string;
    readonly totalDonations?: {
      readonly currency: string;
      readonly valueInCents: number;
    };
  } = {},
) {
  return {
    since: overrides.since ?? '2025-01-01T00:00:00Z',
    totalDonations: overrides.totalDonations ?? {
      currency: 'USD',
      valueInCents: 1_000,
    },
    account: {
      githubHandle: null,
      imageUrl: `https://images.opencollective.com/${slug}/avatar.png`,
      isIncognito: false,
      name: slug.toUpperCase(),
      slug,
      socialLinks: [],
      website: null,
      ...overrides.account,
    },
  };
}

/** A contribution, as `orders(filter: INCOMING)` lists them. */
export function orderNode(
  slug: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    amount: { currency: 'USD', valueInCents: 1_000 },
    createdAt: '2025-01-01T00:00:00Z',
    frequency: 'MONTHLY',
    fromAccount: { slug },
    processedAt: null,
    status: 'ACTIVE',
    ...overrides,
  };
}

/** A page of a connection, as `fetchBackers`'s queries get it. */
export function openCollectivePage(
  nodes: ReadonlyArray<unknown>,
  totalCount = nodes.length,
) {
  return { data: { account: { connection: { nodes, totalCount } } } };
}

/**
 * Answers like Open Collective would for an account with `members` and
 * `orders`, 100 to a page, and what a dollar is worth by `rates`.
 */
export const openCollectiveData =
  (data: {
    readonly members: ReadonlyArray<unknown>;
    readonly orders?: ReadonlyArray<unknown>;
    readonly rates?: Readonly<Record<string, number>>;
  }) =>
  (sent: SentOpenCollectiveQuery): FakeReply => {
    if (sent.query.includes('currencyExchangeRate')) {
      return {
        body: {
          data: {
            currencyExchangeRate: (sent.variables.requests ?? []).flatMap(
              (request) => {
                const value = data.rates?.[request.fromCurrency];
                return value === undefined
                  ? []
                  : [{ fromCurrency: request.fromCurrency, value }];
              },
            ),
          },
        },
      };
    }
    const all = sent.query.includes('connection: members')
      ? data.members
      : (data.orders ?? []);
    const offset = sent.variables.offset ?? 0;
    return {
      body: openCollectivePage(all.slice(offset, offset + 100), all.length),
    };
  };

export function fakeOpenCollective(
  respond: (sent: SentOpenCollectiveQuery) => FakeReply,
) {
  const sent: Array<SentOpenCollectiveQuery> = [];
  const client = HttpClient.make((request) =>
    Effect.sync(() => {
      const bytes = Predicate.isTagged(request.body, 'Uint8Array')
        ? request.body.body
        : new Uint8Array();
      const query: SentOpenCollectiveQuery = {
        url: request.url,
        ...JSON.parse(new TextDecoder().decode(bytes)),
      };
      sent.push(query);
      const reply = respond(query);
      return HttpClientResponse.fromWeb(
        request,
        new Response(JSON.stringify(reply.body), {
          headers: { 'content-type': 'application/json' },
          status: reply.status ?? 200,
        }),
      );
    }),
  );
  return { client, layer: Layer.succeed(HttpClient.HttpClient, client), sent };
}
