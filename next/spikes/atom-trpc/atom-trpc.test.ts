import { RegistryProvider, useAtomSuspense } from '@effect/atom-react';
import { Option } from 'effect';
import { AsyncResult, AtomRegistry, type Atom } from 'effect/reactivity';
import { createElement, Suspense } from 'react';
import { prerender } from 'react-dom/static';
import { localLink } from '@trpc12/trpc/client';
import { error, initTrpc } from '@trpc12/trpc/server';
import { expect, expectTypeOf, test } from 'vite-plus/test';
import { z } from 'zod';
import { make } from './atom-trpc.ts';

const t = initTrpc();
const titles = new Map<string, string>();
let calls = 0;
const router = {
  post: {
    byId: t.procedure.input(z.object({ id: z.string() })).query(({ input }) => {
      calls++;
      const title = titles.get(input.id);
      return title === undefined
        ? error({ code: 'NOT_FOUND', data: { id: input.id } })
        : { id: input.id, title, at: new Date(0) };
    }),
    rename: t.procedure
      .input(z.object({ id: z.string(), title: z.string() }))
      .mutation(({ input }) => {
        titles.set(input.id, input.title);
        return input.title;
      }),
    onRename: t.procedure.subscription(async function* () {
      yield 'first';
      yield 'latest';
    }),
  },
};

function setup() {
  calls = 0;
  titles.clear();
  titles.set('1', 'Hello');
  return {
    trpc: make({ router, links: [localLink({ router })] }),
    registry: AtomRegistry.make(),
  };
}

/** Resolves with the atom's first value that matches. */
const until = <A>(
  registry: AtomRegistry.AtomRegistry,
  atom: Atom.Atom<A>,
  ok: (value: A) => boolean,
): Promise<A> =>
  new Promise((resolve) => {
    const check = (value: A) => {
      if (ok(value)) {
        cancel();
        resolve(value);
      }
    };
    const cancel = registry.subscribe(atom, check, { immediate: true });
  });

const done = <A, E>(result: AsyncResult.AsyncResult<A, E>) =>
  !AsyncResult.isInitial(result) && !result.waiting;

test('the same call is the same atom, with typed success and errors', async () => {
  const { trpc, registry } = setup();
  const post = trpc.post.byId.query({ id: '1' });
  expect(trpc.post.byId.query({ id: '1' })).toBe(post);
  expect(trpc.post.byId.query({ id: '2' })).not.toBe(post);

  const result = await until(registry, post, done);
  expect(AsyncResult.getOrThrow(result)).toEqual({
    id: '1',
    title: 'Hello',
    at: new Date(0).toJSON(),
  });

  const missing = await until(
    registry,
    trpc.post.byId.query({ id: '404' }),
    done,
  );
  const err = Option.getOrThrow(AsyncResult.error(missing));
  expect(err).toMatchObject({ code: 'NOT_FOUND', data: { id: '404' } });
  if (err.defined && err.code === 'NOT_FOUND') {
    expectTypeOf(err.data).toEqualTypeOf<{ id: string }>();
  }
});

test('a mutation with reactivity keys refetches the queries that share them', async () => {
  const { trpc, registry } = setup();
  const post = trpc.post.byId.query({ id: '1' }, { reactivityKeys: ['posts'] });
  const unmount = registry.mount(post);
  await until(registry, post, done);

  const rename = trpc.post.rename.mutation();
  registry.set(rename, {
    input: { id: '1', title: 'Renamed' },
    reactivityKeys: ['posts'],
  });
  const renamed = await until(registry, rename, done);
  expect(AsyncResult.getOrThrow(renamed)).toBe('Renamed');

  const after = await until(
    registry,
    post,
    (r) => done(r) && AsyncResult.getOrThrow(r).title === 'Renamed',
  );
  expect(AsyncResult.getOrThrow(after).title).toBe('Renamed');
  expect(calls).toBe(2);
  unmount();
});

test('timeToLive keeps an unused result; without it, a remount refetches', async () => {
  const { trpc, registry } = setup();
  const kept = trpc.post.byId.query({ id: '1' }, { timeToLive: '1 minute' });
  registry.mount(kept)();
  await until(registry, kept, done);
  registry.mount(kept)();
  expect(calls).toBe(1);

  const plain = trpc.post.byId.query({ id: '1' });
  let unmount = registry.mount(plain);
  await until(registry, plain, done);
  unmount();
  await new Promise((resolve) => setTimeout(resolve, 0));
  unmount = registry.mount(plain);
  await until(registry, plain, done);
  unmount();
  expect(calls).toBe(3);
});

test('a subscription atom holds the latest event', async () => {
  const { trpc, registry } = setup();
  const events = trpc.post.onRename.subscription(undefined);
  const unmount = registry.mount(events);
  const latest = await until(
    registry,
    events,
    (r) => AsyncResult.isSuccess(r) && r.value === 'latest',
  );
  expect(AsyncResult.getOrThrow(latest)).toBe('latest');
  unmount();
});

test('useAtomSuspense renders a query atom', async () => {
  const { trpc } = setup();
  function Post() {
    const post = useAtomSuspense(trpc.post.byId.query({ id: '1' })).value;
    return createElement('h1', null, `${post.title} ${post.at}`);
  }
  const { prelude } = await prerender(
    createElement(
      RegistryProvider,
      null,
      createElement(Suspense, { fallback: 'loading' }, createElement(Post)),
    ),
  );
  expect(await new Response(prelude).text()).toContain(
    'Hello 1970-01-01T00:00:00.000Z',
  );
});
