import { spawn } from 'node:child_process';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { createInterface } from 'node:readline';
import { createTrpcClient, safe } from '@trpc12/trpc/client';
import { toContract } from '@trpc12/trpc/contract';
import { experimental_openApiLink } from '@trpc12/trpc/openapi';
import { appContract } from './src/contract.ts';

const server = spawn(process.execPath, ['dist/main.js'], {
  env: { ...process.env, PORT: '0' },
  stdio: ['ignore', 'pipe', 'inherit'],
});
try {
  let url = '';
  for await (const line of createInterface({ input: server.stdout })) {
    url = /^listening on (\S+)/.exec(line)?.[1] ?? '';
    if (url) break;
  }
  if (!url) throw new Error('the server exited before listening');

  const health = await fetch(`${url}/health`);
  assert.equal(await health.json(), 'ok');

  const res = await fetch(`${url}/posts/1`);
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
  const created = await client.post.create.mutate({ title: 'From the client' });
  assert.equal(created.id, '2');
  assert.deepEqual(
    (await client.post.list.query()).map((post) => post.title),
    ['Served by Nest', 'From the client'],
  );
  const [, missing] = await safe(client.post.byId.query({ id: '9' }));
  assert.equal(missing?.code, 'NOT_FOUND');
  console.log(
    'experimental_openApiLink: created',
    created,
    'then',
    missing?.code,
  );

  const [, forbidden] = await safe(client.admin.stats.query());
  assert.equal(forbidden?.code, 'FORBIDDEN');
  const stats = await fetch(`${url}/admin/stats`, {
    headers: { 'x-user': 'admin' },
  });
  assert.deepEqual(await stats.json(), { posts: 2, requests: 1 });
  console.log('AdminGuard: ada', forbidden?.code, '| admin', stats.status);
} finally {
  if (server.exitCode === null) {
    server.kill();
    await once(server, 'exit');
  }
}
