/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { createServer, IncomingMessage, ServerResponse } from 'http';
import {
  createTRPCProxyClient,
  httpBatchLink,
  TRPCClientError,
} from '@trpc/client/src';
import { AnyRouter, initTRPC, TRPCError } from '@trpc/server';
import {
  NodeHTTPCreateContextFnOptions,
  NodeHTTPHandlerOptions,
  nodeHTTPRequestHandler,
} from '@trpc/server/adapters/node-http';
import fetch from 'node-fetch';
import { z } from 'zod';

// start of custom server

// The query type here is just to show it might
// not extend express's req.query type
// invalidTrpcQuery is used to let trpc know that passing the query to URLSearchParams would cause it to throw
type AugmentedRequest = IncomingMessage & {
  query?: any[] | Record<string, any>;
  invalidTrpcQuery?: boolean;
  pathname: string;
};

type QueryParser = (req: IncomingMessage) => AugmentedRequest['query'];

const defaultQueryParser: QueryParser = (req) => {
  return new URL(req.url!, `https://${req.headers.host}`).searchParams;
};

// just returning an array as an example of something a parser might return that could cause trpc to throw
const invalidTrpcQueryParser: QueryParser = (req) => {
  return [req];
};

// Add new properties and methods to our request object
const augmentRequest = (
  req: IncomingMessage,
  queryParser: QueryParser = defaultQueryParser,
  invalidTrpcQuery?: boolean,
): AugmentedRequest => {
  const url = new URL(req.url!, `https://${req.headers.host}`);
  const { pathname } = url;
  return Object.assign(req, {
    query: queryParser(req),
    invalidTrpcQuery,
    pathname,
  });
};

type AugmentedResponse = ReturnType<typeof augmentResponse>;

// Add new properties and methods to our response object
const augmentResponse = (res: ServerResponse<IncomingMessage>) =>
  Object.assign(res, {
    customMethod(callLocation: string) {
      return `customMethod called from: ${callLocation}`;
    },
  });

type AugmentedHandler = (
  req: AugmentedRequest,
  res: AugmentedResponse,
) => Promise<void>;

// We are only creating a custom server here to show how we can use trpc with
// any server and make sure type checking works throught the application
const createCustomServer = (
  requestListner: AugmentedHandler,
  queryParser?: QueryParser,
  invalidTrpcQuery?: boolean,
) =>
  createServer((req, res) => {
    return requestListner(
      augmentRequest(req, queryParser, invalidTrpcQuery),
      augmentResponse(res),
    );
  });

// end of custom server

// start of custom adapter

type CreateCustomContextOptions = NodeHTTPCreateContextFnOptions<
  AugmentedRequest,
  AugmentedResponse
>;

const createCustomHandler = <TRouter extends AnyRouter>(
  opts: NodeHTTPHandlerOptions<TRouter, AugmentedRequest, AugmentedResponse>,
) =>
  async function (req: AugmentedRequest, res: AugmentedResponse) {
    return await nodeHTTPRequestHandler({
      ...opts,
      req,
      res,
      path: req.pathname.slice(1),
    });
  };

// end of custom adapter

const createContext = async ({ req, res }: CreateCustomContextOptions) => {
  return {
    req,
    res,
  };
};

const t = initTRPC.create();
const router = t.router({
  hello: t.procedure
    .input(
      z.object({
        who: z.string().nullish(),
      }),
    )
    .query(({ input }) => ({
      text: `hello ${input?.who}`,
    })),
  exampleError: t.procedure.query(() => {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Unexpected error',
    });
  }),
});

let server: ReturnType<typeof createCustomServer>;
const startServer = async <TRouter extends AnyRouter>(
  opts: NodeHTTPHandlerOptions<TRouter, AugmentedRequest, AugmentedResponse>,
  {
    queryParser,
    invalidTrpcQuery,
  }: {
    queryParser?: QueryParser;
    invalidTrpcQuery?: boolean;
  } = {},
) => {
  const ac = new AbortController();
  const handler = createCustomHandler(Object.assign({ createContext }, opts));
  server = createCustomServer(
    async (req, res) => {
      // This server now has custom methods
      res.customMethod('Request listner');
      // Do some more custom stuff with your server before calling the custom handler
      // The handler could be middlewear that your server runs
      // you could just pass handler to createCustomServer directly
      try {
        return await handler(req, res);
      } catch (e) {
        ac.abort();
      }
    },
    queryParser,
    invalidTrpcQuery,
  ).listen(0);
  const port = (server.address() as any).port as number;

  return {
    getAc() {
      return ac;
    },
    port,
    client: createTRPCProxyClient<typeof router>({
      links: [
        httpBatchLink({
          url: `http://localhost:${port}`,
        }),
      ],
    }),
  };
};

afterEach(async () => {
  if (server) {
    server.close();
  }
});

test('invalid query aborts', async () => {
  expect.assertions(1);
  const t = await startServer(
    { router },
    { queryParser: invalidTrpcQueryParser },
  );
  try {
    await t.client.hello.query(
      {
        who: 'test',
      },
      { signal: t.getAc().signal },
    );
  } catch (e) {
    expect(e).toStrictEqual(new TRPCClientError('This operation was aborted.'));
  }
});

const runBasicExpect = async (t: Awaited<ReturnType<typeof startServer>>) => {
  expect(
    await t.client.hello.query({
      who: 'test',
    }),
  ).toMatchInlineSnapshot(`
    Object {
      "text": "hello test",
    }
  `);
};

test('invalid query compleats', async () => {
  const t = await startServer(
    { router },
    { queryParser: invalidTrpcQueryParser, invalidTrpcQuery: true },
  );
  await runBasicExpect(t);
});

test('middleware res has custom methods', async () => {
  const t = await startServer({
    middleware: (_req, res, _next) => {
      res.end(res.customMethod('middleware'));
      return;
    },
    router,
  });
  const result = await fetch(`http://localhost:${t.port}`);
  expect(await result.text()).toEqual(`customMethod called from: middleware`);
});

// These tests are the same as the ones in standalone.test.ts but are testing the custom adpater in this file
// if the standalone adapter needs to be change, then it's possible that the custom adpater used here
// will also need to be changed for the other tests to succeed

test('simple query', async () => {
  const t = await startServer({ router });
  await runBasicExpect(t);
});

test('error query', async () => {
  expect.assertions(1);
  const t = await startServer({ router });
  try {
    await t.client.exampleError.query();
  } catch (e) {
    expect(e).toStrictEqual(new TRPCClientError('Unexpected error'));
  }
});

test('middleware intercepts request', async () => {
  const t = await startServer({
    middleware: (_req, res, _next) => {
      res.statusCode = 419;
      res.end();
      return;
    },
    router,
  });
  const result = await fetch(`http://localhost:${t.port}`);
  expect(result.status).toBe(419);
});

test('middleware passes the request', async () => {
  const t = await startServer({
    middleware: (_req, _res, next) => {
      return next();
    },
    router,
  });
  await runBasicExpect(t);
});
