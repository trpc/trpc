import { Effect } from 'effect';
import type { AnyLink } from '@trpc12/trpc/client';
import { expect, expectTypeOf, test } from 'vite-plus/test';
import { matchError, safe, serve } from '../shared/client.ts';
import { trpcFailures, type TrpcFailure } from '../shared/framework.ts';
import { registryToOpenApi } from '../shared/openapi.ts';
import { registrySuite } from '../shared/suite.ts';
import { appRouter, errors, type AppRouter } from './app.ts';
import { createClient, createEffectClient } from './create-errors.ts';

const registry = { ...errors, ...trpcFailures };
const clients = (links: ReadonlyArray<AnyLink>) => ({
  client: createClient<AppRouter>({ links, registry }),
  effect: createEffectClient<AppRouter>({ links, registry }),
});

registrySuite('createErrors', {
  router: appRouter,
  classes: errors,
  clients,
  missingId: (err) => err.data.id,
});

const { client, effect } = clients([serve(appRouter).link]);

type AppError =
  | InstanceType<(typeof errors)[keyof typeof errors]>
  | TrpcFailure;

test('types: every call fails with the whole registry, ahead of time', async () => {
  const [, err] = await safe(client.post.byId.query({ id: '1' }));
  expectTypeOf(err).toEqualTypeOf<AppError | undefined>();
  if (err?._tag === 'TitleTaken') expectTypeOf(err.data).toEqualTypeOf<{ title: string }>();
});

test('types: matchError() wants every app tag and the link failures', async () => {
  const [, err] = await safe(client.post.byId.query({ id: '1' }));
  if (!err) return;
  // One object of app-wide handlers, spread where a call adds its own.
  const app = {
    Unauthorized: () => 'sign in',
    TitleTaken: (e: { data: { title: string } }) => `${e.data.title} is taken`,
    RateLimited: () => 'slow down',
    NetworkError: () => 'offline',
    BadResponse: () => 'try again',
    unexpected: (e: { message: string }) => e.message,
  };
  const out = matchError(err, {
    ...app,
    PostNotFound: (e) => `no post ${e.data.id}`,
  });
  expectTypeOf(out).toEqualTypeOf<string>();
  // @ts-expect-error PostNotFound has no handler
  matchError(err, app);
  matchError(err, {
    ...app,
    PostNotFound: () => '',
    // @ts-expect-error no error of this call has the tag
    PostGone: () => '',
  });
});

test('types: Effect.catchTag removes one error from the channel', () => {
  const program = effect.post.byId
    .query({ id: '1' })
    .pipe(Effect.catchTag('PostNotFound', () => Effect.succeed(null)));
  expectTypeOf<Effect.Error<typeof program>>().toEqualTypeOf<
    Exclude<AppError, { _tag: 'PostNotFound' }>
  >();
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
