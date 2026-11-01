import { createFetchHandler, initTrpc } from '@trpc12/trpc/server';
import { z } from 'zod';

export interface Todo {
  readonly id: string;
  readonly text: string;
  readonly done: boolean;
}

// The demo's database lives in memory, in this page: each edit to the code
// starts it over.
const db = {
  todos: [
    { id: 'seed-1', text: 'Read the tRPC docs', done: true },
    { id: 'seed-2', text: 'Try Fail next request', done: false },
  ] as Array<Todo>,
};

const t = initTrpc();

// #region router
export const appRouter = t.router({
  todo: {
    list: t.procedure.query(() => db.todos),
    add: t.procedure
      .input(
        z.object({
          // The client picks the id, so its optimistic row is the one the
          // server keeps.
          id: z.string(),
          // Only the server checks it: the browser shows the todo at once,
          // and takes it back when this fails.
          text: z
            .string()
            .trim()
            .min(1, 'Write something to do')
            .max(30, 'At most 30 characters'),
        }),
      )
      .mutation((opts) => {
        const todo: Todo = { ...opts.input, done: false };
        db.todos.push(todo);
        return todo;
      }),
    toggle: t.procedure
      .input(z.object({ id: z.string(), done: z.boolean() }))
      .mutation((opts) => {
        db.todos = db.todos.map((todo) =>
          todo.id === opts.input.id ? { ...todo, done: opts.input.done } : todo,
        );
      }),
  },
});

export type AppRouter = typeof appRouter;
// #endregion router

export const handler = createFetchHandler({ router: appRouter });
