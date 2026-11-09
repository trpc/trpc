import { Effect } from 'effect';
import { initTrpc } from '@trpc12/trpc/server';
import { expect, expectTypeOf, test } from 'vite-plus/test';
import { createClient, safe } from '../shared/client.ts';
import type { RegistryError, TrpcFailure } from '../shared/failures.ts';
import { serve } from '../shared/serve.ts';
import { registrySuite } from '../shared/suite.ts';
import { appRouter, errors, PostNotFound, type AppRouter } from './app.ts';
import { classesToOpenApi } from './tagged-classes.ts';

registrySuite('Schema.TaggedError classes', { router: appRouter });

const client = createClient<AppRouter>({ links: [serve(appRouter).link] });

test('types: v12 rejects the classes themselves, returned or failed', () => {
  const t = initTrpc<{ ctx: {} }>();
  // @ts-expect-error a Schema.TaggedError is an Effect: map it first
  t.procedure.query(() => new PostNotFound({ id: '1' }));
  t.procedure.query(() =>
    // @ts-expect-error not a TrpcError
    Effect.gen(function* () {
      return yield* new PostNotFound({ id: '1' });
    }),
  );
});

test('types: mapped per resolver, a call fails with its own errors', async () => {
  const [, byId] = await safe(client.post.byId.query({ id: '1' }));
  expectTypeOf(byId).toEqualTypeOf<
    | RegistryError<'PostNotFound', { readonly id: string }>
    | TrpcFailure
    | undefined
  >();
  const [, create] = await safe(client.post.create.mutate({ title: 'x' }));
  expectTypeOf(create?._tag).toEqualTypeOf<
    'Unauthorized' | 'TitleTaken' | TrpcFailure['_tag'] | undefined
  >();
});

test('the client gets the fields as data, not the class', async () => {
  const [, err] = await safe(client.post.byId.query({ id: 'nope' }));
  expect(err).not.toBeInstanceOf(PostNotFound);
  expect(err).toMatchObject({ _tag: 'PostNotFound', data: { id: 'nope' } });
});

test('the status is HttpApi’s annotation, so OpenAPI reads it too', () => {
  const doc = classesToOpenApi(errors.classes);
  expect(Object.keys(doc.responses)).toEqual(['401', '404', '409', '429']);
  expect(doc.responses['404']?.description).toBe('No post with this id.');
});
