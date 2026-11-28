/** The showcase's post, its comments, and the people and teams they name. */
const comments = [
  { by: 'ada', id: 'c1', text: 'One request, nice.' },
  { by: 'bob', id: 'c2', text: 'And retries only redo what failed?' },
  { by: 'cy', id: 'c3', text: 'With the queries that read it.' },
];

/** The post every slug loads */
export const post = {
  authorId: 'dee',
  comments,
  title: 'Retrying part of a load',
};

export const users: Readonly<
  Record<string, { readonly avatarId: string; readonly name: string }>
> = {
  ada: { avatarId: 'owl', name: 'Ada' },
  bob: { avatarId: 'fox', name: 'Bob' },
  cy: { avatarId: 'cat', name: 'Cy' },
  dee: { avatarId: 'bee', name: 'Dee' },
};

export const avatars: Readonly<Record<string, string>> = {
  bee: '🐝',
  cat: '🐱',
  fox: '🦊',
  owl: '🦉',
};

export const teams: Readonly<Record<string, string>> = { core: 'Core team' };
