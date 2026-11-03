import {
  dehydrate,
  hydrate,
  type DehydratedState,
  MutationObserver,
  onlineManager,
  QueryClient,
} from '@tanstack/react-query';
import {
  createTrpcQueryUtils,
  hydrationOptions,
} from '@trpc12/tanstack-react-query';
import {
  createTrpcClient,
  dedupeLink,
  httpLink,
  localLink,
  routerType,
} from '@trpc12/trpc/client';
import { expect, test } from 'vite-plus/test';
import { directoryRouter } from './server/directory.ts';
import type { trackerRouter } from './server/tracker.ts';
import { isDraft, listOptions, registerIssueMutations } from './src/issues.ts';
import { transformer } from './src/transformer.ts';
import { tracker as trackerApi } from './server/api.ts';

// The app's links, with `fetch` calling the API handler in process; the
// test's helpers then have the same type as the app's, httpLink's errors
// included.
const client = createTrpcClient({
  router: routerType<typeof trackerRouter>(),
  links: [
    dedupeLink(),
    httpLink({
      url: 'http://localhost/trpc',
      batch: { maxItems: 100 },
      transformer,
      fetch: (input, init) => trackerApi.fetch(new Request(input, init)),
    }),
  ],
});
const trpc = createTrpcQueryUtils({ client });
const directory = createTrpcQueryUtils({
  client: createTrpcClient({
    router: routerType<typeof directoryRouter>(),
    links: [localLink({ router: directoryRouter, transformer })],
  }),
  keyPrefix: 'directory',
});

const offline = (): Disposable => {
  onlineManager.setOnline(false);
  return { [Symbol.dispose]: () => onlineManager.setOnline(true) };
};

test('an issue created offline shows as a draft, persists, and is created after a reload', async () => {
  const list = listOptions(trpc);
  const hydration = hydrationOptions({ client });
  const before = new QueryClient();
  registerIssueMutations(before, trpc);
  await before.infiniteQuery(list);

  let state: Partial<DehydratedState> = {};
  {
    using _offline = offline();
    void new MutationObserver(before, trpc.issue.create.mutationOptions())
      .mutate({ title: 'Written offline' })
      .catch(() => {});
    await new Promise((resolve) => setTimeout(resolve));
    const [draft] = before.getQueryData(list.queryKey)?.pages[0]?.items ?? [];
    expect(draft?.title).toBe('Written offline');
    expect(draft && isDraft(draft)).toBe(true);
    expect(before.getMutationCache().getAll()[0]?.state.isPaused).toBe(true);
    // Persisted as the app does (`src/trpc.tsx`): through the transformer,
    // which keeps the first page's `undefined` cursor that plain JSON makes
    // `null`.
    state = JSON.parse(
      JSON.stringify(
        dehydrate(before, { serializeData: hydration.dehydrate.serializeData }),
      ),
    );
  }

  // A new page: the mutation has only its key and variables, and resumes
  // with the function registered for that key.
  const after = new QueryClient();
  registerIssueMutations(after, trpc);
  hydrate(after, state, { defaultOptions: hydration.hydrate });
  await after.resumePausedMutations();
  expect(after.getMutationCache().getAll()[0]?.state.status).toBe('success');
  const page = await after.infiniteQuery(list);
  expect(page.pages[0]?.items[0]).toMatchObject({
    title: 'Written offline',
    number: 13,
  });
});

test('an equal refetch keeps the cached objects, Dates included', async () => {
  const queryClient = new QueryClient();
  const options = trpc.issue.byId.queryOptions({ input: { id: '1' } });
  const first = await queryClient.query(options);
  await queryClient.refetchQueries(trpc.issue.byId.queryFilter());
  expect(first.createdAt).toBeInstanceOf(Date);
  expect(queryClient.getQueryData(options.queryKey)).toBe(first);
});

test('the directory key prefix keeps its queries apart from the tracker', async () => {
  const queryClient = new QueryClient();
  await queryClient.query(trpc.issue.byId.queryOptions({ input: { id: '1' } }));
  await queryClient.query(directory.user.list.queryOptions());
  expect(directory.user.list.queryKey()[0]).toEqual([
    'directory',
    'user',
    'list',
  ]);

  await queryClient.invalidateQueries(directory.pathFilter());
  const invalidated = queryClient
    .getQueryCache()
    .getAll()
    .map((query) => [query.queryKey[0], query.state.isInvalidated]);
  expect(invalidated).toEqual([
    [['issue', 'byId'], false],
    [['directory', 'user', 'list'], true],
  ]);
});
