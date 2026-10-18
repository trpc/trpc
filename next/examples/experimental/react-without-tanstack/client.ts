/**
 * Both clients outside React, as a route loader or a server render would use
 * them. `src/App.tsx` renders them in the page (`pnpm dev`), and
 * `src/App.test.tsx` checks that page in happy-dom.
 */
import assert from 'node:assert/strict';
import { dehydrate } from '@trpc12/experimental-react';
import { AsyncResult, AtomRegistry, type Atom } from 'effect/reactivity';
import { createClients } from './src/trpc.ts';

/**
 * Resolves with the atom's first value that passes `ok`. A subscription's
 * result stays `waiting` while the stream is open, so waiting values count.
 */
const until = <A, E>(
  registry: AtomRegistry.AtomRegistry,
  atom: Atom.Atom<AsyncResult.AsyncResult<A, E>>,
  ok: (value: A) => boolean = () => true,
) =>
  new Promise<A>((resolve, reject) => {
    const cancel = registry.subscribe(
      atom,
      (result) => {
        if (AsyncResult.isSuccess(result) && ok(result.value)) {
          cancel();
          resolve(result.value);
        } else if (AsyncResult.isFailure(result) && !result.waiting) {
          cancel();
          reject(new Error(String(result.cause)));
        }
      },
      { immediate: true },
    );
  });

export async function main(url: string) {
  const { trpc, atoms } = createClients(url);

  // --- @trpc12/experimental-react: queries are promises, cached by the links
  // Outside a browser the client is a server's, one per request: its cache
  // keeps what it read, so a render sees one consistent list.

  const before = await trpc.post.list.query();
  assert.ok(before[0]?.createdAt instanceof Date);
  const added = await trpc.post.add.mutate({ title: 'Added from client.ts' });
  trpc.post.list.setData(undefined, (prev) => [...(prev ?? []), added]);
  const after = [...before, added];
  assert.deepEqual(await trpc.post.list.query(), after);
  assert.deepEqual(trpc.post.list.getData(), after);
  // The next request's client reads the server's list.
  assert.deepEqual(await createClients(url).trpc.post.list.query(), after);
  console.log(
    'experimental-react:',
    after.map((post) => post.title),
  );
  console.log('dehydrated for the page:', Object.keys(dehydrate(trpc)));

  // --- @trpc12/experimental-react-atom: queries are atoms of AsyncResults

  const registry = AtomRegistry.make();
  const list = atoms.post.list.query(undefined, { reactivityKeys: ['posts'] });
  const unmount = registry.mount(list);
  assert.equal((await until(registry, list)).length, after.length);

  const add = atoms.post.add.mutation();
  registry.set(add, {
    input: { title: 'Added with an atom' },
    reactivityKeys: ['posts'],
  });
  const fromAtom = await until(registry, add);
  // The mutation's reactivity key refetches the list atom.
  const refetched = await until(registry, list, (posts) =>
    posts.some((post) => post.id === fromAtom.id),
  );
  console.log(
    'experimental-react-atom:',
    refetched.map((post) => post.title),
  );

  const clock = atoms.clock.subscription(undefined);
  const stop = registry.mount(clock);
  const tick = await until(registry, clock, (event) => event.tick >= 2);
  console.log('clock subscription atom: tick', tick.tick);
  stop();
  unmount();
  registry.dispose();
}

if (import.meta.main) {
  await main(process.argv[2] ?? 'http://localhost:3000/trpc');
}
