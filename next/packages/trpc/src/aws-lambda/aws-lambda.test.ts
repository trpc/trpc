import { openAsBlob } from 'node:fs';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Schema } from 'effect';
import {
  type LambdaContext,
  toLambdaHandler,
  toLambdaStreamingHandler,
  type LambdaPlatform,
  type LambdaResponseStream,
  type LambdaV1Result,
  type LambdaV2Result,
  type LambdaEdgeResult,
} from '@trpc12/trpc/aws-lambda';
import { createFetchHandler, initTrpc } from '@trpc12/trpc/server';
import { expect, expectTypeOf, test } from 'vite-plus/test';

const t = initTrpc<{
  ctx: { requestId: string | undefined; cookie: string };
}>();

const router = {
  hello: t.procedure
    .input(Schema.Struct({ name: Schema.String }))
    .query((opts) => ({ hi: opts.input.name, requestId: opts.ctx.requestId })),
  login: t.procedure.mutation((opts) => {
    opts.response.headers.append('set-cookie', 'a=1; HttpOnly');
    opts.response.headers.append('set-cookie', 'b=2');
    return opts.ctx.cookie;
  }),
  download: t.procedure.query(
    () => new File([new Uint8Array([0, 255, 1])], 'x.bin'),
  ),
  slow: t.procedure.query(
    (opts) =>
      new Promise((resolve) => {
        const timer = setTimeout(() => resolve('late'), 2000);
        opts.signal.addEventListener('abort', () => {
          clearTimeout(timer);
          resolve('aborted');
        });
      }),
  ),
  ticks: t.procedure.subscription(async function* () {
    yield 1;
    yield 2;
  }),
};

const handler = createFetchHandler<typeof router, LambdaPlatform>({
  router,
  createContext: (opts) => ({
    requestId: opts.platform.context.awsRequestId,
    cookie: opts.request.headers['cookie'] ?? '',
  }),
});
const lambda = toLambdaHandler(handler);
const context: LambdaContext = {
  awsRequestId: 'req-1',
  getRemainingTimeInMillis: () => 30_000,
};

test('API Gateway REST events (payload 1.0)', async () => {
  const result = (await lambda(
    {
      httpMethod: 'GET',
      path: '/trpc/hello',
      headers: { host: 'api.example.com' },
      multiValueQueryStringParameters: { input: ['{"name":"a b"}'] },
      body: null,
    },
    context,
  )) as LambdaV1Result;
  expect(result.statusCode).toBe(200);
  expect(result.isBase64Encoded).toBe(false);
  expect(JSON.parse(result.body)).toEqual({
    json: { hi: 'a b', requestId: 'req-1' },
  });

  const login = (await lambda(
    {
      httpMethod: 'POST',
      path: '/trpc/login',
      headers: { 'content-type': 'application/json' },
      multiValueHeaders: { cookie: ['s=1'] },
      body: Buffer.from('{}').toString('base64'),
      isBase64Encoded: true,
    },
    context,
  )) as LambdaV1Result;
  expect(JSON.parse(login.body)).toEqual({ json: 's=1' });
  expect(login.multiValueHeaders['set-cookie']).toEqual([
    'a=1; HttpOnly',
    'b=2',
  ]);
  expect(login.headers['set-cookie']).toBeUndefined();
});

test('HTTP API and function URL events (payload 2.0)', async () => {
  const result = (await lambda(
    {
      version: '2.0',
      rawPath: '/trpc/login',
      rawQueryString: '',
      headers: { 'content-type': 'application/json' },
      cookies: ['s=1', 't=2'],
      body: '{}',
      requestContext: {
        http: { method: 'POST' },
        domainName: 'x.lambda-url.aws',
      },
    },
    context,
  )) as LambdaV2Result;
  expect(JSON.parse(result.body)).toEqual({ json: 's=1; t=2' });
  expect(result.cookies).toEqual(['a=1; HttpOnly', 'b=2']);

  const file = (await lambda({
    version: '2.0',
    rawPath: '/trpc/download',
    rawQueryString: '',
    requestContext: { http: { method: 'GET' } },
  })) as LambdaV2Result;
  expect(file.isBase64Encoded).toBe(true);
  expect([...Buffer.from(file.body, 'base64')]).toEqual([0, 255, 1]);
});

test('ALB events keep the query string as sent and get a status line', async () => {
  const result = (await lambda({
    httpMethod: 'GET',
    path: '/trpc/hello',
    headers: {},
    queryStringParameters: { input: '%7B%22name%22%3A%22alb%20x%22%7D' },
    requestContext: { elb: { targetGroupArn: 'arn' } },
  })) as LambdaV1Result;
  expect(result.statusDescription).toBe('200');
  expect(JSON.parse(result.body).json.hi).toBe('alb x');
});

test('Lambda@Edge events', async () => {
  const result = (await lambda({
    Records: [
      {
        cf: {
          request: {
            method: 'POST',
            uri: '/trpc/login',
            querystring: '',
            headers: {
              'content-type': [
                { key: 'Content-Type', value: 'application/json' },
              ],
              cookie: [{ value: 's=edge' }],
            },
            body: { data: '{}', encoding: 'text' },
          },
        },
      },
    ],
  })) as LambdaEdgeResult;
  expect(result.status).toBe('200');
  expect(result.bodyEncoding).toBe('text');
  expect(JSON.parse(result.body)).toEqual({ json: 's=edge' });
  expect(result.headers['set-cookie']).toEqual([
    { key: 'set-cookie', value: 'a=1; HttpOnly' },
    { key: 'set-cookie', value: 'b=2' },
  ]);
});

test('the streaming handler writes the prelude, then streams the body', async () => {
  const chunks: Uint8Array[] = [];
  let type: string | undefined;
  let ended = false;
  const stream: LambdaResponseStream = {
    write: (chunk) => (chunks.push(chunk), true),
    end: () => (ended = true),
    setContentType: (t) => (type = t),
  };
  await toLambdaStreamingHandler(handler)(
    {
      version: '2.0',
      rawPath: '/trpc/ticks',
      rawQueryString: '',
      headers: { accept: 'text/event-stream' },
      requestContext: { http: { method: 'GET' } },
    },
    stream,
    context,
  );
  expect(ended).toBe(true);
  expect(type).toBe('application/vnd.awslambda.http-integration-response');
  const all = Buffer.concat(chunks);
  const split = all.indexOf(Buffer.alloc(8));
  const prelude = JSON.parse(all.subarray(0, split).toString());
  expect(prelude.statusCode).toBe(200);
  expect(prelude.headers['content-type']).toBe('text/event-stream');
  const body = all.subarray(split + 8).toString();
  expect(body).toContain('data: {"json":1}');
  expect(body).toContain('data: {"json":2}');
});

test('the call is aborted before the Lambda deadline', async () => {
  const started = Date.now();
  const result = (await toLambdaHandler(handler, { timeoutMarginMs: 950 })(
    {
      version: '2.0',
      rawPath: '/trpc/slow',
      rawQueryString: '',
      requestContext: { http: { method: 'GET' } },
    },
    { getRemainingTimeInMillis: () => 1000 },
  )) as LambdaV2Result;
  expect(Date.now() - started).toBeLessThan(1500);
  expect(result.statusCode).not.toBe(200);
});

test('a handler without a platform type is accepted', () => {
  const plain = createFetchHandler({
    router: { ok: initTrpc().procedure.query(() => 'ok') },
  });
  expectTypeOf(toLambdaHandler(plain)).toBeFunction();
});

test('REST events with multi-value headers, sparse values and a base64 body', async () => {
  const result = (await lambda(
    {
      httpMethod: 'post',
      path: '/trpc/login',
      multiValueHeaders: {
        'content-type': ['application/json'],
        cookie: ['from=multi'],
        'x-none': undefined,
      },
      headers: { cookie: 'ignored=1', 'x-single': undefined },
      multiValueQueryStringParameters: { unused: undefined },
      body: Buffer.from('{}').toString('base64'),
      isBase64Encoded: true,
    },
    context,
  )) as LambdaV1Result;
  expect(JSON.parse(result.body)).toEqual({ json: 'from=multi' });

  const bare = (await lambda({
    httpMethod: 'GET',
    path: '/trpc/hello',
    queryStringParameters: { input: '{"name":"q"}', skipped: undefined },
    requestContext: { domainName: 'rest.example.com' },
  })) as LambdaV1Result;
  expect(JSON.parse(bare.body).json.hi).toBe('q');
});

test('HTTP API events with a query string, or a POST without a body', async () => {
  const query = (await lambda({
    version: '2.0',
    rawPath: '/trpc/hello',
    rawQueryString: `input=${encodeURIComponent('{"name":"v2"}')}`,
    requestContext: { http: { method: 'GET' } },
  })) as LambdaV2Result;
  expect(JSON.parse(query.body).json.hi).toBe('v2');

  const empty = (await lambda({
    version: '2.0',
    rawPath: '/trpc/login',
    rawQueryString: '',
    headers: { 'content-type': 'application/json' },
    requestContext: { http: { method: 'POST' } },
  })) as LambdaV2Result;
  expect(JSON.parse(empty.body)).toEqual({ json: '' });
});

test('Lambda@Edge: a query string, and binary bodies as base64', async () => {
  const result = (await lambda({
    Records: [
      {
        cf: {
          request: {
            method: 'GET',
            uri: '/trpc/download',
            querystring: 'unrelated=1',
            headers: { host: [{ value: 'edge.example.com' }] },
          },
        },
      },
    ],
  })) as LambdaEdgeResult;
  expect(result.bodyEncoding).toBe('base64');
  expect([...Buffer.from(result.body, 'base64')]).toEqual([0, 255, 1]);
});

test('the streaming handler waits for drain when the stream is full', async () => {
  const chunks: Uint8Array[] = [];
  let drains = 0;
  const stream: LambdaResponseStream = {
    write: (chunk) => (chunks.push(chunk), false),
    end: () => {},
    once: (_event, listener) => {
      drains++;
      setImmediate(listener);
    },
  };
  await toLambdaStreamingHandler(handler)(
    {
      version: '2.0',
      rawPath: '/trpc/ticks',
      rawQueryString: '',
      headers: { accept: 'text/event-stream' },
      requestContext: { http: { method: 'GET' } },
    },
    stream,
  );
  expect(drains).toBe(chunks.length);
  expect(Buffer.concat(chunks).toString()).toContain('data: {"json":2}');
});

const streamed = async (
  event: Parameters<ReturnType<typeof toLambdaStreamingHandler>>[0],
  target: Parameters<typeof toLambdaStreamingHandler>[0] = handler,
) => {
  const chunks: Uint8Array[] = [];
  let ended = false;
  await toLambdaStreamingHandler(target)(
    event,
    { write: (chunk) => (chunks.push(chunk), true), end: () => (ended = true) },
    context,
  );
  const all = Buffer.concat(chunks);
  const split = all.indexOf(Buffer.alloc(8));
  return {
    ended,
    prelude: JSON.parse(all.subarray(0, split).toString()),
    body: all.subarray(split + 8).toString(),
  };
};

test('the streaming handler sends cookies in the prelude, and HEAD responses without a body', async () => {
  const login = await streamed({
    version: '2.0',
    rawPath: '/trpc/login',
    rawQueryString: '',
    headers: { 'content-type': 'application/json', 'x-none': undefined },
    cookies: ['s=1'],
    body: '{}',
    requestContext: { http: { method: 'POST' } },
  });
  expect(login.prelude.cookies).toEqual(['a=1; HttpOnly', 'b=2']);
  expect(login.prelude.headers['set-cookie']).toBeUndefined();
  expect(login.body).toBe('{"json":"s=1"}');

  const head = await streamed({
    version: '2.0',
    rawPath: '/trpc/hello',
    rawQueryString: '',
    requestContext: { http: { method: 'HEAD' } },
  });
  expect(head.prelude.statusCode).toBe(405);
  expect(head.body).toBe('');
  expect(head.ended).toBe(true);
});

test('the streaming handler ends the stream when the body fails mid-way', async () => {
  const path = join(await mkdtemp(join(tmpdir(), 'trpc-')), 'report.csv');
  await writeFile(path, 'first version');
  const changing = createFetchHandler({
    router: {
      report: initTrpc().procedure.query(async () => {
        const blob = await openAsBlob(path);
        await writeFile(path, 'a longer second version');
        return blob;
      }),
    },
  });
  const result = await streamed(
    {
      version: '2.0',
      rawPath: '/trpc/report',
      rawQueryString: '',
      requestContext: { http: { method: 'GET' } },
    },
    changing,
  );
  expect(result.prelude.statusCode).toBe(200);
  expect(result.ended).toBe(true);
  await changing.dispose();
});
