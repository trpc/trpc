/** The `/posts?sort=…&page=…` page of the "URL is the input" demo. */
export type Sort = 'new' | 'top';

export interface ListInput {
  readonly page: number;
  readonly sort: Sort;
}

export const defaultInput: ListInput = { page: 1, sort: 'new' };

export const lastPage = 5;

/**
 * Reads what the loader would see in `url`, the way `validateSearch` would:
 * anything missing or invalid falls back to the default.
 */
export function parseListUrl(url: string): ListInput {
  let parsed: URL;
  try {
    parsed = new URL(url.trim() || '/', 'https://example.com');
  } catch {
    return defaultInput;
  }
  const sort = parsed.searchParams.get('sort');
  const page = Number(parsed.searchParams.get('page'));
  return {
    page:
      Number.isInteger(page) && page >= 1 && page <= lastPage
        ? page
        : defaultInput.page,
    sort: sort === 'top' || sort === 'new' ? sort : defaultInput.sort,
  };
}

export function listUrl(input: Pick<ListInput, 'page'> & Partial<ListInput>) {
  const search = new URLSearchParams();
  if (input.sort !== undefined) {
    search.set('sort', input.sort);
  }
  search.set('page', String(input.page));
  return `/posts?${search.toString()}`;
}

/** The input as it'd be written in the call, `{ sort: 'top', page: 2 }`. */
export function formatInput(input: Partial<ListInput>) {
  const fields = [
    input.sort === undefined ? null : `sort: '${input.sort}'`,
    input.page === undefined ? null : `page: ${input.page}`,
  ].filter((field) => field !== null);
  return `{ ${fields.join(', ')} }`;
}

export function inputKey(input: ListInput) {
  return `${input.sort}:${input.page}`;
}

const titles = [
  'Typesafe APIs without codegen',
  'Streaming responses over HTTP',
  'Subscriptions with server-sent events',
  'Handles in TanStack Start',
  'Testing procedures with createCaller',
  'Batching requests with httpBatchLink',
  'Errors that keep their types',
  'Middlewares for auth',
  'Moving from REST',
  'Server components and the query client',
  'Infinite queries with cursors',
  'Data transformers and Dates',
  'Caching with staleTime',
  'Validating input with Zod',
  'Links, from the client to the server',
];

/** The posts a page shows: the same titles, ordered by `sort`. */
export function listPosts(input: ListInput) {
  const perPage = 3;
  const ordered = titles.map((title, index) => ({
    title,
    votes: ((index * 37) % 50) + 3,
  }));
  if (input.sort === 'top') {
    ordered.sort((a, b) => b.votes - a.votes);
  }
  return ordered.slice((input.page - 1) * perPage, input.page * perPage);
}
