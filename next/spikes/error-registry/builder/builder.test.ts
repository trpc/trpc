import type { AnyLink } from '@trpc12/trpc/client';
import { expect, expectTypeOf, test } from 'vite-plus/test';
import { safe, serve } from '../shared/client.ts';
import { trpcFailures, type TrpcFailure } from '../shared/framework.ts';
import { registrySuite } from '../shared/suite.ts';
import { appRouter, errors, type AppRouter } from './app.ts';
import {
  createClient,
  createEffectClient,
  errors as registry,
  registryOf,
} from './builder.ts';

const runtime = { ...registryOf(errors), ...trpcFailures };
const clients = (links: ReadonlyArray<AnyLink>) => ({
  client: createClient<AppRouter>({ links, registry: runtime }),
  effect: createEffectClient<AppRouter>({ links, registry: runtime }),
});

registrySuite('errors().add()', {
  router: appRouter,
  classes: registryOf(errors),
  clients,
  missingId: (err) => err.data.id,
});

const { client } = clients([serve(appRouter).link]);

test('types: the chain types the same union as an object literal', async () => {
  const [, err] = await safe(client.post.byId.query({ id: '1' }));
  expectTypeOf(err).toEqualTypeOf<
    | InstanceType<typeof errors.Unauthorized>
    | InstanceType<typeof errors.PostNotFound>
    | InstanceType<typeof errors.TitleTaken>
    | InstanceType<typeof errors.RateLimited>
    | TrpcFailure
    | undefined
  >();
});

test('a tag can be added once', () => {
  const once = registry().add('Gone', { status: 410 });
  // @ts-expect-error the tag is taken
  expect(() => once.add('Gone', { status: 410 })).toThrow('already');
});
