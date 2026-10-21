import { Effect } from 'effect';
import type { AnyLink } from '@trpc12/trpc/client';
import { expect, expectTypeOf, test } from 'vite-plus/test';
import { matchError, safe, serve } from '../shared/client.ts';
import type { TrpcFailure } from '../shared/framework.ts';
import { registrySuite } from '../shared/suite.ts';
import {
  appRouter,
  errors,
  PostNotFound,
  RateLimited,
  TitleTaken,
  Unauthorized,
  type AppRouter,
} from './app.ts';
import {
  classesToOpenApi,
  createClient,
  createEffectClient,
} from './tagged-classes.ts';

const clients = (links: ReadonlyArray<AnyLink>) => ({
  client: createClient<AppRouter>({ links, errors }),
  effect: createEffectClient<AppRouter>({ links, errors }),
});

registrySuite('Schema.TaggedError classes', {
  router: appRouter,
  classes: { Unauthorized, PostNotFound, TitleTaken, RateLimited },
  clients,
  missingId: (err) => err.id,
});

const { client, effect } = clients([serve(appRouter).link]);

type AppError =
  | Unauthorized
  | PostNotFound
  | TitleTaken
  | RateLimited
  | TrpcFailure;

test('types: the client fails with the classes themselves', async () => {
  const [, err] = await safe(client.post.byId.query({ id: '1' }));
  expectTypeOf(err).toEqualTypeOf<AppError | undefined>();
  if (err instanceof TitleTaken) expectTypeOf(err.title).toEqualTypeOf<string>();
});

test('types: matchError() and catchTag work on the classes as they are', async () => {
  const [, err] = await safe(client.post.byId.query({ id: '1' }));
  if (err) {
    matchError(err, {
      Unauthorized: () => 'sign in',
      PostNotFound: (e) => `no post ${e.id}`,
      TitleTaken: (e) => `${e.title} is taken`,
      RateLimited: (e) => `retry in ${e.retryAfter}s`,
      NetworkError: () => 'offline',
      BadResponse: () => 'try again',
      unexpected: (e) => e.message,
    });
  }
  const program = effect.post.byId
    .query({ id: '1' })
    .pipe(Effect.catchTag('PostNotFound', (e) => Effect.succeed(e.id)));
  expectTypeOf<Effect.Error<typeof program>>().toEqualTypeOf<
    Exclude<AppError, PostNotFound>
  >();
});

test('the status is HttpApi’s annotation, so OpenAPI reads it too', () => {
  const doc = classesToOpenApi(errors.classes);
  expect(Object.keys(doc.responses)).toEqual(['401', '404', '409', '429']);
  expect(doc.responses['404']?.description).toBe('No post with this id.');
});
