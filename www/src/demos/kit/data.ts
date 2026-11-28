/** The demo blog's authors, posts and comments. */
export interface Post {
  readonly authorId: number;
  readonly body: string;
  readonly id: number;
  readonly minutes: number;
  readonly title: string;
}

export const authors = ['Ada', 'Grace', 'Linus', 'Margaret'] as const;

/** Ada, Grace and Linus write three posts each, three to a page of the list. */
export const posts: ReadonlyArray<Post> = [
  {
    authorId: 1,
    body: 'Start every query in the loader, and the page loads in one round trip.',
    id: 1,
    minutes: 4,
    title: 'Render as you fetch',
  },
  {
    authorId: 2,
    body: 'A handle names a query; the component that reads it needs nothing else.',
    id: 2,
    minutes: 3,
    title: 'Handles, explained',
  },
  {
    authorId: 3,
    body: 'Filters, sort and page belong in the URL, where the loader can see them.',
    id: 3,
    minutes: 5,
    title: 'The URL is the input',
  },
  {
    authorId: 1,
    body: "A loader's job is to start every query. Await only what the page can't render without.",
    id: 4,
    minutes: 3,
    title: 'Loaders start, components wait',
  },
  {
    authorId: 2,
    body: 'Type a prop with inferQueryHandle, and the component can only read the query it was given.',
    id: 5,
    minutes: 2,
    title: 'Typing props with handles',
  },
  {
    authorId: 3,
    body: 'When the page needs one query to start the next, change the procedure instead of the page.',
    id: 6,
    minutes: 6,
    title: 'Reshape the procedure, not the page',
  },
  {
    authorId: 1,
    body: 'Give each handle its own Suspense boundary, so one slow query never holds back the rest.',
    id: 7,
    minutes: 3,
    title: 'One boundary per handle',
  },
  {
    authorId: 2,
    body: 'A test can start a handle against a test QueryClient, with no server and no mocks.',
    id: 8,
    minutes: 4,
    title: 'Testing components that take handles',
  },
  {
    authorId: 3,
    body: 'A loader runs before the page renders, so the waterfall has nowhere to hide.',
    id: 9,
    minutes: 5,
    title: 'Where waterfalls come from',
  },
];

export const comments = [
  { body: 'Finally, no more spinners inside spinners.', postId: 1 },
  { body: 'The loader starts both? Neat.', postId: 1 },
  { body: 'So a handle is just a key and an input?', postId: 2 },
  { body: 'Yes. The data stays in the cache.', postId: 2 },
  { body: 'Shareable links for free.', postId: 3 },
  { body: 'Took our page from three spinners to one.', postId: 4 },
  { body: 'The type error caught a real bug for us.', postId: 5 },
  { body: 'We moved the slug lookup to the server. Much faster.', postId: 6 },
].map((comment, index) => ({
  ...comment,
  author: authors[(index + 1) % authors.length] ?? 'Ada',
  id: index + 1,
}));
