import { Effect } from 'effect';
import { initTrpc } from '@trpc12/trpc/server';
import { expect, expectTypeOf, test } from 'vite-plus/test';
import {
  createClient,
  createEffectClient,
  matchError,
  safe,
} from '../shared/client.ts';
import type { RegistryError, TrpcFailure } from '../shared/failures.ts';
import { registryToOpenApi } from '../shared/openapi.ts';
import { serve } from '../shared/serve.ts';
import { registrySuite } from '../shared/suite.ts';
import { appRouter, errors, type AppRouter } from './app.ts';

registrySuite('createErrors', { router: appRouter });

const { link } = serve(appRouter);
const client = createClient<AppRouter>({ links: [link] });
const effect = createEffectClient<AppRouter>({ links: [link] });

type PostNotFound = RegistryError<'PostNotFound', { id: string }>;
type TitleTaken = RegistryError<'TitleTaken', { title: string }>;
type Unauthorized = RegistryError<'Unauthorized'>;

test('types: a call fails with what its procedure returns', async () => {
  const [, byId] = await safe(client.post.byId.query({ id: '1' }));
  expectTypeOf(byId).toEqualTypeOf<PostNotFound | TrpcFailure | undefined>();
  const [, eff] = await safe(client.post.byIdEffect.query({ id: '1' }));
  expectTypeOf(eff).toEqualTypeOf<PostNotFound | TrpcFailure | undefined>();
  // The middleware's error, and the resolver's.
  const [, create] = await safe(client.post.create.mutate({ title: 'x' }));
  expectTypeOf(create).toEqualTypeOf<
    Unauthorized | TitleTaken | TrpcFailure | undefined
  >();
  // Thrown: nothing of the app's.
  const [, crash] = await safe(client.post.crash.query({ id: '1' }));
  expectTypeOf(crash).toEqualTypeOf<TrpcFailure | undefined>();
});

test('types: a declared procedure fails with its declaration', async () => {
  const [, err] = await safe(client.post.declared.query({ id: '1' }));
  expectTypeOf(err?._tag).toEqualTypeOf<
    | 'Unauthorized'
    | 'PostNotFound'
    | 'TitleTaken'
    | 'RateLimited'
    | TrpcFailure['_tag']
    | undefined
  >();
});

test('types: once declared, a procedure returns only what it declares', () => {
  const t = initTrpc<{ ctx: {} }>();
  const declared = t.procedure.errors({ PostNotFound: errors.PostNotFound });
  declared.query(() => errors.PostNotFound({ id: '1' }));
  // @ts-expect-error TitleTaken isn't declared
  declared.query(() => errors.TitleTaken({ title: 'x' }));
});

test("types: matchError() wants the call's tags and the link failures", async () => {
  const [, err] = await safe(client.post.byId.query({ id: '1' }));
  if (!err) return;
  const out = matchError(err, {
    PostNotFound: (e) => `no post ${e.data.id}`,
    NetworkError: () => 'offline',
    BadResponse: () => 'try again',
    unexpected: (e) => e.message,
  });
  expectTypeOf(out).toEqualTypeOf<string>();
  // @ts-expect-error PostNotFound has no handler
  matchError(err, {
    NetworkError: () => '',
    BadResponse: () => '',
    unexpected: () => '',
  });
  matchError(err, {
    PostNotFound: () => '',
    NetworkError: () => '',
    BadResponse: () => '',
    unexpected: () => '',
    // @ts-expect-error byId never returns TitleTaken
    TitleTaken: () => '',
  });
});

test('types: Effect.catchTag removes one error from the channel', () => {
  const program = effect.post.byId
    .query({ id: '1' })
    .pipe(Effect.catchTag('PostNotFound', () => Effect.succeed(null)));
  expectTypeOf<Effect.Error<typeof program>>().toEqualTypeOf<TrpcFailure>();
});

test('OpenAPI: one component per error, one response per status', () => {
  const doc = registryToOpenApi(errors);
  expect(Object.keys(doc.schemas)).toEqual([
    'Unauthorized',
    'PostNotFound',
    'TitleTaken',
    'RateLimited',
  ]);
  expect(doc.schemas['PostNotFound']).toMatchObject({
    properties: {
      tag: { const: 'PostNotFound' },
      data: { type: 'object', properties: { id: { type: 'string' } } },
    },
  });
  expect(Object.keys(doc.responses)).toEqual(['401', '404', '409', '429']);
});
