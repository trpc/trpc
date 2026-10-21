// @vitest-environment happy-dom
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
} from '@tanstack/react-query';
import { httpLink } from '@trpc12/trpc/client';
import { createFetchHandler } from '@trpc12/trpc/server';
import { act, createElement as h, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, expectTypeOf, test, vi } from 'vite-plus/test';
import { createClient } from '../merge-errors/merge-errors.ts';
import { matchError } from '../shared/client.ts';
import type { TrpcFailure } from '../shared/framework.ts';
import {
  appRouter,
  AuthBoundary,
  errors,
  OfflineBoundary,
  postErrors,
  RootBoundary,
  useAuthBoundary,
} from './app.ts';
import { createErrorBoundary, createRegistryQueryUtils } from './boundaries.ts';

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const state: { user: string | null; online: boolean } = {
  user: 'ada',
  online: true,
};
const handler = createFetchHandler({
  router: appRouter,
  createContext: (opts) => ({
    user: opts.request.headers['authorization'] ?? null,
  }),
});
const client = createClient<typeof appRouter>({
  registry: errors,
  links: [
    httpLink({
      url: 'http://localhost/trpc',
      fetch: async (url, init) => {
        if (!state.online) throw new TypeError('fetch failed');
        const request = new Request(url, init);
        if (state.user !== null) {
          request.headers.set('authorization', state.user);
        }
        return handler.fetch(request);
      },
    }),
  ],
});
const trpc = createRegistryQueryUtils<typeof appRouter>(client);

type Tags<T> = T extends { readonly _tag: infer K } ? K : never;
type Framework = TrpcFailure['_tag'];

test('types: a posts call fails with the root registry, the posts module and tRPC', () => {
  function PostTitle() {
    const post = useQuery(trpc.posts.byId.queryOptions({ input: { id: '1' } }));
    expectTypeOf<Tags<NonNullable<typeof post.error>>>().toEqualTypeOf<
      'Unauthorized' | 'Forbidden' | 'PostNotFound' | 'TitleTaken' | Framework
    >();
    return null;
  }
  expect(PostTitle).toBeTypeOf('function');
});

test('types: under Auth, Offline and Root, only the posts module and BadResponse are left', () => {
  function PostTitle() {
    const post = useQuery(
      useAuthBoundary().query(
        trpc.posts.byId.queryOptions({ input: { id: '1' } }),
      ),
    );
    expectTypeOf<Tags<NonNullable<typeof post.error>>>().toEqualTypeOf<
      'PostNotFound' | 'TitleTaken' | 'BadResponse'
    >();
    return null;
  }
  expect(PostTitle).toBeTypeOf('function');
});

test("types: a fallback's error is what its boundary claims", () => {
  createErrorBoundary({
    name: 'Auth',
    errors,
    claims: ['Unauthorized', 'Forbidden'],
    fallback: (props) => {
      expectTypeOf(props.error).toEqualTypeOf<
        | InstanceType<(typeof errors)['Unauthorized']>
        | InstanceType<(typeof errors)['Forbidden']>
      >();
      return null;
    },
  });
  createErrorBoundary({
    name: 'Root',
    errors,
    claims: [],
    unexpected: true,
    fallback: (props) => {
      expectTypeOf<Tags<typeof props.error>>().toEqualTypeOf<
        Exclude<Framework, 'NetworkError' | 'BadResponse'>
      >();
      return null;
    },
  });
});

test('types: a claim the registry lacks is a type error', () => {
  createErrorBoundary({
    name: 'Auth',
    errors,
    // @ts-expect-error 'Unauthorised' is no tag of the registry
    claims: ['Unauthorised'],
    fallback: () => null,
  });
  createErrorBoundary({
    name: 'Posts',
    errors: postErrors,
    // @ts-expect-error a module's boundary only claims that module's tags
    claims: ['CardDeclined'],
    fallback: () => null,
  });
});

test('types: claiming a tag a call cannot fail with leaves its union as it is', () => {
  const [, useBilling] = createErrorBoundary({
    name: 'Billing',
    errors,
    claims: ['CardDeclined'],
    fallback: () => null,
  });
  function Rename() {
    const rename = useMutation(
      useBilling().mutation(trpc.posts.rename.mutationOptions()),
    );
    const plain = useMutation(trpc.posts.rename.mutationOptions());
    expectTypeOf(rename.error).toEqualTypeOf(plain.error);
    return null;
  }
  expect(Rename).toBeTypeOf('function');
});

test('types: matchError() under the boundaries needs only what is left', () => {
  function PostTitle() {
    const post = useQuery(
      useAuthBoundary().query(
        trpc.posts.byId.queryOptions({ input: { id: '1' } }),
      ),
    );
    if (!post.error) return null;
    // @ts-expect-error BadResponse has no handler
    matchError(post.error, {
      PostNotFound: (e) => e.data.id,
      TitleTaken: () => 'taken',
    });
    return matchError(post.error, {
      PostNotFound: (e) => e.data.id,
      TitleTaken: () => 'taken',
      BadResponse: () => 'try again',
    });
  }
  expect(PostTitle).toBeTypeOf('function');
});

function PostTitle(props: { id: string }) {
  const post = useQuery(
    useAuthBoundary().query(
      trpc.posts.byId.queryOptions({ input: { id: props.id } }),
    ),
  );
  if (post.error) {
    return h(
      'h1',
      { id: 'title' },
      matchError(post.error, {
        PostNotFound: (e) => `No post ${e.data.id}`,
        TitleTaken: () => 'Taken',
        BadResponse: () => 'Try again',
      }),
    );
  }
  return h('h1', { id: 'title' }, post.data?.title ?? 'loading');
}

function Rename(props: { title: string }) {
  const rename = useMutation(
    useAuthBoundary().mutation(trpc.posts.rename.mutationOptions()),
  );
  return h(
    'form',
    null,
    h('button', {
      id: 'rename',
      type: 'button',
      onClick: () => rename.mutate({ id: '1', title: props.title }),
    }),
    h(
      'p',
      { id: 'message' },
      rename.error
        ? matchError(rename.error, {
            PostNotFound: () => 'Gone',
            TitleTaken: (e) => `${e.data.title} is taken`,
            BadResponse: () => 'Try again',
          })
        : (rename.data?.title ?? ''),
    ),
  );
}

const boundaries = (children: ReactNode) =>
  h(
    RootBoundary,
    null,
    h(OfflineBoundary, null, h(AuthBoundary, null, children)),
  );

async function mount(ui: ReactNode) {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const el = document.createElement('div');
  document.body.append(el);
  const root = createRoot(el);
  await act(async () => {
    root.render(h(QueryClientProvider, { client: queryClient }, ui));
  });
  return {
    text: (selector: string) => el.querySelector(selector)?.textContent,
    click: (selector: string) =>
      act(async () => {
        el.querySelector<HTMLElement>(selector)?.click();
      }),
    settle: () => act(() => new Promise((resolve) => setTimeout(resolve, 30))),
    [Symbol.dispose]: () => {
      root.unmount();
      el.remove();
    },
  };
}

const reset = (user: string | null, online = true) => {
  state.user = user;
  state.online = online;
};

test('a module error the boundaries leave stays in the component', async () => {
  reset('ada');
  using ui = await mount(boundaries(h(PostTitle, { id: 'nope' })));
  await ui.settle();
  expect(ui.text('#title')).toBe('No post nope');
});

test('Unauthorized and Forbidden go to Auth, by tag', async () => {
  reset(null);
  using signedOut = await mount(boundaries(h(PostTitle, { id: '1' })));
  await signedOut.settle();
  expect(signedOut.text('#sign-in')).toBe('Unauthorized');

  reset('guest');
  using guest = await mount(boundaries(h(PostTitle, { id: '1' })));
  await guest.settle();
  expect(guest.text('#sign-in')).toBe('Forbidden');

  reset('ada');
  await guest.click('#sign-in-retry');
  await guest.settle();
  expect(guest.text('#title')).toBe('Hello');
});

test('NetworkError passes Auth and stops at Offline', async () => {
  reset('ada', false);
  using ui = await mount(boundaries(h(PostTitle, { id: '1' })));
  await ui.settle();
  expect(ui.text('#offline')).toBe('NetworkError');
});

test('a crash is Internal, one of the unexpected tags Root owns', async () => {
  reset('ada');
  using ui = await mount(boundaries(h(PostTitle, { id: 'crash' })));
  await ui.settle();
  expect(ui.text('#crashed')).toBe('Internal');
});

test("a mutation's module error stays on the form; Unauthorized replaces it", async () => {
  reset('ada');
  using ui = await mount(boundaries(h(Rename, { title: 'Taken' })));
  await ui.click('#rename');
  await ui.settle();
  expect(ui.text('#message')).toBe('Taken is taken');

  reset(null);
  await ui.click('#rename');
  await ui.settle();
  expect(ui.text('#sign-in')).toBe('Unauthorized');
});

test("an error from outside the call's scope passes every boundary, Root's included", async () => {
  reset('ada');
  function Leak() {
    const leak = useQuery(
      useAuthBoundary().query(
        trpc.posts.leak.queryOptions({ input: undefined }),
      ),
    );
    expectTypeOf<Tags<NonNullable<typeof leak.error>>>().toEqualTypeOf<
      'PostNotFound' | 'TitleTaken' | 'BadResponse'
    >();
    return h(
      'p',
      { id: 'leak' },
      leak.error ? `component got ${leak.error._tag}` : 'loading',
    );
  }
  using ui = await mount(boundaries(h(Leak)));
  await ui.settle();
  expect(ui.text('#crashed')).toBeUndefined();
  expect(ui.text('#leak')).toBe('component got CardDeclined');
});
