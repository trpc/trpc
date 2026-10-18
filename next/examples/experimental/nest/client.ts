/**
 * Calls the Nest app with `fetch` and with `experimental_openApiLink`, built
 * from the same contract. No decorators here, so Node runs it as is.
 */
import assert from 'node:assert/strict';
import { createTrpcClient, safe } from '@trpc12/trpc/client';
import { toContract } from '@trpc12/trpc/contract';
import { experimental_openApiLink } from '@trpc12/trpc/openapi';
import { appContract } from './src/contract.ts';

export async function main(url: string) {
  const health = await fetch(`${url}/health`);
  assert.equal(await health.json(), 'ok');

  const res = await fetch(`${url}/posts/1`);
  assert.equal(res.status, 200);
  console.log('GET /posts/1', res.status, await res.json());

  const anon = await fetch(`${url}/posts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'Nope' }),
  });
  assert.equal(anon.status, 401);

  const client = createTrpcClient({
    router: appContract,
    links: [
      experimental_openApiLink({
        url,
        prefix: '',
        contract: toContract(appContract),
        headers: () => ({ 'x-user': 'ada' }),
      }),
    ],
  });
  const before = await client.post.list.query();
  const created = await client.post.create.mutate({ title: 'From the client' });
  assert.deepEqual(await client.post.list.query(), [...before, created]);
  const [, missing] = await safe(client.post.byId.query({ id: 'nope' }));
  assert.equal(missing?.code, 'NOT_FOUND');
  console.log(
    'experimental_openApiLink: created',
    created,
    'then',
    missing?.code,
  );

  // AdminGuard is a Nest guard: it runs before the procedure.
  const [, forbidden] = await safe(client.admin.stats.query());
  assert.equal(forbidden?.code, 'FORBIDDEN');
  const stats = await fetch(`${url}/admin/stats`, {
    headers: { 'x-user': 'admin' },
  });
  const body = (await stats.json()) as { posts: number; requests: number };
  assert.equal(body.posts, before.length + 1);
  console.log('AdminGuard: ada', forbidden?.code, '| admin', body);
}

if (import.meta.main) {
  await main(process.argv[2] ?? 'http://localhost:3000');
}
