import { Effect, Stream } from 'effect';
import { httpLink, routerType } from '@trpc12/trpc/client';
import { createEffectClient } from '@trpc12/trpc/effect';
import type { AppRouter } from './server.ts';

export const program = (url: string) =>
  Effect.gen(function* () {
    const client = createEffectClient({
      router: routerType<AppRouter>(),
      links: [httpLink({ url, headers: { authorization: 'ada' } })],
    });

    const post = yield* client.post.byId.query({ id: '1' });
    yield* Effect.log('post.byId', post);

    const created = yield* client.post.create.mutate({ title: 'Layers' });
    yield* Effect.log('post.create', created);

    const missing = yield* client.post.byId.query({ id: '404' }).pipe(
      Effect.as('found'),
      // A custom code is always the procedure's own error, with its `data`.
      Effect.catchTag('POST_NOT_FOUND', (err) =>
        Effect.succeed(`no post ${err.data.id} (${err.code})`),
      ),
    );
    yield* Effect.log('post.byId', missing);
    if (missing !== 'no post 404 (POST_NOT_FOUND)') {
      return yield* Effect.die(`expected POST_NOT_FOUND, got ${missing}`);
    }

    const titles = yield* client.post.all.subscribe().pipe(
      Stream.map((p) => p.title),
      Stream.runCollect,
    );
    yield* Effect.log('post.all', titles);
    if (!titles.includes(created.title)) {
      return yield* Effect.die('expected the created post in post.all');
    }
  });

export const main = (url: string) => Effect.runPromise(program(url));

if (import.meta.main)
  await main(process.argv[2] ?? 'http://localhost:3000/trpc');
