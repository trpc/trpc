import * as childProcess from 'child_process';
import fs from 'fs';
import * as http2 from 'http2';
import { createTRPCClient, httpLink } from '@trpc/client';
import { initTRPC } from '@trpc/server';
import type { CreateHTTP2ContextOptions } from '@trpc/server/adapters/standalone';
import { createHTTP2Handler } from '@trpc/server/adapters/standalone';
import { run } from '@trpc/server/unstable-core-do-not-import';
import { makeAsyncResource } from '@trpc/server/unstable-core-do-not-import/stream/utils/disposable';
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

const cert = run(() => {
  const nonce = () => Math.random().toString(36).substring(2, 15);
  const name = `${__dirname}/localhost-${nonce()}`;

  childProcess.execSync(
    `
    openssl req -x509 -newkey rsa:4096 \
        -keyout ${name}.key \
        -out ${name}.crt \
        -days 365 -nodes \
        -subj '/CN=localhost' \
        -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"`.trim(),
    { stdio: 'ignore' },
  );

  const key = fs.readFileSync(`${name}.key`);
  const cert = fs.readFileSync(`${name}.crt`);

  fs.unlinkSync(`${name}.key`);
  fs.unlinkSync(`${name}.crt`);

  return {
    key,
    cert,
  };
});

function createHttp2ServerResource(
  handler: (
    req: http2.Http2ServerRequest,
    res: http2.Http2ServerResponse,
  ) => Promise<void> | void,
) {
  const server = http2.createSecureServer(cert, (req, res) => {
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

function createContext(opts: CreateHTTP2ContextOptions) {
  return opts;
}
const t = initTRPC.context<typeof createContext>().create();

const router = t.router({
  status: t.procedure.query((opts) => {
    const url = opts.ctx.info.url!;

    return {
      url,
    };
  }),
  goodbyeNoInput: t.procedure.mutation((opts) => {
    const url = opts.ctx.info.url!;
    expect(url.pathname).toBe('/goodbyeNoInput');

    return `Goodbye World`;
  }),
  goodbyeWithInput: t.procedure
    .input(
      z.object({
        name: z.string(),
      }),
    )
    .mutation((opts) => {
      const url = opts.ctx.info.url!;
      expect(url.pathname).toBe('/goodbyeWithInput');
      // expect(url.searchParams.get('name')).toBe(opts.input.name);

      return `Goodbye ${opts.input.name}`;
    }),
});

test('query', async () => {
  const handler = createHTTP2Handler({
    router,
    createContext,
  });
  const server = createHttp2ServerResource(handler);

  const client = createTRPCClient<typeof router>({
    links: [
      httpLink({
        url: server.url,
        // @ts-expect-error this is fine
        fetch: undici.fetch,
      }),
    ],
  });

  const result = await client.status.query();
  expect(result.url).toContain('https://localhost:');
});

test('mutation without body', async () => {
  const handler = createHTTP2Handler({
    router,
    createContext,
  });
  const server = createHttp2ServerResource(handler);

  const client = createTRPCClient<typeof router>({
    links: [
      httpLink({
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
  const handler = createHTTP2Handler({
    router,
    createContext,
  });
  const server = createHttp2ServerResource(handler);

  const client = createTRPCClient<typeof router>({
    links: [
      httpLink({
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

test('custom path', async () => {
  const handler = createHTTP2Handler({
    router,
    createContext,
    basePath: '/trpc/',
  });
  const server = createHttp2ServerResource((req, res) => {
    if (req.url.startsWith('/trpc/')) {
      return handler(req, res);
    }

    res.writeHead(404);
    res.write('Not Found');
    res.end();
  });

  {
    const result = await fetch(`${server.url}/some-other-path`);
    expect(result.status).toBe(404);
    expect(await result.text()).toMatchInlineSnapshot(`"Not Found"`);
  }
  {
    const client = createTRPCClient<typeof router>({
      links: [
        httpLink({
          url: `${server.url}/trpc`,
          // @ts-expect-error this is fine
          fetch: undici.fetch,
        }),
      ],
    });

    const result = await client.status.query();
    const url = result.url.replace(/localhost:\d+/, 'localhost:<<redacted>>');

    expect(url).toMatchInlineSnapshot(
      `"https://localhost:<<redacted>>/trpc/status"`,
    );
  }
});
