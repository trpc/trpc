/** The showcase's blog: its teams, authors and posts. */
export interface Team {
  readonly id: string;
  readonly name: string;
}

export interface Author {
  readonly id: string;
  readonly name: string;
  readonly teamId: string;
}

export interface Post {
  readonly authorId: string;
  readonly slug: string;
  readonly title: string;
}

export const teams: ReadonlyArray<Team> = [
  { id: 't1', name: 'Core' },
  { id: 't2', name: 'Docs' },
  { id: 't3', name: 'Examples' },
];

export const authors: ReadonlyArray<Author> = [
  { id: 'ada', name: 'Ada', teamId: 't1' },
  { id: 'bob', name: 'Bob', teamId: 't2' },
  { id: 'cy', name: 'Cy', teamId: 't3' },
  { id: 'dee', name: 'Dee', teamId: 't1' },
  { id: 'eli', name: 'Eli', teamId: 't2' },
  { id: 'fay', name: 'Fay', teamId: 't3' },
];

export const posts: ReadonlyArray<Post> = [
  {
    authorId: 'ada',
    slug: 'pipelining',
    title: 'One request for a whole page',
  },
  { authorId: 'bob', slug: 'streams', title: 'Each result as it is ready' },
  { authorId: 'cy', slug: 'edges', title: 'Edges that settle by themselves' },
  {
    authorId: 'dee',
    slug: 'limits',
    title: 'What the server lets a request do',
  },
  { authorId: 'eli', slug: 'types', title: 'Types all the way down' },
  { authorId: 'fay', slug: 'fallback', title: 'When a link can’t pipeline' },
  { authorId: 'cy', slug: 'maps', title: 'A query for every item' },
  { authorId: 'bob', slug: 'settle', title: 'Waiting for every edge' },
];
