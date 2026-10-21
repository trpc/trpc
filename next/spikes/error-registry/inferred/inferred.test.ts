import { initTrpc } from '@trpc12/trpc/server';
import { expectTypeOf, test } from 'vite-plus/test';
import { createClient, safe } from '../shared/client.ts';
import type { RegistryError, TrpcFailure } from '../shared/failures.ts';
import { serve } from '../shared/serve.ts';
import { registrySuite } from '../shared/suite.ts';
import {
  appRouter,
  PostNotFound,
  TitleTaken,
  type AppRouter,
} from './app.ts';
import { defineError } from './inferred.ts';

registrySuite('inferred, no registry', { router: appRouter });

const client = createClient<AppRouter>({ links: [serve(appRouter).link] });

test('types: the same per-call unions as with a registry', async () => {
  const [, create] = await safe(client.post.create.mutate({ title: 'x' }));
  expectTypeOf(create).toEqualTypeOf<
    | RegistryError<'Unauthorized'>
    | RegistryError<'TitleTaken', { title: string }>
    | TrpcFailure
    | undefined
  >();
  const [, declared] = await safe(client.post.declared.query({ id: '1' }));
  expectTypeOf(declared).toEqualTypeOf<
    RegistryError<'PostNotFound', { id: string }> | TrpcFailure | undefined
  >();
});

test('types: declared entries restrict returns as a registry does', () => {
  const t = initTrpc<{ ctx: {} }>();
  // @ts-expect-error TitleTaken isn't declared
  t.procedure.errors({ PostNotFound }).query(() => TitleTaken({ title: 'x' }));
});

test('nothing stops two modules defining one tag', () => {
  const Again = defineError('PostNotFound', { status: 410 });
  expectTypeOf(Again.tag).toEqualTypeOf(PostNotFound.tag);
});
