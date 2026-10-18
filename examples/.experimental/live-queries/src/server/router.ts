import { initTRPC } from '@trpc/server';
import { z } from 'zod';
import { parseVersion } from '../protocol';
import { createLiveMux, liveFeed } from './liveMux';
import { LiveTable } from './liveTable';
import { trackLive } from './trackLive';

export interface Todo {
  id: string;
  listId: string;
  text: string;
  done: boolean;
}

export interface User {
  id: number;
  name: string;
}

const todoSchema = z.object({
  id: z.string(),
  listId: z.string(),
  text: z.string(),
  done: z.boolean(),
});

const todoFilter = z.object({ listId: z.string().optional() });

const byList = (listId: string | undefined) =>
  listId === undefined ? undefined : (todo: Todo) => todo.listId === listId;

export function createDb(opts?: { historySize?: number }) {
  return {
    todos: new LiveTable<Todo, string>({
      getKey: (todo) => todo.id,
      historySize: opts?.historySize,
      initialRows: [
        { id: 't1', listId: 'a', text: 'Write the spike', done: true },
        { id: 't2', listId: 'a', text: 'Record proposals', done: false },
        { id: 't3', listId: 'b', text: 'Ship it', done: false },
      ],
    }),
    users: new LiveTable<User, number>({
      getKey: (user) => user.id,
      historySize: opts?.historySize,
      initialRows: [
        { id: 1, name: 'Alex' },
        { id: 2, name: 'Nick' },
      ],
    }),
  };
}

export type Db = ReturnType<typeof createDb>;

export function createAppRouter(db: Db) {
  const t = initTRPC.create();

  /** Observability hooks for tests and demos */
  const stats = {
    openMuxStreams: 0,
    feedStarts: [] as { feed: string; since: number | null }[],
    liveStarts: [] as (number | null)[],
  };

  const liveMux = createLiveMux({
    todos: liveFeed({
      input: todoFilter,
      resolve: ({ input, since, signal }) => {
        stats.feedStarts.push({ feed: 'todos', since });
        return db.todos.live({ since, signal, where: byList(input.listId) });
      },
    }),
    users: liveFeed({
      input: z.object({}),
      resolve: ({ since, signal }) => {
        stats.feedStarts.push({ feed: 'users', since });
        return db.users.live({ since, signal });
      },
    }),
  });

  const router = t.router({
    todos: t.router({
      list: t.procedure
        .input(todoFilter)
        .query(({ input }) => db.todos.rows(byList(input.listId))),

      live: t.procedure
        .input(todoFilter.extend({ lastEventId: z.string().nullish() }))
        .subscription(({ input, signal }) => {
          const since = parseVersion(input.lastEventId);
          stats.liveStarts.push(since);
          return trackLive(
            db.todos.live({ since, signal: signal!, where: byList(input.listId) }),
          );
        }),

      create: t.procedure.input(z.array(todoSchema)).mutation(({ input }) => ({
        version: db.todos.mutate((tx) => input.forEach((todo) => tx.insert(todo))),
      })),

      update: t.procedure
        .input(
          z.array(z.object({ id: z.string(), patch: todoSchema.partial() })),
        )
        .mutation(({ input }) => ({
          version: db.todos.mutate((tx) =>
            input.forEach(({ id, patch }) => tx.update(id, patch)),
          ),
        })),

      delete: t.procedure.input(z.array(z.string())).mutation(({ input }) => ({
        version: db.todos.mutate((tx) => input.forEach((id) => tx.delete(id))),
      })),
    }),

    live: t.procedure
      .input(liveMux.input)
      .subscription(async function* (opts) {
        stats.openMuxStreams++;
        try {
          yield* liveMux.stream(opts);
        } finally {
          stats.openMuxStreams--;
        }
      }),
  });

  return { router, stats };
}

export type AppRouter = ReturnType<typeof createAppRouter>['router'];
