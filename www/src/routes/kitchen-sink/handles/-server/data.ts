/** The showcase's posts and their comments. */
export interface Post {
  readonly body: string;
  readonly id: string;
  readonly title: string;
}

export interface Comment {
  readonly author: string;
  readonly id: string;
  readonly text: string;
}

export const posts: ReadonlyArray<Post> = [
  {
    body: 'The loader starts every query the page needs, then hands each component a handle to its query.',
    id: '1',
    title: 'Load once, read anywhere',
  },
  {
    body: 'A handle is a query key and its input. It holds no data, so it is cheap to pass around as a prop.',
    id: '2',
    title: 'Handles hold no data',
  },
  {
    body: 'The data the server loaded reaches the browser with the page, so the browser does not ask for it again.',
    id: '3',
    title: 'No second fetch',
  },
];

export const comments: Readonly<Record<string, ReadonlyArray<Comment>>> = {
  '1': [
    { author: 'Ada', id: 'c1', text: 'One loader, no waterfall.' },
    { author: 'Linus', id: 'c2', text: 'And the input is typed.' },
  ],
  '2': [{ author: 'Grace', id: 'c3', text: 'Small props are nice props.' }],
  '3': [],
};
