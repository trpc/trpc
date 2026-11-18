/**
 * The two halves of a pipelined batch, against each other over HTTP. Nothing
 * here knows of routers, procedures or links: the server is a map of plain
 * functions, and the client is `fetch`. The request is the one a link sends:
 * the paths in the URL, the inputs by index, `?batch=pipeline` and a `pipe`.
 */
import { fetchServerResource } from '@trpc/server/__tests__/fetchServerResource';
import superjson from 'superjson';
import { TRPCError } from '../../error/TRPCError';
import { makeResource } from '../../stream/utils/disposable';
import type { CombinedDataTransformer } from '../../transformer';
import { isObject } from '../../utils';
import {
  deserializePipelinedItems,
  encodePipelineReads,
  pipelinedBatchBody,
  pipelinedBatchUrl,
  pipelinedCallsRan,
  planPipelinedBatch,
  readPipelinedItem,
} from './client';
import type { PipelinedBatchPlan } from './client';
import {
  createPipelineSizeOf,
  parsePipelineReads,
  pipelineCalls,
  pipelineLimitsOf,
  pipeOfBody,
  pipeOfSearchParams,
} from './server';
import type { PipelineRuns } from './server';
import type {
  PipelineCallReads,
  PipelineLimits,
  PipelineList,
  PipelinePath,
  PipeRead,
} from './wire';
import type * as Wire from './wire';
import {
  bindPipelinePath,
  pipelineBatch,
  pipelineFrameOf,
  pipelineLimitDefaults,
  pipelineListLevels,
  readPipelinePath,
} from './wire';

// The same function, watched: a test counts how often the server reads a path
vi.mock('./wire', async (importOriginal) => {
  const wire: typeof Wire = await importOriginal();
  return { ...wire, readPipelinePath: vi.fn(wire.readPipelinePath) };
});

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
  /** Told of every call that failed, with its input as far as it was read */
  onError: (path: string, input: unknown) => void;
  transformer: CombinedDataTransformer;
  /** The most runs of a function a request may have */
  maxRuns: number | null;
  /** Sends each call's result as a line of its own, when it is ready */
  stream: boolean;
  limits: PipelineLimits;
}) {
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
    const calls = paths.map((path, index) => {
      const read = () => {
        const input = isObject(inputs) ? inputs[index] : undefined;
        return input === undefined
          ? undefined
          : opts.transformer.input.deserialize(input);
      };
      return {
        path,
        getRawInput: async () => read(),
        // As a request's: what of the input was read, nothing if it can't be
        result: () => {
          try {
            return read();
          } catch {
            return undefined;
          }
        },
      };
    });
    let pipeline;
    try {
      pipeline = pipelineCalls({
        calls,
        pipe: hasBody ? pipeOfBody(body) : pipeOfSearchParams(url.searchParams),
        transformer: opts.transformer,
        maxRuns: opts.maxRuns,
        limits: opts.limits,
      });
    } catch (cause) {
      return Response.json({ error: wireError(cause) }, { status: 400 });
    }
    // As a request handler does: a call gives how it went, and never rejects
    const results = pipeline.run({
      call: async (
        call,
        run,
      ): Promise<[cause: unknown, data: unknown, items: Items | null]> => {
        try {
          const fn = opts.fns[call.path];
          if (!fn) {
            throw new TRPCError({ code: 'NOT_FOUND' });
          }
          if (run?.kind === 'each') {
            const items = await run.each({
              item: async (input) => fn(input),
              error: (cause, input) => {
                opts.onError(call.path, input);
                return wireError(cause);
              },
            });
            return [undefined, undefined, items];
          }
          return [undefined, await fn(await call.getRawInput()), null];
        } catch (cause) {
          opts.onError(call.path, call.result());
          return [cause ?? new Error('failed'), undefined, null];
        }
      },
      // A failed call has no data for the calls that read it
      data: ([cause, data]) => {
        if (cause !== undefined) {
          throw cause;
        }
        return data;
      },
    });
    const answers = results.map(async (result) => {
      const [cause, data, items] = await result;
      if (cause !== undefined) {
        return { error: wireError(cause) };
      }
      if (items) {
        return settle(items, opts.transformer);
      }
      try {
        const serialized = opts.transformer.output.serialize(data);
        // What can't go in the response is that call's error
        JSON.stringify(serialized);
        return { result: { data: serialized } };
      } catch (unserializable) {
        return { error: wireError(unserializable) };
      }
    });
    if (!opts.stream) {
      return Response.json(await Promise.all(answers));
    }
    const encoder = new TextEncoder();
    return new Response(
      new ReadableStream({
        start(controller) {
          let left = answers.length;
          for (const [index, answer] of answers.entries()) {
            void answer.then((it) => {
              controller.enqueue(
                encoder.encode(`${JSON.stringify({ index, ...it })}\n`),
              );
              left -= 1;
              if (left === 0) {
                controller.close();
              }
            });
          }
        },
      }),
    );
  });
}

type Items = Awaited<PipelineRuns<WireError>>;

/** The runs of a call for every item, once all of them are done */
async function settle(
  node: Items,
  transformer: CombinedDataTransformer,
): Promise<object> {
  if (!('items' in node)) {
    return 'error' in node
      ? node
      : { result: { data: transformer.output.serialize(node.result.data) } };
  }
  const items: Record<string, object> = {};
  for (const [index, item] of node.items.entries()) {
    items[index] = await settle(await item, transformer);
  }
  return { items };
}

// ---------- a client that is `fetch` ----------

/** Something a request has: what the client sends itself, or a call it adds */
interface Sent {
  path: string;
  input: unknown;
}

interface Call extends Sent {
  reads: PipelineCallReads<Sent>;
}

function sent(path: string, input: unknown): Sent {
  return { path, input };
}

function call(
  path: string,
  input: unknown,
  reads: PipelineCallReads<Sent>,
): Call {
  return { path, input, reads };
}

/**
 * What a call reads: a read with `from` reads that call's data, and one
 * without it the item of the list in `each`
 */
function reads(
  each: PipelineList<Sent> | null,
  ...list: (
    | { to: string[]; from: Sent; path: PipelinePath }
    | { to: string[]; path: PipelinePath }
  )[]
): PipelineCallReads<Sent> {
  return {
    each,
    reads: list.map((read) =>
      'from' in read
        ? { kind: 'whole', ...read }
        : { kind: 'item', to: read.to, path: read.path },
    ),
  };
}

/**
 * How a call went: its data, its error, or the runs of a call for every item,
 * by item, one level for each level of lists
 */
type Outcome = { data: unknown } | { error: WireError } | { items: unknown };

/** How many items a call for every item ran for, at its first level of lists */
function itemCount(outcome: Outcome | undefined) {
  return outcome && 'items' in outcome && isObject(outcome.items)
    ? Object.keys(outcome.items).length
    : null;
}

/** Each line of a streamed response, as it arrives */
async function* linesOf(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) {
    return;
  }
  const decoder = new TextDecoder();
  let buffered = '';
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) {
      return;
    }
    buffered += decoder.decode(chunk.value, { stream: true });
    const lines = buffered.split('\n');
    buffered = lines.pop() ?? '';
    yield* lines;
  }
}

async function send(opts: {
  url: string;
  method: 'GET' | 'POST';
  transformer: CombinedDataTransformer;
  sent: Sent[];
  calls: Call[];
  fits: (plan: Pick<PipelinedBatchPlan<Call>, 'calls' | 'pipe'>) => boolean;
  stream: boolean;
}) {
  const plan = planPipelinedBatch({
    sent: opts.sent,
    calls: opts.calls,
    fits: opts.fits,
  });
  const all = [...opts.sent, ...plan.calls];
  const inputs = all.map((it) =>
    it.input === undefined
      ? undefined
      : opts.transformer.input.serialize(it.input),
  );
  // What a link sends for an ordinary batch, pipelined
  const batch = `${opts.url}/${all.map((it) => it.path).join(',')}?batch=1`;
  const url =
    opts.method === 'GET'
      ? pipelinedBatchUrl({
          url: `${batch}&input=${encodeURIComponent(
            JSON.stringify(Object.fromEntries(inputs.entries())),
          )}`,
          pipe: plan.pipe,
        })
      : pipelinedBatchUrl({ url: batch, pipe: null });
  const body =
    opts.method === 'GET'
      ? undefined
      : pipelinedBatchBody({
          body: JSON.stringify(Object.fromEntries(inputs.entries())),
          pipe: plan.pipe,
        });
  const response = await fetch(url, {
    method: opts.method,
    ...(body === undefined
      ? {}
      : { body, headers: { 'content-type': 'application/json' } }),
  });

  /** The order the results came in */
  const arrived: number[] = [];
  const outcomes = all.map(() => {
    let resolve: (outcome: Outcome) => void = () => undefined;
    const promise = new Promise<Outcome>((it) => {
      resolve = it;
    });
    return { promise, resolve };
  });
  const take = (index: number, answer: unknown) => {
    arrived.push(index);
    const result = isObject(answer) ? answer['result'] : undefined;
    outcomes[index]?.resolve(
      isObject(answer) && 'items' in answer
        ? {
            items: (
              deserializePipelinedItems(answer, (value) =>
                opts.transformer.output.deserialize(value),
              ) as { items: unknown }
            ).items,
          }
        : isObject(result)
          ? { data: opts.transformer.output.deserialize(result['data']) }
          : { error: (answer as { error: WireError }).error },
    );
  };
  const reading = (async () => {
    if (opts.stream && response.ok) {
      for await (const line of linesOf(response)) {
        const { index, ...answer } = JSON.parse(line);
        take(index, answer);
      }
      return;
    }
    const json: unknown = await response.json();
    for (const index of all.keys()) {
      // An answer for the whole request is every call's
      take(index, Array.isArray(json) ? json[index] : json);
    }
  })();

  const succeeded = (index: number) =>
    Promise.resolve(outcomes[index]?.promise).then(
      (outcome) => !!outcome && !('error' in outcome),
    );
  const ran = pipelinedCallsRan({
    sent: opts.sent.map((_it, index) => succeeded(index)),
    pipe: plan.pipe,
    calls: plan.calls.map((it, index) => ({
      it,
      result: Promise.resolve(outcomes[opts.sent.length + index]?.promise).then(
        (outcome) => {
          if (!outcome || 'error' in outcome) {
            throw new Error('failed');
          }
          return outcome;
        },
      ),
    })),
  });
  await reading;
  const outcomeOf = new Map<Sent, Outcome>();
  for (const [index, it] of all.entries()) {
    const outcome = await outcomes[index]?.promise;
    if (outcome) {
      outcomeOf.set(it, outcome);
    }
  }
  const ranOf = new Map<Sent, boolean>();
  for (const it of ran) {
    ranOf.set(it.call.it, await it.ran);
  }
  return {
    status: response.status,
    /** The request, as it went */
    wire: {
      method: opts.method,
      url: decodeURIComponent(url.slice(opts.url.length)),
      body: body === undefined ? undefined : JSON.parse(body),
    },
    plan,
    arrived,
    of: (it: Sent) => outcomeOf.get(it),
    /** Whether the server ran a call: `false` if one it reads failed */
    ran: (it: Call) => ranOf.get(it),
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
      teamPosts: (input) =>
        posts
          .filter((post) =>
            authors.some(
              (it) => it.id === post.authorId && it.teamId === input.teamId,
            ),
          )
          .map((post) => post.slug),
      posts: () => ({ items: posts }),
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

describe.each(['GET', 'POST'] as const)('over %s', (method) => {
  test('a call reads a part of its input from the data of another', async () => {
    const { fns, ran } = blog();
    await using server = serve({ ...defaults, fns });
    const post = sent('post', { slug: 'hello' });
    const author = call(
      'author',
      {},
      reads(null, { to: ['id'], from: post, path: ['authorId'] }),
    );

    const res = await send({
      ...defaults,
      url: server.url,
      method,
      sent: [post],
      calls: [author],
    });

    expect(res.of(author)).toEqual({
      data: { id: 'ada', name: 'Ada', teamId: 'infra' },
    });
    // The function got a whole input: the client never knew the id
    expect(ran).toEqual([
      ['post', { slug: 'hello' }],
      ['author', { id: 'ada' }],
    ]);
    expect(res.ran(author)).toBe(true);
  });

  test('a chain: each call reads the one before it, in one request', async () => {
    const { fns, ran } = blog();
    await using server = serve({ ...defaults, fns });
    const post = sent('post', { slug: 'hello' });
    const author = call(
      'author',
      {},
      reads(null, { to: ['id'], from: post, path: ['authorId'] }),
    );
    const teamPosts = call(
      'teamPosts',
      {},
      reads(null, { to: ['teamId'], from: author, path: ['teamId'] }),
    );

    const res = await send({
      ...defaults,
      url: server.url,
      method,
      sent: [post],
      // Written before what it reads: it still goes after it
      calls: [teamPosts, author],
    });

    expect(res.plan.calls).toEqual([author, teamPosts]);
    expect(res.of(teamPosts)).toEqual({ data: ['hello'] });
    expect(ran.map(([path]) => path)).toEqual(['post', 'author', 'teamPosts']);
    expect(res.wire).toEqual({
      method,
      url:
        method === 'GET'
          ? '/post,author,teamPosts?batch=pipeline&input={"0":{"slug":"hello"},"1":{},"2":{}}&pipe={"1":{"reads":[{"to":["id"],"from":0,"path":["authorId"]}]},"2":{"reads":[{"to":["teamId"],"from":1,"path":["teamId"]}]}}'
          : '/post,author,teamPosts?batch=pipeline',
      body:
        method === 'GET'
          ? undefined
          : {
              0: { slug: 'hello' },
              1: {},
              2: {},
              pipe: {
                1: { reads: [{ to: ['id'], from: 0, path: ['authorId'] }] },
                2: { reads: [{ to: ['teamId'], from: 1, path: ['teamId'] }] },
              },
            },
    });
  });

  test('`null` in a path reads a value of every item of a list', async () => {
    const { fns, ran } = blog();
    await using server = serve({ ...defaults, limits: wholeValues, fns });
    const post = sent('post', { slug: 'hello' });
    const tags = call(
      'tags',
      {},
      reads(null, { to: ['ids'], from: post, path: ['tags', null, 'id'] }),
    );

    const res = await send({
      ...defaults,
      url: server.url,
      method,
      sent: [post],
      calls: [tags],
    });

    expect(ran[1]).toEqual(['tags', { ids: ['t1', 't2'] }]);
    expect(res.of(tags)).toEqual({
      data: [
        { id: 't1', name: '#t1' },
        { id: 't2', name: '#t2' },
      ],
    });
  });

  test('a call for every item of a list: each has a result or an error of its own', async () => {
    const { fns, ran } = blog();
    await using server = serve({ ...defaults, fns });
    const list = sent('posts', undefined);
    const authorOfEach = call(
      'author',
      {},
      reads(
        { from: list, path: ['items'] },
        { to: ['id'], path: ['authorId'] },
      ),
    );

    const res = await send({
      ...defaults,
      url: server.url,
      method,
      sent: [list],
      calls: [authorOfEach],
    });

    expect(ran.slice(1)).toEqual([
      ['author', { id: 'ada' }],
      ['author', { id: 'lin' }],
      ['author', { id: 'nobody' }],
    ]);
    const outcome = res.of(authorOfEach);
    assert(outcome && 'items' in outcome);
    expect(
      await Promise.all(
        [0, 1, 2, 3].map((index) => readPipelinedItem(outcome, [index])),
      ),
    ).toEqual([
      { kind: 'data', data: { id: 'ada', name: 'Ada', teamId: 'infra' } },
      { kind: 'data', data: { id: 'lin', name: 'Lin', teamId: 'web' } },
      { kind: 'error', error: { code: 'NOT_FOUND', message: 'No author' } },
      // The list has three items
      { kind: 'missing' },
    ]);
    // The call as a whole succeeded: one item's error isn't the call's
    expect(res.ran(authorOfEach)).toBe(true);
  });

  test('a call that reads a failed one does not run, and neither does what reads it', async () => {
    const { fns, ran } = blog();
    await using server = serve({ ...defaults, fns });
    const post = sent('post', { slug: 'orphan' });
    const author = call(
      'author',
      {},
      reads(null, { to: ['id'], from: post, path: ['authorId'] }),
    );
    const teamPosts = call(
      'teamPosts',
      {},
      reads(null, { to: ['teamId'], from: author, path: ['teamId'] }),
    );
    const other = sent('post', { slug: 'hello' });

    const res = await send({
      ...defaults,
      url: server.url,
      method,
      sent: [post, other],
      calls: [author, teamPosts],
    });

    // The author isn't there. The call for it ran, and failed
    expect(res.of(author)).toEqual({
      error: { code: 'NOT_FOUND', message: 'No author' },
    });
    expect(res.ran(author)).toBe(true);
    // What reads it never ran, and the client knows without the error's code
    expect(res.of(teamPosts)).toEqual({
      error: {
        code: 'PRECONDITION_FAILED',
        message: 'The call this call reads its input from failed',
      },
    });
    expect(res.ran(teamPosts)).toBe(false);
    expect(ran.map(([path]) => path).sort()).toEqual([
      'author',
      'post',
      'post',
    ]);
    // The rest of the request is as it would be without them
    expect(res.of(other)).toMatchObject({ data: { slug: 'hello' } });
  });
});

describe('what a call reads', () => {
  test('several values, from several calls, anywhere in its input', async () => {
    const { fns, ran } = blog();
    await using server = serve({ ...defaults, limits: wholeValues, fns });
    const hello = sent('post', { slug: 'hello' });
    const again = sent('post', { slug: 'again' });
    const echo = call(
      'echo',
      { authors: [null, null], nested: { deep: {} } },
      reads(
        null,
        { to: ['authors', '0'], from: hello, path: ['authorId'] },
        { to: ['authors', '1'], from: again, path: ['authorId'] },
        { to: ['nested', 'deep', 'post'], from: hello, path: [] },
      ),
    );

    await send({
      ...defaults,
      url: server.url,
      method: 'GET',
      sent: [hello, again],
      calls: [echo],
    });

    expect(ran[2]).toEqual([
      'echo',
      { authors: ['ada', 'lin'], nested: { deep: { post: posts[0] } } },
    ]);
  });

  test('its whole input', async () => {
    const { fns, ran } = blog();
    await using server = serve({ ...defaults, fns });
    const post = sent('post', { slug: 'hello' });
    const echo = call(
      'echo',
      undefined,
      reads(null, { to: [], from: post, path: ['authorId'] }),
    );

    await send({
      ...defaults,
      url: server.url,
      method: 'GET',
      sent: [post],
      calls: [echo],
    });

    expect(ran[1]).toEqual(['echo', 'ada']);
  });

  test('what is not there is `undefined`: only own properties of objects and arrays are read', async () => {
    const { fns, ran } = blog();
    await using server = serve({ ...defaults, fns });
    const post = sent('post', { slug: 'hello' });
    const echo = call(
      'echo',
      {},
      reads(
        null,
        { to: ['a'], from: post, path: ['nope'] },
        { to: ['b'], from: post, path: ['slug', 'length'] },
        { to: ['c'], from: post, path: ['constructor'] },
        { to: ['d'], from: post, path: ['tags', 'length'] },
        { to: ['e'], from: post, path: ['slug', null] },
        { to: ['f'], from: post, path: ['__proto__'] },
        { to: ['g'], from: post, path: ['tags', '__proto__', 'length'] },
      ),
    );

    await send({
      ...defaults,
      url: server.url,
      method: 'GET',
      sent: [post],
      calls: [echo],
    });

    // An array's length is its own. A string's isn't read: it is no object
    expect(ran[1]).toEqual(['echo', { d: 2 }]);
  });

  test('the data as the client gets it, and its input as a client sends it', async () => {
    const seen: unknown[] = [];
    await using server = serve({
      ...defaults,
      limits: wholeValues,
      transformer: transformers.superjson,
      fns: {
        post: () => ({
          publishedAt: new Date('2026-01-02T03:04:05Z'),
          // Not in what the client gets
          secret: () => 'a function',
          tags: new Set(['a']),
        }),
        echo: (input) => {
          seen.push(input);
          return input;
        },
      },
    });
    const post = sent('post', undefined);
    const echo = call(
      'echo',
      {},
      reads(
        null,
        { to: ['at'], from: post, path: ['publishedAt'] },
        { to: ['secret'], from: post, path: ['secret'] },
        { to: ['tags'], from: post, path: ['tags'] },
      ),
    );

    const res = await send({
      ...defaults,
      transformer: transformers.superjson,
      url: server.url,
      method: 'GET',
      sent: [post],
      calls: [echo],
    });

    expect(seen).toEqual([
      { at: new Date('2026-01-02T03:04:05Z'), tags: new Set(['a']) },
    ]);
    expect(res.of(echo)).toEqual({
      data: { at: new Date('2026-01-02T03:04:05Z'), tags: new Set(['a']) },
    });
  });

  test('a call whose data is `undefined` has nothing to read: the value is left out', async () => {
    const echo = vi.fn((input: unknown) => input);
    await using server = serve({
      ...defaults,
      fns: { nothing: () => undefined, echo },
    });
    const nothing = sent('nothing', undefined);
    const reader = call(
      'echo',
      { keep: 1 },
      reads(null, { to: ['id'], from: nothing, path: [] }),
    );

    const res = await send({
      ...defaults,
      url: server.url,
      method: 'GET',
      sent: [nothing],
      calls: [reader],
    });

    expect(res.of(reader)).toEqual({ data: { keep: 1 } });
  });

  test('what is not there is in the input as in one a client fills in: `null` in a list, and left out of an object', async () => {
    const seen: Record<'once' | 'whole' | 'each', unknown[]> = {
      once: [],
      whole: [],
      each: [],
    };
    await using server = serve({
      ...defaults,
      fns: {
        post: () => ({ authorId: 'ada' }),
        list: () => ({ items: [{ id: 'a' }, {}] }),
        once: (input) => seen.once.push(input),
        whole: (input) => seen.whole.push(input),
        each: (input) => seen.each.push(input),
      },
    });
    const post = sent('post', undefined);
    const list = sent('list', undefined);
    const once = call(
      'once',
      { ids: ['x', 'y'], filter: { id: 'x' } },
      reads(
        null,
        { to: ['ids', '0'], from: post, path: ['nope'] },
        { to: ['filter', 'id'], from: post, path: ['nope'] },
        { to: ['filter', 'author'], from: post, path: ['authorId'] },
      ),
    );
    const whole = call(
      'whole',
      'replaced',
      reads(null, { to: [], from: post, path: ['nope'] }),
    );
    const each = call(
      'each',
      { ids: ['x'], filter: {} },
      reads(
        { from: list, path: ['items'] },
        { to: ['ids', '0'], path: ['id'] },
        { to: ['filter', 'id'], path: ['id'] },
      ),
    );

    await send({
      ...defaults,
      url: server.url,
      method: 'POST',
      sent: [post, list],
      calls: [once, whole, each],
    });

    // Not `toEqual`, which takes a property that is `undefined` for none
    expect(seen).toStrictEqual({
      once: [{ ids: [null, 'y'], filter: { author: 'ada' } }],
      whole: [undefined],
      each: [
        { ids: ['a'], filter: { id: 'a' } },
        { ids: [null], filter: {} },
      ],
    });
  });

  test('with a transformer that carries `undefined`, what is not there is `undefined`', async () => {
    const seen: unknown[] = [];
    await using server = serve({
      ...defaults,
      transformer: transformers.superjson,
      fns: {
        post: () => ({ authorId: 'ada' }),
        echo: (input) => {
          seen.push(input);
          return null;
        },
      },
    });
    const post = sent('post', undefined);
    const echo = call(
      'echo',
      { ids: ['x'], filter: {} },
      reads(
        null,
        { to: ['ids', '0'], from: post, path: ['nope'] },
        { to: ['filter', 'id'], from: post, path: ['nope'] },
      ),
    );

    await send({
      ...defaults,
      transformer: transformers.superjson,
      url: server.url,
      method: 'POST',
      sent: [post],
      calls: [echo],
    });

    expect(seen).toStrictEqual([
      { ids: [undefined], filter: { id: undefined } },
    ]);
  });

  test('a copy: a function that changes its input changes nothing another reads', async () => {
    const seen: unknown[] = [];
    await using server = serve({
      ...defaults,
      limits: wholeValues,
      fns: {
        post: () => ({ author: { name: 'Ada' } }),
        rename: (input) => {
          input.author.name = 'changed';
          return null;
        },
        echo: (input) => {
          seen.push(structuredClone(input));
          return input;
        },
      },
    });
    const post = sent('post', undefined);
    const rename = call(
      'rename',
      {},
      reads(null, { to: ['author'], from: post, path: ['author'] }),
    );
    const echo = call(
      'echo',
      {},
      reads(null, { to: ['author'], from: post, path: ['author'] }),
    );

    const res = await send({
      ...defaults,
      url: server.url,
      method: 'GET',
      sent: [post],
      calls: [rename, echo],
    });

    expect(seen).toEqual([{ author: { name: 'Ada' } }]);
    expect(res.of(post)).toEqual({ data: { author: { name: 'Ada' } } });
  });

  test('data that cannot go over the wire is a failed call to what reads it', async () => {
    const { fns } = blog();
    await using server = serve({
      ...defaults,
      fns: { ...fns, big: () => ({ id: 1n }) },
    });
    const big = sent('big', undefined);
    const echo = call(
      'echo',
      {},
      reads(null, { to: ['id'], from: big, path: ['id'] }),
    );

    const res = await send({
      ...defaults,
      url: server.url,
      method: 'GET',
      sent: [big],
      calls: [echo],
    });

    expect(res.of(echo)).toMatchObject({
      error: { code: 'PRECONDITION_FAILED' },
    });
  });
});

describe('a call for every item', () => {
  test('reads values of the item and values that are the same for every run, in the order they are written', async () => {
    const { fns, ran } = blog();
    await using server = serve({ ...defaults, limits: wholeValues, fns });
    const list = sent('posts', undefined);
    const hello = sent('post', { slug: 'hello' });
    const echo = call(
      'echo',
      { item: {} },
      reads(
        { from: list, path: ['items'] },
        { to: ['from'], from: hello, path: ['slug'] },
        { to: ['item'], path: [] },
        { to: ['item', 'tags'], from: hello, path: ['authorId'] },
        { to: ['slug'], path: ['slug'] },
      ),
    );

    await send({
      ...defaults,
      url: server.url,
      method: 'GET',
      sent: [list, hello],
      calls: [echo],
    });

    expect(ran.slice(2).map(([, input]) => input)).toEqual(
      posts.map((post) => ({
        from: 'hello',
        item: { ...post, tags: 'ada' },
        slug: post.slug,
      })),
    );
  });

  test.each([
    { name: 'an empty list', data: { items: [] } },
    { name: 'what is no list', data: { items: 'text' } },
    { name: 'nothing', data: null },
  ])('runs for no item of $name', async (scenario) => {
    const echo = vi.fn((input: unknown) => input);
    await using server = serve({
      ...defaults,
      fns: { list: () => scenario.data, echo },
    });
    const list = sent('list', undefined);
    const each = call(
      'echo',
      {},
      reads({ from: list, path: ['items'] }, { to: ['id'], path: ['id'] }),
    );

    const res = await send({
      ...defaults,
      url: server.url,
      method: 'GET',
      sent: [list],
      calls: [each],
    });

    expect(res.of(each)).toEqual({ items: {} });
    expect(echo).not.toHaveBeenCalled();
  });

  test('a list of lists: a run for every item of the first, with the list of values of the second', async () => {
    const echo = vi.fn((input: unknown) => input);
    await using server = serve({
      ...defaults,
      limits: wholeValues,
      fns: {
        list: () => [{ tags: [{ id: 'a' }, { id: 'b' }] }, { tags: [] }],
        echo,
      },
    });
    const list = sent('list', undefined);
    const each = call(
      'echo',
      {},
      reads(
        { from: list, path: [] },
        { to: ['ids'], path: ['tags', null, 'id'] },
      ),
    );

    await send({
      ...defaults,
      url: server.url,
      method: 'GET',
      sent: [list],
      calls: [each],
    });

    expect(echo.mock.calls).toEqual([[{ ids: ['a', 'b'] }], [{ ids: [] }]]);
  });

  test("a call that reads a call for every item runs once for every item too, and its run for an item reads that item's run", async () => {
    const { fns, ran } = blog();
    await using server = serve({ ...defaults, fns });
    const list = sent('posts', undefined);
    const authorOfEach = call(
      'author',
      {},
      reads(
        { from: list, path: ['items'] },
        { to: ['id'], path: ['authorId'] },
      ),
    );
    const teamPosts = call(
      'teamPosts',
      {},
      reads(null, { to: ['teamId'], from: authorOfEach, path: ['teamId'] }),
    );

    const res = await send({
      ...defaults,
      url: server.url,
      method: 'GET',
      sent: [list],
      calls: [authorOfEach, teamPosts],
    });

    expect(ran.filter(([path]) => path === 'teamPosts')).toEqual([
      ['teamPosts', { teamId: 'infra' }],
      ['teamPosts', { teamId: 'web' }],
    ]);
    // The third author failed: its run of the team's posts doesn't run
    expect(res.of(teamPosts)).toEqual({
      items: {
        0: { result: { data: ['hello'] } },
        1: { result: { data: ['again'] } },
        2: {
          error: {
            code: 'PRECONDITION_FAILED',
            message: 'The call this call reads its input from failed',
          },
        },
      },
    });
    expect(res.wire.url).toBe(
      '/posts,author,teamPosts?batch=pipeline&input={"1":{},"2":{}}&pipe={"1":{"each":{"from":0,"path":["items"]},"reads":[{"to":["id"],"path":["authorId"]}]},"2":{"reads":[{"to":["teamId"],"from":1,"path":["teamId"]}]}}',
    );
  });

  test('every run counts towards the most runs a request may have', async () => {
    const { fns, ran } = blog();
    // The list, the call for its three items: four runs
    await using server = serve({ ...defaults, fns, maxRuns: 3 });
    const list = sent('posts', undefined);
    const authorOfEach = call(
      'author',
      {},
      reads(
        { from: list, path: ['items'] },
        { to: ['id'], path: ['authorId'] },
      ),
    );

    const res = await send({
      ...defaults,
      url: server.url,
      method: 'GET',
      sent: [list],
      calls: [authorOfEach],
    });

    expect(res.of(authorOfEach)).toEqual({
      error: {
        code: 'BAD_REQUEST',
        message: 'A call for every item exceeds the maximum batch size',
      },
    });
    // It ran for none of them
    expect(ran.map(([path]) => path)).toEqual(['posts']);
  });

  test('a list longer than the most runs a request may have is refused before anything is made for its items', async () => {
    const { fns, ran } = blog();
    // Room for the batch's two calls, not for the list's three items
    await using server = serve({ ...defaults, fns, maxRuns: 2 });
    const list = sent('posts', undefined);
    const authorOfEach = call(
      'author',
      {},
      reads(
        { from: list, path: ['items'] },
        { to: ['id'], path: ['authorId'] },
      ),
    );

    const res = await send({
      ...defaults,
      url: server.url,
      method: 'GET',
      sent: [list],
      calls: [authorOfEach],
    });

    expect(res.of(authorOfEach)).toEqual({
      error: {
        code: 'BAD_REQUEST',
        message: 'A call for every item exceeds the maximum batch size',
      },
    });
    expect(ran.map(([path]) => path)).toEqual(['posts']);
  });

  test('a call that is refused takes none of the runs: a later one that fits still runs', async () => {
    const echo = vi.fn((input: unknown) => input);
    await using server = serve({
      ...defaults,
      // Two lists, and two calls for their items
      maxRuns: 4,
      fns: { long: () => [1, 2, 3], short: () => [1, 2], echo },
    });
    const long = sent('long', undefined);
    const short = sent('short', undefined);
    const ofLong = call(
      'echo',
      {},
      reads({ from: long, path: [] }, { to: ['n'], path: [] }),
    );
    const ofShort = call(
      'echo',
      {},
      reads({ from: short, path: [] }, { to: ['n'], path: [] }),
    );

    const res = await send({
      ...defaults,
      url: server.url,
      method: 'GET',
      sent: [long, short],
      calls: [ofLong, ofShort],
    });

    expect(res.of(ofLong)).toMatchObject({ error: { code: 'BAD_REQUEST' } });
    expect(res.of(ofShort)).toEqual({
      items: {
        0: { result: { data: { n: 1 } } },
        1: { result: { data: { n: 2 } } },
      },
    });
  });

  test('a call for the items of an empty list has no run: its place goes to one that needs it', async () => {
    const echo = vi.fn((input: unknown) => input);
    await using server = serve({
      ...defaults,
      // Four calls, and three runs for the items of the long list
      maxRuns: 5,
      fns: {
        empty: () => [],
        // Its list is ready after the empty one
        long: async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return [1, 2, 3];
        },
        echo,
      },
    });
    const empty = sent('empty', undefined);
    const long = sent('long', undefined);
    const ofEmpty = call(
      'echo',
      {},
      reads({ from: empty, path: [] }, { to: ['n'], path: [] }),
    );
    const ofLong = call(
      'echo',
      {},
      reads({ from: long, path: [] }, { to: ['n'], path: [] }),
    );

    const res = await send({
      ...defaults,
      url: server.url,
      method: 'GET',
      sent: [empty, long],
      calls: [ofEmpty, ofLong],
    });

    expect(res.of(ofEmpty)).toEqual({ items: {} });
    expect(echo.mock.calls).toEqual([[{ n: 1 }], [{ n: 2 }], [{ n: 3 }]]);
    expect(Object.keys((res.of(ofLong) as { items: object }).items)).toEqual([
      '0',
      '1',
      '2',
    ]);
  });

  test('a call for every item whose list is from a failed call has no run: its place goes to one that needs it', async () => {
    const echo = vi.fn((input: unknown) => input);
    await using server = serve({
      ...defaults,
      // Four calls, and two runs for the items of the list
      maxRuns: 4,
      fns: {
        broken: () => {
          throw new Error('broken');
        },
        // Ready after the call for the items of `broken` has failed
        list: async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return [1, 2];
        },
        echo,
      },
    });
    const broken = sent('broken', undefined);
    const list = sent('list', undefined);
    const ofBroken = call(
      'echo',
      {},
      reads({ from: broken, path: [] }, { to: ['n'], path: [] }),
    );
    const ofList = call(
      'echo',
      {},
      reads({ from: list, path: [] }, { to: ['n'], path: [] }),
    );

    const res = await send({
      ...defaults,
      url: server.url,
      method: 'GET',
      sent: [broken, list],
      calls: [ofBroken, ofList],
    });

    expect(res.of(ofBroken)).toMatchObject({
      error: { code: 'PRECONDITION_FAILED' },
    });
    expect(res.of(ofList)).toEqual({
      items: {
        0: { result: { data: { n: 1 } } },
        1: { result: { data: { n: 2 } } },
      },
    });
  });

  test('a call whose own input can not be read has no run: its place goes to one that needs it', async () => {
    const echo = vi.fn((input: unknown) => input);
    await using server = serve({
      ...defaults,
      // A transformer that can't read the input `'unreadable'`
      transformer: {
        ...transformers.none,
        input: {
          serialize: (it: unknown) => it,
          deserialize: (it: unknown) => {
            if (it === 'unreadable') {
              throw new Error('unreadable');
            }
            return it;
          },
        },
      },
      // Three calls, and two runs for the items of the list
      maxRuns: 3,
      fns: {
        list: async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return [1, 2];
        },
        echo,
      },
    });
    const list = sent('list', undefined);
    const unreadable = call(
      'echo',
      'unreadable',
      reads(null, { to: ['n'], from: list, path: ['0'] }),
    );
    const ofList = call(
      'echo',
      {},
      reads({ from: list, path: [] }, { to: ['n'], path: [] }),
    );

    const res = await send({
      ...defaults,
      url: server.url,
      method: 'GET',
      sent: [list],
      calls: [unreadable, ofList],
    });

    expect(res.of(unreadable)).toMatchObject({
      error: { message: 'unreadable' },
    });
    expect(res.of(ofList)).toEqual({
      items: {
        0: { result: { data: { n: 1 } } },
        1: { result: { data: { n: 2 } } },
      },
    });
  });

  test('does not run when the call its list is from failed', async () => {
    const { fns, ran } = blog();
    await using server = serve({ ...defaults, fns });
    const post = sent('post', { slug: 'gone' });
    const tagOfEach = call(
      'echo',
      {},
      reads({ from: post, path: ['tags'] }, { to: ['id'], path: ['id'] }),
    );

    const res = await send({
      ...defaults,
      url: server.url,
      method: 'GET',
      sent: [post],
      calls: [tagOfEach],
    });

    expect(res.of(tagOfEach)).toEqual({
      error: {
        code: 'PRECONDITION_FAILED',
        message: 'The call this call reads its input from failed',
      },
    });
    expect(res.ran(tagOfEach)).toBe(false);
    expect(ran).toEqual([['post', { slug: 'gone' }]]);
  });

  test('a `null` in the path of `each` is a level of lists: a run has an index for each, and its response a level of `items`', async () => {
    const echo = vi.fn((input: { n: number }) => input.n);
    await using server = serve({
      ...defaults,
      fns: {
        book: () => ({
          pages: [{ items: [1, 2] }, { items: [3] }, { items: 'none' }],
        }),
        echo,
      },
    });
    const book = sent('book', undefined);
    const each = call(
      'echo',
      {},
      reads(
        { from: book, path: ['pages', null, 'items'] },
        { to: ['n'], path: [] },
      ),
    );

    const res = await send({
      ...defaults,
      url: server.url,
      method: 'POST',
      sent: [book],
      calls: [each],
    });

    expect(res.of(each)).toEqual({
      items: {
        0: {
          items: { 0: { result: { data: 1 } }, 1: { result: { data: 2 } } },
        },
        1: { items: { 0: { result: { data: 3 } } } },
        // What isn't a list has no items
        2: { items: {} },
      },
    });
    expect(echo).toHaveBeenCalledTimes(3);
    expect(await readPipelinedItem(res.of(each), [1, 0])).toEqual({
      kind: 'data',
      data: 3,
    });
  });

  test('every run of a list of lists counts, and a list that would go over `maxRuns` fails by itself', async () => {
    const echo = vi.fn((input: { n: number }) => input.n);
    await using server = serve({
      ...defaults,
      // The book, and the runs for the items of its first page
      limits: { ...pipelineLimitDefaults, maxRuns: 3 },
      fns: {
        book: () => ({ pages: [{ items: [1, 2] }, { items: [3] }] }),
        echo,
      },
    });
    const book = sent('book', undefined);
    const each = call(
      'echo',
      {},
      reads(
        { from: book, path: ['pages', null, 'items'] },
        { to: ['n'], path: [] },
      ),
    );

    const res = await send({
      ...defaults,
      url: server.url,
      method: 'POST',
      sent: [book],
      calls: [each],
    });

    expect(res.of(each)).toEqual({
      items: {
        0: {
          items: { 0: { result: { data: 1 } }, 1: { result: { data: 2 } } },
        },
        1: {
          error: {
            code: 'BAD_REQUEST',
            message:
              'This call would make the batch run 4 times, more than `maxRuns` (3) allows',
          },
        },
      },
    });
    expect(echo).toHaveBeenCalledTimes(2);
  });

  test('a call for every item of a list in each run of a call for every item: its runs have an index for both', async () => {
    const echo = vi.fn((input: { group: string; member: string }) => input);
    await using server = serve({
      ...defaults,
      fns: {
        groups: () => [{ id: 'a' }, { id: 'b' }, { id: 'gone' }],
        members: (input: { id: string }) =>
          input.id === 'gone'
            ? notFound('group')
            : { ids: [`${input.id}1`, `${input.id}2`] },
        echo,
      },
    });
    const groups = sent('groups', undefined);
    const members = call(
      'members',
      {},
      reads({ from: groups, path: [] }, { to: ['id'], path: ['id'] }),
    );
    // Reads the group of its run too: a frame its own starts with
    const ofMembers = call(
      'echo',
      {},
      reads(
        { from: members, path: ['ids'] },
        { to: ['member'], path: [] },
        { to: ['group'], from: groups, path: ['0', 'id'] },
      ),
    );

    const res = await send({
      ...defaults,
      url: server.url,
      method: 'GET',
      sent: [groups],
      calls: [members, ofMembers],
    });

    expect(res.of(ofMembers)).toEqual({
      items: {
        0: {
          items: {
            0: { result: { data: { member: 'a1', group: 'a' } } },
            1: { result: { data: { member: 'a2', group: 'a' } } },
          },
        },
        1: {
          items: {
            0: { result: { data: { member: 'b1', group: 'a' } } },
            1: { result: { data: { member: 'b2', group: 'a' } } },
          },
        },
        // The run of `members` it would be in failed
        2: {
          error: {
            code: 'PRECONDITION_FAILED',
            message: 'The call this call reads its input from failed',
          },
        },
      },
    });
    expect(res.wire.url).toContain(
      '"2":{"each":{"from":1,"path":["ids"]},"reads":[{"to":["member"],"path":[]},{"to":["group"],"from":0,"path":["0","id"]}]}',
    );
  });

  test('a call for every item of a list in the runs of a call that was refused runs for none', async () => {
    const echo = vi.fn(() => null);
    await using server = serve({
      ...defaults,
      // The batch's three calls, but not the two runs of `members` in
      // place of its own
      limits: { ...pipelineLimitDefaults, maxRuns: 3 },
      fns: {
        groups: () => [{ id: 'a' }, { id: 'b' }],
        members: () => ({ ids: ['x'] }),
        echo,
      },
    });
    const groups = sent('groups', undefined);
    const members = call(
      'members',
      {},
      reads({ from: groups, path: [] }, { to: ['id'], path: ['id'] }),
    );
    const ofMembers = call(
      'echo',
      {},
      reads({ from: members, path: ['ids'] }, { to: ['member'], path: [] }),
    );

    const res = await send({
      ...defaults,
      url: server.url,
      method: 'GET',
      sent: [groups],
      calls: [members, ofMembers],
    });

    expect(res.of(members)).toMatchObject({ error: { code: 'BAD_REQUEST' } });
    expect(res.of(ofMembers)).toEqual({
      items: {
        0: { error: expect.objectContaining({ code: 'PRECONDITION_FAILED' }) },
        1: { error: expect.objectContaining({ code: 'PRECONDITION_FAILED' }) },
      },
    });
    expect(echo).not.toHaveBeenCalled();
  });

  test('a call that reads calls for the items of two different lists is refused, and the rest of the batch runs', async () => {
    const { fns, ran } = blog();
    await using server = serve({ ...defaults, fns });
    const post = sent('post', { slug: 'hello' });
    const list = sent('posts', undefined);
    const tags = call(
      'echo',
      {},
      reads({ from: post, path: ['tags'] }, { to: ['id'], path: ['id'] }),
    );
    const authors = call(
      'author',
      {},
      reads(
        { from: list, path: ['items'] },
        { to: ['id'], path: ['authorId'] },
      ),
    );
    const both = call(
      'echo',
      {},
      reads(
        null,
        { to: ['tag'], from: tags, path: ['id'] },
        { to: ['author'], from: authors, path: ['id'] },
      ),
    );

    const res = await send({
      ...defaults,
      url: server.url,
      method: 'GET',
      sent: [post, list],
      calls: [tags, authors, both],
    });

    expect(res.of(both)).toEqual({
      error: {
        code: 'BAD_REQUEST',
        message:
          'Invalid "pipe": call 4 reads calls that run for the items of different lists',
      },
    });
    expect(itemCount(res.of(tags))).toBe(2);
    expect(ran.filter(([path]) => path === 'author')).toHaveLength(3);
  });

  test("a call for the items of a list of lists can read a call over its outer list: its run for an item reads the run for the item's list", async () => {
    const echo = vi.fn((input: unknown) => input);
    await using server = serve({
      ...defaults,
      fns: {
        book: () => ({
          pages: [
            { title: 'one', items: [1, 2] },
            { title: 'two', items: [3] },
          ],
        }),
        echo,
      },
    });
    const book = sent('book', undefined);
    const titles = call(
      'echo',
      {},
      reads(
        { from: book, path: ['pages'] },
        { to: ['title'], path: ['title'] },
      ),
    );
    const items = call(
      'echo',
      {},
      reads(
        { from: book, path: ['pages', null, 'items'] },
        { to: ['n'], path: [] },
        { to: ['page'], from: titles, path: ['title'] },
      ),
    );

    const res = await send({
      ...defaults,
      url: server.url,
      method: 'POST',
      sent: [book],
      calls: [titles, items],
    });

    expect(res.of(items)).toEqual({
      items: {
        0: {
          items: {
            0: { result: { data: { n: 1, page: 'one' } } },
            1: { result: { data: { n: 2, page: 'one' } } },
          },
        },
        1: { items: { 0: { result: { data: { n: 3, page: 'two' } } } } },
      },
    });
  });

  /**
   * Data as a server reads it, where an object with `trap` has an `items`
   * that throws when it is read, as an output transformer could make
   */
  const trapping: CombinedDataTransformer = {
    input: transformers.none.input,
    output: {
      serialize: (it: unknown) => it,
      deserialize: function revive(it: unknown): unknown {
        if (Array.isArray(it)) {
          return it.map(revive);
        }
        if (!isObject(it)) {
          return it;
        }
        if ('trap' in it) {
          return Object.defineProperty({}, 'items', {
            get: () => {
              throw new Error('Can not read it');
            },
          });
        }
        return Object.fromEntries(
          Object.entries(it).map(([key, value]) => [key, revive(value)]),
        );
      },
    },
  };

  test('an inner list that can not be read fails by itself: the other lists run', async () => {
    const echo = vi.fn((input: unknown) => input);
    await using server = serve({
      ...defaults,
      transformer: trapping,
      fns: {
        groups: () => ({ groups: [{ items: [1] }, { trap: true }] }),
        echo,
      },
    });
    const groups = sent('groups', undefined);
    const each = call(
      'echo',
      {},
      reads(
        { from: groups, path: ['groups', null, 'items'] },
        { to: ['n'], path: [] },
      ),
    );

    const res = await send({
      ...defaults,
      transformer: trapping,
      url: server.url,
      method: 'GET',
      sent: [groups],
      calls: [each],
    });

    expect(res.of(each)).toEqual({
      items: {
        0: { items: { 0: { result: { data: { n: 1 } } } } },
        1: {
          error: { code: 'INTERNAL_SERVER_ERROR', message: 'Can not read it' },
        },
      },
    });
  });

  test('a run whose item can not be read fails by itself, and the rejection of what else it reads is handled', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    using _listener = makeResource({}, () =>
      process.off('unhandledRejection', unhandled),
    );
    await using server = serve({
      ...defaults,
      transformer: trapping,
      fns: {
        list: () => [{ trap: true }],
        broken: () => {
          throw new Error('Broken');
        },
        echo: (input: unknown) => input,
      },
    });
    const list = sent('list', undefined);
    const broken = sent('broken', undefined);
    const each = call(
      'echo',
      {},
      reads(
        { from: list, path: [] },
        // Read first: it fails once the item read has already thrown
        { to: ['b'], from: broken, path: [] },
        { to: ['n'], path: ['items'] },
      ),
    );

    const res = await send({
      ...defaults,
      transformer: trapping,
      url: server.url,
      method: 'GET',
      sent: [list, broken],
      calls: [each],
    });
    // A turn for a rejection nothing waits for to be reported
    await new Promise((resolve) => setImmediate(resolve));

    // The item's own error, not the one of what else it reads
    expect(res.of(each)).toEqual({
      items: {
        0: {
          error: { code: 'INTERNAL_SERVER_ERROR', message: 'Can not read it' },
        },
      },
    });
    expect(unhandled).not.toHaveBeenCalled();
  });

  test('a value that many runs read of the same run is read of its data once', async () => {
    const echo = vi.fn((input: unknown) => input);
    await using server = serve({
      ...defaults,
      fns: {
        list: () => [1, 2, 3],
        settings: () => ({ theme: 'dark' }),
        echo,
      },
    });
    const list = sent('list', undefined);
    const settings = sent('settings', undefined);
    const each = call(
      'echo',
      {},
      reads(
        { from: list, path: [] },
        { to: ['n'], path: [] },
        { to: ['theme'], from: settings, path: ['theme'] },
      ),
    );
    vi.mocked(readPipelinePath).mockClear();

    const res = await send({
      ...defaults,
      url: server.url,
      method: 'GET',
      sent: [list, settings],
      calls: [each],
    });

    expect(itemCount(res.of(each))).toBe(3);
    // Each run has it
    expect(echo.mock.calls.map(([input]) => input)).toEqual([
      { n: 1, theme: 'dark' },
      { n: 2, theme: 'dark' },
      { n: 3, theme: 'dark' },
    ]);
    // Once for the three runs
    expect(
      vi
        .mocked(readPipelinePath)
        .mock.calls.filter(([, path]) => JSON.stringify(path) === '["theme"]'),
    ).toHaveLength(1);
  });

  test('a list too long for any call to run for every item is refused before anything is made for its items', async () => {
    const echo = vi.fn(() => null);
    await using server = serve({
      ...defaults,
      limits: { ...pipelineLimitDefaults, maxRuns: 3 },
      fns: { list: () => [1, 2, 3, 4], echo },
    });
    const list = sent('list', undefined);
    const each = call(
      'echo',
      {},
      reads({ from: list, path: [] }, { to: ['n'], path: [] }),
    );

    const res = await send({
      ...defaults,
      url: server.url,
      method: 'GET',
      sent: [list],
      calls: [each],
    });

    expect(res.of(each)).toEqual({
      error: {
        code: 'BAD_REQUEST',
        message: 'A list has 4 items, more than `maxRuns` (3) allows',
      },
    });
    expect(echo).not.toHaveBeenCalled();
  });

  test('a call that fails before it begins to read, such as for a procedure that is not there, gives back its place', async () => {
    const echo = vi.fn((input: unknown) => input);
    await using server = serve({
      ...defaults,
      // The list, the call that isn't there, and the two runs below
      limits: { ...pipelineLimitDefaults, maxRuns: 3 },
      fns: {
        list: async () => {
          // Ready after the call below has failed
          await new Promise((resolve) => setTimeout(resolve, 10));
          return [1, 2];
        },
        echo,
      },
    });
    const list = sent('list', undefined);
    const missing = call(
      'missing',
      {},
      reads(null, { to: ['n'], from: list, path: ['0'] }),
    );
    const each = call(
      'echo',
      {},
      reads({ from: list, path: [] }, { to: ['n'], path: [] }),
    );

    const res = await send({
      ...defaults,
      url: server.url,
      method: 'GET',
      sent: [list],
      calls: [missing, each],
    });

    expect(res.of(missing)).toMatchObject({ error: { code: 'NOT_FOUND' } });
    expect(itemCount(res.of(each))).toBe(2);
    expect(echo).toHaveBeenCalledTimes(2);
  });
  test('a list of more levels than a stack has room for runs for none of its items, and a call that reads it in its frame too', async () => {
    const path = Array.from({ length: 200_000 }, () => null);
    const pipeline = pipelineCalls({
      calls: [0, 1, 2].map(() => ({
        getRawInput: async () => ({}),
        result: () => undefined,
      })),
      pipe: JSON.stringify({
        1: { each: { from: 0, path }, reads: [] },
        2: {
          each: { from: 0, path },
          reads: [{ to: ['n'], from: 1, path: [] }],
        },
      }),
      transformer: transformers.none,
      maxRuns: null,
      limits: pipelineLimitDefaults,
    });
    const ran = vi.fn();
    const [list, ...each] = pipeline.run<Outcome>({
      call: async (_call, run) => {
        try {
          if (run?.kind === 'each') {
            const runs = await run.each({
              item: async (input) => {
                ran(input);
                return input;
              },
              error: wireError,
            });
            return { items: 'items' in runs ? runs.items : runs };
          }
          return { data: [] };
        } catch (cause) {
          return { error: wireError(cause) };
        }
      },
      data: (outcome) => {
        if ('error' in outcome) {
          throw new Error(outcome.error.message);
        }
        return 'data' in outcome ? outcome.data : undefined;
      },
    });

    expect(await list).toEqual({ data: [] });
    expect(await Promise.all(each)).toEqual([{ items: [] }, { items: [] }]);
    expect(ran).not.toHaveBeenCalled();
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
      maxRuns: 100,
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
        maxRuns: 5,
      }),
    ).toEqual({
      maxValueLength: 1,
      maxReadsPerCall: 2,
      maxFillSize: 3,
      maxDepth: 4,
      allowWholeValues: true,
      maxRuns: 5,
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
      call(
        path,
        {},
        reads(
          null,
          ...Array.from({ length: count }, (_it, index) => ({
            to: [`k${index}`],
            from: post,
            path: ['id'],
          })),
        ),
      );
    const fns = { post: () => ({ id: 'ada' }), over: () => 1, within: () => 2 };

    test.each([
      { limits: pipelineLimitDefaults, max: 16 },
      { limits: { ...pipelineLimitDefaults, maxReadsPerCall: 20 }, max: 20 },
      { limits: { ...pipelineLimitDefaults, maxReadsPerCall: 1 }, max: 1 },
    ])(
      'a call that reads more than $max values is refused, and the rest of the batch runs',
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

    test('a call with more reads than a stack has room for is refused by itself', async () => {
      const read = { to: ['id'], from: 0, path: ['id'] };
      const pipeline = pipelineCalls({
        calls: [0, 1].map(() => ({
          getRawInput: async () => ({}),
          result: () => undefined,
        })),
        pipe: JSON.stringify({
          1: { reads: Array.from({ length: 200_000 }, () => read) },
        }),
        transformer: transformers.none,
        maxRuns: null,
        limits: pipelineLimitDefaults,
      });
      const [first, second] = pipeline.run<Outcome>({
        call: async (_call, run) => {
          try {
            return {
              data: run?.kind === 'once' ? await run.input() : { id: 'a' },
            };
          } catch (cause) {
            return { error: wireError(cause) };
          }
        },
        data: (outcome) => {
          if ('error' in outcome) {
            throw new Error(outcome.error.message);
          }
          return 'data' in outcome ? outcome.data : undefined;
        },
      });

      expect(await first).toEqual({ data: { id: 'a' } });
      expect(await second).toEqual(
        refused(
          'This call reads 200000 values, more than `maxReadsPerCall` (16) allows',
        ),
      );
    });

    test('a call for every item counts its reads too, and runs for no item', async () => {
      const list = sent('list', undefined);
      const each = call(
        'each',
        {},
        reads(
          { from: list, path: ['items'] },
          { to: ['a'], path: [] },
          { to: ['b'], from: list, path: ['id'] },
        ),
      );

      const { res, ran } = await sendWith({
        limits: { ...pipelineLimitDefaults, maxReadsPerCall: 1 },
        fns: { list: () => ({ id: 'x', items: [1, 2] }), each: () => 1 },
        sent: [list],
        calls: [each],
      });

      expect(res.of(each)).toEqual(
        refused(
          'This call reads 2 values, more than `maxReadsPerCall` (1) allows',
        ),
      );
      expect(ran).toEqual(['list']);
    });
  });

  describe('`maxDepth`', () => {
    // `post` is 1, `author` 2, `team` 3 and `teamPosts` 4
    const post = sent('post', undefined);
    const author = call(
      'author',
      {},
      reads(null, { to: ['id'], from: post, path: ['authorId'] }),
    );
    const team = call(
      'team',
      {},
      reads(null, { to: ['id'], from: author, path: ['teamId'] }),
    );
    const teamPosts = call(
      'teamPosts',
      {},
      reads(null, { to: ['id'], from: team, path: ['id'] }),
    );
    // 5: it reads a call that is refused
    const first = call(
      'first',
      {},
      reads(null, { to: ['slug'], from: teamPosts, path: ['0'] }),
    );
    // 3, from the deepest call it reads, which is 2
    const both = call(
      'both',
      {},
      reads(
        null,
        { to: ['slug'], from: post, path: ['slug'] },
        { to: ['id'], from: author, path: ['id'] },
      ),
    );
    const fns = {
      post: () => ({ slug: 'hello', authorId: 'ada' }),
      author: () => ({ id: 'ada', teamId: 'infra' }),
      team: () => ({ id: 'infra' }),
      teamPosts: () => ['hello'],
      first: () => 'first',
      both: () => 'both',
    };
    const deep = (depth: number, max: number) =>
      refused(
        `This call is ${depth} calls deep in a chain, more than \`maxDepth\` (${max}) allows`,
      );

    test('a call more than 3 calls deep is refused, and the rest of the batch runs', async () => {
      const { res, ran } = await sendWith({
        limits: pipelineLimitDefaults,
        fns,
        sent: [post],
        calls: [author, team, teamPosts, first, both],
      });

      expect(res.of(team)).toEqual({ data: { id: 'infra' } });
      expect(res.of(both)).toEqual({ data: 'both' });
      expect(res.of(teamPosts)).toEqual(deep(4, 3));
      expect(res.of(first)).toEqual(deep(5, 3));
      expect(ran).toEqual(['post', 'author', 'team', 'both']);
    });

    test('raised, a longer chain runs, and lowered, a shorter one is refused', async () => {
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
        calls: [author, team, both],
      });
      expect(lowered.res.of(author)).toEqual({
        data: { id: 'ada', teamId: 'infra' },
      });
      expect(lowered.res.of(team)).toEqual(deep(3, 2));
      expect(lowered.res.of(both)).toEqual(deep(3, 2));
    });

    test('a call for every item is as deep as the list it runs for', async () => {
      const list = call(
        'list',
        {},
        reads(null, { to: ['id'], from: post, path: ['authorId'] }),
      );
      const each = call(
        'each',
        {},
        reads({ from: list, path: ['items'] }, { to: ['n'], path: [] }),
      );

      const { res, ran } = await sendWith({
        limits: { ...pipelineLimitDefaults, maxDepth: 2 },
        fns: { post: fns.post, list: () => ({ items: [1] }), each: () => 1 },
        sent: [post],
        calls: [list, each],
      });

      expect(res.of(each)).toEqual(deep(3, 2));
      expect(ran).toEqual(['post', 'list']);
    });

    test('a call that reads no values is 1 deep, as one the client sends itself', async () => {
      // `none` 1, `second` 2, `third` 3 and `fourth` 4
      const none = call('none', {}, reads(null));
      const second = call(
        'second',
        {},
        reads(null, { to: ['id'], from: none, path: ['id'] }),
      );
      const third = call(
        'third',
        {},
        reads(null, { to: ['id'], from: second, path: ['id'] }),
      );
      const fourth = call(
        'fourth',
        {},
        reads(null, { to: ['id'], from: third, path: ['id'] }),
      );

      const { res, ran } = await sendWith({
        limits: pipelineLimitDefaults,
        fns: {
          none: () => ({ id: 'a' }),
          second: () => ({ id: 'b' }),
          third: () => ({ id: 'c' }),
          fourth: () => ({ id: 'd' }),
        },
        sent: [],
        calls: [none, second, third, fourth],
      });

      expect(res.of(third)).toEqual({ data: { id: 'c' } });
      expect(res.of(fourth)).toEqual(deep(4, 3));
      expect(ran).toEqual(['none', 'second', 'third']);
    });
  });

  describe('`maxRuns`', () => {
    const list = sent('list', undefined);
    const ofList = call(
      'echo',
      {},
      reads({ from: list, path: [] }, { to: ['n'], path: [] }),
    );
    const fns = (length: number) => ({
      list: () => Array.from({ length }, (_it, index) => index),
      echo: () => null,
    });

    test.each([
      { limits: pipelineLimitDefaults, max: 100 },
      { limits: { ...pipelineLimitDefaults, maxRuns: 10 }, max: 10 },
    ])(
      'a call for every item that would make the batch run more than $max times is refused, without `maxBatchSize`',
      async ({ limits, max }) => {
        // `list` is a run, and one more item would be one too many
        const within = await sendWith({
          limits,
          fns: fns(max - 1),
          sent: [list],
          calls: [ofList],
        });
        expect(itemCount(within.res.of(ofList))).toBe(max - 1);

        const over = await sendWith({
          limits,
          fns: fns(max),
          sent: [list],
          calls: [ofList],
        });
        expect(over.res.of(ofList)).toEqual(
          refused(
            `This call would make the batch run ${max + 1} times, more than \`maxRuns\` (${max}) allows`,
          ),
        );
        expect(over.ran).toEqual(['list']);
      },
    );

    test('a refused call for every item gives its place back: a later one that fits runs', async () => {
      const short = sent('short', undefined);
      const ofShort = call(
        'echo',
        {},
        reads({ from: short, path: [] }, { to: ['n'], path: [] }),
      );
      const { res } = await sendWith({
        // Four calls, and two runs for the items of `short`
        limits: { ...pipelineLimitDefaults, maxRuns: 4 },
        fns: {
          list: () => [1, 2, 3],
          // Ready after the call for the items of `list` is refused
          short: async () => {
            await new Promise((resolve) => setTimeout(resolve, 10));
            return [1, 2];
          },
          echo: () => null,
        },
        sent: [list, short],
        calls: [ofList, ofShort],
      });

      expect(res.of(ofList)).toMatchObject({ error: { code: 'BAD_REQUEST' } });
      expect(itemCount(res.of(ofShort))).toBe(2);
    });
  });

  describe('`maxValueLength`', () => {
    const post = sent('post', undefined);
    const reader = (path: string) =>
      call(path, {}, reads(null, { to: ['v'], from: post, path: [path] }));
    // Its quotes count: `"xx"` is 4 characters of JSON
    const ofLength = (length: number) => 'x'.repeat(length - 2);

    test.each([
      { limits: pipelineLimitDefaults, max: 1024 },
      { limits: { ...pipelineLimitDefaults, maxValueLength: 2000 }, max: 2000 },
      { limits: { ...pipelineLimitDefaults, maxValueLength: 10 }, max: 10 },
    ])(
      'a call that reads a value longer than $max characters of JSON is refused, and the rest of the batch runs',
      async ({ limits, max }) => {
        const over = reader('over');
        const within = reader('within');

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

    test('a value of an item counts, and a run whose value is too long fails by itself', async () => {
      const list = sent('list', undefined);
      const each = call(
        'each',
        {},
        reads({ from: list, path: ['items'] }, { to: ['v'], path: ['v'] }),
      );

      const { res, ran } = await sendWith({
        limits: { ...pipelineLimitDefaults, maxValueLength: 10 },
        fns: {
          list: () => ({ items: [{ v: 'short' }, { v: ofLength(11) }] }),
          each: () => 1,
        },
        sent: [list],
        calls: [each],
      });

      expect(res.of(each)).toEqual({
        items: {
          0: { result: { data: 1 } },
          1: refused(
            'A value this call reads is longer than `maxValueLength` (10 characters of JSON) allows',
          ),
        },
      });
      expect(ran).toEqual(['list', 'each']);
    });
  });

  describe('`allowWholeValues`', () => {
    const post = sent('post', undefined);
    const reader = (path: string) =>
      call(path, {}, reads(null, { to: ['v'], from: post, path: [path] }));
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
      ].map(reader);

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
      const author = reader('author');
      const tags = reader('tags');

      const { res } = await sendWith({
        limits: { ...pipelineLimitDefaults, allowWholeValues: true },
        fns,
        sent: [post],
        calls: [author, tags],
      });

      expect(res.of(author)).toEqual({ data: { id: 'ada' } });
      expect(res.of(tags)).toEqual({ data: ['a'] });
    });

    test('an item itself is a whole value, and a value of it is not', async () => {
      const list = sent('list', undefined);
      const items = call(
        'items',
        {},
        reads({ from: list, path: ['items'] }, { to: ['v'], path: [] }),
      );
      const ids = call(
        'ids',
        {},
        reads({ from: list, path: ['items'] }, { to: ['v'], path: ['id'] }),
      );

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

      expect(res.of(items)).toEqual({ items: { 0: whole } });
      expect(res.of(ids)).toEqual({ items: { 0: { result: { data: 'a' } } } });
    });
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
  const refused = {
    error: {
      code: 'BAD_REQUEST',
      message: `What this call fills in goes over \`maxFillSize\` (${maxFillSize} characters of JSON for the batch)`,
    },
  };

  test('a call that would go over `maxFillSize` is refused, and takes none of it', async () => {
    const echo = vi.fn((input: unknown) =>
      isObject(input) ? input['n'] : null,
    );
    await using server = serve({
      ...defaults,
      limits,
      fns: { post: () => ({ big, id: 'ada' }), echo },
    });
    const post = sent('post', undefined);
    const fits = call(
      'echo',
      { n: 1 },
      reads(null, { to: ['big'], from: post, path: ['big'] }),
    );
    const tooMuch = call(
      'echo',
      { n: 2 },
      reads(
        null,
        { to: ['big'], from: post, path: ['big'] },
        { to: ['again'], from: post, path: ['big'] },
      ),
    );
    const small = call(
      'echo',
      { n: 3 },
      reads(null, { to: ['id'], from: post, path: ['id'] }),
    );

    const res = await send({
      ...defaults,
      url: server.url,
      method: 'POST',
      sent: [post],
      calls: [fits, tooMuch, small],
    });

    expect(res.of(fits)).toEqual({ data: 1 });
    expect(res.of(tooMuch)).toEqual(refused);
    expect(res.of(small)).toEqual({ data: 3 });
    expect(
      echo.mock.calls.map(([input]) => (input as { n: number }).n),
    ).toEqual([1, 3]);
  });

  test('a string counts as long as it is in JSON, escapes included', async () => {
    // Twice as long in JSON: each `\n` is two characters there
    const lines = '\n'.repeat(Math.ceil(maxFillSize * 0.3));
    const echo = vi.fn(() => null);
    await using server = serve({
      ...defaults,
      limits,
      fns: { post: () => ({ lines }), echo },
    });
    const post = sent('post', undefined);
    const reader = call(
      'echo',
      {},
      reads(
        null,
        { to: ['a'], from: post, path: ['lines'] },
        { to: ['b'], from: post, path: ['lines'] },
      ),
    );

    const res = await send({
      ...defaults,
      url: server.url,
      method: 'POST',
      sent: [post],
      calls: [reader],
    });

    expect(res.of(reader)).toEqual(refused);
    expect(echo).not.toHaveBeenCalled();
  });

  test('a call whose input can not be written to takes none of it', async () => {
    const echo = vi.fn(() => null);
    await using server = serve({
      ...defaults,
      limits,
      fns: { post: () => ({ big: 'x'.repeat(maxFillSize * 0.6) }), echo },
    });
    const post = sent('post', undefined);
    const broken = call(
      'echo',
      { id: 'text' },
      reads(null, { to: ['id', 'big'], from: post, path: ['big'] }),
    );
    const fits = call(
      'echo',
      {},
      reads(null, { to: ['big'], from: post, path: ['big'] }),
    );

    const res = await send({
      ...defaults,
      url: server.url,
      method: 'POST',
      sent: [post],
      calls: [broken, fits],
    });

    expect(res.of(broken)).toMatchObject({ error: { code: 'BAD_REQUEST' } });
    expect(res.of(fits)).toEqual({ data: null });
  });

  test('every run of a call for every item counts, with its whole input', async () => {
    const echo = vi.fn((input: unknown) =>
      isObject(input) ? input['n'] : null,
    );
    await using server = serve({
      ...defaults,
      limits,
      // A run that is refused gives its place back
      maxRuns: 6,
      fns: {
        three: () => ({ big, items: [1, 2, 3] }),
        // Ready after the first is refused
        two: async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return { big, items: [1, 2] };
        },
        echo,
      },
    });
    const three = sent('three', undefined);
    const two = sent('two', undefined);
    // Three runs, each with the big value: the third is too much
    const ofThree = call(
      'echo',
      {},
      reads(
        { from: three, path: ['items'] },
        { to: ['n'], path: [] },
        { to: ['big'], from: three, path: ['big'] },
      ),
    );
    // Two runs, each with an input that is the big value, and too much once
    // the first two runs above have theirs
    const ofTwo = call(
      'echo',
      { big },
      reads({ from: two, path: ['items'] }, { to: ['n'], path: [] }),
    );

    const res = await send({
      ...defaults,
      url: server.url,
      method: 'POST',
      sent: [three, two],
      calls: [ofThree, ofTwo],
    });

    expect(res.of(ofThree)).toEqual({
      items: {
        0: { result: { data: 1 } },
        1: { result: { data: 2 } },
        2: refused,
      },
    });
    expect(res.of(ofTwo)).toEqual({ items: { 0: refused, 1: refused } });
    expect(echo).toHaveBeenCalledTimes(2);
  });

  test("a call that runs in the frame of a call for every item counts each run's whole input too", async () => {
    const echo = vi.fn(() => null);
    await using server = serve({
      ...defaults,
      limits,
      fns: { list: () => [1, 2, 3], echo },
    });
    const list = sent('list', undefined);
    const ofList = call(
      'echo',
      {},
      reads({ from: list, path: [] }, { to: ['n'], path: [] }),
    );
    // Reads a small value of each run above, and is a copy of the big input
    // the client sent for each
    const copies = call(
      'echo',
      { big },
      reads(null, { to: ['after'], from: ofList, path: [] }),
    );

    const res = await send({
      ...defaults,
      url: server.url,
      method: 'POST',
      sent: [list],
      calls: [ofList, copies],
    });

    // Two copies fit, and the third is too much
    expect(res.of(copies)).toEqual({
      items: {
        0: { result: { data: null } },
        1: { result: { data: null } },
        2: refused,
      },
    });
  });

  test('the keys a run of a call for every item writes its values under count too', async () => {
    // `{"longField":"x"}` is 17 characters of JSON, though the value is 3
    const run = async (max: number) => {
      const echo = vi.fn(() => null);
      await using server = serve({
        ...defaults,
        limits: { ...pipelineLimitDefaults, maxFillSize: max },
        fns: { list: () => ['x'], echo },
      });
      const list = sent('list', undefined);
      const each = call(
        'echo',
        {},
        reads({ from: list, path: [] }, { to: ['longField'], path: [] }),
      );
      const res = await send({
        ...defaults,
        url: server.url,
        method: 'POST',
        sent: [list],
        calls: [each],
      });
      return { outcome: res.of(each), echo };
    };

    const over = await run(16);
    expect(over.outcome).toEqual({
      items: {
        0: {
          error: {
            code: 'BAD_REQUEST',
            message:
              'What this call fills in goes over `maxFillSize` (16 characters of JSON for the batch)',
          },
        },
      },
    });
    expect(over.echo).not.toHaveBeenCalled();

    const within = await run(17);
    expect(within.outcome).toEqual({
      items: { 0: { result: { data: null } } },
    });
    expect(within.echo).toHaveBeenCalledWith({ longField: 'x' });
  });
});

describe('how long a value is, for what a request fills in', () => {
  test('is how long it is in JSON', () => {
    const sizeOf = createPipelineSizeOf();
    const value = { a: ['x\ny', 1, true, null], b: { c: 'z' } };

    expect(sizeOf(value, Infinity)).toBe(JSON.stringify(value).length);
  });

  test('a number JSON can not write is as long as the `null` it writes instead', () => {
    const sizeOf = createPipelineSizeOf();
    const value = [Number.NaN, Number.POSITIVE_INFINITY, -1.5];

    expect(sizeOf(Number.NaN, Infinity)).toBe(4);
    expect(sizeOf(value, Infinity)).toBe(JSON.stringify(value).length);
  });

  test('a function with `toJSON` is as long as what it gives, as JSON writes it', () => {
    const sizeOf = createPipelineSizeOf();
    const value = { a: 1, fn: Object.assign(() => 1, { toJSON: () => 'fn' }) };

    expect(sizeOf(value, Infinity)).toBe(JSON.stringify(value).length);
  });

  test('a property JSON leaves out of an object counts for nothing', () => {
    const sizeOf = createPipelineSizeOf();
    const value = {
      a: 1,
      gone: undefined,
      fn: () => 1,
      sym: Symbol('x'),
      b: [undefined, 2],
    };

    expect(sizeOf(value, Infinity)).toBe(JSON.stringify(value).length);
  });

  test('a value that JSON writes with `toJSON`, such as a `Date`, is as long as that', () => {
    const sizeOf = createPipelineSizeOf();
    const value = { at: new Date('2026-01-01T00:00:00Z') };

    expect(sizeOf(value, Infinity)).toBe(JSON.stringify(value).length);
  });

  test('a string longer than the room is too long without being measured', () => {
    const sizeOf = createPipelineSizeOf();
    const stringify = vi.spyOn(JSON, 'stringify');
    try {
      expect(sizeOf('x'.repeat(100), 50)).toBeGreaterThan(50);
      expect(stringify).not.toHaveBeenCalled();
    } finally {
      stringify.mockRestore();
    }
  });

  test('an object that could not be measured is measured again, not taken as empty', () => {
    let reads = 0;
    const value = {
      get long() {
        reads++;
        if (reads === 1) {
          throw new Error('Not yet');
        }
        return 'x'.repeat(100);
      },
    };
    const sizeOf = createPipelineSizeOf();

    expect(() => sizeOf(value, Infinity)).toThrow('Not yet');
    expect(sizeOf(value, Infinity)).toBe(JSON.stringify(value).length);
  });

  test('an object is measured until it is longer than the room, and once', () => {
    let reads = 0;
    const big = new Proxy(
      Object.fromEntries(
        Array.from({ length: 10_000 }, (_it, index) => [`k${index}`, index]),
      ),
      {
        get(target, key, receiver) {
          reads++;
          return Reflect.get(target, key, receiver);
        },
      },
    );
    const sizeOf = createPipelineSizeOf();

    expect(sizeOf(big, 100)).toBeGreaterThan(100);
    expect(reads).toBeLessThan(100);
    const first = reads;
    // It is at least that long: no room as small reads it again
    expect(sizeOf(big, 100)).toBeGreaterThan(100);
    expect(reads).toBe(first);
    // A list too
    expect(
      sizeOf(
        Array.from({ length: 10_000 }, () => 1),
        100,
      ),
    ).toBe(101);
  });
});

describe('data that is still to come', () => {
  test('can not be read: what JSON makes of it is not what the client gets', async () => {
    const echo = vi.fn(() => null);
    await using server = serve({
      ...defaults,
      fns: {
        // As a stream sends it: its `later` arrives after the rest
        post: () => ({ id: 'ada', later: Promise.resolve('soon') }),
        echo,
      },
    });
    const post = sent('post', undefined);
    const reader = call(
      'echo',
      {},
      reads(null, { to: ['id'], from: post, path: ['id'] }),
    );

    const res = await send({
      ...defaults,
      url: server.url,
      method: 'GET',
      sent: [post],
      calls: [reader],
    });

    expect(res.of(reader)).toEqual({
      error: {
        code: 'UNSUPPORTED_MEDIA_TYPE',
        message: 'Cannot read the data of a stream-like response',
      },
    });
    expect(echo).not.toHaveBeenCalled();
  });
});

describe('a call that failed', () => {
  test('is reported with the input it ran with: filled in, if it got that far', async () => {
    const { fns } = blog();
    const failed: [path: string, input: unknown][] = [];
    await using server = serve({
      ...defaults,
      fns,
      onError: (path, input) => failed.push([path, input]),
    });
    const post = sent('post', { slug: 'orphan' });
    const author = call(
      'author',
      { fields: ['name'] },
      reads(null, { to: ['id'], from: post, path: ['authorId'] }),
    );
    const teamPosts = call(
      'teamPosts',
      { limit: 5 },
      reads(null, { to: ['teamId'], from: author, path: ['teamId'] }),
    );

    await send({
      ...defaults,
      url: server.url,
      method: 'GET',
      sent: [post],
      calls: [author, teamPosts],
    });

    expect(failed).toEqual([
      // It ran, with the id the server read from the post
      ['author', { fields: ['name'], id: 'nobody' }],
      // It never ran: its input is as the client sent it
      ['teamPosts', { limit: 5 }],
    ]);
  });
});

describe('the order things happen in', () => {
  test('calls that read nothing of each other run at the same time, and one that reads another runs after it', async () => {
    const events: string[] = [];
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await using server = serve({
      ...defaults,
      fns: {
        slow: async () => {
          events.push('slow starts');
          await held;
          events.push('slow ends');
          return { id: 'slow' };
        },
        fast: () => {
          events.push('fast runs');
          return { id: 'fast' };
        },
        echo: (input) => {
          events.push(`echo of ${input.id} runs`);
          if (input.id === 'fast') {
            // What reads the fast one has run: the slow one can end
            release();
          }
          return input;
        },
      },
    });
    const slow = sent('slow', undefined);
    const fast = sent('fast', undefined);
    const ofSlow = call(
      'echo',
      {},
      reads(null, { to: ['id'], from: slow, path: ['id'] }),
    );
    const ofFast = call(
      'echo',
      {},
      reads(null, { to: ['id'], from: fast, path: ['id'] }),
    );

    await send({
      ...defaults,
      url: server.url,
      method: 'GET',
      sent: [slow, fast],
      calls: [ofSlow, ofFast],
    });

    expect(events).toEqual([
      'slow starts',
      'fast runs',
      'echo of fast runs',
      'slow ends',
      'echo of slow runs',
    ]);
  });

  test('with a response that streams, each result arrives when it is ready', async () => {
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await using server = serve({
      ...defaults,
      stream: true,
      fns: {
        slow: async () => {
          await held;
          return notFound('slow');
        },
        fast: () => ({ id: 'fast' }),
        echo: (input) => {
          if (input.id === 'fast') {
            // What reads the fast one has run: the slow one can end
            release();
          }
          return input;
        },
      },
    });
    const slow = sent('slow', undefined);
    const fast = sent('fast', undefined);
    const ofSlow = call(
      'echo',
      {},
      reads(null, { to: ['id'], from: slow, path: ['id'] }),
    );
    const ofFast = call(
      'echo',
      {},
      reads(null, { to: ['id'], from: fast, path: ['id'] }),
    );

    const res = await send({
      ...defaults,
      stream: true,
      url: server.url,
      method: 'GET',
      sent: [slow, fast],
      calls: [ofSlow, ofFast],
    });

    // In the request: slow, fast, of slow, of fast
    expect(res.arrived).toEqual([1, 3, 0, 2]);
    expect(res.ran(ofFast)).toBe(true);
    expect(res.ran(ofSlow)).toBe(false);
    expect(res.of(ofFast)).toEqual({ data: { id: 'fast' } });
  });
});

describe('what a client puts in a request', () => {
  const post = sent('post', { slug: 'hello' });
  const author = call(
    'author',
    {},
    reads(null, { to: ['id'], from: post, path: ['authorId'] }),
  );
  const teamPosts = call(
    'teamPosts',
    {},
    reads(null, { to: ['teamId'], from: author, path: ['teamId'] }),
  );

  test('a call that does not fit is left out, and so is what reads it', () => {
    const plan = planPipelinedBatch({
      sent: [post],
      calls: [author, teamPosts],
      fits: (next) => !next.calls.includes(author),
    });

    expect(plan).toEqual({ calls: [], pipe: {}, left: [author, teamPosts] });
  });

  test('a call that fits goes, also when a later one does not', () => {
    const plan = planPipelinedBatch({
      sent: [post],
      calls: [author, teamPosts],
      fits: (next) => next.calls.length <= 1,
    });

    expect(plan).toEqual({
      calls: [author],
      pipe: { 1: { reads: [{ to: ['id'], from: 0, path: ['authorId'] }] } },
      left: [teamPosts],
    });
  });

  test('a call that reads what the request does not have is left out', () => {
    const elsewhere = sent('post', { slug: 'again' });
    const reader = call(
      'echo',
      {},
      reads(
        null,
        { to: ['a'], from: post, path: ['slug'] },
        { to: ['b'], from: elsewhere, path: ['slug'] },
      ),
    );
    const ofEach = call(
      'echo',
      {},
      reads({ from: elsewhere, path: [] }, { to: ['a'], path: [] }),
    );

    const plan = planPipelinedBatch({
      // `null`: something in the request that no call reads
      sent: [null, post],
      calls: [reader, ofEach, author],
      fits: () => true,
    });

    expect(plan.calls).toEqual([author]);
    expect(plan.pipe).toEqual({
      2: { reads: [{ to: ['id'], from: 1, path: ['authorId'] }] },
    });
    expect(plan.left).toEqual([reader, ofEach]);
  });

  test('a call for every item that also reads what the request does not have is left out', () => {
    const elsewhere = sent('post', { slug: 'again' });
    const ofEach = call(
      'echo',
      {},
      reads(
        { from: post, path: ['tags'] },
        { to: ['a'], path: [] },
        { to: ['b'], from: elsewhere, path: ['slug'] },
      ),
    );

    const plan = planPipelinedBatch({
      sent: [post],
      calls: [ofEach],
      fits: () => true,
    });

    expect(plan).toEqual({ calls: [], pipe: {}, left: [ofEach] });
  });

  test('a call the `pipe` says nothing of reads nothing, so it ran', async () => {
    const [first] = pipelinedCallsRan({
      sent: [Promise.resolve(false)],
      pipe: {},
      calls: [{ result: Promise.resolve('data') }],
    });

    await expect(first?.ran).resolves.toBe(true);
  });

  test('an item the server sent neither a result nor an error for is missing', async () => {
    const items = { items: { 0: {}, 1: { result: null }, 2: 'text' } };
    expect(
      await Promise.all(
        [0, 1, 2, 3].map((index) => readPipelinedItem(items, [index])),
      ),
    ).toEqual(Array.from({ length: 4 }, () => ({ kind: 'missing' })));
    // What has no items, or a list that couldn't run, has no runs
    expect(await readPipelinedItem(null, [0])).toEqual({ kind: 'missing' });
    expect(await readPipelinedItem({ error: {} }, [0])).toEqual({
      kind: 'missing',
    });
    // A level of lists with no list at an index
    expect(
      await readPipelinedItem({ items: { 0: { items: {} } } }, [0, 1]),
    ).toEqual({ kind: 'missing' });
    // A place that is a level of lists, not a run
    expect(await readPipelinedItem(items, [])).toEqual({ kind: 'missing' });
  });

  test('a run is read through every level of lists, streamed or not', async () => {
    const run = { result: { data: 'a' } };
    expect(
      await readPipelinedItem({ items: { 1: { items: { 0: run } } } }, [1, 0]),
    ).toEqual({ kind: 'data', data: 'a' });
    expect(
      await readPipelinedItem(
        {
          items: Promise.resolve({
            1: Promise.resolve({ items: Promise.resolve({ 0: run }) }),
          }),
        },
        [1, 0],
      ),
    ).toEqual({ kind: 'data', data: 'a' });
  });

  test("a response that does not stream has each run deserialized as a call's result is", () => {
    const deserialize = (value: unknown) => ({ deserialized: value });
    expect(
      deserializePipelinedItems(
        {
          items: {
            0: { result: { data: 1 } },
            1: { error: 'e' },
            2: { items: { 0: { result: { data: 2 } } } },
            // What is no run is as it was
            3: 'text',
            4: { result: null },
          },
        },
        deserialize,
      ),
    ).toEqual({
      items: {
        0: { result: { data: { deserialized: 1 } } },
        1: { error: { deserialized: 'e' } },
        2: { items: { 0: { result: { data: { deserialized: 2 } } } } },
        3: 'text',
        4: { result: null },
      },
    });
  });

  test('the reads of a call are the same after a trip over the wire', () => {
    const cases: PipelineCallReads<number>[] = [
      { each: null, reads: [] },
      { each: null, reads: [{ kind: 'whole', to: [], from: 0, path: [] }] },
      {
        each: { from: 1, path: ['pages', null, 'items'] },
        reads: [
          { kind: 'whole', to: ['a'], from: 0, path: ['x', null, 'y'] },
          { kind: 'item', to: ['b'], path: ['id', null] },
          { kind: 'item', to: ['c', '0'], path: [] },
          { kind: 'whole', to: ['d'], from: 2, path: ['z'] },
        ],
      },
      {
        each: { from: 0, path: [null] },
        reads: [{ kind: 'item', to: ['a'], path: [] }],
      },
    ];
    for (const reads of cases) {
      const pipe = { 3: encodePipelineReads(reads) };
      expect(
        // A source that is its own index: what comes out is what went in
        parsePipelineReads({
          pipe: JSON.stringify(pipe),
          sources: [0, 1, 2, 3],
        }).get(3),
      ).toEqual(reads);
    }
    // What can be left out is a key, never `undefined`
    expect(JSON.stringify(encodePipelineReads(cases[0]!))).toBe('{"reads":[]}');
  });

  test('the levels of a list are its path, split at each `null`', () => {
    expect(pipelineListLevels([])).toEqual([[]]);
    expect(pipelineListLevels(['items'])).toEqual([['items']]);
    expect(pipelineListLevels(['pages', null, 'items'])).toEqual([
      ['pages'],
      ['items'],
    ]);
    expect(pipelineListLevels([null])).toEqual([[], []]);
  });

  test('a call runs for the items of one list: the frames of what it reads are the start of its own', () => {
    const frameOf = new Map<
      number,
      ReturnType<typeof pipelineFrameOf<number>>['frame']
    >();
    const add = (index: number, reads: PipelineCallReads<number>) => {
      const framed = pipelineFrameOf({
        reads,
        frameOf: (from) => frameOf.get(from) ?? null,
      });
      frameOf.set(index, framed.frame);
      return framed;
    };
    const whole = (from: number) => ({
      kind: 'whole' as const,
      to: [],
      from,
      path: [],
    });
    // 1 and 2 run for the items of two lists of 0, 3 for the items of 1's
    expect(add(1, { each: { from: 0, path: ['a'] }, reads: [] }).frame).toEqual(
      {
        parent: null,
        list: { from: 0, path: ['a'] },
        inItem: null,
        depth: 1,
      },
    );
    add(2, { each: { from: 0, path: ['b'] }, reads: [] });
    expect(
      add(3, { each: { from: 1, path: ['c', null, 'd'] }, reads: [] }).frame
        ?.depth,
    ).toBe(3);
    // In 1's frame, as it reads 1
    expect(add(4, { each: null, reads: [whole(0), whole(1)] })).toEqual({
      frame: frameOf.get(1),
      fits: true,
    });
    // 3's frame starts with 1's, and with 4's, which is the same
    expect(add(5, { each: null, reads: [whole(3), whole(4)] }).fits).toBe(true);
    // Another list of the same call, and a call over another list
    expect(add(6, { each: null, reads: [whole(1), whole(2)] }).fits).toBe(
      false,
    );
    expect(add(7, { each: null, reads: [whole(3), whole(2)] }).fits).toBe(
      false,
    );
    // A list in each of 1's runs, which reads 2
    expect(
      add(8, { each: { from: 1, path: ['e'] }, reads: [whole(2)] }).fits,
    ).toBe(false);
    // The same list, as another call has it
    expect(
      add(9, {
        each: { from: 0, path: ['a'] },
        reads: [whole(1), whole(4)],
      }).fits,
    ).toBe(true);
    // A level of lists is a frame of its own: the items of every `a` are in
    // the frame of the `a`s, which call 1 runs in
    const inner = add(10, {
      each: { from: 0, path: ['a', null, 'b'] },
      reads: [whole(1)],
    });
    expect(inner.fits).toBe(true);
    expect(inner.frame).toMatchObject({
      parent: frameOf.get(1),
      // Only its own part of the path: the rest is its parent's
      list: { from: 0, path: ['b'] },
      inItem: ['b'],
      depth: 2,
    });
  });

  test('the URL of a batch, pipelined', () => {
    const pipe = {
      1: { reads: [{ to: ['id'], from: 0, path: ['authorId'] }] },
    };
    const encoded = encodeURIComponent(JSON.stringify(pipe));
    expect(
      pipelinedBatchUrl({ url: 'http://x/a,b?batch=1&input=%7B%7D', pipe }),
    ).toBe(`http://x/a,b?batch=pipeline&input=%7B%7D&pipe=${encoded}`);
    // Its own search params are left alone, also one that looks like it
    expect(
      pipelinedBatchUrl({ url: 'http://x/a,b?rebatch=1&batch=1', pipe: null }),
    ).toBe('http://x/a,b?rebatch=1&batch=pipeline');
    expect(
      pipeOfSearchParams(
        new URL(pipelinedBatchUrl({ url: 'http://x/a,b?batch=1', pipe }))
          .searchParams,
      ),
    ).toBe(JSON.stringify(pipe));
    expect(pipeOfSearchParams(new URLSearchParams())).toBeUndefined();
    expect(pipeOfBody('not an object')).toBeUndefined();
  });

  test('the path of one item, for a client that reads what the server read', () => {
    expect(bindPipelinePath(['items', null, 'tags', null, 'id'], 2)).toEqual([
      'items',
      '2',
      'tags',
      null,
      'id',
    ]);
    expect(
      readPipelinePath(
        { items: [{}, {}, { tags: [{ id: 'a' }] }] },
        bindPipelinePath(['items', null, 'tags', null, 'id'], 2),
      ),
    ).toEqual(['a']);
  });
});

test('a pipelined batch without a `pipe` has nothing to fill in: its calls run as they were sent', async () => {
  const { fns, ran } = blog();
  await using server = serve({ ...defaults, fns });

  const response = await fetch(
    `${server.url}/post,author?batch=${pipelineBatch}&input=${encodeURIComponent(
      JSON.stringify({ 0: { slug: 'hello' }, 1: { id: 'lin' } }),
    )}`,
  );

  expect(await response.json()).toEqual([
    { result: { data: posts[0] } },
    { result: { data: authors[1] } },
  ]);
  expect(ran).toEqual([
    ['post', { slug: 'hello' }],
    ['author', { id: 'lin' }],
  ]);
});

describe('a request the server refuses, before anything of it runs', () => {
  const read: PipeRead = { to: ['id'], from: 0, path: ['authorId'] };

  test.each<{ name: string; pipe: unknown; message: string }>([
    { name: 'no JSON', pipe: '{', message: 'not JSON' },
    { name: 'no object', pipe: '[]', message: 'expected an object' },
    {
      name: 'a call that is not there',
      pipe: { 2: { reads: [] } },
      message: 'no call at index 2',
    },
    {
      name: 'a call before the first',
      pipe: { '-1': { reads: [] } },
      message: 'no call at index -1',
    },
    // It would be read as `1`, and the last of the two would win
    {
      name: 'a second way to write an index',
      pipe: { '01': { reads: [read] } },
      message: 'no call at index 01',
    },
    {
      name: 'a third way to write an index',
      pipe: { '1e0': { reads: [read] } },
      message: 'no call at index 1e0',
    },
    {
      name: 'a zero with a sign',
      pipe: { '-0': { reads: [] } },
      message: 'no call at index -0',
    },
    {
      name: 'a key that is no index',
      pipe: { a: { reads: [] } },
      message: 'no call at index a',
    },
    {
      name: 'a call that is no object',
      pipe: { 1: [read] },
      message: 'expected "reads" at 1',
    },
    {
      name: 'reads that are no list',
      pipe: { 1: { reads: {} } },
      message: 'expected "reads" at 1',
    },
    {
      name: 'a read that is no object',
      pipe: { 1: { reads: ['x'] } },
      message: 'expected "to" and "path" at 1',
    },
    {
      name: 'a `to` that is no list of keys',
      pipe: { 1: { reads: [{ ...read, to: [1] }] } },
      message: 'expected "to" and "path" at 1',
    },
    {
      name: 'a `path` that is no path',
      pipe: { 1: { reads: [{ ...read, path: [1] }] } },
      message: 'expected "to" and "path" at 1',
    },
    {
      name: 'a read from itself',
      pipe: { 1: { reads: [{ ...read, from: 1 }] } },
      message: 'call 1 can only read from an earlier call',
    },
    {
      name: 'a read from no call',
      pipe: { 1: { reads: [{ ...read, from: 0.5 }] } },
      message: 'call 1 can only read from an earlier call',
    },
    {
      name: 'a read from a name',
      pipe: { 1: { reads: [{ ...read, from: '0' }] } },
      message: 'call 1 can only read from an earlier call',
    },
    {
      name: 'a read of an item without `each`',
      pipe: { 1: { reads: [{ to: ['id'], path: [] }] } },
      message: 'call 1 reads an item without "each", or has no "from"',
    },
    {
      name: 'an `each` that is no object',
      pipe: { 1: { each: ['a'], reads: [] } },
      message: 'expected "from" and "path" in "each" at 1',
    },
    {
      name: 'an `each` without a path',
      pipe: { 1: { each: { from: 0 }, reads: [] } },
      message: 'expected "from" and "path" in "each" at 1',
    },
    {
      name: 'an `each` of a list in itself',
      pipe: { 1: { each: { from: 1, path: [] }, reads: [] } },
      message: 'call 1 can only read from an earlier call',
    },
  ])('$name', async (scenario) => {
    const { fns, ran } = blog();
    await using server = serve({ ...defaults, fns });
    const pipe =
      typeof scenario.pipe === 'string'
        ? scenario.pipe
        : JSON.stringify(scenario.pipe);

    const response = await fetch(
      `${server.url}/post,author?batch=${pipelineBatch}&pipe=${encodeURIComponent(pipe)}`,
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: 'BAD_REQUEST',
        message: `Invalid "pipe": ${scenario.message}`,
      },
    });
    expect(ran).toEqual([]);
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
  ])('$name', async (scenario) => {
    const { fns, ran } = blog();
    await using server = serve({ ...defaults, fns });
    const post = sent('post', { slug: 'hello' });
    const echo = call(
      'echo',
      scenario.input,
      reads(null, { to: scenario.to, from: post, path: ['authorId'] }),
    );

    const res = await send({
      ...defaults,
      url: server.url,
      method: 'POST',
      sent: [post],
      calls: [echo],
    });

    expect(res.of(echo)).toEqual({
      error: {
        code: 'BAD_REQUEST',
        message: `Invalid "pipe": the input has nothing at "${scenario.to.join('.')}"`,
      },
    });
    // Only that call: the rest of the request ran
    expect(ran).toEqual([['post', { slug: 'hello' }]]);
  });

  test.each([
    { name: 'a Map', input: { filter: new Map([['id', 'x']]) } },
    { name: 'a Date', input: { filter: new Date(0) } },
    { name: 'a Set', input: { filter: new Set(['id']) } },
  ])(
    'inside $name, which keeps what it has out of its properties',
    async (scenario) => {
      const echo = vi.fn((input: unknown) => input);
      await using server = serve({
        ...defaults,
        transformer: transformers.superjson,
        fns: { post: () => ({ authorId: 'ada' }), echo },
      });
      const post = sent('post', undefined);
      const reader = call(
        'echo',
        scenario.input,
        reads(null, { to: ['filter', 'id'], from: post, path: ['authorId'] }),
      );

      const res = await send({
        ...defaults,
        transformer: transformers.superjson,
        url: server.url,
        method: 'POST',
        sent: [post],
        calls: [reader],
      });

      expect(res.of(reader)).toEqual({
        error: {
          code: 'BAD_REQUEST',
          message: `Invalid "pipe": the input has a value on the way to "filter.id" that can't be written to`,
        },
      });
      expect(echo).not.toHaveBeenCalled();
    },
  );

  test('a key named `__proto__` is a property like any other, and changes no prototype', async () => {
    const seen: unknown[] = [];
    await using server = serve({
      ...defaults,
      limits: wholeValues,
      fns: {
        post: () => ({ authorId: 'ada', evil: { polluted: true } }),
        echo: (input) => {
          seen.push(input);
          return null;
        },
      },
    });
    const post = sent('post', undefined);
    const reader = call(
      'echo',
      {},
      reads(null, { to: ['__proto__'], from: post, path: ['evil'] }),
    );

    await send({
      ...defaults,
      url: server.url,
      method: 'POST',
      sent: [post],
      calls: [reader],
    });

    const [input] = seen;
    assert(isObject(input));
    expect(Object.getPrototypeOf(input)).toBe(Object.prototype);
    expect(Object.getOwnPropertyDescriptor(input, '__proto__')?.value).toEqual({
      polluted: true,
    });
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  test('a `__proto__` on the way is a property of the input too, and changes no prototype', async () => {
    const seen: unknown[] = [];
    await using server = serve({
      ...defaults,
      fns: {
        post: () => ({ yes: true }),
        echo: (input) => {
          seen.push(input);
          return null;
        },
      },
    });
    const post = sent('post', undefined);
    // An input that has one: JSON makes `"__proto__"` a property
    const reader = call(
      'echo',
      JSON.parse('{"__proto__":{"a":1}}'),
      reads(null, { to: ['__proto__', 'polluted'], from: post, path: ['yes'] }),
    );

    await send({
      ...defaults,
      url: server.url,
      method: 'POST',
      sent: [post],
      calls: [reader],
    });

    const [input] = seen;
    assert(isObject(input));
    expect(Object.getPrototypeOf(input)).toBe(Object.prototype);
    expect(Object.getOwnPropertyDescriptor(input, '__proto__')?.value).toEqual({
      a: 1,
      polluted: true,
    });
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  test.each<{ name: string; to: string[] }>([
    { name: '`__proto__`', to: ['__proto__', 'polluted'] },
    { name: '`constructor`', to: ['constructor', 'prototype', 'polluted'] },
  ])(
    'what an input has from its prototype, such as $name, is nothing to write to',
    async ({ to }) => {
      const echo = vi.fn(() => null);
      await using server = serve({
        ...defaults,
        fns: { post: () => ({ yes: true }), echo },
      });
      const post = sent('post', undefined);
      const reader = call(
        'echo',
        {},
        reads(null, { to, from: post, path: ['yes'] }),
      );

      const res = await send({
        ...defaults,
        url: server.url,
        method: 'POST',
        sent: [post],
        calls: [reader],
      });

      expect(res.of(reader)).toEqual({
        error: {
          code: 'BAD_REQUEST',
          message: `Invalid "pipe": the input has nothing at "${to.join('.')}"`,
        },
      });
      expect(echo).not.toHaveBeenCalled();
      expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
      expect(Object.prototype).not.toHaveProperty('polluted');
    },
  );

  test('an instance of a class keeps its class', async () => {
    class Range {
      constructor(
        public from: number,
        public to: number,
      ) {}
      get length() {
        return this.to - this.from;
      }
    }
    superjson.registerClass(Range, { identifier: 'pipeline.test.Range' });
    const seen: unknown[] = [];
    await using server = serve({
      ...defaults,
      transformer: transformers.superjson,
      fns: {
        post: () => ({ max: 9 }),
        echo: (input) => {
          seen.push(input);
          return null;
        },
      },
    });
    const post = sent('post', undefined);
    const reader = call(
      'echo',
      new Range(1, 0),
      reads(null, { to: ['to'], from: post, path: ['max'] }),
    );

    await send({
      ...defaults,
      transformer: transformers.superjson,
      url: server.url,
      method: 'POST',
      sent: [post],
      calls: [reader],
    });

    const [input] = seen;
    assert(input instanceof Range);
    expect(input.length).toBe(8);
  });
});
