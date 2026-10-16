import { Button } from "@examples/ui/components/button";
import { Input } from "@examples/ui/components/input";
import { Skeleton } from "@examples/ui/components/skeleton";
import { cn } from "@examples/ui/lib/utils";
import {
	infiniteQueryOptions,
	type QueryHandleWithData,
	useQuery,
	useQueryClient,
} from "@raf-query/react";
import { useActionState, useOptimistic } from "react";
import { useFormStatus } from "react-dom";

import { DemoBrowser } from "~/demo-kit/browser.tsx";
import { FailNextButton, Spinner } from "~/demo-kit/controls.tsx";
import { defineDemo } from "~/demo-kit/define.ts";
import { createFakeServer } from "~/demo-kit/server.ts";

interface Todo {
	readonly id: number;
	readonly pending?: boolean;
	readonly text: string;
}

function seedTodos(): Array<Todo> {
	return [
		{ id: 1, text: "Write the action" },
		{ id: 2, text: "Add useOptimistic" },
	];
}

const server = createFakeServer(() => ({ todos: seedTodos() }));

interface TodoPage {
	readonly items: ReadonlyArray<Todo>;
	readonly nextCursor: number | null;
}

function todoNext(lastPage: TodoPage) {
	return lastPage.nextCursor;
}

function todosQuery() {
	return infiniteQueryOptions({
		getNextPageParam: todoNext,
		initialPageParam: 0,
		queryFn: (context) =>
			server.respond(
				"GET /todos",
				(db) => ({ items: db.todos, nextCursor: null }),
				context,
			),
		queryKey: ["todos"],
	});
}

function addTodo(text: string) {
	return server.respond(`POST /todos "${text}"`, (db) => {
		const todo = {
			id: Math.max(0, ...db.todos.map((item) => item.id)) + 1,
			text,
		};
		db.todos.push(todo);
		return todo;
	});
}

interface PageData {
	readonly todos: QueryHandleWithData<typeof todosQuery>;
}

function SubmitButton() {
	const status = useFormStatus();
	return (
		<Button disabled={status.pending} size="sm" type="submit">
			{status.pending ? <Spinner className="text-current" /> : null}
			Add
		</Button>
	);
}

function TodoList(props: {
	readonly handle: QueryHandleWithData<typeof todosQuery>;
}) {
	const qc = useQueryClient();
	const [pages] = useQuery(todosQuery, props.handle);
	const serverTodos = pages.pages.flatMap((page) => page.items);
	const [todos, addOptimistic] = useOptimistic<ReadonlyArray<Todo>, string>(
		serverTodos,
		(current, text) => [
			...current,
			{ id: -current.length - 1, pending: true, text },
		],
	);
	const [message, formAction] = useActionState<string | null, FormData>(
		async (_previous, formData) => {
			const text = String(formData.get("text")).trim();
			if (!text) {
				return "Write something first.";
			}
			addOptimistic(text);
			try {
				await addTodo(text);
			} catch (error) {
				return error instanceof Error ? error.message : "Something went wrong";
			}
			await qc.invalidate(todosQuery);
			return null;
		},
		null,
	);

	return (
		<div className="grid gap-3">
			<ul className="grid gap-1.5">
				{todos.map((todo) => (
					<li
						className={cn(
							"flex items-center justify-between rounded-md border px-3 py-1.5 text-sm",
							todo.pending && "border-dashed text-muted-foreground",
						)}
						key={todo.id}
					>
						{todo.text}
						{todo.pending ? (
							<span className="flex items-center gap-1.5 text-xs">
								<Spinner /> saving
							</span>
						) : null}
					</li>
				))}
			</ul>
			<form action={formAction} className="flex gap-2">
				<Input aria-label="New todo" name="text" placeholder="Add a todo" />
				<SubmitButton />
			</form>
			{message ? (
				<p className="text-sm text-destructive" role="alert">
					{message}
				</p>
			) : null}
		</div>
	);
}

function OptimisticUpdates() {
	return (
		<div className="grid gap-3">
			<div>
				<FailNextButton server={server} />
			</div>
			<DemoBrowser
				fallback={<Skeleton className="h-24 w-full" />}
				initial={{ path: "/todos" }}
				loader={async (args): Promise<PageData> => ({
					todos: await args.client.ensure(todosQuery),
				})}
			>
				{(route) => <TodoList handle={route.data.todos} />}
			</DemoBrowser>
		</div>
	);
}

export default defineDemo({
	Component: OptimisticUpdates,
	hint: "Add a todo: it appears at once, dashed, until the server confirms and the list refetches. Make the next request fail to watch it roll back on its own.",
	server,
	title: "Optimistic updates with useOptimistic",
});
