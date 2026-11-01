import { initTrpc } from '@trpc12/trpc/server';

export interface User {
  id: string;
  name: string;
}

const users: User[] = [
  { id: 'ada', name: 'Ada Lovelace' },
  { id: 'grace', name: 'Grace Hopper' },
  { id: 'linus', name: 'Linus Torvalds' },
];

const t = initTrpc();

/**
 * A second API, as if run by another team: the browser caches it in the same
 * `QueryClient` under the `directory` key prefix.
 */
export const directoryRouter = t.router({
  user: {
    list: t.procedure.query(() => users),
  },
});
export type DirectoryRouter = typeof directoryRouter;
