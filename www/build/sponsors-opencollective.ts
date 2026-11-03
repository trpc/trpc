/**
 * Reads who backs an Open Collective account through its public GraphQL API:
 * each backer, what they've given in all, and what their contributions give
 * now, in US dollars at Open Collective's current exchange rate. The API
 * answers this without a token (ten requests a minute; a sync makes three),
 * and an incognito backer comes back as no one in particular, so is left out.
 */
import { Clock, Effect, Option, Schema } from 'effect';
import { HttpClient, HttpClientRequest } from 'effect/http';

import { SponsorsSyncError } from './sponsors-github.ts';

/** Someone who backs, or has backed, an Open Collective account. */
export interface OpenCollectiveBacker {
  readonly avatarUrl: string;
  /** When they started backing it, in ms since the epoch. */
  readonly createdAt: number;
  /** The GitHub account their profile links to, if any. */
  readonly githubLogin: string | null;
  /**
   * Whether they back it now: a monthly or yearly contribution that's
   * still going, or a one-time one in the last 30 days.
   */
  readonly isCurrent: boolean;
  /** What their ongoing contributions give a month; 0 for one-time ones. */
  readonly monthlyDollars: number;
  readonly name: string;
  /** What they've given in all, in cents. */
  readonly paidCents: number;
  readonly slug: string;
  readonly websiteUrl: string | null;
}

export const openCollectiveUrl = 'https://api.opencollective.com/graphql/v2';

const oneTimeCountsMs = 30 * 24 * 60 * 60 * 1000;

const Amount = Schema.Struct({
  currency: Schema.String,
  valueInCents: Schema.Number,
});

const SocialLink = Schema.Struct({ type: Schema.String, url: Schema.String });

const MemberNode = Schema.Struct({
  account: Schema.Struct({
    // Deprecated for `socialLinks`, but the only place some profiles keep them.
    githubHandle: Schema.NullOr(Schema.String),
    imageUrl: Schema.NullOr(Schema.String),
    isIncognito: Schema.Boolean,
    name: Schema.NullOr(Schema.String),
    slug: Schema.String,
    socialLinks: Schema.Array(SocialLink),
    website: Schema.NullOr(Schema.String),
  }),
  since: Schema.String,
  totalDonations: Amount,
});

const OrderNode = Schema.Struct({
  amount: Amount,
  createdAt: Schema.String,
  frequency: Schema.Literals(['MONTHLY', 'YEARLY', 'ONETIME']),
  fromAccount: Schema.Struct({ slug: Schema.String }),
  processedAt: Schema.NullOr(Schema.String),
  status: Schema.String,
});

type Order = typeof OrderNode.Type;

const Page = Schema.Struct({
  data: Schema.Struct({
    account: Schema.NullOr(
      Schema.Struct({
        connection: Schema.Struct({
          nodes: Schema.Array(Schema.Unknown),
          totalCount: Schema.Number,
        }),
      }),
    ),
  }),
});

const Rates = Schema.Struct({
  data: Schema.Struct({
    currencyExchangeRate: Schema.Array(
      Schema.Struct({ fromCurrency: Schema.String, value: Schema.Number }),
    ),
  }),
});

const GraphqlErrors = Schema.Struct({
  errors: Schema.NonEmptyArray(Schema.Struct({ message: Schema.String })),
});

const pageSize = 100;

/** The query for one page of `connection`; `$slug` and `$offset` are its variables. */
function connectionQuery(opts: {
  /** The connection's arguments besides the page's. */
  readonly args: string;
  readonly connection: string;
  readonly nodes: string;
}) {
  return `query ($slug: String!, $offset: Int!) {
  account(slug: $slug) {
    connection: ${opts.connection}(limit: ${pageSize}, offset: $offset, ${opts.args}) {
      totalCount
      nodes { ${opts.nodes} }
    }
  }
}`;
}

const membersQuery = connectionQuery({
  args: 'role: [BACKER]',
  connection: 'members',
  nodes:
    'since totalDonations { valueInCents currency } account { slug name imageUrl isIncognito socialLinks { type url } website githubHandle }',
});

const ordersQuery = connectionQuery({
  args: 'filter: INCOMING, status: [ACTIVE, PAID]',
  connection: 'orders',
  nodes:
    'status frequency createdAt processedAt amount { valueInCents currency } fromAccount { slug }',
});

const ratesQuery = `query ($requests: [CurrencyExchangeRateRequest!]!) {
  currencyExchangeRate(requests: $requests) { fromCurrency value }
}`;

const describeCause = (cause: unknown) =>
  cause instanceof Error ? cause.message : String(cause);

const failFor = (slug: string, message: string) =>
  new SponsorsSyncError({
    message: `Open Collective, for ${slug}: ${message}`,
  });

const post = Effect.fn('post')(function* (
  slug: string,
  query: string,
  variables: Record<string, unknown>,
) {
  const client = yield* HttpClient.HttpClient;
  const fail = (message: string) => failFor(slug, message);
  const request = HttpClientRequest.post(openCollectiveUrl).pipe(
    HttpClientRequest.setHeader('user-agent', 'trpc-sponsors-sync'),
    HttpClientRequest.acceptJson,
    HttpClientRequest.bodyJsonUnsafe({ query, variables }),
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
  return body;
});

/** Every node of `query`'s connection, following its pages. */
const fetchConnection = Effect.fn('fetchConnection')(function* (
  slug: string,
  query: string,
) {
  const nodes: Array<unknown> = [];
  for (;;) {
    const body = yield* post(slug, query, { offset: nodes.length, slug });
    const page = yield* Schema.decodeUnknownEffect(Page)(body).pipe(
      Effect.mapError((cause) =>
        failFor(slug, `unexpected response: ${cause.message}`),
      ),
    );
    if (page.data.account === null) {
      return yield* failFor(slug, 'no such account');
    }
    const connection = page.data.account.connection;
    nodes.push(...connection.nodes);
    if (
      connection.nodes.length === 0 ||
      nodes.length >= connection.totalCount
    ) {
      return nodes;
    }
  }
});

/** What a dollar is worth in each of `currencies`, by Open Collective's rates. */
const fetchRates = Effect.fn('fetchRates')(function* (
  slug: string,
  currencies: ReadonlySet<string>,
) {
  const rates = new Map([['USD', 1]]);
  const others = [...currencies].filter((currency) => !rates.has(currency));
  if (others.length === 0) {
    return rates;
  }
  const body = yield* post(slug, ratesQuery, {
    requests: others.map((fromCurrency) => ({
      fromCurrency,
      toCurrency: 'USD',
    })),
  });
  const decoded = yield* Schema.decodeUnknownEffect(Rates)(body).pipe(
    Effect.mapError((cause) =>
      failFor(slug, `unexpected exchange rates: ${cause.message}`),
    ),
  );
  for (const rate of decoded.data.currencyExchangeRate) {
    rates.set(rate.fromCurrency, rate.value);
  }
  const missing = others.filter((currency) => !rates.has(currency));
  if (missing.length > 0) {
    return yield* failFor(
      slug,
      `no exchange rate to USD for ${missing.join(', ')}`,
    );
  }
  return rates;
});

/** The GitHub login of a `github.com/<login>` URL (a repo's, its owner's). */
export function githubLoginOf(url: string) {
  const withScheme = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  if (!URL.canParse(withScheme)) {
    return null;
  }
  const parsed = new URL(withScheme);
  const login = parsed.pathname.split('/')[1];
  return /^(www\.)?github\.com$/i.test(parsed.hostname) &&
    login !== undefined &&
    login !== ''
    ? login
    : null;
}

const isCurrentOrder = (order: Order, now: number) =>
  order.frequency === 'ONETIME'
    ? order.status === 'PAID' &&
      now - Date.parse(order.processedAt ?? order.createdAt) <= oneTimeCountsMs
    : order.status === 'ACTIVE';

const monthlyOf: Record<Order['frequency'], number> = {
  MONTHLY: 1,
  ONETIME: 0,
  YEARLY: 1 / 12,
};

const decodeNodes = <A>(
  schema: Schema.Codec<A, unknown>,
  slug: string,
  what: string,
  nodes: ReadonlyArray<unknown>,
) =>
  Schema.decodeUnknownEffect(Schema.Array(schema))(nodes).pipe(
    Effect.mapError((cause) =>
      failFor(slug, `unexpected ${what}: ${cause.message}`),
    ),
  );

/**
 * `slug`'s backers, past and present, but the incognito, in the order
 * Open Collective lists them. One listed once per tier they've backed at
 * is one backer, from when they first started, who has given the most any
 * of those lists says.
 */
export const fetchBackers = Effect.fn('fetchBackers')(function* (slug: string) {
  const [memberNodes, orderNodes] = yield* Effect.all(
    [fetchConnection(slug, membersQuery), fetchConnection(slug, ordersQuery)],
    { concurrency: 'unbounded' },
  );
  const members = yield* decodeNodes(MemberNode, slug, 'backer', memberNodes);
  const orders = yield* decodeNodes(
    OrderNode,
    slug,
    'contribution',
    orderNodes,
  );
  const rates = yield* fetchRates(
    slug,
    new Set(
      [
        ...members.map((member) => member.totalDonations),
        ...orders.map((order) => order.amount),
      ].map((amount) => amount.currency),
    ),
  );
  const toUsdCents = (amount: typeof Amount.Type) =>
    amount.valueInCents * (rates.get(amount.currency) ?? 0);
  const now = yield* Clock.currentTimeMillis;

  const backers = new Map<string, OpenCollectiveBacker>();
  for (const member of members) {
    const account = member.account;
    if (account.isIncognito) {
      continue;
    }
    const listed = backers.get(account.slug);
    if (listed !== undefined) {
      backers.set(account.slug, {
        ...listed,
        createdAt: Math.min(listed.createdAt, Date.parse(member.since)),
        paidCents: Math.max(
          listed.paidCents,
          Math.round(toUsdCents(member.totalDonations)),
        ),
      });
      continue;
    }
    const current = orders.filter(
      (order) =>
        order.fromAccount.slug === account.slug && isCurrentOrder(order, now),
    );
    const link = (type: string) =>
      account.socialLinks.find((social) => social.type === type)?.url;
    const github = link('GITHUB') ?? account.githubHandle;
    backers.set(account.slug, {
      avatarUrl:
        account.imageUrl ??
        `https://images.opencollective.com/${account.slug}/avatar.png`,
      createdAt: Date.parse(member.since),
      githubLogin:
        github === null || github === undefined
          ? null
          : (githubLoginOf(github) ?? githubLoginOf(`github.com/${github}`)),
      isCurrent: current.length > 0,
      monthlyDollars:
        current.reduce(
          (sum, order) =>
            sum + toUsdCents(order.amount) * monthlyOf[order.frequency],
          0,
        ) / 100,
      name: account.name ?? account.slug,
      paidCents: Math.round(toUsdCents(member.totalDonations)),
      slug: account.slug,
      websiteUrl: link('WEBSITE') ?? account.website,
    });
  }
  return [...backers.values()];
});
