/**
 * The client every page wraps, called from Node: read the poll, vote for each
 * framework, and take two ticks of the clock subscription.
 */
import assert from 'node:assert/strict';
import { frameworks } from './src/frameworks.ts';
import { makeClient } from './src/trpc.ts';

export async function main(url: string) {
  const client = makeClient(url);
  const before = await client.votes.list.query();
  for (const framework of frameworks) {
    const count = await client.votes.cast.mutate({ framework });
    assert.equal(count, before[framework] + 1);
  }
  const after = await client.votes.list.query();
  assert.ok(after.at instanceof Date);
  console.log('votes', after);

  const ticks: number[] = [];
  for await (const event of client.clock.subscribe()) {
    ticks.push(event.tick);
    if (ticks.length === 2) break;
  }
  assert.deepEqual(ticks, [1, 2]);
  console.log('clock ticks', ticks.join(', '));
}

if (import.meta.main) {
  await main(process.argv[2] ?? 'http://localhost:3000/trpc');
}
