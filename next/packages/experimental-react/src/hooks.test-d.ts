import {
  createReactClient,
  useMutation,
  useQuery,
  type QueryPromise,
} from '@trpc12/experimental-react';
import { localLink, routerType, type TrpcPromise } from '@trpc12/trpc/client';
import { error, initTrpc } from '@trpc12/trpc/server';
import { Duration } from 'effect';
import { expectTypeOf, test } from 'vite-plus/test';
import { router, type AppRouter } from '../../trpc/src/fixtures/posts.ts';

const trpc = createReactClient({
  router: routerType<AppRouter>(),
  links: [localLink({ router })],
});
const post = trpc.post.byId.query({ id: '1' });
type PostError = NonNullable<(typeof post)['~error']>;

test('useQuery keeps the data and error types; select picks the data type; refetchInterval takes a duration', () => {
  expectTypeOf(useQuery(post)).toEqualTypeOf<typeof post>();
  const title = useQuery(post, { select: (data) => data.title });
  expectTypeOf(title).toEqualTypeOf<QueryPromise<string, PostError>>();
  expectTypeOf(useQuery(post, {})).toEqualTypeOf<typeof post>();
  for (const every of [
    5_000,
    '5 seconds',
    Duration.seconds(5),
    false,
  ] as const) {
    expectTypeOf(useQuery(post, { refetchInterval: every })).toEqualTypeOf<
      typeof post
    >();
  }
  // @ts-expect-error: an interval is a duration, or false
  void useQuery(post, { refetchInterval: true });
  // @ts-expect-error: select takes the query's data
  void useQuery(post, { select: (data: { nope: string }) => data.nope });
});

type Rename = typeof trpc.post.rename.mutate;
type RenameError = NonNullable<ReturnType<Rename>['~error']>;

test("useMutation's mutate is the procedure's, and its state narrows on status", () => {
  const rename = useMutation(trpc.post.rename);
  expectTypeOf(rename.mutate).parameters.toEqualTypeOf<Parameters<Rename>>();
  expectTypeOf(rename.mutate).returns.toEqualTypeOf<
    TrpcPromise<string, RenameError>
  >();
  expectTypeOf(rename.error).toEqualTypeOf<RenameError | undefined>();
  if (rename.status === 'success') {
    expectTypeOf(rename.data).toEqualTypeOf<string>();
    expectTypeOf(rename.input).toEqualTypeOf<{ id: string; title: string }>();
  }
  if (rename.status === 'error') {
    expectTypeOf(rename.error).toEqualTypeOf<RenameError>();
    expectTypeOf(rename.data).toEqualTypeOf<undefined>();
  }
  // @ts-expect-error: the input is checked
  void rename.mutate({ id: 1, title: 'x' });
  // @ts-expect-error: a query has no mutate
  useMutation(trpc.post.byId);
});

test("useMutation's error is the procedure's typed union; invalidates sees the input and data", () => {
  const t = initTrpc();
  const local = t.router({
    claim: t.procedure.mutation(() =>
      error({ code: 'CONFLICT', data: { reason: 'taken' } }),
    ),
  });
  const claims = createReactClient({
    router: routerType<typeof local>(),
    links: [localLink({ router: local })],
  });
  const claim = useMutation(claims.claim);
  const err = claim.error;
  if (err?.defined && err.code === 'CONFLICT') {
    expectTypeOf(err.data).toEqualTypeOf<{ reason: string }>();
  }

  useMutation(trpc.post.rename, {
    invalidates: (opts) => {
      expectTypeOf(opts.input).toEqualTypeOf<{ id: string; title: string }>();
      expectTypeOf(opts.data).toEqualTypeOf<string>();
      return [trpc.post.byId.queryKey({ id: opts.input.id }), 'post.list'];
    },
  });
  // @ts-expect-error: path prefixes and query keys are strings
  useMutation(trpc.post.rename, { invalidates: 1 });
});

test('queryKey takes the query input', () => {
  expectTypeOf(trpc.post.byId.queryKey({ id: '1' })).toEqualTypeOf<string>();
  expectTypeOf(trpc.post.count.queryKey()).toEqualTypeOf<string>();
  // @ts-expect-error: byId takes an input
  trpc.post.byId.queryKey();
});
