import {
  useInfiniteQuery,
  useMutation,
  useQueries,
  useQuery,
  useSuspenseQuery,
} from '@tanstack/react-query';
import {
  matchError,
  type RouterType,
  type BuiltinErrorCode,
  type UndeclaredCode,
} from '@trpc12/trpc/client';
import type { inferQueryHandle } from '@trpc12/tanstack-query';
import { createElement } from 'react';
import { describe, expectTypeOf, test } from 'vite-plus/test';
import {
  createErrorBoundary,
  type ErrorsOf,
  type Unclaimed,
} from './error-boundary.ts';
import {
  AuthBoundary,
  type createApp,
  makeClient,
  RootBoundary,
  type router,
  useAuthBoundary,
  useOfflineBoundary,
  useRootBoundary,
  useStaleBoundary,
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

  test('a handle reads with the same narrowing', () => {
    const handle = {} as inferQueryHandle<typeof app.trpc.doc.byId>;
    const read = () =>
      useSuspenseQuery(useAuthBoundary().query(app.trpc.$fromHandle(handle)));
    expectTypeOf<ErrorOf<ReturnType<typeof read>>>().toEqualTypeOf<DocError>();
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
    type Left = Unclaimed<RenameError, 'NETWORK_ERROR', false>;
    expectTypeOf<CodeOf<Extract<Left, { defined: false }>>>().toEqualTypeOf<
      | Exclude<BuiltinErrorCode, 'NETWORK_ERROR' | 'STREAM_INTERRUPTED'>
      | UndeclaredCode
    >();
  });
});

type TagOf<E> = E extends { readonly _tag: infer T } ? T : never;

describe('each fallback gets exactly the errors its claim takes', () => {
  test('a code: every error with it, defined or not', () => {
    createErrorBoundary({
      name: 'Auth',
      errors: makeClient,
      claims: {
        UNAUTHORIZED: (props) => {
          expectTypeOf(props.error.code).toEqualTypeOf<'UNAUTHORIZED'>();
          expectTypeOf(props.error._tag).toEqualTypeOf<'Unauthorized'>();
          expectTypeOf(props.error.defined).toEqualTypeOf<boolean>();
          expectTypeOf(props.reset).toEqualTypeOf<() => void>();
          return null;
        },
      },
    });
  });

  test('a tag: that failure alone, and the code claim gets the rest', () => {
    createErrorBoundary({
      name: 'Missing',
      errors: makeClient,
      claims: {
        ProcedureNotFound: (props) => {
          expectTypeOf(props.error._tag).toEqualTypeOf<'ProcedureNotFound'>();
          expectTypeOf(props.error.defined).toEqualTypeOf<false>();
          return null;
        },
        NOT_FOUND: (props) => {
          expectTypeOf<TagOf<typeof props.error>>().toEqualTypeOf<'NotFound'>();
          return null;
        },
      },
    });
  });

  test("a custom code's data is the procedure's", () => {
    createErrorBoundary({
      name: 'Title',
      errors: makeClient,
      claims: {
        TITLE_TAKEN: (props) => {
          expectTypeOf(props.error.code).toEqualTypeOf<'TITLE_TAKEN'>();
          return null;
        },
      },
    });
  });

  test("unexpected's is unknown: it takes any throw", () => {
    createErrorBoundary({
      name: 'Root',
      errors: makeClient,
      claims: {
        unexpected: (props) => {
          expectTypeOf(props.error).toBeUnknown();
          return null;
        },
      },
    });
  });

  test('a claim nothing fails with is a type error', () => {
    createErrorBoundary({
      name: 'Typo',
      errors: makeClient,
      // @ts-expect-error no call fails with UNAUTHORISED
      claims: { UNAUTHORISED: () => null },
    });
  });

  test('a routerType() value names the errors too', () => {
    expectTypeOf<
      Extract<CodeOf<ErrorsOf<RouterType<typeof router>>>, 'TITLE_TAKEN'>
    >().toEqualTypeOf<'TITLE_TAKEN'>();
  });
});

describe("the component's props", () => {
  test("onError gets the boundary's own claims", () => {
    createElement(AuthBoundary, {
      resetKeys: ['ada'],
      onReset: (details) => {
        expectTypeOf(details.reason).toEqualTypeOf<'reset' | 'keys'>();
      },
      onError: (error, info) => {
        expectTypeOf(error.code).toEqualTypeOf<'UNAUTHORIZED'>();
        expectTypeOf(info.componentStack).toEqualTypeOf<
          string | null | undefined
        >();
      },
    });
    createElement(RootBoundary, {
      onError: (error) => expectTypeOf(error).toBeUnknown(),
    });
  });
});

describe('a tag claim', () => {
  test("takes one failure: the doc's own NOT_FOUND stays", () => {
    const doc = () => useQuery(useStaleBoundary().query(byIdOptions()));
    type DocError = ErrorOf<ReturnType<typeof doc>>;
    expectTypeOf<
      TagOf<Extract<DocError, { code: 'NOT_FOUND' }>>
    >().toEqualTypeOf<'NotFound'>();
  });
});
