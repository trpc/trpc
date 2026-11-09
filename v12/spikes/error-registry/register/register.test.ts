import { expectTypeOf, test } from 'vite-plus/test';
import { createClient, safe } from '../shared/client.ts';
import type { RegistryError, TrpcFailure } from '../shared/failures.ts';
import { serve } from '../shared/serve.ts';
import { registrySuite } from '../shared/suite.ts';
import { appRouter, type AppRouter } from './app.ts';
import type { RegisteredError } from './register.ts';

registrySuite('declaration merging', { router: appRouter });

const client = createClient<AppRouter>({ links: [serve(appRouter).link] });

test('types: a call fails with its own errors, not the interface’s', async () => {
  const [, err] = await safe(client.post.byId.query({ id: '1' }));
  expectTypeOf(err).toEqualTypeOf<
    RegistryError<'PostNotFound', { id: string }> | TrpcFailure | undefined
  >();
});

test('types: the interface names every tag with no type parameter', () => {
  type AppTag = 'Unauthorized' | 'RateLimited' | 'PostNotFound' | 'TitleTaken';
  expectTypeOf<
    Extract<RegisteredError['_tag'], AppTag>
  >().toEqualTypeOf<AppTag>();
  const claims = <T extends RegisteredError['_tag']>(tags: ReadonlyArray<T>) =>
    tags;
  claims(['Unauthorized', 'NetworkError']);
  // @ts-expect-error no error has the tag
  claims(['Unauthorised']);
});
