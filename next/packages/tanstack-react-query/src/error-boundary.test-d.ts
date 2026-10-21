import {
  useInfiniteQuery,
  useMutation,
  useQueries,
  useQuery,
  useSuspenseQuery,
} from '@tanstack/react-query';
import {
  matchError,
  type BuiltinErrorCode,
  type UndeclaredCode,
} from '@trpc12/trpc/client';
import { describe, expectTypeOf, test } from 'vite-plus/test';
import type { Remaining } from './error-boundary.ts';
import {
  type createApp,
  useAuthBoundary,
  useOfflineBoundary,
  useRootBoundary,
} from './fixtures/error-boundary.ts';

declare const app: ReturnType<typeof createApp>;
type CodeOf<E> = E extends { readonly code: infer C } ? C : never;
type ErrorOf<R> = NonNullable<R extends { error: infer E } ? E : never>;

const renameOptions = () => app.trpc.doc.rename.mutationOptions();
type RenameError = Parameters<
  NonNullable<ReturnType<typeof renameOptions>['onError']>
>[0];
const byIdOptions = () =>
  app.trpc.doc.byId.queryOptions({ input: { id: '1' } });

describe('the rename mutation', () => {
  test('its full union', () => {
    expectTypeOf<
      CodeOf<Extract<RenameError, { defined: true }>>
    >().toEqualTypeOf<'UNAUTHORIZED' | 'TITLE_TAKEN' | 'BAD_REQUEST'>();
  });

  test('under Auth, only what no boundary owns', () => {
    const rename = () =>
      useMutation(useAuthBoundary().mutation(renameOptions()));
    expectTypeOf<CodeOf<ErrorOf<ReturnType<typeof rename>>>>().toEqualTypeOf<
      'TITLE_TAKEN' | 'BAD_REQUEST'
    >();
  });

  test('under Offline, UNAUTHORIZED is back', () => {
    const rename = () =>
      useMutation(useOfflineBoundary().mutation(renameOptions()));
    expectTypeOf<CodeOf<ErrorOf<ReturnType<typeof rename>>>>().toEqualTypeOf<
      'UNAUTHORIZED' | 'TITLE_TAKEN' | 'BAD_REQUEST'
    >();
  });
});

describe('the byId query', () => {
  const doc = () => useQuery(useAuthBoundary().query(byIdOptions()));
  type DocError = ErrorOf<ReturnType<typeof doc>>;

  test('under Auth, error is only the defined codes no boundary owns', () => {
    expectTypeOf<CodeOf<DocError>>().toEqualTypeOf<
      'NOT_FOUND' | 'BAD_REQUEST'
    >();
    expectTypeOf<Extract<DocError, { defined: false }>>().toBeNever();
  });

  test('matchError() needs every code left, and nothing the boundaries own', () => {
    const err = {} as DocError;
    matchError(err, {
      NOT_FOUND: () => 'No such doc',
      BAD_REQUEST: () => 'Bad id',
    });
    // @ts-expect-error NOT_FOUND is still the component's to handle
    matchError(err, { BAD_REQUEST: () => 'Bad id' });
    matchError(err, {
      NOT_FOUND: () => 'No such doc',
      BAD_REQUEST: () => 'Bad id',
      // @ts-expect-error Auth owns UNAUTHORIZED, so no error of this call goes here
      UNAUTHORIZED: () => 'Sign in',
    });
    matchError(err, {
      NOT_FOUND: () => 'No such doc',
      BAD_REQUEST: () => 'Bad id',
      // @ts-expect-error Root owns every defined: false error
      unexpected: () => 'Try again',
    });
  });

  test("under Root alone, UNAUTHORIZED is the component's again, and the link codes are gone", () => {
    const rooted = () => useQuery(useRootBoundary().query(byIdOptions()));
    expectTypeOf<CodeOf<ErrorOf<ReturnType<typeof rooted>>>>().toEqualTypeOf<
      'UNAUTHORIZED' | 'NOT_FOUND' | 'BAD_REQUEST'
    >();
  });
});

describe("TanStack's other hooks take the same options", () => {
  type Left = 'NOT_FOUND' | 'BAD_REQUEST';

  test('useQuery keeps the initialData overload, so data is defined', () => {
    const doc = () =>
      useQuery(
        useAuthBoundary().query(
          app.trpc.doc.byId.queryOptions({
            input: { id: '1' },
            initialData: { id: '1', title: 'Hello' },
          }),
        ),
      );
    expectTypeOf<ReturnType<typeof doc>['data']>().toEqualTypeOf<{
      id: string;
      title: string;
    }>();
    expectTypeOf<
      CodeOf<ErrorOf<ReturnType<typeof doc>>>
    >().toEqualTypeOf<Left>();
  });

  test('spread options with their own fields still fit', () => {
    const title = () =>
      useQuery(
        useAuthBoundary().query({
          ...byIdOptions(),
          select: (doc) => doc.title,
        }),
      );
    expectTypeOf<ReturnType<typeof title>['data']>().toEqualTypeOf<
      string | undefined
    >();
    expectTypeOf<
      CodeOf<ErrorOf<ReturnType<typeof title>>>
    >().toEqualTypeOf<Left>();
  });

  test('useSuspenseQuery', () => {
    const doc = () => useSuspenseQuery(useAuthBoundary().query(byIdOptions()));
    expectTypeOf<
      CodeOf<ErrorOf<ReturnType<typeof doc>>>
    >().toEqualTypeOf<Left>();
  });

  test('useQueries', () => {
    const docs = () =>
      useQueries({ queries: [useAuthBoundary().query(byIdOptions())] });
    expectTypeOf<
      CodeOf<ErrorOf<ReturnType<typeof docs>[0]>>
    >().toEqualTypeOf<Left>();
  });

  test('useInfiniteQuery, through infiniteQuery()', () => {
    const titles = () =>
      useInfiniteQuery(
        useAuthBoundary().infiniteQuery(
          app.trpc.doc.titles.infiniteOptions({
            input: (cursor: number) => ({ cursor }),
            initialPageParam: 0,
            getNextPageParam: (page) => page.next,
          }),
        ),
      );
    expectTypeOf<
      CodeOf<ErrorOf<ReturnType<typeof titles>>>
    >().toEqualTypeOf<'BAD_REQUEST'>();
  });
});

describe('a claim of one link code, with no unexpected claim', () => {
  test('subtracts it from the closed client union', () => {
    type Left = Remaining<RenameError, 'NETWORK_ERROR', false>;
    expectTypeOf<CodeOf<Extract<Left, { defined: false }>>>().toEqualTypeOf<
      | Exclude<BuiltinErrorCode, 'NETWORK_ERROR' | 'STREAM_INTERRUPTED'>
      | UndeclaredCode
    >();
  });
});
