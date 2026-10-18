/**
 * Calls the server three ways: RPC with `httpLink`, REST with `fetch`, and
 * REST with the typed `experimental_openApiLink`.
 */
import assert from 'node:assert/strict';
import {
  createTrpcClient,
  httpLink,
  routerType,
  safe,
} from '@trpc12/trpc/client';
import { experimental_toContract } from '@trpc12/trpc/contract';
import { experimental_openApiLink } from '@trpc12/trpc/openapi';
import type { AppRouter } from './server.ts';
import { appRouter } from './router.ts';

export async function main(url: string) {
  const origin = new URL(url).origin;

  // --- RPC -----------------------------------------------------------------------

  const rpc = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [httpLink({ url })],
  });
  const first = await rpc.post.byId.query({ id: '1' });
  console.log('httpLink post.byId', first);
  assert.equal(first.title, 'Hello REST');

  // --- REST with fetch -------------------------------------------------------------

  const spec = await fetch(`${origin}/api/openapi.json`);
  const document = (await spec.json()) as {
    paths: Record<string, Record<string, { responses: object }>>;
  };
  const byIdResponses = Object.keys(
    document.paths['/api/posts/{id}']!['get']!.responses,
  );
  console.log('GET /api/posts/{id} documents', byIdResponses.join(', '));
  assert.ok(byIdResponses.includes('404'), 'the inferred 404 is missing');

  const list = await fetch(`${origin}/api/posts?limit=5`);
  console.log('GET /api/posts', list.status, await list.json());

  const missing = await fetch(`${origin}/api/posts/404`);
  assert.equal(missing.status, 404);
  console.log('GET /api/posts/404', missing.status, await missing.json());

  const created = await fetch(`${origin}/api/posts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-user': 'ada' },
    body: JSON.stringify({ title: 'From fetch' }),
  });
  assert.equal(created.status, 201);
  console.log('POST /api/posts', created.status, await created.json());

  // --- REST with the typed client --------------------------------------------------

  const contract = experimental_toContract(appRouter);
  const rest = createTrpcClient({
    router: contract,
    links: [
      experimental_openApiLink({
        url: origin,
        contract,
        headers: { 'x-user': 'ada' },
      }),
    ],
  });
  const post = await rest.post.create.mutate({
    title: 'From experimental_openApiLink',
  });
  console.log('experimental_openApiLink post.create', post.id, post.createdAt);
  assert.equal(typeof post.createdAt, 'string');

  const [, err] = await safe(rest.post.byId.query({ id: '404' }));
  console.log('experimental_openApiLink post.byId', err?.code);
  assert.equal(err?.code, 'NOT_FOUND');
}

if (import.meta.main) {
  await main(process.argv[2] ?? 'http://localhost:3000/trpc');
}
