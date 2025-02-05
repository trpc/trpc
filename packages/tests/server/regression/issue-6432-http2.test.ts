import * as childProcess from 'child_process';
import fs from 'fs';
import * as http2 from 'http2';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { initTRPC } from '@trpc/server';
import { createHTTPHandler } from '@trpc/server/adapters/standalone';
import { run } from '@trpc/server/unstable-core-do-not-import';
import {
  makeAsyncResource,
  makeResource,
} from '@trpc/server/unstable-core-do-not-import/stream/utils/disposable';
import * as undici from 'undici';
import { z } from 'zod';

undici.setGlobalDispatcher(
  new undici.Agent({
    allowH2: true, // Allow HTTP/2
    connect: {
      rejectUnauthorized: false, // Allow self-signed certificates
    },
  }),
);

function createCertificate() {
  const nonce = () => Math.random().toString(36).substring(2, 15);
  const name = `__generated__/localhost-${nonce()}`;

  childProcess.execSync(
    `
    openssl req -x509 -newkey rsa:4096 \
        -keyout ${name}.key \
        -out ${name}.crt \
        -days 365 -nodes \
        -subj '/CN=localhost' \
        -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"`.trim(),
    // { stdio: 'ignore' },
  );

  const key = fs.readFileSync(`${name}.key`);
  const cert = fs.readFileSync(`${name}.crt`);

  fs.unlinkSync(`${name}.key`);
  fs.unlinkSync(`${name}.crt`);

  return {
    key,
    cert,
  };
}

function createHttp2ServerResource(
  handler: (
    req: http2.Http2ServerRequest,
    res: http2.Http2ServerResponse,
  ) => Promise<void> | void,
) {
  const server = http2.createSecureServer(createCertificate(), (req, res) => {
    run(async () => handler(req, res)).catch((err) => {
      // eslint-disable-next-line no-console
      console.error(err);
      res.writeHead(500);
      res.end();
    });
  });

  server.listen(0);

  const port: number = (server.address() as any).port;

  return makeAsyncResource(
    {
      url: `https://localhost:${port}`,
    },
    async () => {
      await new Promise((resolve) => {
        server.close(resolve);
      });
    },
  );
}

test('smoke', async () => {
  const server = createHttp2ServerResource((_req, res) => {
    res.end('Hello World');
  });

  const client = http2.connect(server.url, {
    rejectUnauthorized: false,
  });

  using _clientCleanup = makeResource({}, () => {
    client.close();
  });

  const req = client.request({
    ':method': 'GET',
    ':path': '/',
  });

  let data = '';
  for await (const chunk of req) {
    data += chunk;
  }
  expect(data).toBe('Hello World');
});

describe('with trpc', () => {
  const t = initTRPC.create();
  const router = t.router({
    hello: t.procedure.query(() => {
      return 'Hello World';
    }),
    goodbyeNoInput: t.procedure.mutation(() => {
      return `Goodbye 'World'}`;
    }),
    goodbyeWithInput: t.procedure
      .input(
        z.object({
          name: z.string(),
        }),
      )
      .mutation((opts) => {
        return `Goodbye ${opts.input.name}`;
      }),
  });

  const handler = createHTTPHandler({ router });

  test('fetch', async () => {
    const server = createHttp2ServerResource(
      // @ts-expect-error later concern
      handler,
    );

    const client = await undici.fetch(`${server.url}/hello`);

    const result = await client.json();

    expect(result).toMatchInlineSnapshot(`
    Object {
      "result": Object {
        "data": "Hello World",
      },
    }
  `);
  });

  test('query', async () => {
    const server = createHttp2ServerResource(
      // @ts-expect-error later concern
      handler,
    );

    const client = createTRPCClient<typeof router>({
      links: [
        httpBatchLink({
          url: server.url,
          // @ts-expect-error this is fine
          fetch: undici.fetch,
        }),
      ],
    });

    const result = await client.hello.query();
    expect(result).toBe('Hello World');
  });

  test('mutation without body', async () => {
    const server = createHttp2ServerResource(
      // @ts-expect-error later concern
      handler,
    );

    const client = createTRPCClient<typeof router>({
      links: [
        httpBatchLink({
          url: server.url,
          // @ts-expect-error this is fine
          fetch: undici.fetch,
        }),
      ],
    });

    const result = await client.goodbyeNoInput.mutate();
    expect(result).toBe('Goodbye World');
  });

  test('mutation with body', async () => {
    const server = createHttp2ServerResource(
      // @ts-expect-error later concern
      handler,
    );

    const client = createTRPCClient<typeof router>({
      links: [
        httpBatchLink({
          url: server.url,
          // @ts-expect-error this is fine
          fetch: undici.fetch,
        }),
      ],
    });

    const result = await client.goodbyeWithInput.mutate({
      name: 'John',
    });
    expect(result).toBe('Goodbye John');
  });
});
