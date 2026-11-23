/**
 * Reads an account's GitHub Sponsors through GitHub's GraphQL API: who
 * sponsors it now, and how much each sponsor has ever paid it (summed from
 * its sponsors activity log). Only the
 * account's owner (or an admin of an organization) sees tiers, private
 * sponsors and amounts, so the token has to be theirs; with anyone else's,
 * the fetch fails rather than weighing everyone at nothing.
 */
import { Clock, Data, Effect, Option, type Redacted, Schema } from 'effect';
import { HttpClient, HttpClientRequest } from 'effect/http';

export class SponsorsSyncError extends Data.TaggedError('SponsorsSyncError')<{
  readonly message: string;
}> {}

/** A GitHub account people sponsor. */
export interface SponsoredAccount {
  readonly kind: 'organization' | 'user';
  readonly login: string;
}

/** A current sponsorship of one of the accounts, as GitHub reports it. */
export interface Sponsorship {
  readonly avatarUrl: string;
  /** When it started, in ms since the epoch. */
  readonly createdAt: number;
  readonly isPublic: boolean;
  readonly login: string;
  /** What they give a month; 0 for a one-time payment. */
  readonly monthlyDollars: number;
  readonly name: string | null;
  readonly websiteUrl: string | null;
}

/** What a sponsor has paid one account in all, in cents. */
export interface LifetimeValue {
  readonly cents: number;
  readonly login: string;
}

export const graphqlUrl = 'https://api.github.com/graphql';

const PageInfo = Schema.Struct({
  endCursor: Schema.NullOr(Schema.String),
  hasNextPage: Schema.Boolean,
});

const Page = Schema.Struct({
  data: Schema.Struct({
    account: Schema.NullOr(
      Schema.Struct({
        connection: Schema.Struct({
          nodes: Schema.Array(Schema.Unknown),
          pageInfo: PageInfo,
        }),
      }),
    ),
  }),
});

const GraphqlErrors = Schema.Struct({
  errors: Schema.NonEmptyArray(Schema.Struct({ message: Schema.String })),
});

const SponsorshipNode = Schema.Struct({
  createdAt: Schema.String,
  privacyLevel: Schema.Literals(['PRIVATE', 'PUBLIC']),
  // `null` for an account that has since been deleted.
  sponsorEntity: Schema.NullOr(
    Schema.Struct({
      avatarUrl: Schema.String,
      login: Schema.String,
      name: Schema.NullOr(Schema.String),
      websiteUrl: Schema.NullOr(Schema.String),
    }),
  ),
  // `null` when the token isn't the account owner's.
  tier: Schema.NullOr(
    Schema.Struct({
      isOneTime: Schema.Boolean,
      monthlyPriceInDollars: Schema.Number,
    }),
  ),
});

const Tier = Schema.Struct({
  isOneTime: Schema.Boolean,
  monthlyPriceInDollars: Schema.Number,
});

const ActivityNode = Schema.Struct({
  action: Schema.String,
  // `null` for an account that has since been deleted.
  sponsor: Schema.NullOr(Schema.Struct({ login: Schema.String })),
  sponsorsTier: Schema.NullOr(Tier),
  timestamp: Schema.String,
});

/** An entry of an account's sponsors activity log. */
export type Activity = typeof ActivityNode.Type;

const sponsorFields = 'login name websiteUrl avatarUrl';

/**
 * The query for one page of `connection`, aliased so every query's
 * response has the same shape. `$login` and `$cursor` are its variables.
 */
export function connectionQuery(opts: {
  readonly account: SponsoredAccount;
  /** The connection's arguments besides the page's. */
  readonly args?: string;
  readonly connection: string;
  readonly nodes: string;
}) {
  const args = ['first: 100', 'after: $cursor', opts.args ?? []].flat();
  return `query ($login: String!, $cursor: String) {
  account: ${opts.account.kind}(login: $login) {
    connection: ${opts.connection}(${args.join(', ')}) {
      pageInfo { hasNextPage endCursor }
      nodes { ${opts.nodes} }
    }
  }
}`;
}

const sponsorshipsQuery = (account: SponsoredAccount) =>
  connectionQuery({
    account,
    args: 'includePrivate: true',
    connection: 'sponsorshipsAsMaintainer',
    nodes: `createdAt privacyLevel tier { isOneTime monthlyPriceInDollars } sponsorEntity { ... on User { ${sponsorFields} } ... on Organization { ${sponsorFields} } }`,
  });

const activitiesQuery = (account: SponsoredAccount) =>
  connectionQuery({
    account,
    args: 'period: ALL, includePrivate: true, orderBy: { field: TIMESTAMP, direction: ASC }',
    connection: 'sponsorsActivities',
    nodes:
      'action timestamp sponsorsTier { isOneTime monthlyPriceInDollars } sponsor { ... on User { login } ... on Organization { login } }',
  });

const describeCause = (cause: unknown) =>
  cause instanceof Error ? cause.message : String(cause);

interface ConnectionOpts {
  readonly account: SponsoredAccount;
  readonly query: string;
  readonly token: Redacted.Redacted;
}

interface ConnectionPage {
  /** The next page's cursor, or `null` on the last page. */
  readonly next: string | null;
  readonly nodes: ReadonlyArray<unknown>;
}

const tokenOwner: Record<SponsoredAccount['kind'], (login: string) => string> =
  {
    organization: (login) => `a token of an admin of ${login}`,
    user: (login) => `${login}'s own token`,
  };

const failFor = (account: SponsoredAccount, message: string) =>
  new SponsorsSyncError({
    message: `GitHub, for ${account.kind} ${account.login}: ${message}`,
  });

const fetchPage = Effect.fn('fetchPage')(function* (
  opts: ConnectionOpts,
  cursor: string | null,
): Effect.fn.Return<ConnectionPage, SponsorsSyncError, HttpClient.HttpClient> {
  const client = yield* HttpClient.HttpClient;
  const fail = (message: string) => failFor(opts.account, message);
  const request = HttpClientRequest.post(graphqlUrl).pipe(
    HttpClientRequest.bearerToken(opts.token),
    HttpClientRequest.setHeader('user-agent', 'trpc-sponsors-sync'),
    HttpClientRequest.acceptJson,
    HttpClientRequest.bodyJsonUnsafe({
      query: opts.query,
      variables: { cursor, login: opts.account.login },
    }),
  );
  const response = yield* client
    .execute(request)
    .pipe(Effect.mapError((cause) => fail(describeCause(cause))));
  const body = yield* response.json.pipe(
    Effect.mapError((cause) =>
      fail(`HTTP ${response.status}, not JSON: ${describeCause(cause)}`),
    ),
  );
  const errors = Schema.decodeUnknownOption(GraphqlErrors)(body);
  if (Option.isSome(errors)) {
    return yield* fail(
      errors.value.errors.map((error) => error.message).join('; '),
    );
  }
  if (response.status < 200 || response.status >= 300) {
    return yield* fail(`HTTP ${response.status}: ${JSON.stringify(body)}`);
  }
  const page = yield* Schema.decodeUnknownEffect(Page)(body).pipe(
    Effect.mapError((cause) => fail(`unexpected response: ${cause.message}`)),
  );
  if (page.data.account === null) {
    return yield* fail('no such account');
  }
  const connection = page.data.account.connection;
  return {
    next: connection.pageInfo.hasNextPage
      ? connection.pageInfo.endCursor
      : null,
    nodes: connection.nodes,
  };
});

/** Every node of a connection, following its pages. */
const fetchConnection = Effect.fn('fetchConnection')(function* (
  opts: ConnectionOpts,
) {
  const nodes: Array<unknown> = [];
  let page = yield* fetchPage(opts, null);
  nodes.push(...page.nodes);
  while (page.next !== null) {
    page = yield* fetchPage(opts, page.next);
    nodes.push(...page.nodes);
  }
  return nodes;
});

/** `account`'s current sponsorships, skipping deleted sponsors. */
export const fetchSponsorships = Effect.fn('fetchSponsorships')(function* (
  account: SponsoredAccount,
  token: Redacted.Redacted,
) {
  const nodes = yield* fetchConnection({
    account,
    query: sponsorshipsQuery(account),
    token,
  });
  const sponsorships: Array<Sponsorship> = [];
  for (const raw of nodes) {
    const node = yield* Schema.decodeUnknownEffect(SponsorshipNode)(raw).pipe(
      Effect.mapError((cause) =>
        failFor(account, `unexpected sponsorship: ${cause.message}`),
      ),
    );
    const entity = node.sponsorEntity;
    if (entity === null) {
      continue;
    }
    if (node.tier === null) {
      return yield* failFor(
        account,
        `${entity.login}'s tier is hidden: SPONSORS_SYNC_GITHUB_TOKEN has to be ${tokenOwner[account.kind](account.login)}`,
      );
    }
    sponsorships.push({
      avatarUrl: entity.avatarUrl,
      createdAt: Date.parse(node.createdAt),
      isPublic: node.privacyLevel === 'PUBLIC',
      login: entity.login,
      monthlyDollars: node.tier.isOneTime ? 0 : node.tier.monthlyPriceInDollars,
      name: entity.name,
      websiteUrl: entity.websiteUrl,
    });
  }
  return sponsorships;
});

/** The monthly charges from `since` until `until`: one at the start of each month. */
function monthlyCharges(since: number, until: number) {
  const start = new Date(since);
  const end = new Date(until);
  let months =
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (end.getUTCMonth() - start.getUTCMonth());
  const last = new Date(since);
  last.setUTCMonth(start.getUTCMonth() + months);
  if (last.getTime() < until) {
    months += 1;
  }
  return Math.max(1, months);
}

/**
 * What each sponsor in `activities` (oldest first) has paid by `now`: a
 * monthly tier pays at the start of every month it's held, from when it was
 * picked to the next tier change, cancellation or `now`; a one-time tier
 * pays once; a refund takes back its tier's price.
 */
export function paidFromActivities(
  activities: ReadonlyArray<Activity>,
  now: number,
): Array<LifetimeValue> {
  const dollars = new Map<string, number>();
  const monthly = new Map<string, { dollars: number; since: number }>();
  const add = (login: string, amount: number) =>
    dollars.set(login, (dollars.get(login) ?? 0) + amount);
  const close = (login: string, at: number) => {
    const held = monthly.get(login);
    if (held === undefined) {
      return;
    }
    monthly.delete(login);
    add(login, held.dollars * monthlyCharges(held.since, at));
  };
  for (const activity of activities) {
    if (activity.sponsor === null) {
      continue;
    }
    const login = activity.sponsor.login;
    const at = Date.parse(activity.timestamp);
    const tier = activity.sponsorsTier;
    switch (activity.action) {
      case 'NEW_SPONSORSHIP':
      case 'TIER_CHANGE': {
        if (tier === null) {
          break;
        }
        if (tier.isOneTime) {
          add(login, tier.monthlyPriceInDollars);
          break;
        }
        close(login, at);
        monthly.set(login, { dollars: tier.monthlyPriceInDollars, since: at });
        break;
      }
      case 'CANCELLED_SPONSORSHIP': {
        close(login, at);
        break;
      }
      case 'REFUND': {
        if (tier !== null) {
          add(login, -tier.monthlyPriceInDollars);
        }
        break;
      }
    }
  }
  for (const login of monthly.keys()) {
    close(login, now);
  }
  return [...dollars].map(([login, amount]) => ({
    cents: Math.round(Math.max(0, amount) * 100),
    login,
  }));
}

/**
 * What each of `account`'s sponsors, past or present, has paid it in all,
 * from its sponsors activity log. (`lifetimeReceivedSponsorshipValues` would
 * say, but GitHub sends `null` for its every node, to every token tried.)
 */
export const fetchLifetimeValues = Effect.fn('fetchLifetimeValues')(function* (
  account: SponsoredAccount,
  token: Redacted.Redacted,
) {
  const nodes = yield* fetchConnection({
    account,
    query: activitiesQuery(account),
    token,
  });
  const activities: Array<Activity> = [];
  for (const raw of nodes) {
    // GitHub sends a few entries as `null`, with no error.
    if (raw === null) {
      continue;
    }
    activities.push(
      yield* Schema.decodeUnknownEffect(ActivityNode)(raw).pipe(
        Effect.mapError((cause) =>
          failFor(account, `unexpected activity: ${cause.message}`),
        ),
      ),
    );
  }
  return paidFromActivities(activities, yield* Clock.currentTimeMillis);
});
