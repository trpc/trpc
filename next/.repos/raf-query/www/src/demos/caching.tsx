import { Skeleton } from "@examples/ui/components/skeleton";
import { cn } from "@examples/ui/lib/utils";
import {
	infiniteQueryOptions,
	type QueryHandle,
	useQuery,
} from "@raf-query/react";
import { use } from "react";

import { DemoBrowser, DemoLink } from "~/demo-kit/browser.tsx";
import { formatTime, Spinner } from "~/demo-kit/controls.tsx";
import { defineDemo } from "~/demo-kit/define.ts";
import { createFakeServer } from "~/demo-kit/server.ts";

interface Todo {
	readonly done: boolean;
	readonly id: number;
	readonly text: string;
}

const server = createFakeServer(() => ({
	todos: [
		{ done: true, id: 1, text: "Read about staleTime" },
		{ done: false, id: 2, text: "Watch an entry go inactive" },
		{ done: false, id: 3, text: "Wait out gcTime" },
	] satisfies ReadonlyArray<Todo>,
}));

interface TodoPage {
	readonly items: ReadonlyArray<Todo>;
	readonly nextCursor: number | null;
}

function todoNext(lastPage: TodoPage) {
	return lastPage.nextCursor;
}

function todosQuery() {
	return infiniteQueryOptions({
		gcTime: 10_000,
		getNextPageParam: todoNext,
		initialPageParam: 0,
		queryFn: (context) =>
			server.respond(
				"GET /todos",
				(db) => ({ items: db.todos, nextCursor: null }),
				context,
			),
		queryKey: ["todos"],
		staleTime: 5000,
	});
}

type PageData =
	| { readonly page: "about" }
	| { readonly page: "todos"; readonly todos: QueryHandle<typeof todosQuery> };

function TodosSkeleton() {
	return (
		<div className="grid gap-2">
			<Skeleton className="h-5 w-1/3" />
			<Skeleton className="h-8 w-full" />
			<Skeleton className="h-8 w-full" />
			<Skeleton className="h-8 w-full" />
		</div>
	);
}

function Todos(props: { readonly handle: QueryHandle<typeof todosQuery> }) {
	const [pagesPromise, todos] = useQuery(todosQuery, props.handle);
	const pages = use(pagesPromise);
	const list = pages.pages.flatMap((page) => page.items);
	return (
		<div aria-busy={todos.isFetching} className="grid gap-2">
			<p className="flex items-center gap-2 text-xs text-muted-foreground">
				Fetched at {formatTime(todos.updatedAt)}
				{todos.isFetching ? (
					<>
						<Spinner /> refetching in the background
					</>
				) : null}
			</p>
			<ul className="grid gap-1.5">
				{list.map((todo) => (
					<li
						className={cn(
							"rounded-md border px-3 py-1.5 text-sm",
							todo.done && "text-muted-foreground line-through",
						)}
						key={todo.id}
					>
						{todo.text}
					</li>
				))}
			</ul>
		</div>
	);
}

function Page(props: { readonly data: PageData }) {
	const data = props.data;
	return (
		<div className="grid gap-4">
			<nav className="flex gap-1 text-sm">
				{[
					{ label: "Todos", path: "/todos" },
					{ label: "About", path: "/about" },
				].map((link) => (
					<DemoLink
						className="rounded-md px-2.5 py-1 hover:bg-accent aria-[current=page]:bg-accent aria-[current=page]:font-medium"
						key={link.path}
						to={{ path: link.path }}
					>
						{link.label}
					</DemoLink>
				))}
			</nav>
			{data.page === "todos" ? (
				<Todos handle={data.todos} />
			) : (
				<p className="text-sm text-muted-foreground">
					Nothing here reads <code>{'["todos"]'}</code>, so its entry is
					inactive. Come back within 10 seconds to find it cached; wait longer
					and it’s garbage-collected.
				</p>
			)}
		</div>
	);
}

function Caching() {
	return (
		<DemoBrowser
			fallback={<TodosSkeleton />}
			initial={{ path: "/todos" }}
			loader={(args): PageData =>
				args.location.path === "/todos"
					? { page: "todos", todos: args.client.prefetch(todosQuery) }
					: { page: "about" }
			}
		>
			{(route) => <Page data={route.data} />}
		</DemoBrowser>
	);
}

export default defineDemo({
	Component: Caching,
	hint: "staleTime is 5 s and gcTime 10 s. Switch pages and watch the entry in the Queries panel go from fresh to stale, then inactive, and get removed.",
	server,
	title: "The life of a cache entry",
});
