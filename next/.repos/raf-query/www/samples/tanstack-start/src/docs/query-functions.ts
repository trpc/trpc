import { infiniteQueryOptions, queryOptions } from "@raf-query/react";
import type { Todo } from "~/api.ts";

declare function fetchAllTodos(): Promise<ReadonlyArray<Todo>>;

declare function fetchTodoById(id: number): Promise<Todo>;

declare const id: number;

// #region intro
infiniteQueryOptions({
	getNextPageParam: (lastPage: {
		readonly items: ReadonlyArray<Todo>;
		readonly nextCursor: number | null;
	}) => lastPage.nextCursor,
	initialPageParam: 0,
	queryFn: async () => ({ items: await fetchAllTodos(), nextCursor: null }),
	queryKey: ["todos"],
});
queryOptions({ queryKey: ["todos", id], queryFn: () => fetchTodoById(id) });
queryOptions({
	queryKey: ["todos", id],
	queryFn: async () => {
		const data = await fetchTodoById(id);
		return data;
	},
});
queryOptions({
	queryKey: ["todos", id],
	queryFn: (context) => fetchTodoById(context.queryKey[1] as number),
});
// #endregion

declare const somethingGoesWrong: boolean;

declare const somethingElseGoesWrong: boolean;

declare const data: unknown;

// #region handling-and-throwing-errors
queryOptions({
	queryKey: ["todos", id],
	queryFn: async () => {
		if (somethingGoesWrong) {
			throw new Error("Oh no!");
		}
		if (somethingElseGoesWrong) {
			return Promise.reject(new Error("Oh no!"));
		}
		return data;
	},
});
// #endregion

// #region with-fetch-and-other-clients-that-dont-throw
queryOptions({
	queryKey: ["todos", id],
	queryFn: async (context) => {
		const response = await fetch(`/todos/${id}`, { signal: context.signal });
		if (!response.ok) {
			throw new Error(`Request failed: ${response.status}`);
		}
		return response.json();
	},
});
// #endregion
