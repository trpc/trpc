// #region loader
import { type QueryHandle, useQuery } from "@raf-query/react";
import { createFileRoute } from "@tanstack/react-router";
import { Suspense, use } from "react";

import { todosQuery } from "~/queries.ts";

export const Route = createFileRoute("/todos")({
	loader: (args) => ({
		todos: args.context.queryClient.prefetch(todosQuery),
	}),
	component: TodosPage,
});
// #endregion

// #region component
function TodosPage() {
	const loaderData = Route.useLoaderData();
	return (
		<Suspense fallback={<p>Loading…</p>}>
			<TodoList handle={loaderData.todos} />
		</Suspense>
	);
}

function TodoList(props: { handle: QueryHandle<typeof todosQuery> }) {
	const [pagesPromise, todosState] = useQuery(todosQuery, props.handle);
	const pages = use(pagesPromise);
	return (
		<ul aria-busy={todosState.isFetching}>
			{pages.pages
				.flatMap((page) => page.items)
				.map((todo) => (
					<li key={todo.id}>{todo.title}</li>
				))}
		</ul>
	);
}
// #endregion
