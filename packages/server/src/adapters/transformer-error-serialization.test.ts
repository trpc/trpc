import { createServer } from 'http';
import express from 'express';
import fetch from 'node-fetch';
import superjson from 'superjson';
import { initTRPC } from '@trpc/server';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { z } from 'zod';

// This is a focused integration test: start a tiny express server with a router configured
// with transformer: superjson; trigger a validation error and assert that the HTTP error
// body is parseable by superjson.parse().
test('error responses are parseable by superjson when transformer: superjson is configured', async () => {
  const t = initTRPC.create({ transformer: superjson, errorFormatter({ shape }) { return shape; } });
  const router = t.router({
    demo: t.procedure.input(z.object({ x: z.string() })).mutation(() => ({ ok: true })),
  });

  const app = express();
  app.use(express.json());
  app.use('/api/trpc', createExpressMiddleware({ router, createContext: () => ({}) }));

  const server = createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = (server.address() && (server.address() as { port: number }).port) || 0;

  // Intentionally call demo mutation with missing input to trigger validation error
  const res = await fetch(`http://localhost:${port}/api/trpc/demo.mutate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ input: {} }),
  });
  const text = await res.text();

  // Now we expect that the body is parseable by superjson.parse(text)
  try {
    const parsed = superjson.parse(text);
    // If parsed: basic shape checks
    expect(parsed).toBeDefined();
  } catch (e) {
    server.close();
    throw new Error('Expected error response to be parseable by superjson. Parsing failed with: ' + (e instanceof Error ? e.message : String(e)) + '\nRaw response:\n' + text.slice(0, 2000));
  }

  server.close();
});

