/**
 * The two halves of a pipelined batch, against each other over HTTP. Nothing
 * here knows of routers, procedures or links: the server is a map of plain
 * functions, and the client is `fetch`. The request is the one a link sends:
 * the paths in the URL, the inputs by index, `?batch=pipeline` and a `pipe`.
 */
import { fetchServerResource } from '@trpc/server/__tests__/fetchServerResource';
import superjson from 'superjson';
import { TRPCError } from '../../error/TRPCError';
import type { CombinedDataTransformer } from '../../transformer';
import { isObject } from '../../utils';
import {
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
import type {
  PipelineCallReads,
  PipelineLimits,
  PipelineRead,
  PipeRead,
} from './wire';
import {
  bindPipelinePath,
  groupPipelineReads,
  pipelineBatch,
  pipelineLimitDefaults,
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
      return { path, getRawInput: async () => read(), result: read };
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
      call: async (call, each): Promise<[cause: unknown, data: unknown]> => {
        try {
          const fn = opts.fns[call.path];
          if (!fn) {
            throw new TRPCError({ code: 'NOT_FOUND' });
          }
          return [
            undefined,
            await (each
              ? each({ item: async (input) => fn(input), error: wireError })
              : fn(await call.getRawInput())),
          ];
        } catch (cause) {
          opts.onError(call.path, call.result());
          return [cause ?? new Error('failed'), undefined];
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
      const [cause, data] = await result;
      if (cause !== undefined) {
        return { error: wireError(cause) };
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

function call(path: string, input: unknown, reads: PipelineRead<Sent>[]): Call {
  const grouped = groupPipelineReads(reads);
  if (!grouped.ok) {
    throw new Error(grouped.problem);
  }
  return { path, input, reads: grouped.reads };
}

type Outcome = { data: unknown } | { error: WireError };

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
  fits: (plan: Pick<PipelinedBatchPlan<Call>, 'calls' | 'reads'>) => boolean;
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
          pipe: plan.reads,
        })
      : pipelinedBatchUrl({ url: batch, pipe: null });
  const body =
    opts.method === 'GET'
      ? undefined
      : pipelinedBatchBody({
          body: JSON.stringify(Object.fromEntries(inputs.entries())),
          pipe: plan.reads,
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
      isObject(result)
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
      (outcome) => !!outcome && 'data' in outcome,
    );
  const ran = pipelinedCallsRan({
    sent: opts.sent.map((_it, index) => succeeded(index)),
    reads: plan.reads,
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
    const author = call('author', {}, [
      { to: ['id'], from: post, path: ['authorId'], each: false },
    ]);

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
    const author = call('author', {}, [
      { to: ['id'], from: post, path: ['authorId'], each: false },
    ]);
    const teamPosts = call('teamPosts', {}, [
      { to: ['teamId'], from: author, path: ['teamId'], each: false },
    ]);

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
          ? '/post,author,teamPosts?batch=pipeline&input={"0":{"slug":"hello"},"1":{},"2":{}}&pipe={"1":[{"to":["id"],"from":0,"path":["authorId"]}],"2":[{"to":["teamId"],"from":1,"path":["teamId"]}]}'
          : '/post,author,teamPosts?batch=pipeline',
      body:
        method === 'GET'
          ? undefined
          : {
              0: { slug: 'hello' },
              1: {},
              2: {},
              pipe: {
                1: [{ to: ['id'], from: 0, path: ['authorId'] }],
                2: [{ to: ['teamId'], from: 1, path: ['teamId'] }],
              },
            },
    });
  });

  test('`null` in a path reads a value of every item of a list', async () => {
    const { fns, ran } = blog();
    await using server = serve({ ...defaults, limits: wholeValues, fns });
    const post = sent('post', { slug: 'hello' });
    const tags = call('tags', {}, [
      { to: ['ids'], from: post, path: ['tags', null, 'id'], each: false },
    ]);

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
    const authorOfEach = call('author', {}, [
      {
        to: ['id'],
        from: list,
        path: ['items', null, 'authorId'],
        each: true,
      },
    ]);

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
    assert(outcome && 'data' in outcome);
    expect(
      [0, 1, 2, 3].map((index) => readPipelinedItem(outcome.data, index)),
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
    const author = call('author', {}, [
      { to: ['id'], from: post, path: ['authorId'], each: false },
    ]);
    const teamPosts = call('teamPosts', {}, [
      { to: ['teamId'], from: author, path: ['teamId'], each: false },
    ]);
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
    const echo = call('echo', { authors: [null, null], nested: { deep: {} } }, [
      { to: ['authors', '0'], from: hello, path: ['authorId'], each: false },
      { to: ['authors', '1'], from: again, path: ['authorId'], each: false },
      { to: ['nested', 'deep', 'post'], from: hello, path: [], each: false },
    ]);

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
    const echo = call('echo', undefined, [
      { to: [], from: post, path: ['authorId'], each: false },
    ]);

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
    const echo = call('echo', {}, [
      { to: ['a'], from: post, path: ['nope'], each: false },
      { to: ['b'], from: post, path: ['slug', 'length'], each: false },
      { to: ['c'], from: post, path: ['constructor'], each: false },
      { to: ['d'], from: post, path: ['tags', 'length'], each: false },
      { to: ['e'], from: post, path: ['slug', null], each: false },
      // What every object inherits, and has JSON
      { to: ['f'], from: post, path: ['__proto__'], each: false },
      {
        to: ['g'],
        from: post,
        path: ['tags', '__proto__', 'length'],
        each: false,
      },
    ]);

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
    const echo = call('echo', {}, [
      { to: ['at'], from: post, path: ['publishedAt'], each: false },
      { to: ['secret'], from: post, path: ['secret'], each: false },
      { to: ['tags'], from: post, path: ['tags'], each: false },
    ]);

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
    const once = call('once', { ids: ['x', 'y'], filter: { id: 'x' } }, [
      { to: ['ids', '0'], from: post, path: ['nope'], each: false },
      { to: ['filter', 'id'], from: post, path: ['nope'], each: false },
      { to: ['filter', 'author'], from: post, path: ['authorId'], each: false },
    ]);
    const whole = call('whole', 'replaced', [
      { to: [], from: post, path: ['nope'], each: false },
    ]);
    const each = call('each', { ids: ['x'], filter: {} }, [
      { to: ['ids', '0'], from: list, path: ['items', null, 'id'], each: true },
      {
        to: ['filter', 'id'],
        from: list,
        path: ['items', null, 'id'],
        each: true,
      },
    ]);

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
    const echo = call('echo', { ids: ['x'], filter: {} }, [
      { to: ['ids', '0'], from: post, path: ['nope'], each: false },
      { to: ['filter', 'id'], from: post, path: ['nope'], each: false },
    ]);

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
    const rename = call('rename', {}, [
      { to: ['author'], from: post, path: ['author'], each: false },
    ]);
    const echo = call('echo', {}, [
      { to: ['author'], from: post, path: ['author'], each: false },
    ]);

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
    const echo = call('echo', {}, [
      { to: ['id'], from: big, path: ['id'], each: false },
    ]);

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
    const echo = call('echo', { item: {} }, [
      { to: ['from'], from: hello, path: ['slug'], each: false },
      { to: ['item'], from: list, path: ['items', null], each: true },
      // Written after the item, inside it
      { to: ['item', 'tags'], from: hello, path: ['authorId'], each: false },
      {
        to: ['slug'],
        from: list,
        path: ['items', null, 'slug'],
        each: true,
      },
    ]);

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
    const each = call('echo', {}, [
      { to: ['id'], from: list, path: ['items', null, 'id'], each: true },
    ]);

    const res = await send({
      ...defaults,
      url: server.url,
      method: 'GET',
      sent: [list],
      calls: [each],
    });

    expect(res.of(each)).toEqual({ data: [] });
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
    const each = call('echo', {}, [
      { to: ['ids'], from: list, path: [null, 'tags', null, 'id'], each: true },
    ]);

    await send({
      ...defaults,
      url: server.url,
      method: 'GET',
      sent: [list],
      calls: [each],
    });

    expect(echo.mock.calls).toEqual([[{ ids: ['a', 'b'] }], [{ ids: [] }]]);
  });

  test('a call can read the list of results of a call for every item', async () => {
    const { fns, ran } = blog();
    await using server = serve({ ...defaults, limits: wholeValues, fns });
    const list = sent('posts', undefined);
    const authorOfEach = call('author', {}, [
      { to: ['id'], from: list, path: ['items', null, 'authorId'], each: true },
    ]);
    const echo = call('echo', {}, [
      {
        to: ['names'],
        from: authorOfEach,
        path: [null, 'result', 'data', 'name'],
        each: false,
      },
    ]);

    await send({
      ...defaults,
      url: server.url,
      method: 'GET',
      sent: [list],
      calls: [authorOfEach, echo],
    });

    // The third item failed: it has no result to read a name of. In a list,
    // that is `null` once it has gone over the wire, as from a client
    expect(ran.at(-1)).toEqual(['echo', { names: ['Ada', 'Lin', null] }]);
  });

  test('every run counts towards the most runs a request may have', async () => {
    const { fns, ran } = blog();
    // The list, the call for its three items: four runs
    await using server = serve({ ...defaults, fns, maxRuns: 3 });
    const list = sent('posts', undefined);
    const authorOfEach = call('author', {}, [
      { to: ['id'], from: list, path: ['items', null, 'authorId'], each: true },
    ]);

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
    const ofLong = call('echo', {}, [
      { to: ['n'], from: long, path: [null], each: true },
    ]);
    const ofShort = call('echo', {}, [
      { to: ['n'], from: short, path: [null], each: true },
    ]);

    const res = await send({
      ...defaults,
      url: server.url,
      method: 'GET',
      sent: [long, short],
      calls: [ofLong, ofShort],
    });

    expect(res.of(ofLong)).toMatchObject({ error: { code: 'BAD_REQUEST' } });
    expect(res.of(ofShort)).toEqual({
      data: [{ result: { data: { n: 1 } } }, { result: { data: { n: 2 } } }],
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
    const ofEmpty = call('echo', {}, [
      { to: ['n'], from: empty, path: [null], each: true },
    ]);
    const ofLong = call('echo', {}, [
      { to: ['n'], from: long, path: [null], each: true },
    ]);

    const res = await send({
      ...defaults,
      url: server.url,
      method: 'GET',
      sent: [empty, long],
      calls: [ofEmpty, ofLong],
    });

    expect(res.of(ofEmpty)).toEqual({ data: [] });
    expect(echo.mock.calls).toEqual([[{ n: 1 }], [{ n: 2 }], [{ n: 3 }]]);
    expect(res.of(ofLong)).toMatchObject({ data: { length: 3 } });
  });

  test('does not run when the call its list is from failed', async () => {
    const { fns, ran } = blog();
    await using server = serve({ ...defaults, fns });
    const post = sent('post', { slug: 'gone' });
    const tagOfEach = call('echo', {}, [
      { to: ['id'], from: post, path: ['tags', null, 'id'], each: true },
    ]);

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
      call(
        path,
        {},
        Array.from({ length: count }, (_it, index) => ({
          to: [`k${index}`],
          from: post,
          path: ['id'],
          each: false,
        })),
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

    test('a call for every item counts its reads too, and runs for no item', async () => {
      const list = sent('list', undefined);
      const each = call('each', {}, [
        { to: ['a'], from: list, path: ['items', null], each: true },
        { to: ['b'], from: list, path: ['id'], each: false },
      ]);

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
    const author = call('author', {}, [
      { to: ['id'], from: post, path: ['authorId'], each: false },
    ]);
    const team = call('team', {}, [
      { to: ['id'], from: author, path: ['teamId'], each: false },
    ]);
    const teamPosts = call('teamPosts', {}, [
      { to: ['id'], from: team, path: ['id'], each: false },
    ]);
    // 5: it reads a call that is refused
    const first = call('first', {}, [
      { to: ['slug'], from: teamPosts, path: ['0'], each: false },
    ]);
    // 3, from the deepest call it reads, which is 2
    const both = call('both', {}, [
      { to: ['slug'], from: post, path: ['slug'], each: false },
      { to: ['id'], from: author, path: ['id'], each: false },
    ]);
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
      const list = call('list', {}, [
        { to: ['id'], from: post, path: ['authorId'], each: false },
      ]);
      const each = call('each', {}, [
        { to: ['n'], from: list, path: ['items', null], each: true },
      ]);

      const { res, ran } = await sendWith({
        limits: { ...pipelineLimitDefaults, maxDepth: 2 },
        fns: { post: fns.post, list: () => ({ items: [1] }), each: () => 1 },
        sent: [post],
        calls: [list, each],
      });

      expect(res.of(each)).toEqual(deep(3, 2));
      expect(ran).toEqual(['post', 'list']);
    });
  });

  describe('`maxValueLength`', () => {
    const post = sent('post', undefined);
    const reads = (path: string) =>
      call(path, {}, [{ to: ['v'], from: post, path: [path], each: false }]);
    // Its quotes count: `"xx"` is 4 characters of JSON
    const ofLength = (length: number) => 'x'.repeat(length - 2);

    test.each([
      { limits: pipelineLimitDefaults, max: 1024 },
      { limits: { ...pipelineLimitDefaults, maxValueLength: 2000 }, max: 2000 },
      { limits: { ...pipelineLimitDefaults, maxValueLength: 10 }, max: 10 },
    ])(
      'a call that reads a value longer than $max characters of JSON is refused, and the rest of the batch runs',
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

    test('a value of an item counts, and a call for every item runs for none if one is too long', async () => {
      const list = sent('list', undefined);
      const each = call('each', {}, [
        { to: ['v'], from: list, path: ['items', null, 'v'], each: true },
      ]);

      const { res, ran } = await sendWith({
        limits: { ...pipelineLimitDefaults, maxValueLength: 10 },
        fns: {
          list: () => ({ items: [{ v: 'short' }, { v: ofLength(11) }] }),
          each: () => 1,
        },
        sent: [list],
        calls: [each],
      });

      expect(res.of(each)).toEqual(
        refused(
          'A value this call reads is longer than `maxValueLength` (10 characters of JSON) allows',
        ),
      );
      expect(ran).toEqual(['list']);
    });
  });

  describe('`allowWholeValues`', () => {
    const post = sent('post', undefined);
    const reads = (path: string) =>
      call(path, {}, [{ to: ['v'], from: post, path: [path], each: false }]);
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
      const items = call('items', {}, [
        { to: ['v'], from: list, path: ['items', null], each: true },
      ]);
      const ids = call('ids', {}, [
        { to: ['v'], from: list, path: ['items', null, 'id'], each: true },
      ]);

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

      expect(res.of(items)).toEqual(whole);
      expect(res.of(ids)).toEqual({ data: [{ result: { data: 'a' } }] });
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
    const fits = call('echo', { n: 1 }, [
      { to: ['big'], from: post, path: ['big'], each: false },
    ]);
    const tooMuch = call('echo', { n: 2 }, [
      { to: ['big'], from: post, path: ['big'], each: false },
      { to: ['again'], from: post, path: ['big'], each: false },
    ]);
    const small = call('echo', { n: 3 }, [
      { to: ['id'], from: post, path: ['id'], each: false },
    ]);

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
    const reader = call('echo', {}, [
      { to: ['a'], from: post, path: ['lines'], each: false },
      { to: ['b'], from: post, path: ['lines'], each: false },
    ]);

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
    const broken = call('echo', { id: 'text' }, [
      { to: ['id', 'big'], from: post, path: ['big'], each: false },
    ]);
    const fits = call('echo', {}, [
      { to: ['big'], from: post, path: ['big'], each: false },
    ]);

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
      // A refused call takes none of the runs either
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
    // Three runs, each with the big value: too much together
    const ofThree = call('echo', {}, [
      { to: ['n'], from: three, path: ['items', null], each: true },
      { to: ['big'], from: three, path: ['big'], each: false },
    ]);
    // Two runs, each with an input that is the big value
    const ofTwo = call('echo', { big }, [
      { to: ['n'], from: two, path: ['items', null], each: true },
    ]);

    const res = await send({
      ...defaults,
      url: server.url,
      method: 'POST',
      sent: [three, two],
      calls: [ofThree, ofTwo],
    });

    expect(res.of(ofThree)).toEqual(refused);
    expect(res.of(ofTwo)).toEqual({
      data: [{ result: { data: 1 } }, { result: { data: 2 } }],
    });
    expect(echo).toHaveBeenCalledTimes(2);
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
    try {
      expect(sizeOf('x'.repeat(100), 50)).toBeGreaterThan(50);
      expect(stringify).not.toHaveBeenCalled();
    } finally {
      stringify.mockRestore();
    }
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
    const author = call('author', { fields: ['name'] }, [
      { to: ['id'], from: post, path: ['authorId'], each: false },
    ]);
    const teamPosts = call('teamPosts', { limit: 5 }, [
      { to: ['teamId'], from: author, path: ['teamId'], each: false },
    ]);

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
    const ofSlow = call('echo', {}, [
      { to: ['id'], from: slow, path: ['id'], each: false },
    ]);
    const ofFast = call('echo', {}, [
      { to: ['id'], from: fast, path: ['id'], each: false },
    ]);

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
    const ofSlow = call('echo', {}, [
      { to: ['id'], from: slow, path: ['id'], each: false },
    ]);
    const ofFast = call('echo', {}, [
      { to: ['id'], from: fast, path: ['id'], each: false },
    ]);

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
  const author = call('author', {}, [
    { to: ['id'], from: post, path: ['authorId'], each: false },
  ]);
  const teamPosts = call('teamPosts', {}, [
    { to: ['teamId'], from: author, path: ['teamId'], each: false },
  ]);

  test('a call that does not fit is left out, and so is what reads it', () => {
    const plan = planPipelinedBatch({
      sent: [post],
      calls: [author, teamPosts],
      fits: (next) => !next.calls.includes(author),
    });

    expect(plan).toEqual({ calls: [], reads: {}, left: [author, teamPosts] });
  });

  test('a call that fits goes, also when a later one does not', () => {
    const plan = planPipelinedBatch({
      sent: [post],
      calls: [author, teamPosts],
      fits: (next) => next.calls.length <= 1,
    });

    expect(plan).toEqual({
      calls: [author],
      reads: { 1: [{ to: ['id'], from: 0, path: ['authorId'] }] },
      left: [teamPosts],
    });
  });

  test('a call that reads what the request does not have is left out', () => {
    const elsewhere = sent('post', { slug: 'again' });
    const reader = call('echo', {}, [
      { to: ['a'], from: post, path: ['slug'], each: false },
      { to: ['b'], from: elsewhere, path: ['slug'], each: false },
    ]);
    const ofEach = call('echo', {}, [
      { to: ['a'], from: elsewhere, path: [null], each: true },
    ]);

    const plan = planPipelinedBatch({
      // `null`: something in the request that no call reads
      sent: [null, post],
      calls: [reader, ofEach, author],
      fits: () => true,
    });

    expect(plan.calls).toEqual([author]);
    expect(plan.reads).toEqual({
      2: [{ to: ['id'], from: 1, path: ['authorId'] }],
    });
    expect(plan.left).toEqual([reader, ofEach]);
  });

  test('a call for every item that also reads what the request does not have is left out', () => {
    const elsewhere = sent('post', { slug: 'again' });
    const ofEach = call('echo', {}, [
      { to: ['a'], from: post, path: ['tags', null], each: true },
      { to: ['b'], from: elsewhere, path: ['slug'], each: false },
    ]);

    const plan = planPipelinedBatch({
      sent: [post],
      calls: [ofEach],
      fits: () => true,
    });

    expect(plan).toEqual({ calls: [], reads: {}, left: [ofEach] });
  });

  test('a call the `pipe` says nothing of reads nothing, so it ran', async () => {
    const [first] = pipelinedCallsRan({
      sent: [Promise.resolve(false)],
      reads: {},
      calls: [{ result: Promise.resolve('data') }],
    });

    await expect(first?.ran).resolves.toBe(true);
  });

  test('an item the server sent neither a result nor an error for is missing', () => {
    expect(
      [0, 1, 2, 3].map((index) =>
        readPipelinedItem([{}, { result: null }, 'text'], index),
      ),
    ).toEqual(Array.from({ length: 4 }, () => ({ kind: 'missing' })));
    // Data that is no list has no items
    expect(readPipelinedItem(null, 0)).toEqual({ kind: 'missing' });
  });

  test('the reads of a call are the same after a trip over the wire', () => {
    const cases: PipelineRead<number>[][] = [
      [],
      [{ to: [], from: 0, path: [], each: false }],
      [
        { to: ['a'], from: 0, path: ['x', null, 'y'], each: false },
        { to: ['b'], from: 1, path: ['items', null, 'id', null], each: true },
        { to: ['c', '0'], from: 1, path: ['items', null], each: true },
        { to: ['d'], from: 2, path: ['z'], each: false },
      ],
      [{ to: ['a'], from: 0, path: [null], each: true }],
    ];
    for (const reads of cases) {
      const grouped = groupPipelineReads(reads);
      assert(grouped.ok);
      const pipe = { 3: encodePipelineReads(grouped.reads) };
      expect(
        // A source that is its own index: what comes out is what went in
        parsePipelineReads({
          pipe: JSON.stringify(pipe),
          sources: [0, 1, 2, 3],
        }).get(3),
      ).toEqual(grouped.reads);
    }
  });

  test('reads the server would refuse are no reads to a client either', () => {
    expect(
      groupPipelineReads([
        { to: ['a'], from: post, path: ['tags'], each: true },
      ]),
    ).toEqual({ ok: false, problem: 'each-without-list' });
    for (const other of [
      { to: ['b'], from: author, path: ['tags', null], each: true },
      { to: ['b'], from: post, path: ['other', null], each: true },
      { to: ['b'], from: post, path: ['tags', 'more', null], each: true },
    ]) {
      expect(
        groupPipelineReads([
          { to: ['a'], from: post, path: ['tags', null], each: true },
          other,
        ]),
      ).toEqual({ ok: false, problem: 'more-than-one-list' });
    }
  });

  test('the URL of a batch, pipelined', () => {
    const pipe = { 1: [{ to: ['id'], from: 0, path: ['authorId'] }] };
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
      pipe: { 2: [] },
      message: 'no call at index 2',
    },
    {
      name: 'a call before the first',
      pipe: { '-1': [] },
      message: 'no call at index -1',
    },
    // It would be read as `1`, and the last of the two would win
    {
      name: 'a second way to write an index',
      pipe: { '01': [read] },
      message: 'no call at index 01',
    },
    {
      name: 'a third way to write an index',
      pipe: { '1e0': [read] },
      message: 'no call at index 1e0',
    },
    {
      name: 'a zero with a sign',
      pipe: { '-0': [] },
      message: 'no call at index -0',
    },
    {
      name: 'a key that is no index',
      pipe: { a: [] },
      message: 'no call at index a',
    },
    {
      name: 'reads that are no list',
      pipe: { 1: {} },
      message: 'expected an array at 1',
    },
    {
      name: 'a read that is no object',
      pipe: { 1: ['x'] },
      message: 'expected "to" and "path" at 1',
    },
    {
      name: 'a `to` that is no list of keys',
      pipe: { 1: [{ ...read, to: [1] }] },
      message: 'expected "to" and "path" at 1',
    },
    {
      name: 'a `path` that is no path',
      pipe: { 1: [{ ...read, path: [1] }] },
      message: 'expected "to" and "path" at 1',
    },
    {
      name: 'a read from itself',
      pipe: { 1: [{ ...read, from: 1 }] },
      message: 'call 1 can only read from an earlier call',
    },
    {
      name: 'a read from no call',
      pipe: { 1: [{ ...read, from: 0.5 }] },
      message: 'call 1 can only read from an earlier call',
    },
    {
      name: 'a read from a name',
      pipe: { 1: [{ ...read, from: '0' }] },
      message: 'call 1 can only read from an earlier call',
    },
    {
      name: '`each` without a list',
      pipe: { 1: [{ ...read, each: true }] },
      message: '"each" at 1 needs a list in its path',
    },
    {
      name: 'the items of two lists',
      pipe: {
        1: [
          { to: ['a'], from: 0, path: ['a', null], each: true },
          { to: ['b'], from: 0, path: ['b', null], each: true },
        ],
      },
      message: 'call 1 reads each item of more than one list',
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
    const echo = call('echo', scenario.input, [
      { to: scenario.to, from: post, path: ['authorId'], each: false },
    ]);

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
      const reader = call('echo', scenario.input, [
        { to: ['filter', 'id'], from: post, path: ['authorId'], each: false },
      ]);

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
    const reader = call('echo', {}, [
      { to: ['__proto__'], from: post, path: ['evil'], each: false },
    ]);

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
    const reader = call('echo', JSON.parse('{"__proto__":{"a":1}}'), [
      { to: ['__proto__', 'polluted'], from: post, path: ['yes'], each: false },
    ]);

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
      const reader = call('echo', {}, [
        { to, from: post, path: ['yes'], each: false },
      ]);

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
    const reader = call('echo', new Range(1, 0), [
      { to: ['to'], from: post, path: ['max'], each: false },
    ]);

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
