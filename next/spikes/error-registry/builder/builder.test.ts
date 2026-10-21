import { expect, expectTypeOf, test } from 'vite-plus/test';
import { createClient, safe } from '../shared/client.ts';
import type { RegistryError, TrpcFailure } from '../shared/failures.ts';
import { serve } from '../shared/serve.ts';
import { registrySuite } from '../shared/suite.ts';
import { appRouter, type AppRouter } from './app.ts';
import { errors as registry } from './builder.ts';

registrySuite('errors().add()', { router: appRouter });

const client = createClient<AppRouter>({ links: [serve(appRouter).link] });

test('types: a call fails with what its procedure returns, as with B', async () => {
  const [, err] = await safe(client.post.create.mutate({ title: 'x' }));
  expectTypeOf(err).toEqualTypeOf<
    | RegistryError<'Unauthorized'>
    | RegistryError<'TitleTaken', { title: string }>
    | TrpcFailure
    | undefined
  >();
});

test('types: registryOf() declares the chain', async () => {
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

test('a tag can be added once', () => {
  const once = registry().add('Gone', { status: 410 });
  // @ts-expect-error the tag is taken
  expect(() => once.add('Gone', { status: 410 })).toThrow('already');
});
