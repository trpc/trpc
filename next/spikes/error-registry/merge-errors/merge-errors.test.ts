import { expect, expectTypeOf, test } from 'vite-plus/test';
import { createClient, safe } from '../shared/client.ts';
import type { RegistryError, TrpcFailure } from '../shared/failures.ts';
import { serve } from '../shared/serve.ts';
import { registrySuite } from '../shared/suite.ts';
import {
  appRouter,
  authErrors,
  billingErrors,
  postErrors,
  postProcedure,
  type AppRouter,
} from './app.ts';
import { createErrors, mergeErrors } from './merge-errors.ts';

registrySuite('mergeErrors() with module declarations', { router: appRouter });

const client = createClient<AppRouter>({ links: [serve(appRouter).link] });

type PostError =
  | RegistryError<'PostNotFound', { id: string }>
  | RegistryError<'TitleTaken', { title: string }>;

test("types: a module's call fails with its module's errors", async () => {
  const [, post] = await safe(client.post.byId.query({ id: '1' }));
  expectTypeOf(post).toEqualTypeOf<PostError | TrpcFailure | undefined>();
  // Middleware's errors aren't declared: they add to the module's.
  const [, create] = await safe(client.post.create.mutate({ title: 'x' }));
  expectTypeOf(create).toEqualTypeOf<
    PostError | RegistryError<'Unauthorized'> | TrpcFailure | undefined
  >();
  const [, charge] = await safe(client.billing.charge.mutate({ cents: 1 }));
  expectTypeOf(charge).toEqualTypeOf<
    | RegistryError<'CardDeclined', { reason: string }>
    | RegistryError<'Unauthorized'>
    | TrpcFailure
    | undefined
  >();
});

test("types: a module's procedure returns only its module's errors", () => {
  postProcedure.query(() => postErrors.TitleTaken({ title: 'x' }));
  // @ts-expect-error CardDeclined is billing's
  postProcedure.query(() => billingErrors.CardDeclined({ reason: 'x' }));
});

test('a thrown error the module declares is typed, as v12 has it', async () => {
  const [, err] = await safe(client.post.thrown.query({ id: 'nope' }));
  expect(err).toMatchObject({ _tag: 'PostNotFound', data: { id: 'nope' } });
  expectTypeOf(err).toEqualTypeOf<PostError | TrpcFailure | undefined>();
});

test('a tag in two modules is a type error, and throws', () => {
  const other = createErrors({ Unauthorized: { status: 403 } });
  // @ts-expect-error 'Unauthorized' is in two registries
  expect(() => mergeErrors(authErrors, other)).toThrow('two registries');
});
