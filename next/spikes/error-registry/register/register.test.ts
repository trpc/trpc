import type { AnyLink } from '@trpc12/trpc/client';
import { expectTypeOf, test } from 'vite-plus/test';
import { safe, serve } from '../shared/client.ts';
import { trpcFailures } from '../shared/framework.ts';
import { registrySuite } from '../shared/suite.ts';
import { appRouter, authErrors, postErrors, type AppRouter } from './app.ts';
import {
  createClient,
  createEffectClient,
  type RegisteredError,
} from './register.ts';

const registry = { ...authErrors, ...postErrors, ...trpcFailures };
const clients = (links: ReadonlyArray<AnyLink>) => ({
  client: createClient<AppRouter>({ links, registry }),
  effect: createEffectClient<AppRouter>({ links, registry }),
});

registrySuite('declaration merging', {
  router: appRouter,
  classes: { ...authErrors, ...postErrors },
  clients,
  missingId: (err) => err.data.id,
});

const { client } = clients([serve(appRouter).link]);

test('types: every module’s errors, read from one interface', async () => {
  const [, err] = await safe(client.post.byId.query({ id: '1' }));
  expectTypeOf(err).toEqualTypeOf<RegisteredError | undefined>();
  expectTypeOf<RegisteredError['_tag']>().toExtend<
    'Unauthorized' | 'RateLimited' | 'PostNotFound' | 'TitleTaken' | string
  >();
});

test('types: code anywhere names a tag with no type parameter', () => {
  // An error boundary's claims, say, checked against the registry.
  const claims = <T extends RegisteredError['_tag']>(tags: ReadonlyArray<T>) => tags;
  claims(['Unauthorized', 'NetworkError']);
  // @ts-expect-error no error has the tag
  claims(['Unauthorised']);
});
