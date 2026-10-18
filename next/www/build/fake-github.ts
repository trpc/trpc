/**
 * A stand-in for GitHub's GraphQL API in the sponsors tests: an
 * `HttpClient` that answers each request with `respond`, and records what
 * was sent.
 */
import { Effect, Layer, Predicate } from 'effect';
import { HttpClient, HttpClientResponse } from 'effect/http';

export interface SentQuery {
  readonly authorization: string | undefined;
  readonly query: string;
  readonly url: string;
  readonly variables: {
    readonly cursor: string | null;
    readonly login: string;
  };
}

export interface FakeReply {
  readonly body: unknown;
  readonly status?: number;
}

/** A page of a connection, as `connectionQuery`'s queries get it. */
export function connectionPage(
  nodes: ReadonlyArray<unknown>,
  next: string | null = null,
) {
  return {
    data: {
      account: {
        connection: {
          nodes,
          pageInfo: { endCursor: next, hasNextPage: next !== null },
        },
      },
    },
  };
}

/** A sponsorship node, as GitHub sends it to the account's owner. */
export function sponsorshipNode(
  login: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    createdAt: '2025-01-01T00:00:00Z',
    privacyLevel: 'PUBLIC',
    sponsorEntity: {
      avatarUrl: `https://avatars.githubusercontent.com/${login}?v=4`,
      login,
      name: login.toUpperCase(),
      websiteUrl: null,
    },
    tier: { monthlyPriceInDollars: 10 },
    ...overrides,
  };
}

export function lifetimeNode(login: string, cents: number) {
  return { amountInCents: cents, sponsor: { login } };
}

export const isLifetimeQuery = (sent: SentQuery) =>
  sent.query.includes('lifetimeReceivedSponsorshipValues');

export function fakeGithub(respond: (sent: SentQuery) => FakeReply) {
  const sent: Array<SentQuery> = [];
  const client = HttpClient.make((request) =>
    Effect.sync(() => {
      const bytes = Predicate.isTagged(request.body, 'Uint8Array')
        ? request.body.body
        : new Uint8Array();
      const query: SentQuery = {
        authorization: request.headers['authorization'],
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
  return { layer: Layer.succeed(HttpClient.HttpClient, client), sent };
}
