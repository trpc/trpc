import type { AnyLink } from '@trpc12/trpc/client';
import { expect, expectTypeOf, test } from 'vite-plus/test';
import { safe, serve } from '../shared/client.ts';
import { trpcFailures } from '../shared/framework.ts';
import { registrySuite } from '../shared/suite.ts';
import {
  appRouter,
  PostNotFound,
  RateLimited,
  TitleTaken,
  Unauthorized,
  type AppRouter,
} from './app.ts';
import { createClient, createEffectClient } from './inferred.ts';

const classes = { Unauthorized, PostNotFound, TitleTaken, RateLimited };
const registry = { ...classes, ...trpcFailures };
const clients = (links: ReadonlyArray<AnyLink>) => ({
  client: createClient<AppRouter>({ links, registry }),
  effect: createEffectClient<AppRouter>({ links, registry }),
});

registrySuite('inferred from the router', {
  router: appRouter,
  classes,
  clients,
  missingId: (err) => err.data.id,
});

const { client } = clients([serve(appRouter).link]);

test('types: the union is what the procedures return, thrown errors left out', async () => {
  const [, err] = await safe(client.post.byId.query({ id: '1' }));
  expectTypeOf<NonNullable<typeof err>['_tag']>().toEqualTypeOf<
    | 'Unauthorized'
    | 'PostNotFound'
    | 'TitleTaken'
    | 'InvalidInput'
    | keyof typeof trpcFailures
  >();
});

test('a thrown error arrives all the same, but the types never list it', async () => {
  const [, err] = await safe(client.post.hot.query());
  expect(err).toBeInstanceOf(RateLimited);
});
