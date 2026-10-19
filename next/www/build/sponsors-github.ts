/**
 * Reads an account's GitHub Sponsors through GitHub's GraphQL API: who
 * sponsors it now, and how much each sponsor has ever paid it. Only the
 * account's owner (or an admin of an organization) sees tiers, private
 * sponsors and amounts, so the token has to be theirs; with anyone else's,
 * the fetch fails rather than weighing everyone at nothing.
 */
import { Data, Effect, Option, type Redacted, Schema } from 'effect';
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
  tier: Schema.NullOr(Schema.Struct({ monthlyPriceInDollars: Schema.Number })),
});

const LifetimeValueNode = Schema.Struct({
  amountInCents: Schema.Number,
  sponsor: Schema.Struct({ login: Schema.String }),
});

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
    nodes: `createdAt privacyLevel tier { monthlyPriceInDollars } sponsorEntity { ... on User { ${sponsorFields} } ... on Organization { ${sponsorFields} } }`,
  });

const lifetimeValuesQuery = (account: SponsoredAccount) =>
  connectionQuery({
    account,
    connection: 'lifetimeReceivedSponsorshipValues',
    nodes:
      'amountInCents sponsor { ... on User { login } ... on Organization { login } }',
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
      monthlyDollars: node.tier.monthlyPriceInDollars,
      name: entity.name,
      websiteUrl: entity.websiteUrl,
    });
  }
  return sponsorships;
});

/** What each of `account`'s sponsors, past or present, has paid it in all. */
export const fetchLifetimeValues = Effect.fn('fetchLifetimeValues')(function* (
  account: SponsoredAccount,
  token: Redacted.Redacted,
) {
  const nodes = yield* fetchConnection({
    account,
    query: lifetimeValuesQuery(account),
    token,
  });
  const values: Array<LifetimeValue> = [];
  for (const raw of nodes) {
    if (raw === null) {
      return yield* failFor(
        account,
        "what its sponsors paid is hidden (GitHub sends null): SPONSORS_SYNC_GITHUB_TOKEN has to be a classic personal access token, not an app's token such as gh's",
      );
    }
    const node = yield* Schema.decodeUnknownEffect(LifetimeValueNode)(raw).pipe(
      Effect.mapError((cause) =>
        failFor(account, `unexpected lifetime value: ${cause.message}`),
      ),
    );
    values.push({ cents: node.amountInCents, login: node.sponsor.login });
  }
  return values;
});
