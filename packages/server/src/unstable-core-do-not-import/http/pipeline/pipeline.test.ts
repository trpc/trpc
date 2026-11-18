/**
 * The two halves of a pipelined batch, against each other over HTTP. Nothing
 * here knows of routers, procedures or links: the server is a map of plain
 * functions, and the client is `fetch`. The request is the one a link sends:
 * the paths in the URL, the inputs by index, `?batch=tree` and a `tree`.
 */
import { fetchServerResource } from '@trpc/server/__tests__/fetchServerResource';
import superjson from 'superjson';
import { TRPCError } from '../../error/TRPCError';
import { jsonlStreamConsumer, jsonlStreamProducer } from '../../stream/jsonl';
import type { CombinedDataTransformer } from '../../transformer';
import { isObject } from '../../utils';
import type { PipelineStep, PipelineTreeCall } from './client';
import {
  pipelinedBatchBody,
  pipelinedBatchUrl,
  planPipelineTree,
  readPipelineCall,
  readPipelinedItem,
} from './client';
import type { PipelineNodeOutcome } from './server';
import {
  createPipelineSizeOf,
  parsePipelineTree,
  pipelineChildrenJSON,
  pipelineChildrenStream,
  pipelineLimitsOf,
  pipelineTree,
  treeOfBody,
  treeOfSearchParams,
} from './server';
import type { PipelineLimits, PipeRead, PipeTree } from './wire';
import {
  bindPipelinePath,
  formatPipelineListKey,
  parsePipelineKey,
  pipelineBatch,
  pipelineLimitDefaults,
  readPipelineList,
  readPipelinePath,
} from './wire';

// ---------- a server that is a map of functions ----------

type Fn = (input: any) => unknown;

const transformers = {
  none: {
    input: { serialize: (it: unknown) => it, deserialize: (it: unknown) => it },
    output: {
      serialize: (it: unknown) => it,
      deserialize: (it: unknown) => it,
    },
  },
  superjson: { input: superjson, output: superjson },
} satisfies Record<string, CombinedDataTransformer>;

interface WireError {
  message: string;
  code: string;
}

function wireError(cause: unknown): WireError {
  return {
    message: cause instanceof Error ? cause.message : String(cause),
    code: cause instanceof TRPCError ? cause.code : 'INTERNAL_SERVER_ERROR',
  };
}

function serve(opts: {
  fns: Record<string, Fn>;
  /** Told of every call that failed, with the input it ran with */
  onError: (path: string, input: unknown) => void;
  transformer: CombinedDataTransformer;
  /** The most runs of functions a request may have */
  maxRuns: number | null;
  /** Streams the response, each value when it is ready */
  stream: boolean;
  limits: PipelineLimits;
}) {
  const { transformer } = opts;
  return fetchServerResource(async (request) => {
    const url = new URL(request.url);
    const paths = url.pathname.slice(1).split(',');
    if (url.searchParams.get('batch') !== pipelineBatch) {
      return Response.json(
        { error: { message: 'Not a pipelined batch', code: 'BAD_REQUEST' } },
        { status: 400 },
      );
    }
    const hasBody = request.method !== 'GET';
    const body: unknown = hasBody ? await request.json() : null;
    const inputs: unknown = hasBody
      ? body
      : JSON.parse(url.searchParams.get('input') ?? '{}');
    let pipeline;
    try {
      pipeline = pipelineTree({
        tree: hasBody ? treeOfBody(body) : treeOfSearchParams(url.searchParams),
        calls: paths.length,
        transformer,
        limits: opts.limits,
        maxRuns: opts.maxRuns,
      });
    } catch (cause) {
      return Response.json({ error: wireError(cause) }, { status: 400 });
    }
    // As a request handler does: a call gives how it went, and never rejects
    const call = async (
      path: string,
      input: unknown,
    ): Promise<PipelineNodeOutcome<WireError>> => {
      try {
        const fn = opts.fns[path];
        if (!fn) {
          throw new TRPCError({ code: 'NOT_FOUND' });
        }
        return { ok: true, data: await fn(input) };
      } catch (cause) {
        opts.onError(path, input);
        return { ok: false, error: wireError(cause) };
      }
    };
    const top = paths.map((path, index) => {
      const input = isObject(inputs) ? inputs[index] : undefined;
      return call(
        path,
        input === undefined ? undefined : transformer.input.deserialize(input),
      );
    });
    const running = pipeline.run({
      node: (node) => call(node.path, node.input),
      fail: (error) => wireError(error),
    });
    const children = top.map((outcome, index) =>
      running.children(index, outcome),
    );

    if (opts.stream) {
      const envelope = (outcome: PipelineNodeOutcome<WireError>) =>
        outcome.ok
          ? { result: Promise.resolve({ data: Promise.resolve(outcome.data) }) }
          : { error: outcome.error };
      return new Response(
        jsonlStreamProducer({
          maxDepth: Infinity,
          data: top.map(async (outcome, index) => {
            const tree = children[index];
            return {
              ...envelope(await outcome),
              ...(tree && {
                children: pipelineChildrenStream(tree, envelope),
              }),
            };
          }),
          serialize: (value) => transformer.output.serialize(value),
          formatError: ({ error }) => wireError(error),
        }),
      );
    }
    const serialize = (outcome: PipelineNodeOutcome<WireError>) => {
      if (!outcome.ok) {
        return { error: outcome.error };
      }
      try {
        const data = transformer.output.serialize(outcome.data);
        // What can't go in the response is that call's error
        JSON.stringify(data);
        return { result: { data } };
      } catch (cause) {
        return { error: wireError(cause) };
      }
    };
    return Response.json(
      await Promise.all(
        top.map(async (outcome, index) => {
          const tree = children[index];
          return {
            ...serialize(await outcome),
            ...(tree && {
              children: await pipelineChildrenJSON(tree, serialize),
            }),
          };
        }),
      ),
    );
  });
}

// ---------- a client that is `fetch` ----------

/** Something a request has: what the client sends itself */
interface Sent {
  path: string;
  input: unknown;
}

type Call = PipelineTreeCall & Sent;

function sent(path: string, input: unknown): Sent {
  return { path, input };
}

/** A follow-up call under `parent`, or under a list in its data */
function call(opts: {
  parent: Sent | Call;
  path: string;
  input: unknown;
  reads: PipeRead[];
  list: string[][] | null;
}): Call {
  return { ...opts };
}

type Outcome = { data: unknown } | { error: WireError };

async function send(opts: {
  url: string;
  method: 'GET' | 'POST';
  transformer: CombinedDataTransformer;
  sent: Sent[];
  calls: Call[];
  fits: Parameters<typeof planPipelineTree<Call>>[0]['fits'];
  stream: boolean;
}) {
  const { transformer } = opts;
  const plan = planPipelineTree({
    sent: opts.sent,
    calls: opts.calls,
    serialize: (input) => transformer.input.serialize(input),
    fits: opts.fits,
  });
  const inputs = opts.sent.map((it) =>
    it.input === undefined ? undefined : transformer.input.serialize(it.input),
  );
  // What a link sends for an ordinary batch, with a tree
  const batch = `${opts.url}/${opts.sent.map((it) => it.path).join(',')}?batch=1`;
  const url =
    opts.method === 'GET'
      ? pipelinedBatchUrl({
          url: `${batch}&input=${encodeURIComponent(
            JSON.stringify(Object.fromEntries(inputs.entries())),
          )}`,
          tree: plan.tree,
        })
      : pipelinedBatchUrl({ url: batch, tree: null });
  const body =
    opts.method === 'GET'
      ? undefined
      : pipelinedBatchBody({
          body: JSON.stringify(Object.fromEntries(inputs.entries())),
          tree: plan.tree,
        });
  const response = await fetch(url, {
    method: opts.method,
    ...(body === undefined
      ? {}
      : { body, headers: { 'content-type': 'application/json' } }),
  });

  let top: Promise<unknown>[];
  if (opts.stream && response.ok) {
    const [head] = await jsonlStreamConsumer<Record<string, unknown>>({
      from: response.body!,
      deserialize: (value) => transformer.output.deserialize(value),
      formatError: ({ error }) => new Error(String(error)),
      abortController: new AbortController(),
    });
    top = opts.sent.map((_it, index) => Promise.resolve(head[index]));
  } else {
    const json: unknown = await response.json();
    top = opts.sent.map((_it, index) =>
      Promise.resolve(Array.isArray(json) ? json[index] : json),
    );
  }
  const data = (value: unknown) =>
    opts.stream ? value : transformer.output.deserialize(value);
  /** An outcome, streamed or not, as these tests compare it */
  const outcomeOf = async (envelope: unknown): Promise<Outcome | undefined> => {
    if (!isObject(envelope)) {
      return undefined;
    }
    if ('error' in envelope) {
      return { error: envelope['error'] as WireError };
    }
    const result: unknown = await envelope['result'];
    return isObject(result) ? { data: data(await result['data']) } : undefined;
  };
  const itemsOf = async (items: unknown[]): Promise<unknown[]> =>
    Promise.all(
      items.map((item) =>
        Array.isArray(item) ? itemsOf(item) : outcomeOf(item),
      ),
    );

  /** The order the outcomes came in */
  const arrived: string[] = [];
  const outcomes = new Map<Sent, unknown>();
  await Promise.all([
    ...opts.sent.map(async (it, index) => {
      const outcome = await outcomeOf(await top[index]);
      arrived.push(it.path);
      outcomes.set(it, outcome);
    }),
    ...plan.calls.map(async (it) => {
      const place = plan.places.get(it);
      if (!place) {
        return;
      }
      const read = await readPipelineCall(
        top[place.index]?.then((entry) =>
          isObject(entry) ? entry['children'] : undefined,
        ),
        place.steps,
      );
      arrived.push(it.path);
      outcomes.set(
        it,
        read.kind === 'outcome'
          ? await outcomeOf(read.outcome)
          : read.kind === 'items'
            ? await itemsOf(read.items)
            : read.kind === 'failed'
              ? { failed: read.error }
              : undefined,
      );
    }),
  ]);
  return {
    status: response.status,
    /** The request, as it went */
    wire: {
      url: decodeURIComponent(url.slice(opts.url.length)),
      body: body === undefined ? undefined : JSON.parse(body),
    },
    plan,
    arrived,
    of: (it: Sent) => outcomes.get(it),
  };
}

// ---------- a blog ----------

const posts = [
  { slug: 'hello', authorId: 'ada', tags: [{ id: 't1' }, { id: 't2' }] },
  { slug: 'again', authorId: 'lin', tags: [] },
  { slug: 'orphan', authorId: 'nobody', tags: [] },
];
const authors = [
  { id: 'ada', name: 'Ada', teamId: 'infra' },
  { id: 'lin', name: 'Lin', teamId: 'web' },
  { id: 'sam', name: 'Sam', teamId: 'infra' },
];

function notFound(what: string): never {
  throw new TRPCError({ code: 'NOT_FOUND', message: `No ${what}` });
}

function blog() {
  const ran: [path: string, input: unknown][] = [];
  const logged = (fns: Record<string, Fn>): Record<string, Fn> =>
    Object.fromEntries(
      Object.entries(fns).map(([path, fn]) => [
        path,
        (input: unknown) => {
          ran.push([path, input]);
          return fn(input);
        },
      ]),
    );
  return {
    ran,
    fns: logged({
      post: (input) =>
        posts.find((it) => it.slug === input.slug) ?? notFound('post'),
      author: (input) =>
        authors.find((it) => it.id === input.id) ?? notFound('author'),
      team: (input) => ({
        id: input.id,
        members: authors
          .filter((it) => it.teamId === input.id)
          .map((it) => it.id),
      }),
      teamPosts: (input) =>
        posts
          .filter((post) =>
            authors.some(
              (it) => it.id === post.authorId && it.teamId === input.teamId,
            ),
          )
          .map((post) => post.slug),
      posts: () => ({ items: posts }),
      tag: (input) => ({ id: input.id, name: `#${input.id}` }),
      tags: (input) => input.ids.map((id: string) => ({ id, name: `#${id}` })),
      echo: (input) => input,
    }),
  };
}

const defaults = {
  transformer: transformers.none,
  maxRuns: null,
  limits: pipelineLimitDefaults,
  stream: false,
  fits: () => true,
  onError: () => undefined,
} as const;

/** For reads of objects and arrays, which a server takes only with `allowWholeValues` */
const wholeValues: PipelineLimits = {
  ...pipelineLimitDefaults,
  allowWholeValues: true,
};

// ---------- the tests ----------

describe.each([
  { method: 'GET', transformer: 'none' },
  { method: 'POST', transformer: 'none' },
  { method: 'GET', transformer: 'superjson' },
  { method: 'POST', transformer: 'superjson' },
] as const)('over $method, with $transformer', (scenario) => {
  const transformer = transformers[scenario.transformer];
  const method = scenario.method;

  test('a follow-up reads a part of its input from the data of the call it is under', async () => {
    const { fns, ran } = blog();
    await using server = serve({ ...defaults, transformer, fns });
    const post = sent('post', { slug: 'hello' });
    const author = call({
      parent: post,
      path: 'author',
      input: {},
      reads: [{ to: ['id'], data: ['authorId'] }],
      list: null,
    });

    const res = await send({
      ...defaults,
      transformer,
      url: server.url,
      method,
      sent: [post],
      calls: [author],
    });

    expect(res.of(author)).toEqual({ data: authors[0] });
    expect(ran).toEqual([
      ['post', { slug: 'hello' }],
      ['author', { id: 'ada' }],
    ]);
    const tree = {
      0: {
        author: {
          path: 'author',
          input: transformer.input.serialize({}),
          reads: [{ to: ['id'], data: ['authorId'] }],
        },
      },
    };
    expect(res.wire).toEqual(
      method === 'GET'
        ? {
            url: `/post?batch=tree&input=${JSON.stringify({
              0: transformer.input.serialize({ slug: 'hello' }),
            })}&tree=${JSON.stringify(tree)}`,
            body: undefined,
          }
        : {
            url: '/post?batch=tree',
            body: {
              0: transformer.input.serialize({ slug: 'hello' }),
              tree,
            },
          },
    );
  });

  test('a chain: each follow-up is nested under the one it reads, and can read any call above it', async () => {
    const { fns, ran } = blog();
    await using server = serve({ ...defaults, transformer, fns });
    const post = sent('post', { slug: 'hello' });
    const author = call({
      parent: post,
      path: 'author',
      input: {},
      reads: [{ to: ['id'], data: ['authorId'] }],
      list: null,
    });
    const team = call({
      parent: author,
      path: 'echo',
      input: {},
      reads: [
        { to: ['teamId'], data: ['teamId'] },
        // Two calls up: the post
        { to: ['slug'], data: ['slug'], up: 2 },
      ],
      list: null,
    });

    const res = await send({
      ...defaults,
      transformer,
      url: server.url,
      method,
      sent: [post],
      calls: [author, team],
    });

    expect(res.of(team)).toEqual({ data: { teamId: 'infra', slug: 'hello' } });
    expect(ran.map(([path]) => path)).toEqual(['post', 'author', 'echo']);
  });

  test('a list key: a follow-up runs for every item, and each run has a result or an error of its own', async () => {
    const { fns, ran } = blog();
    await using server = serve({ ...defaults, transformer, fns });
    const list = sent('posts', undefined);
    const author = call({
      parent: list,
      path: 'author',
      input: {},
      reads: [{ to: ['id'], item: ['authorId'] }],
      list: [['items']],
    });

    const res = await send({
      ...defaults,
      transformer,
      url: server.url,
      method,
      sent: [list],
      calls: [author],
    });

    expect(res.of(author)).toEqual([
      { data: authors[0] },
      { data: authors[1] },
      { error: { code: 'NOT_FOUND', message: 'No author' } },
    ]);
    expect(ran.filter(([path]) => path === 'author')).toHaveLength(3);
  });

  test('`null` in a path reads a value of every item of a list', async () => {
    const { fns } = blog();
    await using server = serve({
      ...defaults,
      transformer,
      limits: wholeValues,
      fns,
    });
    const post = sent('post', { slug: 'hello' });
    const tags = call({
      parent: post,
      path: 'tags',
      input: {},
      reads: [{ to: ['ids'], data: ['tags', null, 'id'] }],
      list: null,
    });

    const res = await send({
      ...defaults,
      transformer,
      url: server.url,
      method,
      sent: [post],
      calls: [tags],
    });

    expect(res.of(tags)).toEqual({
      data: [
        { id: 't1', name: '#t1' },
        { id: 't2', name: '#t2' },
      ],
    });
  });

  test('a call that fails gives its follow-ups an error and runs none of them, and neither of theirs', async () => {
    const { fns, ran } = blog();
    await using server = serve({ ...defaults, transformer, fns });
    const post = sent('post', { slug: 'gone' });
    const author = call({
      parent: post,
      path: 'author',
      input: {},
      reads: [{ to: ['id'], data: ['authorId'] }],
      list: null,
    });
    const team = call({
      parent: author,
      path: 'team',
      input: {},
      reads: [{ to: ['id'], data: ['teamId'] }],
      list: null,
    });
    const tags = call({
      parent: post,
      path: 'tag',
      input: {},
      reads: [{ to: ['id'], item: ['id'] }],
      list: [['tags']],
    });

    const res = await send({
      ...defaults,
      transformer,
      url: server.url,
      method,
      sent: [post],
      calls: [author, team, tags],
    });

    const failed = {
      code: 'PRECONDITION_FAILED',
      message: 'The call this call reads its input from failed',
    };
    expect(res.of(post)).toEqual({
      error: { code: 'NOT_FOUND', message: 'No post' },
    });
    expect(res.of(author)).toEqual({ error: failed });
    expect(res.of(team)).toEqual({ failed });
    expect(res.of(tags)).toEqual({ failed });
    expect(ran).toEqual([['post', { slug: 'gone' }]]);
  });

  test('a node that fails for one item gives its follow-ups an error for that item only', async () => {
    const { fns, ran } = blog();
    await using server = serve({ ...defaults, transformer, fns });
    const list = sent('posts', undefined);
    const author = call({
      parent: list,
      path: 'author',
      input: {},
      reads: [{ to: ['id'], item: ['authorId'] }],
      list: [['items']],
    });
    const team = call({
      parent: author,
      path: 'team',
      input: {},
      reads: [{ to: ['id'], data: ['teamId'] }],
      list: null,
    });

    const res = await send({
      ...defaults,
      transformer,
      url: server.url,
      method,
      sent: [list],
      calls: [author, team],
    });

    expect(res.of(team)).toEqual([
      { data: { id: 'infra', members: ['ada', 'sam'] } },
      { data: { id: 'web', members: ['lin'] } },
      {
        error: {
          code: 'PRECONDITION_FAILED',
          message: 'The call this call reads its input from failed',
        },
      },
    ]);
    expect(ran.filter(([path]) => path === 'team')).toHaveLength(2);
  });

  test('with a streamed response too', async () => {
    const { fns } = blog();
    await using server = serve({ ...defaults, transformer, stream: true, fns });
    const list = sent('posts', undefined);
    const author = call({
      parent: list,
      path: 'author',
      input: {},
      reads: [{ to: ['id'], item: ['authorId'] }],
      list: [['items']],
    });
    const team = call({
      parent: author,
      path: 'team',
      input: {},
      reads: [{ to: ['id'], data: ['teamId'] }],
      list: null,
    });

    const res = await send({
      ...defaults,
      transformer,
      stream: true,
      url: server.url,
      method,
      sent: [list],
      calls: [author, team],
    });

    expect(res.of(list)).toEqual({ data: { items: posts } });
    expect(res.of(author)).toEqual([
      { data: authors[0] },
      { data: authors[1] },
      { error: { code: 'NOT_FOUND', message: 'No author' } },
    ]);
    expect(res.of(team)).toEqual([
      { data: { id: 'infra', members: ['ada', 'sam'] } },
      { data: { id: 'web', members: ['lin'] } },
      {
        error: {
          code: 'PRECONDITION_FAILED',
          message: 'The call this call reads its input from failed',
        },
      },
    ]);
  });
});

describe('what a node reads', () => {
  test('values of the item and of every call above it, anywhere in its input', async () => {
    const { fns } = blog();
    await using server = serve({ ...defaults, limits: wholeValues, fns });
    const list = sent('posts', undefined);
    const author = call({
      parent: list,
      path: 'author',
      input: {},
      reads: [{ to: ['id'], item: ['authorId'] }],
      list: [['items']],
    });
    const echo = call({
      parent: author,
      path: 'echo',
      input: { filter: { by: 'author' } },
      reads: [
        { to: ['filter', 'name'], data: ['name'] },
        // The item the author ran for
        { to: ['slug'], item: ['slug'], up: 1 },
        // The list the author is under
        { to: ['count'], data: ['items', '1', 'slug'], up: 2 },
      ],
      list: null,
    });

    const res = await send({
      ...defaults,
      url: server.url,
      method: 'POST',
      sent: [list],
      calls: [author, echo],
    });

    expect(res.of(echo)).toMatchObject([
      {
        data: {
          filter: { by: 'author', name: 'Ada' },
          slug: 'hello',
          count: 'again',
        },
      },
      { data: { filter: { name: 'Lin' }, slug: 'again' } },
      { error: { code: 'PRECONDITION_FAILED' } },
    ]);
  });

  test('its whole input', async () => {
    const { fns, ran } = blog();
    await using server = serve({ ...defaults, fns });
    const post = sent('post', { slug: 'hello' });
    const team = call({
      parent: post,
      path: 'echo',
      input: undefined,
      reads: [{ to: [], data: ['authorId'] }],
      list: null,
    });

    const res = await send({
      ...defaults,
      url: server.url,
      method: 'GET',
      sent: [post],
      calls: [team],
    });

    expect(res.of(team)).toEqual({ data: 'ada' });
    expect(ran[1]).toEqual(['echo', 'ada']);
  });

  test('what is not there is `undefined`: only own properties of objects and arrays are read', async () => {
    const owned = Object.assign(Object.create({ inherited: 'no' }), {
      own: 'yes',
    });
    expect(readPipelinePath(owned, ['inherited'])).toBeUndefined();
    expect(readPipelinePath(owned, ['own'])).toBe('yes');
    expect(readPipelinePath('text', ['length'])).toBeUndefined();
    expect(readPipelinePath({ a: 1 }, ['a', null])).toBeUndefined();
    expect(readPipelinePath({ a: [{ b: 1 }, {}] }, ['a', null, 'b'])).toEqual([
      1,
      undefined,
    ]);
    expect(readPipelinePath({}, ['__proto__'])).toBeUndefined();
    expect(readPipelinePath({}, ['constructor'])).toBeUndefined();
  });

  test('the data as the client gets it, and its input as a client sends it', async () => {
    const at = new Date('2026-01-01T00:00:00Z');
    const echo = vi.fn((input: unknown) => input);
    await using server = serve({
      ...defaults,
      transformer: transformers.superjson,
      // A `Date` is an object
      limits: wholeValues,
      fns: {
        post: () => ({ at, ids: new Set(['a']) }),
        echo,
      },
    });
    const post = sent('post', undefined);
    const reader = call({
      parent: post,
      path: 'echo',
      input: { since: at },
      reads: [{ to: ['at'], data: ['at'] }],
      list: null,
    });

    const res = await send({
      ...defaults,
      transformer: transformers.superjson,
      url: server.url,
      method: 'POST',
      sent: [post],
      calls: [reader],
    });

    expect(res.of(reader)).toEqual({ data: { since: at, at } });
    const [input] = echo.mock.calls[0] ?? [];
    expect((input as { at: unknown }).at).toBeInstanceOf(Date);
  });

  test('what is not there is in the input as in one a client fills in: `null` in a list, and left out of an object', async () => {
    const echo = vi.fn((input: unknown) => input);
    await using server = serve({
      ...defaults,
      fns: { post: () => ({}), echo },
    });
    const post = sent('post', undefined);
    const reader = call({
      parent: post,
      path: 'echo',
      input: { list: ['a', 'b'], object: { a: 1 } },
      reads: [
        { to: ['list', '1'], data: ['missing'] },
        { to: ['object', 'a'], data: ['missing'] },
      ],
      list: null,
    });

    const res = await send({
      ...defaults,
      url: server.url,
      method: 'POST',
      sent: [post],
      calls: [reader],
    });

    expect(res.of(reader)).toEqual({
      data: { list: ['a', null], object: {} },
    });
  });

  test('with a transformer that carries `undefined`, what is not there is `undefined`', async () => {
    const echo = vi.fn((input: unknown) => input);
    await using server = serve({
      ...defaults,
      transformer: transformers.superjson,
      fns: { post: () => ({}), echo },
    });
    const post = sent('post', undefined);
    const reader = call({
      parent: post,
      path: 'echo',
      input: { a: 1 },
      reads: [{ to: ['a'], data: ['missing'] }],
      list: null,
    });

    await send({
      ...defaults,
      transformer: transformers.superjson,
      url: server.url,
      method: 'POST',
      sent: [post],
      calls: [reader],
    });

    const [input] = echo.mock.calls[0] ?? [];
    expect(input).toEqual({ a: undefined });
    expect(Object.keys(input as object)).toEqual(['a']);
  });

  test('a copy: a function that changes its input changes nothing another reads', async () => {
    const author = { name: 'Ada' };
    await using server = serve({
      ...defaults,
      limits: wholeValues,
      fns: {
        post: () => ({ author }),
        change: (input: { author: { name: string } }) => {
          input.author.name = 'changed';
          return input;
        },
        echo: (input: unknown) => input,
      },
    });
    const post = sent('post', undefined);
    const change = call({
      parent: post,
      path: 'change',
      input: {},
      reads: [{ to: ['author'], data: ['author'] }],
      list: null,
    });
    const echo = call({
      parent: post,
      path: 'echo',
      input: {},
      reads: [{ to: ['author'], data: ['author'] }],
      list: null,
    });

    const res = await send({
      ...defaults,
      url: server.url,
      method: 'POST',
      sent: [post],
      calls: [change, echo],
    });

    expect(res.of(echo)).toEqual({ data: { author: { name: 'Ada' } } });
    expect(author).toEqual({ name: 'Ada' });
  });

  test('a follow-up whose data cannot go over the wire gives the follow-ups under it an error', async () => {
    const echo = vi.fn((input: unknown) => input);
    await using server = serve({
      ...defaults,
      fns: { post: () => ({ id: 'p' }), big: () => ({ n: BigInt(1) }), echo },
    });
    const post = sent('post', undefined);
    const big = call({
      parent: post,
      path: 'big',
      input: {},
      reads: [{ to: ['id'], data: ['id'] }],
      list: null,
    });
    const reader = call({
      parent: big,
      path: 'echo',
      input: {},
      reads: [{ to: ['n'], data: ['n'] }],
      list: null,
    });

    const res = await send({
      ...defaults,
      url: server.url,
      method: 'POST',
      sent: [post],
      calls: [big, reader],
    });

    expect(res.of(big)).toMatchObject({
      error: { code: 'INTERNAL_SERVER_ERROR' },
    });
    expect(res.of(reader)).toMatchObject({
      error: { code: 'PRECONDITION_FAILED' },
    });
    expect(echo).not.toHaveBeenCalled();
  });

  test('a call whose data is `undefined` gives its follow-ups nothing', async () => {
    const echo = vi.fn((input: unknown) => input === undefined);
    await using server = serve({
      ...defaults,
      fns: { nothing: () => undefined, echo },
    });
    const nothing = sent('nothing', undefined);
    const reader = call({
      parent: nothing,
      path: 'echo',
      input: undefined,
      reads: [{ to: [], data: [] }],
      list: null,
    });

    const res = await send({
      ...defaults,
      url: server.url,
      method: 'POST',
      sent: [nothing],
      calls: [reader],
    });

    expect(res.of(reader)).toEqual({ data: true });
  });

  test('an input the transformer cannot read fails with a bad request', async () => {
    const echo = vi.fn();
    const strict: CombinedDataTransformer = {
      input: {
        serialize: (it) => it,
        deserialize: (it) => {
          if (isObject(it) && it['broken']) {
            throw new Error('unreadable');
          }
          return it;
        },
      },
      output: transformers.none.output,
    };
    await using server = serve({
      ...defaults,
      transformer: strict,
      fns: { post: () => ({ id: 'ada' }), echo },
    });
    const post = sent('post', undefined);
    const reader = call({
      parent: post,
      path: 'echo',
      input: { broken: true },
      reads: [{ to: ['id'], data: ['id'] }],
      list: null,
    });

    const res = await send({
      ...defaults,
      transformer: strict,
      url: server.url,
      method: 'POST',
      sent: [post],
      calls: [reader],
    });

    expect(res.of(reader)).toEqual({
      error: { code: 'BAD_REQUEST', message: 'unreadable' },
    });
    expect(echo).not.toHaveBeenCalled();
  });

  test('data that cannot go over the wire gives the follow-ups that read it an error', async () => {
    const echo = vi.fn((input: unknown) => input);
    await using server = serve({
      ...defaults,
      fns: { post: () => ({ big: BigInt(1) }), echo },
    });
    const post = sent('post', undefined);
    const reader = call({
      parent: post,
      path: 'echo',
      input: {},
      reads: [{ to: ['big'], data: ['big'] }],
      list: null,
    });

    const res = await send({
      ...defaults,
      url: server.url,
      method: 'POST',
      sent: [post],
      calls: [reader],
    });

    expect(res.of(post)).toMatchObject({
      error: { code: 'INTERNAL_SERVER_ERROR' },
    });
    expect(res.of(reader)).toMatchObject({
      error: { code: 'PRECONDITION_FAILED' },
    });
    expect(echo).not.toHaveBeenCalled();
  });
});

describe('a list key', () => {
  test('a follow-up reads values of the item and values that are the same for every run, in the order they are written', async () => {
    const echo = vi.fn((input: unknown) => input);
    await using server = serve({
      ...defaults,
      fns: {
        list: () => ({ from: 'list', items: [{ id: 'a' }, { id: 'b' }] }),
        echo,
      },
    });
    const list = sent('list', undefined);
    const each = call({
      parent: list,
      path: 'echo',
      input: {},
      reads: [
        { to: ['from'], data: ['from'] },
        { to: ['id'], item: ['id'] },
        { to: ['from'], item: ['id'] },
      ],
      list: [['items']],
    });

    const res = await send({
      ...defaults,
      url: server.url,
      method: 'POST',
      sent: [list],
      calls: [each],
    });

    expect(res.of(each)).toEqual([
      { data: { from: 'a', id: 'a' } },
      { data: { from: 'b', id: 'b' } },
    ]);
  });

  test('a list with holes has a run for each of them, and what is no list has no items', async () => {
    const echo = vi.fn((input: unknown) => input);
    await using server = serve({
      ...defaults,
      fns: {
        list: () => ({ holes: [{ id: 'a' }, , { id: 'c' }], none: 'text' }),
        echo,
      },
    });
    const list = sent('list', undefined);
    const holes = call({
      parent: list,
      path: 'echo',
      input: {},
      reads: [{ to: ['id'], item: ['id'] }],
      list: [['holes']],
    });
    const none = call({
      parent: list,
      path: 'echo',
      input: {},
      reads: [{ to: ['id'], item: ['id'] }],
      list: [['none']],
    });

    const res = await send({
      ...defaults,
      url: server.url,
      method: 'POST',
      sent: [list],
      calls: [holes, none],
    });

    expect(res.of(holes)).toEqual([
      { data: { id: 'a' } },
      { data: {} },
      { data: { id: 'c' } },
    ]);
    expect(res.of(none)).toEqual([]);
  });

  test('a list of lists, as one key or as a list key inside another: a level of lists for each', async () => {
    const echo = vi.fn((input: unknown) => input);
    await using server = serve({
      ...defaults,
      fns: {
        pages: () => ({
          pages: [
            { items: [{ id: 'a' }, { id: 'b' }] },
            { items: [{ id: 'c' }] },
          ],
        }),
        echo,
      },
    });
    const pages = sent('pages', undefined);
    const oneKey = call({
      parent: pages,
      path: 'echo',
      input: {},
      reads: [{ to: ['id'], item: ['id'] }],
      list: [['pages'], ['items']],
    });

    const res = await send({
      ...defaults,
      url: server.url,
      method: 'POST',
      sent: [pages],
      calls: [oneKey],
    });

    expect(res.of(oneKey)).toEqual([
      [{ data: { id: 'a' } }, { data: { id: 'b' } }],
      [{ data: { id: 'c' } }],
    ]);
    await using streaming = serve({
      ...defaults,
      stream: true,
      fns: {
        pages: () => ({
          pages: [
            { items: [{ id: 'a' }, { id: 'b' }] },
            { items: [{ id: 'c' }] },
          ],
        }),
        echo,
      },
    });
    const streamed = await send({
      ...defaults,
      stream: true,
      url: streaming.url,
      method: 'POST',
      sent: [pages],
      calls: [oneKey],
    });
    expect(streamed.of(oneKey)).toEqual(res.of(oneKey));

    // The same, as `pages[]` with `items[]` inside it
    const tree: PipeTree = {
      0: {
        'pages[]': {
          'items[]': {
            echo: {
              path: 'echo',
              input: {},
              reads: [{ to: ['id'], item: ['id'] }],
            },
          },
        },
      },
    };
    const response = await fetch(
      `${server.url}/pages?batch=tree&tree=${encodeURIComponent(JSON.stringify(tree))}`,
    );
    expect(await response.json()).toEqual([
      {
        result: expect.anything(),
        children: {
          'pages[]': [
            {
              'items[]': [
                { echo: { result: { data: { id: 'a' } } } },
                { echo: { result: { data: { id: 'b' } } } },
              ],
            },
            {
              'items[]': [{ echo: { result: { data: { id: 'c' } } } }],
            },
          ],
        },
      },
    ]);
  });

  test('a follow-up of a follow-up that runs for every item runs for every item too, and a list key under it for every item of its data', async () => {
    const { fns, ran } = blog();
    await using server = serve({
      ...defaults,
      limits: { ...pipelineLimitDefaults, maxDepth: 4 },
      fns,
    });
    const list = sent('posts', undefined);
    const author = call({
      parent: list,
      path: 'author',
      input: {},
      reads: [{ to: ['id'], item: ['authorId'] }],
      list: [['items']],
    });
    const team = call({
      parent: author,
      path: 'team',
      input: {},
      reads: [{ to: ['id'], data: ['teamId'] }],
      list: null,
    });
    const members = call({
      parent: team,
      path: 'author',
      input: {},
      reads: [{ to: ['id'], item: [] }],
      list: [['members']],
    });

    const res = await send({
      ...defaults,
      url: server.url,
      method: 'POST',
      sent: [list],
      calls: [author, team, members],
    });

    expect(res.of(members)).toEqual([
      [{ data: authors[0] }, { data: authors[2] }],
      [{ data: authors[1] }],
      {
        error: {
          code: 'PRECONDITION_FAILED',
          message: 'The call this call reads its input from failed',
        },
      },
    ]);
    expect(ran.filter(([path]) => path === 'author')).toHaveLength(6);
  });

  test('every run counts towards the most runs a request may have, and a node that is refused takes none', async () => {
    const echo = vi.fn((input: unknown) => input);
    await using server = serve({
      ...defaults,
      // The list, and three runs: not the fourth and fifth too
      maxRuns: 4,
      fns: { list: () => ({ three: [1, 2, 3], two: [1, 2] }), echo },
    });
    const list = sent('list', undefined);
    const two = call({
      parent: list,
      path: 'echo',
      input: {},
      reads: [{ to: ['n'], item: [] }],
      list: [['two']],
    });
    const three = call({
      parent: list,
      path: 'echo',
      input: {},
      reads: [{ to: ['n'], item: [] }],
      list: [['three']],
    });
    const one = call({
      parent: list,
      path: 'echo',
      input: {},
      reads: [{ to: ['n'], data: ['two', '0'] }],
      list: null,
    });

    const res = await send({
      ...defaults,
      url: server.url,
      method: 'POST',
      sent: [list],
      calls: [two, three, one],
    });

    expect(res.of(two)).toEqual([{ data: { n: 1 } }, { data: { n: 2 } }]);
    const refused = {
      error: {
        code: 'BAD_REQUEST',
        message: 'A call for every item exceeds the maximum batch size',
      },
    };
    expect(res.of(three)).toEqual([refused, refused, refused]);
    // What three would have taken is still there
    expect(res.of(one)).toEqual({ data: { n: 1 } });
    expect(echo).toHaveBeenCalledTimes(3);
  });

  test('a node under an empty list has no run, and takes none', async () => {
    const echo = vi.fn((input: unknown) => input);
    await using server = serve({
      ...defaults,
      maxRuns: 2,
      fns: { list: () => ({ empty: [], one: [1] }), echo },
    });
    const list = sent('list', undefined);
    const empty = call({
      parent: list,
      path: 'echo',
      input: {},
      reads: [{ to: ['n'], item: [] }],
      list: [['empty']],
    });
    const one = call({
      parent: list,
      path: 'echo',
      input: {},
      reads: [{ to: ['n'], item: [] }],
      list: [['one']],
    });

    const res = await send({
      ...defaults,
      url: server.url,
      method: 'POST',
      sent: [list],
      calls: [empty, one],
    });

    expect(res.of(empty)).toEqual([]);
    expect(res.of(one)).toEqual([{ data: { n: 1 } }]);
  });
});

describe('the limits of a server', () => {
  test('`true` is the defaults, and an object sets the ones it has', () => {
    expect(pipelineLimitsOf(true)).toEqual({
      maxValueLength: 1024,
      maxReadsPerCall: 16,
      maxFillSize: 100_000,
      maxDepth: 3,
      allowWholeValues: false,
    });
    expect(pipelineLimitsOf({ maxDepth: 5, allowWholeValues: true })).toEqual({
      ...pipelineLimitDefaults,
      maxDepth: 5,
      allowWholeValues: true,
    });
    expect(
      pipelineLimitsOf({
        maxValueLength: 1,
        maxReadsPerCall: 2,
        maxFillSize: 3,
        maxDepth: 4,
        allowWholeValues: true,
      }),
    ).toEqual({
      maxValueLength: 1,
      maxReadsPerCall: 2,
      maxFillSize: 3,
      maxDepth: 4,
      allowWholeValues: true,
    });
    expect(pipelineLimitsOf({})).toEqual(pipelineLimitDefaults);
    expect(pipelineLimitsOf(false)).toBeNull();
    expect(pipelineLimitsOf(undefined)).toBeNull();
  });

  /** Sends a batch to a server with `limits`, and what ran */
  async function sendWith(opts: {
    limits: PipelineLimits;
    fns: Record<string, Fn>;
    sent: Sent[];
    calls: Call[];
  }) {
    const ran: string[] = [];
    await using server = serve({
      ...defaults,
      limits: opts.limits,
      fns: Object.fromEntries(
        Object.entries(opts.fns).map(([path, fn]) => [
          path,
          (input: unknown) => {
            ran.push(path);
            return fn(input);
          },
        ]),
      ),
    });
    const res = await send({
      ...defaults,
      url: server.url,
      method: 'POST',
      sent: opts.sent,
      calls: opts.calls,
    });
    return { res, ran };
  }

  const refused = (message: string) => ({
    error: { code: 'BAD_REQUEST', message },
  });

  describe('`maxReadsPerCall`', () => {
    const post = sent('post', undefined);
    const reading = (path: string, count: number) =>
      call({
        parent: post,
        path,
        input: {},
        reads: Array.from({ length: count }, (_it, index) => ({
          to: [`k${index}`],
          data: ['id'],
        })),
        list: null,
      });
    const fns = { post: () => ({ id: 'ada' }), over: () => 1, within: () => 2 };

    test.each([
      { limits: pipelineLimitDefaults, max: 16 },
      { limits: { ...pipelineLimitDefaults, maxReadsPerCall: 20 }, max: 20 },
      { limits: { ...pipelineLimitDefaults, maxReadsPerCall: 1 }, max: 1 },
    ])(
      'a node that reads more than $max values is refused, and the rest of the batch runs',
      async ({ limits, max }) => {
        const over = reading('over', max + 1);
        const within = reading('within', max);

        const { res, ran } = await sendWith({
          limits,
          fns,
          sent: [post],
          calls: [over, within],
        });

        expect(res.of(over)).toEqual(
          refused(
            `This call reads ${max + 1} values, more than \`maxReadsPerCall\` (${max}) allows`,
          ),
        );
        expect(res.of(within)).toEqual({ data: 2 });
        expect(ran).toEqual(['post', 'within']);
      },
    );
  });

  describe('`maxDepth`: how deep queries nest', () => {
    // `post` is 1, `author` 2, `team` 3 and `teamPosts` 4
    const post = sent('post', undefined);
    const author = call({
      parent: post,
      path: 'author',
      input: {},
      reads: [{ to: ['id'], data: ['authorId'] }],
      list: null,
    });
    const team = call({
      parent: author,
      path: 'team',
      input: {},
      reads: [{ to: ['id'], data: ['teamId'] }],
      list: null,
    });
    const teamPosts = call({
      parent: team,
      path: 'teamPosts',
      input: {},
      reads: [{ to: ['id'], data: ['id'] }],
      list: null,
    });
    // 5: under one that is refused
    const first = call({
      parent: teamPosts,
      path: 'first',
      input: {},
      reads: [{ to: ['slug'], data: ['0'] }],
      list: null,
    });
    const fns = {
      post: () => ({ slug: 'hello', authorId: 'ada' }),
      author: () => ({ id: 'ada', teamId: 'infra' }),
      team: () => ({ id: 'infra' }),
      teamPosts: () => ['hello'],
      first: () => 'first',
    };
    const deep = (depth: number, max: number) =>
      refused(
        `This call is nested ${depth} deep, more than \`maxDepth\` (${max}) allows`,
      );

    test('a node more than 3 calls deep is refused, what is under it gets an error, and the rest runs', async () => {
      const { res, ran } = await sendWith({
        limits: pipelineLimitDefaults,
        fns,
        sent: [post],
        calls: [author, team, teamPosts, first],
      });

      expect(res.of(team)).toEqual({ data: { id: 'infra' } });
      expect(res.of(teamPosts)).toEqual(deep(4, 3));
      expect(res.of(first)).toMatchObject({
        error: { code: 'PRECONDITION_FAILED' },
      });
      expect(ran).toEqual(['post', 'author', 'team']);
    });

    test('raised, a deeper tree runs, and lowered, a shallower one is refused', async () => {
      const raised = await sendWith({
        limits: { ...pipelineLimitDefaults, maxDepth: 5 },
        fns,
        sent: [post],
        calls: [author, team, teamPosts, first],
      });
      expect(raised.res.of(first)).toEqual({ data: 'first' });

      const lowered = await sendWith({
        limits: { ...pipelineLimitDefaults, maxDepth: 2 },
        fns,
        sent: [post],
        calls: [author, team],
      });
      expect(lowered.res.of(author)).toEqual({
        data: { id: 'ada', teamId: 'infra' },
      });
      expect(lowered.res.of(team)).toEqual(deep(3, 2));
    });

    test('a list key adds no depth', async () => {
      const list = sent('list', undefined);
      const each = call({
        parent: list,
        path: 'each',
        input: {},
        reads: [{ to: ['n'], item: [] }],
        list: [['a'], ['b']],
      });

      const { res } = await sendWith({
        limits: { ...pipelineLimitDefaults, maxDepth: 2 },
        fns: { list: () => ({ a: [{ b: [1] }] }), each: () => 1 },
        sent: [list],
        calls: [each],
      });

      expect(res.of(each)).toEqual([[{ data: 1 }]]);
    });
  });

  describe('`maxValueLength`', () => {
    const post = sent('post', undefined);
    const reads = (path: string) =>
      call({
        parent: post,
        path,
        input: {},
        reads: [{ to: ['v'], data: [path] }],
        list: null,
      });
    // Its quotes count: `"xx"` is 4 characters of JSON
    const ofLength = (length: number) => 'x'.repeat(length - 2);

    test.each([
      { limits: pipelineLimitDefaults, max: 1024 },
      { limits: { ...pipelineLimitDefaults, maxValueLength: 2000 }, max: 2000 },
      { limits: { ...pipelineLimitDefaults, maxValueLength: 10 }, max: 10 },
    ])(
      'a node that reads a value longer than $max characters of JSON is refused, and the rest of the batch runs',
      async ({ limits, max }) => {
        const over = reads('over');
        const within = reads('within');

        const { res, ran } = await sendWith({
          limits,
          fns: {
            post: () => ({ over: ofLength(max + 1), within: ofLength(max) }),
            over: () => 1,
            within: () => 2,
          },
          sent: [post],
          calls: [over, within],
        });

        expect(res.of(over)).toEqual(
          refused(
            `A value this call reads is longer than \`maxValueLength\` (${max} characters of JSON) allows`,
          ),
        );
        expect(res.of(within)).toEqual({ data: 2 });
        expect(ran).toEqual(['post', 'within']);
      },
    );

    test('a value of an item counts, and a node that runs for every item runs for none if one is too long', async () => {
      const list = sent('list', undefined);
      const each = call({
        parent: list,
        path: 'each',
        input: {},
        reads: [{ to: ['v'], item: ['v'] }],
        list: [['items']],
      });

      const { res, ran } = await sendWith({
        limits: { ...pipelineLimitDefaults, maxValueLength: 10 },
        fns: {
          list: () => ({ items: [{ v: 'short' }, { v: ofLength(11) }] }),
          each: () => 1,
        },
        sent: [list],
        calls: [each],
      });

      const error = refused(
        'A value this call reads is longer than `maxValueLength` (10 characters of JSON) allows',
      );
      expect(res.of(each)).toEqual([error, error]);
      expect(ran).toEqual(['list']);
    });
  });

  describe('`allowWholeValues`', () => {
    const post = sent('post', undefined);
    const reads = (path: string) =>
      call({
        parent: post,
        path,
        input: {},
        reads: [{ to: ['v'], data: [path] }],
        list: null,
      });
    const fns = {
      post: () => ({
        author: { id: 'ada' },
        tags: ['a'],
        text: 'a',
        number: 1,
        boolean: false,
        nothing: null,
      }),
      author: (input: { v: unknown }) => input.v,
      tags: (input: { v: unknown }) => input.v,
      text: (input: { v: unknown }) => input.v,
      number: (input: { v: unknown }) => input.v,
      boolean: (input: { v: unknown }) => input.v,
      nothing: (input: { v: unknown }) => input.v,
      missing: (input: { v?: unknown }) => 'v' in input,
    };
    const whole = refused(
      'A value this call reads is an object or an array, and `allowWholeValues` is false',
    );

    test('a read that lands on an object or an array is refused by default, and the rest of the batch runs', async () => {
      const calls = [
        'author',
        'tags',
        'text',
        'number',
        'boolean',
        'nothing',
        'missing',
      ].map(reads);

      const { res, ran } = await sendWith({
        limits: pipelineLimitDefaults,
        fns,
        sent: [post],
        calls,
      });

      expect(calls.map((it) => res.of(it))).toEqual([
        whole,
        whole,
        { data: 'a' },
        { data: 1 },
        { data: false },
        { data: null },
        // What isn't there is left out of the input, as JSON leaves it out
        { data: false },
      ]);
      expect(ran).toEqual([
        'post',
        'text',
        'number',
        'boolean',
        'nothing',
        'missing',
      ]);
    });

    test('`allowWholeValues: true` lets a read land on an object or an array', async () => {
      const author = reads('author');
      const tags = reads('tags');

      const { res } = await sendWith({
        limits: wholeValues,
        fns,
        sent: [post],
        calls: [author, tags],
      });

      expect(res.of(author)).toEqual({ data: { id: 'ada' } });
      expect(res.of(tags)).toEqual({ data: ['a'] });
    });

    test('an item itself is a whole value, and a value of it is not', async () => {
      const list = sent('list', undefined);
      const items = call({
        parent: list,
        path: 'items',
        input: {},
        reads: [{ to: ['v'], item: [] }],
        list: [['items']],
      });
      const ids = call({
        parent: list,
        path: 'ids',
        input: {},
        reads: [{ to: ['v'], item: ['id'] }],
        list: [['items']],
      });

      const { res } = await sendWith({
        limits: pipelineLimitDefaults,
        fns: {
          list: () => ({ items: [{ id: 'a' }] }),
          items: () => 1,
          ids: (input: { v: unknown }) => input.v,
        },
        sent: [list],
        calls: [items, ids],
      });

      expect(res.of(items)).toEqual([whole]);
      expect(res.of(ids)).toEqual([{ data: 'a' }]);
    });
  });

  describe('`maxFillSize`: what a request fills in', () => {
    // A value is copied into every input it goes in. Without a limit, a small
    // request could make the server copy a large result many times over
    const maxFillSize = 1000;
    const limits: PipelineLimits = {
      ...pipelineLimitDefaults,
      maxFillSize,
      maxValueLength: maxFillSize,
    };
    const big = 'x'.repeat(Math.ceil(maxFillSize * 0.4));
    const over = refused(
      `What this call fills in goes over \`maxFillSize\` (${maxFillSize} characters of JSON for the batch)`,
    );

    test('a node that would go over `maxFillSize` is refused, and takes none of it', async () => {
      const post = sent('post', undefined);
      const node = (n: number, count: number) =>
        call({
          parent: post,
          path: 'echo',
          input: { n },
          reads: Array.from({ length: count }, (_it, index) => ({
            to: [`big${index}`],
            data: ['big'],
          })),
          list: null,
        });
      const fits = node(1, 1);
      const tooMuch = node(2, 2);
      const small = call({
        parent: post,
        path: 'echo',
        input: { n: 3 },
        reads: [{ to: ['id'], data: ['id'] }],
        list: null,
      });
      const echo = vi.fn((input: { n: number }) => input.n);

      const { res } = await sendWith({
        limits,
        fns: { post: () => ({ big, id: 'ada' }), echo },
        sent: [post],
        calls: [fits, tooMuch, small],
      });

      expect(res.of(fits)).toEqual({ data: 1 });
      expect(res.of(tooMuch)).toEqual(over);
      expect(res.of(small)).toEqual({ data: 3 });
      expect(echo.mock.calls.map(([input]) => input.n)).toEqual([1, 3]);
    });

    test('a string counts as long as it is in JSON, escapes included', async () => {
      // Twice as long in JSON: each `\n` is two characters there
      const lines = '\n'.repeat(Math.ceil(maxFillSize * 0.3));
      const post = sent('post', undefined);
      const reader = call({
        parent: post,
        path: 'echo',
        input: {},
        reads: [
          { to: ['a'], data: ['lines'] },
          { to: ['b'], data: ['lines'] },
        ],
        list: null,
      });

      const { res, ran } = await sendWith({
        limits,
        fns: { post: () => ({ lines }), echo: () => null },
        sent: [post],
        calls: [reader],
      });

      expect(res.of(reader)).toEqual(over);
      expect(ran).toEqual(['post']);
    });

    test('a node whose input can not be written to takes none of it', async () => {
      const post = sent('post', undefined);
      const broken = call({
        parent: post,
        path: 'echo',
        input: { id: 'text' },
        reads: [{ to: ['id', 'big'], data: ['big'] }],
        list: null,
      });
      const fits = call({
        parent: post,
        path: 'echo',
        input: {},
        reads: [{ to: ['big'], data: ['big'] }],
        list: null,
      });

      const { res } = await sendWith({
        limits,
        fns: {
          post: () => ({ big: 'x'.repeat(maxFillSize * 0.6) }),
          echo: () => null,
        },
        sent: [post],
        calls: [broken, fits],
      });

      expect(res.of(broken)).toMatchObject({ error: { code: 'BAD_REQUEST' } });
      expect(res.of(fits)).toEqual({ data: null });
    });

    test('every run of a node for every item counts, with its whole input', async () => {
      const list = sent('list', undefined);
      // Three runs, each with the big value: too much together
      const withValue = call({
        parent: list,
        path: 'echo',
        input: {},
        reads: [
          { to: ['n'], item: [] },
          { to: ['big'], data: ['big'] },
        ],
        list: [['three']],
      });
      // Two runs, each with an input that is the big value
      const withInput = call({
        parent: list,
        path: 'echo',
        input: { big },
        reads: [{ to: ['n'], item: [] }],
        list: [['two']],
      });
      const echo = vi.fn((input: { n: number }) => input.n);

      const { res } = await sendWith({
        limits,
        fns: { list: () => ({ big, three: [1, 2, 3], two: [1, 2] }), echo },
        sent: [list],
        calls: [withValue, withInput],
      });

      expect(res.of(withValue)).toEqual([over, over, over]);
      expect(res.of(withInput)).toEqual([{ data: 1 }, { data: 2 }]);
      expect(echo).toHaveBeenCalledTimes(2);
    });
  });
});

describe('how long a value is, for what a request fills in', () => {
  test('is how long it is in JSON', () => {
    const sizeOf = createPipelineSizeOf();
    const value = { a: ['x\ny', 1, true, null], b: { c: 'z' } };

    expect(sizeOf(value, Infinity)).toBe(JSON.stringify(value).length);
  });

  test('a string longer than the room is too long without being measured', () => {
    const sizeOf = createPipelineSizeOf();
    const stringify = vi.spyOn(JSON, 'stringify');

    expect(sizeOf('x'.repeat(100), 10)).toBe(102);
    expect(stringify).not.toHaveBeenCalled();
    stringify.mockRestore();
  });

  test('an object is measured until it is longer than the room, and once', () => {
    const sizeOf = createPipelineSizeOf();
    const reads: string[] = [];
    const counted = <T extends object>(value: T) =>
      new Proxy(value, {
        get(target, key, receiver) {
          if (typeof key === 'string') {
            reads.push(key);
          }
          return Reflect.get(target, key, receiver);
        },
      });
    const object = counted({ a: 'xxxx', b: 'xxxx', c: 'xxxx' });

    expect(sizeOf(object, 10)).toBeGreaterThan(10);
    // `{"a":"xxxx"` is longer than 10 already
    expect(reads.filter((key) => key !== 'constructor')).toEqual(['a']);
    reads.length = 0;
    expect(sizeOf(object, 10)).toBeGreaterThan(10);
    expect(reads).toEqual([]);
    // More room measures it again, and then it knows it whole
    expect(sizeOf(object, Infinity)).toBe(JSON.stringify(object).length);
    const array = counted(['xxxx', 'xxxx', 'xxxx']);
    expect(sizeOf(array, 8)).toBeGreaterThan(8);
    // A value inside itself counts as nothing the second time
    const self: Record<string, unknown> = {};
    self['self'] = self;
    expect(sizeOf(self, Infinity)).toBe('{"self":}'.length);
  });
});

describe('a call that failed', () => {
  test('is reported with the input it ran with, filled in', async () => {
    const onError = vi.fn();
    const { fns } = blog();
    await using server = serve({ ...defaults, fns, onError });
    const post = sent('post', { slug: 'orphan' });
    const author = call({
      parent: post,
      path: 'author',
      input: {},
      reads: [{ to: ['id'], data: ['authorId'] }],
      list: null,
    });

    await send({
      ...defaults,
      url: server.url,
      method: 'POST',
      sent: [post],
      calls: [author],
    });

    expect(onError.mock.calls).toEqual([['author', { id: 'nobody' }]]);
  });
});

describe('the order things happen in', () => {
  test('follow-ups that read nothing of each other run at the same time, and one runs after the call it is under', async () => {
    const events: string[] = [];
    const slow = (name: string, ms: number, data: unknown) => async () => {
      events.push(`start ${name}`);
      await new Promise((resolve) => setTimeout(resolve, ms));
      events.push(`end ${name}`);
      return data;
    };
    await using server = serve({
      ...defaults,
      fns: {
        post: slow('post', 5, { id: 'p' }),
        a: slow('a', 20, { id: 'a' }),
        b: slow('b', 5, { id: 'b' }),
        c: slow('c', 1, 'c'),
      },
    });
    const post = sent('post', undefined);
    const a = call({
      parent: post,
      path: 'a',
      input: {},
      reads: [{ to: ['id'], data: ['id'] }],
      list: null,
    });
    const b = call({
      parent: post,
      path: 'b',
      input: {},
      reads: [{ to: ['id'], data: ['id'] }],
      list: null,
    });
    const c = call({
      parent: b,
      path: 'c',
      input: {},
      reads: [{ to: ['id'], data: ['id'] }],
      list: null,
    });

    await send({
      ...defaults,
      url: server.url,
      method: 'POST',
      sent: [post],
      calls: [a, b, c],
    });

    expect(events).toEqual([
      'start post',
      'end post',
      'start a',
      'start b',
      'end b',
      // Under b, it doesn't wait for a
      'start c',
      'end c',
      'end a',
    ]);
  });

  test('streamed, each node arrives when it is ready, before what is under it', async () => {
    const wait = (ms: number) =>
      new Promise((resolve) => setTimeout(resolve, ms));
    await using server = serve({
      ...defaults,
      stream: true,
      fns: {
        post: async () => ({ id: 'p' }),
        author: async () => {
          await wait(5);
          return { id: 'a' };
        },
        slowTeam: async () => {
          await wait(60);
          return { id: 't' };
        },
        other: async () => {
          await wait(20);
          return 'other';
        },
      },
    });
    const post = sent('post', undefined);
    const author = call({
      parent: post,
      path: 'author',
      input: {},
      reads: [{ to: ['id'], data: ['id'] }],
      list: null,
    });
    const team = call({
      parent: author,
      path: 'slowTeam',
      input: {},
      reads: [{ to: ['id'], data: ['id'] }],
      list: null,
    });
    const other = call({
      parent: post,
      path: 'other',
      input: {},
      reads: [{ to: ['id'], data: ['id'] }],
      list: null,
    });

    const res = await send({
      ...defaults,
      stream: true,
      url: server.url,
      method: 'POST',
      sent: [post],
      calls: [author, team, other],
    });

    // The author doesn't wait for the team under it
    expect(res.arrived).toEqual(['post', 'author', 'other', 'slowTeam']);
  });
});

describe('what a client puts in a request', () => {
  const post = sent('post', undefined);
  const author = call({
    parent: post,
    path: 'author',
    input: {},
    reads: [{ to: ['id'], data: ['authorId'] }],
    list: null,
  });
  const team = call({
    parent: author,
    path: 'team',
    input: undefined,
    reads: [{ to: ['id'], data: ['teamId'] }],
    list: null,
  });
  const plan = (calls: Call[], fits: (count: number) => boolean) =>
    planPipelineTree({
      sent: [post],
      calls,
      serialize: (input) => input,
      fits: (next) => fits(next.calls.length),
    });

  test('a node that does not fit is left out, and so is what is under it', () => {
    const planned = plan([author, team], (count) => count < 1);
    expect(planned.calls).toEqual([]);
    expect(planned.left).toEqual([author, team]);
    expect(planned.tree).toEqual({});
  });

  test('a node that fits goes, also when a later one does not', () => {
    const planned = plan([author, team], (count) => count < 2);
    expect(planned.calls).toEqual([author]);
    expect(planned.left).toEqual([team]);
  });

  test('a node goes under what the request has, by its index', () => {
    const planned = planPipelineTree({
      sent: [null, post],
      calls: [author],
      serialize: (input) => input,
      fits: () => true,
    });
    expect(Object.keys(planned.tree)).toEqual(['1']);
    expect(planned.places.get(author)?.index).toBe(1);
  });

  test('a node under what the request does not have is left out', () => {
    const other = sent('other', undefined);
    const orphan = call({
      parent: other,
      path: 'echo',
      input: undefined,
      reads: [],
      list: null,
    });
    const planned = plan([orphan], () => true);
    expect(planned.left).toEqual([orphan]);
  });

  test('two nodes with the same path at one place get names of their own, and an input left out is not in the tree', () => {
    const again = call({ ...author, parent: post, input: undefined });
    const planned = plan([author, again, team], () => true);
    expect(planned.tree).toEqual({
      0: {
        author: {
          path: 'author',
          input: {},
          reads: [{ to: ['id'], data: ['authorId'] }],
          children: {
            team: { path: 'team', reads: [{ to: ['id'], data: ['teamId'] }] },
          },
        },
        'author#2': {
          path: 'author',
          reads: [{ to: ['id'], data: ['authorId'] }],
        },
      },
    });
    const steps = (it: Call): PipelineStep[] | undefined =>
      planned.places.get(it)?.steps;
    expect(steps(again)).toEqual([{ kind: 'node', key: 'author#2' }]);
    expect(steps(team)).toEqual([
      { kind: 'node', key: 'author' },
      { kind: 'node', key: 'team' },
    ]);
  });

  test('what a response does not have for a call is missing', async () => {
    const steps: PipelineStep[] = [{ kind: 'node', key: 'author' }];
    expect(await readPipelineCall(undefined, steps)).toEqual({
      kind: 'missing',
    });
    expect(await readPipelineCall({ author: 'text' }, steps)).toEqual({
      kind: 'missing',
    });
    expect(await readPipelineCall({ author: {} }, steps)).toEqual({
      kind: 'missing',
    });
    expect(await readPipelineCall({}, [])).toEqual({ kind: 'missing' });
    expect(await readPipelineCall({ author: [] }, steps)).toEqual({
      kind: 'missing',
    });
    expect(
      await readPipelineCall({ author: { result: 'text' } }, steps),
    ).toEqual({ kind: 'missing' });
    // Nothing under a node that has neither children nor an error
    expect(
      await readPipelineCall({ author: { result: { data: 1 } } }, [
        ...steps,
        { kind: 'node', key: 'team' },
      ]),
    ).toEqual({ kind: 'missing' });
    expect(
      await readPipelineCall({ 'items[]': ['text', {}] }, [
        { kind: 'list', key: 'items[]', depth: 1 },
        ...steps,
      ]),
    ).toEqual({ kind: 'items', items: [undefined, undefined] });
    expect(
      await readPipelineCall({ 'pages[].items[]': ['text'] }, [
        { kind: 'list', key: 'pages[].items[]', depth: 2 },
        ...steps,
      ]),
    ).toEqual({ kind: 'items', items: [[]] });
    // Streamed, the items of a list are by index
    expect(
      await readPipelineCall(
        { 'items[]': { 0: Promise.resolve({}), 2: Promise.resolve({}) } },
        [{ kind: 'list', key: 'items[]', depth: 1 }, ...steps],
      ),
    ).toEqual({ kind: 'items', items: [undefined, undefined] });
  });

  test('an item the server sent neither a result nor an error for is missing', () => {
    expect(readPipelinedItem([{}], 0)).toEqual({ kind: 'missing' });
    expect(readPipelinedItem(['text'], 0)).toEqual({ kind: 'missing' });
    expect(readPipelinedItem('text', 0)).toEqual({ kind: 'missing' });
    expect(readPipelinedItem([{ result: { data: 1 } }], 0)).toEqual({
      kind: 'data',
      data: 1,
    });
    expect(readPipelinedItem([{ error: 'no' }], 0)).toEqual({
      kind: 'error',
      error: 'no',
    });
  });

  test('the URL of a batch with a tree', () => {
    expect(
      pipelinedBatchUrl({ url: '/a,b?batch=1&input=x', tree: { 0: {} } }),
    ).toBe(`/a,b?batch=tree&input=x&tree=${encodeURIComponent('{"0":{}}')}`);
    expect(pipelinedBatchUrl({ url: '/a?batch=1', tree: null })).toBe(
      '/a?batch=tree',
    );
  });
});

describe('keys', () => {
  test.each<{ key: string; parsed: ReturnType<typeof parsePipelineKey> }>([
    { key: 'author', parsed: { kind: 'node', name: 'author' } },
    { key: 'author.byId', parsed: { kind: 'node', name: 'author.byId' } },
    { key: 'items[]', parsed: { kind: 'list', levels: [['items']] } },
    {
      key: 'data.items[]',
      parsed: { kind: 'list', levels: [['data', 'items']] },
    },
    {
      key: 'pages[].items[]',
      parsed: { kind: 'list', levels: [['pages'], ['items']] },
    },
    { key: 'a\\.b[]', parsed: { kind: 'list', levels: [['a.b']] } },
    { key: 'a\\[\\]\\\\[]', parsed: { kind: 'list', levels: [['a[]\\']] } },
    { key: '', parsed: null },
    { key: '[]', parsed: null },
    { key: '.a[]', parsed: null },
    { key: 'a..b[]', parsed: null },
    { key: 'a.[]', parsed: null },
    { key: 'a[]b[]', parsed: null },
    { key: 'a[].[]', parsed: null },
    { key: 'a[x][]', parsed: null },
    { key: 'a]b[]', parsed: null },
    { key: 'a\\x[]', parsed: null },
    { key: 'a\\[]', parsed: null },
    { key: 'a[].b.[]', parsed: null },
  ])('$key', ({ key, parsed }) => {
    expect(parsePipelineKey(key)).toEqual(parsed);
    if (parsed?.kind === 'list') {
      expect(parsePipelineKey(formatPipelineListKey(parsed.levels))).toEqual(
        parsed,
      );
    }
  });

  test('the path of one item, for a client that reads what the server read for one run', () => {
    expect(bindPipelinePath(['items', null, 'id', null], 2)).toEqual([
      'items',
      '2',
      'id',
      null,
    ]);
    expect(bindPipelinePath(['id'], 2)).toEqual(['id']);
  });

  test('the items of a list key, a list for each level', () => {
    expect(readPipelineList({ a: [1, 2] }, [['a']])).toEqual([1, 2]);
    // Without a level, the value is the list
    expect(readPipelineList([1], [])).toEqual([1]);
    expect(
      readPipelineList({ a: [{ b: [1] }, { b: 'x' }] }, [['a'], ['b']]),
    ).toEqual([[1], []]);
    expect(readPipelineList({ a: 'x' }, [['a']])).toEqual([]);
  });
});

describe('a request the server refuses, before anything of it runs', () => {
  const node = { path: 'author', reads: [{ to: ['id'], data: ['authorId'] }] };
  test.each<{ name: string; tree: unknown; message: string }>([
    { name: 'a tree that is not JSON', tree: '{nope', message: 'not JSON' },
    {
      name: 'a tree that is no object',
      tree: '[]',
      message: 'expected an object',
    },
    {
      name: 'an index of no call',
      tree: { 2: {} },
      message: 'no call at index 2',
    },
    {
      name: 'an index written another way',
      tree: { '01': {} },
      message: 'no call at index 01',
    },
    {
      name: 'children that are no object',
      tree: { 0: [] },
      message: 'expected children at 0',
    },
    {
      name: 'a key that is no key',
      tree: { 0: { 'a..b[]': {} } },
      message: 'no such key: "a..b[]"',
    },
    {
      name: 'a list key with no children',
      tree: { 0: { 'a[]': [] } },
      message: 'expected children at 0 "a[]"',
    },
    {
      name: 'a node without a path',
      tree: { 0: { author: { reads: [] } } },
      message: 'expected a node with "path" and "reads" at 0 "author"',
    },
    {
      name: 'a node with an empty path',
      tree: { 0: { author: { path: '', reads: [] } } },
      message: 'expected a node with "path" and "reads" at 0 "author"',
    },
    {
      name: 'a node without reads',
      tree: { 0: { author: { path: 'author' } } },
      message: 'expected a node with "path" and "reads" at 0 "author"',
    },
    {
      name: 'a node with another key',
      tree: { 0: { author: { ...node, each: true } } },
      message: 'expected a node with "path" and "reads" at 0 "author"',
    },
    {
      name: 'a node with children that are no object',
      tree: { 0: { author: { ...node, children: [] } } },
      message: 'expected a node with "path" and "reads" at 0 "author"',
    },
    {
      name: 'a read without "to"',
      tree: { 0: { author: { path: 'author', reads: [{ data: [] }] } } },
      message: 'expected a read with "to" at 0 "author".reads.0',
    },
    {
      name: 'a read with another key',
      tree: {
        0: {
          author: { path: 'author', reads: [{ to: [], data: [], from: 0 }] },
        },
      },
      message: 'expected a read with "to" at 0 "author".reads.0',
    },
    {
      name: 'a read of both an item and data',
      tree: {
        0: {
          author: { path: 'author', reads: [{ to: [], data: [], item: [] }] },
        },
      },
      message: 'expected "item" or "data" at 0 "author".reads.0',
    },
    {
      name: 'a read of neither',
      tree: { 0: { author: { path: 'author', reads: [{ to: [] }] } } },
      message: 'expected "item" or "data" at 0 "author".reads.0',
    },
    {
      name: 'a path that is no path',
      tree: {
        0: { author: { path: 'author', reads: [{ to: [], data: [1] }] } },
      },
      message: 'expected "item" or "data" at 0 "author".reads.0',
    },
    {
      name: 'an `up` that is no whole number',
      tree: {
        0: {
          author: { path: 'author', reads: [{ to: [], data: [], up: 1.5 }] },
        },
      },
      message: 'expected "up" to be a whole number at 0 "author".reads.0',
    },
    {
      name: 'a negative `up`',
      tree: {
        0: {
          author: { path: 'author', reads: [{ to: [], data: [], up: -1 }] },
        },
      },
      message: 'expected "up" to be a whole number at 0 "author".reads.0',
    },
    {
      name: 'a read of its own data',
      tree: {
        0: { author: { path: 'author', reads: [{ to: [], data: [], up: 0 }] } },
      },
      message: 'a read at 0 "author".reads.0 reaches no call above it',
    },
    {
      name: 'a read of data above the top-level call',
      tree: {
        0: { author: { path: 'author', reads: [{ to: [], data: [], up: 2 }] } },
      },
      message: 'a read at 0 "author".reads.0 reaches no call above it',
    },
    {
      name: 'a read of an item outside a list',
      tree: {
        0: { author: { path: 'author', reads: [{ to: [], item: [] }] } },
      },
      message: 'a read at 0 "author".reads.0 reaches no item above it',
    },
    {
      name: 'a read of the item of a call that runs once',
      tree: {
        0: {
          author: {
            ...node,
            children: {
              team: { path: 'team', reads: [{ to: [], item: [], up: 1 }] },
            },
          },
        },
      },
      message: 'a read at 0 "author" "team".reads.0 reaches no item above it',
    },
  ])('$name', async (scenario) => {
    const { fns, ran } = blog();
    await using server = serve({ ...defaults, fns });
    const tree =
      typeof scenario.tree === 'string'
        ? scenario.tree
        : JSON.stringify(scenario.tree);

    const response = await fetch(
      `${server.url}/post,author?batch=${pipelineBatch}&tree=${encodeURIComponent(tree)}`,
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: 'BAD_REQUEST',
        message: `Invalid "tree": ${scenario.message}`,
      },
    });
    expect(ran).toEqual([]);
  });

  test('a node deeper than the server goes is not looked at', () => {
    const plan = parsePipelineTree({
      tree: { 0: { a: { path: 'a', reads: [], children: { b: 'anything' } } } },
      calls: 1,
      maxDepth: 1,
    });
    expect(plan.get(0)).toMatchObject([
      { kind: 'node', node: { key: 'a', childKeys: ['b'], children: null } },
    ]);
  });

  test('a `tree` is in the search params of a request without a body, and beside the inputs in a body', () => {
    expect(treeOfSearchParams(new URLSearchParams('tree=x'))).toBe('x');
    expect(treeOfSearchParams(new URLSearchParams())).toBeUndefined();
    expect(treeOfBody({ 0: {}, tree: 'x' })).toBe('x');
    expect(treeOfBody([])).toBeUndefined();
  });

  test('a batch without a `tree` has nothing under its calls: they run as they were sent', async () => {
    const { fns, ran } = blog();
    await using server = serve({ ...defaults, fns });

    const response = await fetch(
      `${server.url}/post?batch=${pipelineBatch}&input=${encodeURIComponent(
        JSON.stringify({ 0: { slug: 'hello' } }),
      )}`,
    );

    expect(await response.json()).toEqual([{ result: { data: posts[0] } }]);
    expect(ran).toEqual([['post', { slug: 'hello' }]]);
  });
});

describe('a place in an input that a read cannot write to', () => {
  test.each<{ name: string; input: unknown; to: string[] }>([
    { name: 'inside a string', input: { id: 'text' }, to: ['id', 'x'] },
    { name: 'inside nothing', input: {}, to: ['filter', 'id'] },
    { name: 'inside an input that is not there', input: undefined, to: ['id'] },
    {
      name: 'an item an array does not have',
      input: { ids: ['a'] },
      to: ['ids', '1'],
    },
    {
      name: 'the length of an array',
      input: { ids: ['a'] },
      to: ['ids', 'length'],
    },
    {
      name: 'an index written another way',
      input: { ids: ['a'] },
      to: ['ids', '00'],
    },
  ])('$name: the node fails with a bad request', async (scenario) => {
    const echo = vi.fn();
    await using server = serve({
      ...defaults,
      fns: { post: () => ({ id: 'ada' }), echo },
    });
    const post = sent('post', undefined);
    const writer = call({
      parent: post,
      path: 'echo',
      input: scenario.input,
      reads: [{ to: scenario.to, data: ['id'] }],
      list: null,
    });

    const res = await send({
      ...defaults,
      url: server.url,
      method: 'POST',
      sent: [post],
      calls: [writer],
    });

    expect(res.of(writer)).toEqual({
      error: {
        code: 'BAD_REQUEST',
        message: `Invalid "tree": the input has nothing at "${scenario.to.join('.')}"`,
      },
    });
    expect(echo).not.toHaveBeenCalled();
  });

  test.each([
    { name: 'a `Map`', input: { m: new Map([['k', 1]]) } },
    { name: 'a `Date`', input: { m: new Date() } },
  ])('$name: the node fails with a bad request', async (scenario) => {
    const echo = vi.fn();
    await using server = serve({
      ...defaults,
      transformer: transformers.superjson,
      fns: { post: () => ({ id: 'ada' }), echo },
    });
    const post = sent('post', undefined);
    const writer = call({
      parent: post,
      path: 'echo',
      input: scenario.input,
      reads: [{ to: ['m', 'k'], data: ['id'] }],
      list: null,
    });

    const res = await send({
      ...defaults,
      transformer: transformers.superjson,
      url: server.url,
      method: 'POST',
      sent: [post],
      calls: [writer],
    });

    expect(res.of(writer)).toEqual({
      error: {
        code: 'BAD_REQUEST',
        message: `Invalid "tree": the input has a value on the way to "m.k" that can't be written to`,
      },
    });
    expect(echo).not.toHaveBeenCalled();
  });

  test('an instance of a class keeps its class', async () => {
    class Point {
      constructor(
        public x: number,
        public label: string,
      ) {}
    }
    superjson.registerClass(Point, { identifier: 'pipeline-test-point' });
    const echo = vi.fn((input: { at: Point }) => input.at instanceof Point);
    await using server = serve({
      ...defaults,
      transformer: transformers.superjson,
      fns: { post: () => ({ label: 'here' }), echo },
    });
    const post = sent('post', undefined);
    const writer = call({
      parent: post,
      path: 'echo',
      input: { at: new Point(1, '') },
      reads: [{ to: ['at', 'label'], data: ['label'] }],
      list: null,
    });

    const res = await send({
      ...defaults,
      transformer: transformers.superjson,
      url: server.url,
      method: 'POST',
      sent: [post],
      calls: [writer],
    });

    expect(res.of(writer)).toEqual({ data: true });
    expect(echo.mock.calls[0]?.[0].at).toEqual(new Point(1, 'here'));
  });
});

describe('keys named `__proto__` or `constructor`', () => {
  const prototypes = () => [
    Object.prototype,
    Array.prototype,
    Object.getPrototypeOf({}),
  ];

  test('in a tree, they are names and paths like any other, and change no prototype', async () => {
    const before = prototypes().map((it) => Object.keys(it));
    const echo = vi.fn((input: unknown) => input);
    await using server = serve({
      ...defaults,
      fns: {
        post: () => JSON.parse('{"__proto__":[{"id":"a"}],"constructor":[]}'),
        echo,
      },
    });
    // As JSON, so `__proto__` is a key of its own
    const node = (reads: string) =>
      `{"path":"echo","input":{},"reads":${reads}}`;
    const body = `{"tree":{"0":{${[
      `"__proto__":${node('[{"to":["n"],"data":["__proto__","0","id"]}]')}`,
      `"constructor":${node('[]')}`,
      `"__proto__[]":{"echo":${node('[{"to":["id"],"item":["id"]}]')}}`,
      `"constructor[]":{"echo":${node('[{"to":["id"],"item":["id"]}]')}}`,
    ].join(',')}}}}`;

    const response = await fetch(`${server.url}/post?batch=tree`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });
    const json = await response.json();

    expect(Object.keys(json[0].children)).toEqual([
      '__proto__',
      'constructor',
      '__proto__[]',
      'constructor[]',
    ]);
    expect(json[0].children['__proto__']).toEqual({
      result: { data: { n: 'a' } },
    });
    expect(json[0].children['__proto__[]']).toEqual([
      { echo: { result: { data: { id: 'a' } } } },
    ]);
    expect(json[0].children['constructor[]']).toEqual([]);
    expect(prototypes().map((it) => Object.keys(it))).toEqual(before);
    expect(({} as Record<string, unknown>)['n']).toBeUndefined();
  });

  test('in a `to` path, they are properties of the input too, and change no prototype', async () => {
    const echo = vi.fn((input: unknown) => input);
    await using server = serve({
      ...defaults,
      fns: { post: () => ({ id: 'ada' }), echo },
    });
    const post = sent('post', undefined);
    const writers = [
      call({
        parent: post,
        path: 'echo',
        input: JSON.parse('{"__proto__":{}}'),
        reads: [{ to: ['__proto__', 'polluted'], data: ['id'] }],
        list: null,
      }),
      call({
        parent: post,
        path: 'echo',
        input: {},
        reads: [{ to: ['__proto__'], data: ['id'] }],
        list: null,
      }),
    ];

    await send({
      ...defaults,
      url: server.url,
      method: 'POST',
      sent: [post],
      calls: writers,
    });

    const [nested, direct] = echo.mock.calls.map(([input]) => input);
    expect(Object.getPrototypeOf(nested)).toBe(Object.prototype);
    expect(Object.getOwnPropertyDescriptor(nested, '__proto__')?.value).toEqual(
      {
        polluted: 'ada',
      },
    );
    expect(Object.getOwnPropertyDescriptor(direct, '__proto__')?.value).toBe(
      'ada',
    );
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });

  test.each<{ name: string; to: string[] }>([
    { name: '`__proto__`', to: ['__proto__', 'polluted'] },
    { name: '`constructor`', to: ['constructor', 'prototype', 'polluted'] },
  ])(
    'what an input has from its prototype, such as $name, is nothing to write to',
    async (scenario) => {
      const echo = vi.fn();
      await using server = serve({
        ...defaults,
        fns: { post: () => ({ id: 'ada' }), echo },
      });
      const post = sent('post', undefined);
      const writer = call({
        parent: post,
        path: 'echo',
        input: {},
        reads: [{ to: scenario.to, data: ['id'] }],
        list: null,
      });

      const res = await send({
        ...defaults,
        url: server.url,
        method: 'POST',
        sent: [post],
        calls: [writer],
      });

      expect(res.of(writer)).toMatchObject({ error: { code: 'BAD_REQUEST' } });
      expect(echo).not.toHaveBeenCalled();
      expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
    },
  );
});
