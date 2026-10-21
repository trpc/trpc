import type { AnyLink } from '@trpc12/trpc/client';
import { expect, expectTypeOf, test } from 'vite-plus/test';
import { safe, serve } from '../shared/client.ts';
import type { ErrorsOf } from '../shared/define.ts';
import { trpcFailures, type TrpcFailure } from '../shared/framework.ts';
import { registrySuite } from '../shared/suite.ts';
import {
  appRouter,
  authErrors,
  billingErrors,
  errors,
  postErrors,
  type AppRouter,
} from './app.ts';
import {
  createClient,
  createEffectClient,
  createErrors,
  mergeErrors,
} from './merge-errors.ts';

const registry = { ...errors, ...trpcFailures };
const clients = (links: ReadonlyArray<AnyLink>) => ({
  client: createClient<AppRouter>({ links, registry }),
  effect: createEffectClient<AppRouter>({ links, registry }),
});

registrySuite('mergeErrors() with scopes', {
  router: appRouter,
  classes: errors,
  clients,
  missingId: (err) => err.data.id,
});

const { client } = clients([serve(appRouter).link]);

test('types: a subtree fails with its module’s errors and its parents’', async () => {
  const [, post] = await safe(client.post.byId.query({ id: '1' }));
  expectTypeOf(post).toEqualTypeOf<
    ErrorsOf<typeof postErrors> | ErrorsOf<typeof authErrors> | TrpcFailure | undefined
  >();
  const [, charge] = await safe(client.billing.charge.mutate({ cents: 1 }));
  expectTypeOf(charge).toEqualTypeOf<
    ErrorsOf<typeof billingErrors> | ErrorsOf<typeof authErrors> | TrpcFailure | undefined
  >();
});

test('a tag in two modules is a type error, and throws', () => {
  const other = createErrors({ Unauthorized: { status: 403 } });
  // @ts-expect-error 'Unauthorized' is in two registries
  expect(() => mergeErrors(authErrors, other)).toThrow('two registries');
});
