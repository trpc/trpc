import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import type { Issue } from '../server/tracker.ts';
import type { Tracker } from './trpc.tsx';

export const pageSize = 5;

type Page = { items: Issue[]; nextCursor: number | null };
type Pages = InfiniteData<Page, number | undefined>;

/** The issue list, `pageSize` at a time, newest first. */
export const listOptions = (trpc: Tracker) =>
  trpc.issue.list.infiniteOptions({
    input: (cursor) => ({ cursor, limit: pageSize }),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });

/** A created issue the server hasn't confirmed yet has a `draft-` id. */
export const isDraft = (issue: Issue) => issue.id.startsWith('draft-');

export const updateIssues = (
  pages: Pages | undefined,
  update: (items: Issue[], pageIndex: number) => Issue[],
): Pages | undefined =>
  pages && {
    ...pages,
    pages: pages.pages.map((page, i) => ({
      ...page,
      items: update(page.items, i),
    })),
  };

/**
 * `issue.create` is registered as a default for its key, so a mutation
 * queued offline and persisted can resume after a reload: the restored
 * mutation only has its key and variables, and gets the function and the
 * callbacks from here. Components call
 * `useMutation(trpc.issue.create.mutationOptions())`.
 */
export function registerIssueMutations(
  queryClient: QueryClient,
  trpc: Tracker,
) {
  const list = listOptions(trpc);
  const create = trpc.issue.create.mutationOptions({
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: list.queryKey });
      const draft: Issue = {
        id: `draft-${crypto.randomUUID()}`,
        number: 0,
        title: input.title,
        status: 'open',
        assigneeId: null,
        createdAt: new Date(),
      };
      queryClient.setQueryData(list.queryKey, (pages) =>
        updateIssues(pages, (items, i) =>
          i === 0 ? [draft, ...items] : items,
        ),
      );
    },
    // Success or failure, the server's list replaces the draft.
    onSettled: () => queryClient.invalidateQueries(trpc.issue.pathFilter()),
  });
  queryClient.setMutationDefaults(create.mutationKey, create);
}
