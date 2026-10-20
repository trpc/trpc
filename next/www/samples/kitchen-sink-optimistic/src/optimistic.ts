import type { Todo } from './server.ts';
import type { AppContext } from './trpc.ts';

/**
 * Settles the list once the last todo mutation does: a refetch while
 * another is in flight would drop that one's optimistic change until it
 * lands.
 */
function settle(ctx: AppContext) {
  const others = ctx.queryClient.isMutating({
    mutationKey: ctx.trpc.todo.pathKey(),
  });
  return others > 1
    ? undefined
    : ctx.queryClient.invalidateQueries(ctx.trpc.todo.list.queryFilter());
}

// #region add
/**
 * Shows the new todo before the server has it, and takes it back if the
 * call fails. The list's key is typed, so `setQueryData` knows the cache
 * holds `Todo[]`, and what `onMutate` returns is what `onError` gets.
 */
export function addTodoOptions(ctx: AppContext) {
  const list = ctx.trpc.todo.list;
  return ctx.trpc.todo.add.mutationOptions({
    onMutate: async (input) => {
      // A refetch in flight would land on top of the optimistic list.
      await ctx.queryClient.cancelQueries(list.queryFilter());
      const previous = ctx.queryClient.getQueryData(list.queryKey());
      ctx.queryClient.setQueryData(list.queryKey(), (todos = []) => [
        ...todos,
        { id: input.id, text: input.text, done: false } satisfies Todo,
      ]);
      return { previous };
    },
    onError: (_err, _input, result) => {
      ctx.queryClient.setQueryData(list.queryKey(), result?.previous);
    },
    onSettled: () => settle(ctx),
  });
}
// #endregion add

/** Ticks a todo at once, and unticks it if the call fails. */
export function toggleTodoOptions(ctx: AppContext) {
  const list = ctx.trpc.todo.list;
  return ctx.trpc.todo.toggle.mutationOptions({
    onMutate: async (input) => {
      await ctx.queryClient.cancelQueries(list.queryFilter());
      const previous = ctx.queryClient.getQueryData(list.queryKey());
      ctx.queryClient.setQueryData(list.queryKey(), (todos) =>
        todos?.map((todo) =>
          todo.id === input.id ? { ...todo, done: input.done } : todo,
        ),
      );
      return { previous };
    },
    onError: (_err, _input, result) => {
      ctx.queryClient.setQueryData(list.queryKey(), result?.previous);
    },
    onSettled: () => settle(ctx),
  });
}
