import { initTRPC, TRPCError } from '@trpc/server';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import type { experimental_PipeliningOptions } from '@trpc/server/unstable-core-do-not-import';
import { z } from 'zod';

/**
 * Error shapes that JSON can't carry, in a pipelined batch: the call or run
 * whose error it is fails as an `INTERNAL_SERVER_ERROR`, and the rest of the
 * response is as it would be
 */

/** A pipelined batch as a request, with an empty input for calls 1 and 2 */
function pipelined(opts: {
  paths: string;
  pipe: unknown;
  /** Whether the response streams, as `httpBatchStreamLink` asks */
  streams: boolean;
}) {
  return new Request(
    `http://localhost/trpc/${opts.paths}?batch=pipeline&input=${encodeURIComponent(
      JSON.stringify({ 1: {}, 2: {} }),
    )}&pipe=${encodeURIComponent(JSON.stringify(opts.pipe))}`,
    { headers: opts.streams ? { 'trpc-accept': 'application/jsonl' } : {} },
  );
}

function createRouter(opts: {
  /** Which errors the formatter gives a `BigInt` */
  big: (code: TRPCError['code']) => boolean;
  /**
   * Whether the formatter gives a `NOT_FOUND` a value that is a string the
   * first time it is read, and a `BigInt` each time after
   */
  changing: boolean;
}) {
  const t = initTRPC.create({
    errorFormatter: ({ shape, error }) => {
      if (opts.changing && error.code === 'NOT_FOUND') {
        let reads = 0;
        return {
          ...shape,
          data: {
            ...shape.data,
            get changing() {
              reads += 1;
              return reads === 1 ? 'first' : BigInt(reads);
            },
          },
        };
      }
      return opts.big(error.code)
        ? { ...shape, data: { ...shape.data, big: BigInt(1) } }
        : shape;
    },
  });
  return t.router({
    post: t.procedure.query(() => ({
      authorId: 'missing',
      tags: [{ id: 'missing' }, { id: 't1' }],
    })),
    author: t.procedure
      .input(z.object({ id: z.string() }))
      .query(async (opts) => {
        if (opts.input.id === 'missing') {
          throw new TRPCError({ code: 'NOT_FOUND' });
        }
        // Arrives after the one that fails
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { id: opts.input.id };
      }),
  });
}

/** Every error but an `INTERNAL_SERVER_ERROR` has a `BigInt` */
const allButInternal = (code: TRPCError['code']) =>
  code !== 'INTERNAL_SERVER_ERROR';

async function send(opts: {
  router: ReturnType<typeof createRouter>;
  paths: string;
  pipe: unknown;
  streams: boolean;
  allowPipelining: true | experimental_PipeliningOptions;
}) {
  return fetchRequestHandler({
    endpoint: '/trpc',
    req: pipelined(opts),
    router: opts.router,
    experimental_allowPipelining: opts.allowPipelining,
  });
}

const authorOfPost = { reads: [{ to: ['id'], from: 0, path: ['authorId'] }] };
const authorOfEachTag = {
  each: { from: 0, path: ['tags'] },
  reads: [{ to: ['id'], path: ['id'] }],
};

test('a run whose error JSON cannot carry fails by itself in a stream: the runs after it still arrive', async () => {
  const res = await send({
    router: createRouter({ big: allButInternal, changing: false }),
    paths: 'post,author',
    pipe: { 1: authorOfEachTag },
    streams: true,
    allowPipelining: true,
  });
  const text = await res.text();

  // The first run's error, and the second run's result after it
  expect(text).toContain('INTERNAL_SERVER_ERROR');
  expect(text).toContain('"data":{"id":"t1"}');
  expect(text.indexOf('INTERNAL_SERVER_ERROR')).toBeLessThan(
    text.indexOf('"data":{"id":"t1"}'),
  );
});

test('a call whose error JSON cannot carry fails as `INTERNAL_SERVER_ERROR` by itself, not the response', async () => {
  const res = await send({
    router: createRouter({ big: allButInternal, changing: false }),
    paths: 'post,author,author',
    pipe: { 1: authorOfPost, 2: authorOfEachTag },
    streams: false,
    allowPipelining: true,
  });
  const json = await res.json();

  expect(json[0]).toMatchObject({ result: { data: { authorId: 'missing' } } });
  expect(json[1]).toMatchObject({
    error: { data: { code: 'INTERNAL_SERVER_ERROR', path: 'author' } },
  });
  expect(json[2]).toMatchObject({
    items: {
      0: { error: { data: { code: 'INTERNAL_SERVER_ERROR' } } },
      1: { result: { data: { id: 't1' } } },
    },
  });
});

test('a call whose error JSON cannot carry fails by itself in a stream: the calls after it still arrive', async () => {
  const res = await send({
    router: createRouter({ big: allButInternal, changing: false }),
    paths: 'post,author,author',
    pipe: { 1: authorOfPost, 2: authorOfEachTag },
    streams: true,
    allowPipelining: true,
  });
  const text = await res.text();

  expect(text.match(/INTERNAL_SERVER_ERROR/g)).toHaveLength(2);
  expect(text).toContain('"data":{"id":"t1"}');
});

test.each([
  {
    name: 'a call that runs once',
    pipe: { 1: authorOfPost },
    allowPipelining: { maxReadsPerCall: 0 },
  },
  {
    name: 'a call for every item',
    pipe: { 1: authorOfEachTag },
    allowPipelining: { maxRuns: 2 },
  },
])(
  "keeps `pipeline: 'not-run'` when the error of $name the server refused is one JSON cannot carry",
  async ({ pipe, allowPipelining }) => {
    const res = await send({
      router: createRouter({ big: allButInternal, changing: false }),
      paths: 'post,author',
      pipe,
      streams: false,
      allowPipelining,
    });
    const json = await res.json();

    expect(json[0]).toMatchObject({
      result: { data: { authorId: 'missing' } },
    });
    expect(json[1]).toMatchObject({
      error: {
        data: { code: 'INTERNAL_SERVER_ERROR', pipeline: 'not-run' },
      },
    });
  },
);

test("is the default shape when the formatter's `INTERNAL_SERVER_ERROR` cannot be carried either", async () => {
  const res = await send({
    router: createRouter({ big: () => true, changing: false }),
    paths: 'post,author',
    pipe: { 1: authorOfPost },
    streams: false,
    allowPipelining: true,
  });
  const json = await res.json();

  expect(json[0]).toMatchObject({ result: { data: { authorId: 'missing' } } });
  expect(json[1]).toMatchObject({
    error: { data: { code: 'INTERNAL_SERVER_ERROR', path: 'author' } },
  });
  expect(json[1].error.data).not.toHaveProperty('big');
});

describe('an error shape that serializes differently each time it is read', () => {
  const router = createRouter({ big: () => false, changing: true });

  test('is sent as it was checked, and fails no other call', async () => {
    const res = await send({
      router,
      paths: 'post,author,author',
      pipe: { 1: authorOfPost, 2: authorOfEachTag },
      streams: false,
      allowPipelining: true,
    });
    const json = await res.json();

    expect(json[0]).toMatchObject({
      result: { data: { authorId: 'missing' } },
    });
    expect(json[1]).toMatchObject({
      error: { data: { code: 'NOT_FOUND', changing: 'first' } },
    });
    expect(json[2]).toMatchObject({
      items: {
        0: { error: { data: { code: 'NOT_FOUND', changing: 'first' } } },
        1: { result: { data: { id: 't1' } } },
      },
    });
  });

  test('is sent as it was checked in a stream, and the calls after it still arrive', async () => {
    const res = await send({
      router,
      paths: 'post,author,author',
      pipe: { 1: authorOfPost, 2: authorOfEachTag },
      streams: true,
      allowPipelining: true,
    });
    const text = await res.text();

    expect(text.match(/"changing":"first"/g)).toHaveLength(2);
    expect(text).toContain('"data":{"id":"t1"}');
  });
});

describe('what a pipelined response sends, serialized once', () => {
  const identity = {
    serialize: (value: unknown) => value,
    deserialize: (value: unknown) => value,
  };

  test.each([false, true])(
    'reads no output back through the transformer but for a call that reads it: a decode that fails fails only that call (streams: %s)',
    async (streams) => {
      const decoded = vi.fn();
      const t = initTRPC.create({
        transformer: {
          input: identity,
          output: {
            serialize: (value: unknown) => value,
            deserialize: (value: unknown) => {
              decoded(value);
              throw new Error('Cannot decode');
            },
          },
        },
      });
      const res = await fetchRequestHandler({
        endpoint: '/trpc',
        req: pipelined({
          paths: 'post,author',
          pipe: { 1: authorOfPost },
          streams,
        }),
        router: t.router({
          post: t.procedure.query(() => ({ authorId: 'ada' })),
          author: t.procedure
            .input(z.object({ id: z.string() }))
            .query((opts) => opts.input),
        }),
        experimental_allowPipelining: true,
      });
      const text = await res.text();

      // The source as it is, and the call that reads it failed
      expect(text).toContain('{"authorId":"ada"}');
      expect(text).toContain('PRECONDITION_FAILED');
      if (!streams) {
        // Only the read of the source: none for what is sent
        expect(decoded).toHaveBeenCalledTimes(1);
      }
    },
  );

  test("sends a run's data as it was checked: data that serializes differently each time fails nothing", async () => {
    const t = initTRPC.create();
    const res = await fetchRequestHandler({
      endpoint: '/trpc',
      req: pipelined({
        paths: 'post,author',
        pipe: { 1: authorOfEachTag },
        streams: false,
      }),
      router: t.router({
        post: t.procedure.query(() => ({ tags: [{ id: 't1' }] })),
        author: t.procedure.input(z.unknown()).query(() => {
          let reads = 0;
          return {
            toJSON: () => {
              reads += 1;
              return { changing: reads === 1 ? 'first' : BigInt(reads) };
            },
          };
        }),
      }),
      experimental_allowPipelining: true,
    });
    const json = await res.json();

    expect(json[0]).toEqual({ result: { data: { tags: [{ id: 't1' }] } } });
    expect(json[1]).toEqual({
      items: { 0: { result: { data: { changing: 'first' } } } },
    });
  });

  test('an error shape JSON writes nothing for is sent as an `INTERNAL_SERVER_ERROR`', async () => {
    const t = initTRPC.create({
      errorFormatter: ({ shape, error }) =>
        error.code === 'NOT_FOUND'
          ? { ...shape, toJSON: () => undefined }
          : shape,
    });
    const res = await fetchRequestHandler({
      endpoint: '/trpc',
      req: pipelined({
        paths: 'post,author',
        pipe: { 1: authorOfPost },
        streams: false,
      }),
      router: t.router({
        post: t.procedure.query(() => ({ authorId: 'missing' })),
        author: t.procedure.input(z.unknown()).query(() => {
          throw new TRPCError({ code: 'NOT_FOUND' });
        }),
      }),
      experimental_allowPipelining: true,
    });
    const json = await res.json();

    expect(json[0]).toEqual({ result: { data: { authorId: 'missing' } } });
    expect(json[1]).toMatchObject({
      error: { data: { code: 'INTERNAL_SERVER_ERROR', path: 'author' } },
    });
  });
});
