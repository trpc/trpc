import type { BuiltinErrorCode } from '@trpc12/trpc/client';
import { initTrpc } from '@trpc12/trpc/server';
import { z } from 'zod';
import { expect, expectTypeOf, test } from 'vite-plus/test';
import type * as B from '../create-errors/app.ts';
import type * as C from '../tagged-classes/app.ts';
import type * as D from '../builder/app.ts';
import type * as E from '../merge-errors/app.ts';
import type * as F from '../register/app.ts';
import type { Errors } from '../register/register.ts';
import type * as G from '../inferred/app.ts';
import type { RegistryError, TrpcFailure } from '../shared/failures.ts';
import { createErrorBoundary } from './boundaries.ts';
import { createCodeErrorBoundary, type CodeOf } from './codes.ts';
import { errorsOf, type ErrorsFrom, type TagOf } from './sources.ts';

type Tags<T> = T extends { readonly _tag: infer K } ? K : never;
type Framework = TrpcFailure['_tag'];

test('B: the router, a subrouter and a procedure are what they return; the registry is all of it', () => {
  expectTypeOf<Tags<ErrorsFrom<B.AppRouter>>>().toEqualTypeOf<
    'Unauthorized' | 'PostNotFound' | 'TitleTaken' | 'RateLimited'
  >();
  expectTypeOf<
    Tags<ErrorsFrom<B.AppRouter['post']['byId']>>
  >().toEqualTypeOf<'PostNotFound'>();
  expectTypeOf<Tags<ErrorsFrom<typeof B.errors>>>().toEqualTypeOf<
    'Unauthorized' | 'PostNotFound' | 'TitleTaken' | 'RateLimited'
  >();
  expectTypeOf<ErrorsFrom<B.AppRouter['post']['byId']>>().toEqualTypeOf<
    RegistryError<'PostNotFound', { id: string }>
  >();
});

test("C: the class list's tags, with the fields as data, not the classes", () => {
  expectTypeOf<Tags<ErrorsFrom<typeof C.errors>>>().toEqualTypeOf<
    'Unauthorized' | 'PostNotFound' | 'TitleTaken' | 'RateLimited'
  >();
  expectTypeOf<ErrorsFrom<C.AppRouter['post']['byId']>>().toEqualTypeOf<
    RegistryError<'PostNotFound', { readonly id: string }>
  >();
});

test("D: the builder's entries, without its methods", () => {
  expectTypeOf<Tags<ErrorsFrom<typeof D.errors>>>().toEqualTypeOf<
    'Unauthorized' | 'PostNotFound' | 'TitleTaken' | 'RateLimited'
  >();
});

test("E: a module's registry, its base procedure, its subtree and the backend's merge", () => {
  expectTypeOf<Tags<ErrorsFrom<typeof E.postErrors>>>().toEqualTypeOf<
    'PostNotFound' | 'TitleTaken'
  >();
  expectTypeOf<Tags<ErrorsFrom<typeof E.postProcedure>>>().toEqualTypeOf<
    'PostNotFound' | 'TitleTaken'
  >();
  // The subtree adds the auth middleware's error, which `create` returns
  expectTypeOf<Tags<ErrorsFrom<E.AppRouter['post']>>>().toEqualTypeOf<
    'Unauthorized' | 'PostNotFound' | 'TitleTaken'
  >();
  expectTypeOf<Tags<ErrorsFrom<typeof E.errors>>>().toEqualTypeOf<
    | 'Unauthorized'
    | 'RateLimited'
    | 'PostNotFound'
    | 'TitleTaken'
    | 'CardDeclined'
  >();
});

test("F: the interface is every module's registry, whatever the router returns", () => {
  expectTypeOf<Tags<ErrorsFrom<Errors>>>().toEqualTypeOf<
    'Unauthorized' | 'RateLimited' | 'PostNotFound' | 'TitleTaken'
  >();
  expectTypeOf<Tags<ErrorsFrom<F.AppRouter>>>().toEqualTypeOf<
    'Unauthorized' | 'PostNotFound' | 'TitleTaken'
  >();
});

test('G: one error, or the router: nothing else lists them', () => {
  expectTypeOf<
    Tags<ErrorsFrom<typeof G.PostNotFound>>
  >().toEqualTypeOf<'PostNotFound'>();
  expectTypeOf<
    Tags<ErrorsFrom<{ PostNotFound: typeof G.PostNotFound }>>
  >().toEqualTypeOf<'PostNotFound'>();
  expectTypeOf<Tags<ErrorsFrom<G.AppRouter>>>().toEqualTypeOf<
    'Unauthorized' | 'PostNotFound' | 'TitleTaken'
  >();
});

test("a boundary's claims are its source's tags and tRPC's", () => {
  expectTypeOf<TagOf<typeof E.postErrors>>().toEqualTypeOf<
    'PostNotFound' | 'TitleTaken' | Framework
  >();
  createErrorBoundary({
    name: 'Posts',
    errors: errorsOf<typeof E.postErrors>(),
    claims: ['TitleTaken', 'NetworkError'],
    fallback: (props) => {
      expectTypeOf(props.error).toEqualTypeOf<
        | RegistryError<'TitleTaken', { title: string }>
        | RegistryError<'NetworkError'>
      >();
      return null;
    },
  });
  createErrorBoundary({
    name: 'Posts',
    errors: errorsOf<typeof E.postErrors>(),
    // @ts-expect-error the auth middleware's error isn't the posts module's
    claims: ['Unauthorized'],
    fallback: () => null,
  });
  createErrorBoundary({
    name: 'Posts',
    errors: errorsOf<typeof G.PostNotFound>(),
    // @ts-expect-error G: a boundary over one error claims that one
    claims: ['TitleTaken'],
    fallback: () => null,
  });
});

test('A: every built-in code is in every source; only custom codes narrow', () => {
  const t = initTrpc<{ ctx: { user: string | null } }>();
  const appRouter = {
    posts: {
      byId: t.procedure
        .errors({ NOT_FOUND: { data: z.object({ id: z.string() }) } })
        .query(() => null),
      rename: t.procedure
        .errors({ TITLE_TAKEN: { status: 409 } })
        .mutation(() => null),
    },
  };
  type AppRouter = typeof appRouter;
  expectTypeOf<
    Exclude<CodeOf<AppRouter['posts']['byId']>, BuiltinErrorCode>
  >().toEqualTypeOf<`~undeclared:${string}`>();
  expectTypeOf<
    Exclude<CodeOf<AppRouter['posts']['rename']>, BuiltinErrorCode>
  >().toEqualTypeOf<'TITLE_TAKEN' | `~undeclared:${string}`>();
  // Every built-in code, from any source
  expectTypeOf<
    Extract<CodeOf<AppRouter['posts']['byId']>, 'PAYMENT_REQUIRED'>
  >().toEqualTypeOf<'PAYMENT_REQUIRED'>();

  createCodeErrorBoundary({
    name: 'Auth',
    errors: errorsOf<AppRouter['posts']['byId']>(),
    claims: ['UNAUTHORIZED'],
    fallback: (props) => {
      expectTypeOf(props.error.code).toEqualTypeOf<'UNAUTHORIZED'>();
      expectTypeOf(props.error.defined).toEqualTypeOf<false>();
      return null;
    },
  });
  createCodeErrorBoundary({
    name: 'Rename',
    errors: errorsOf<AppRouter['posts']['byId']>(),
    // @ts-expect-error TITLE_TAKEN is rename's, not byId's
    claims: ['TITLE_TAKEN'],
    fallback: () => null,
  });
  createCodeErrorBoundary({
    name: 'Typo',
    errors: errorsOf<AppRouter>(),
    // @ts-expect-error no such code
    claims: ['UNAUTHORISED'],
    fallback: () => null,
  });
  expect(appRouter.posts.byId).toBeDefined();
});
