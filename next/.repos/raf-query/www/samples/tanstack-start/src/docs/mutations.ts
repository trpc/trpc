import { QueryClient } from "@raf-query/react";
import { todosQuery } from "~/queries.ts";
import { updatePost } from "~/api.ts";
import { postQuery } from "~/queries.ts";

declare function toggleTodoApi(id: number): Promise<void>;

const qc = new QueryClient();

const api = { toggleTodo: toggleTodoApi };

// #region optimistic-updates-in-the-cache
async function toggleTodo(id: number) {
	const previous = qc.getData(todosQuery);
	qc.setData(todosQuery, undefined, (data) => ({
		pageParams: data?.pageParams ?? [],
		pages: (data?.pages ?? []).map((page) => ({
			...page,
			items: page.items.map((todo) =>
				todo.id === id ? { ...todo, done: !todo.done } : todo,
			),
		})),
	}));
	try {
		await api.toggleTodo(id);
	} catch (error) {
		qc.setData(
			todosQuery,
			undefined,
			previous ?? { pageParams: [], pages: [] },
		);
		throw error;
	} finally {
		await qc.invalidate(todosQuery);
	}
}
// #endregion

declare const slug: string;

declare const title: string;

// #region updates-from-mutation-responses
const updated = await updatePost({ slug, title });
qc.setData(postQuery, { slug }, updated);
// #endregion
