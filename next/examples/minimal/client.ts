import assert from 'node:assert/strict';
import {
  createTrpcClient,
  httpLink,
  matchError,
  safe,
  routerType,
} from '@trpc12/trpc/client';
import type { AppRouter } from './server.ts';

export async function main(url: string) {
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [httpLink({ url, batch: true, headers: { authorization: 'ada' } })],
  });

  const post = await client.post.byId.query({ id: '1' });
  console.log('post.byId:', post);
  assert.equal(post.title, 'Hello v12');

  const created = await client.post.create.mutate({ title: 'Typed errors' });
  console.log('post.create:', created);
  assert.equal(created.title, 'Typed errors');

  const [, err] = await safe(client.post.byId.query({ id: '404' }));
  assert.ok(err, 'expected NOT_FOUND');
  const reason = matchError(err, {
    NOT_FOUND: (e) => `no post ${e.data.id}`,
    BAD_REQUEST: (e) => `invalid input: ${e.data.issues.length} issues`,
    builtin: (e) => `${e.code}: ${e.message}`,
  });
  console.log('post.byId failed:', reason);
  assert.equal(reason, 'no post 404');

  const ids: string[] = [];
  for await (const event of client.post.all.subscribe()) {
    console.log('post.all event', event.id, event.data.title);
    ids.push(event.id);
  }
  assert.ok(ids.includes(created.id));
}

if (import.meta.main)
  await main(process.argv[2] ?? 'http://localhost:3000/trpc');
