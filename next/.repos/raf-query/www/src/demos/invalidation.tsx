import { Button } from "@examples/ui/components/button";
import { Skeleton } from "@examples/ui/components/skeleton";
import { cn } from "@examples/ui/lib/utils";
import {
	type QueryCache,
	infiniteQueryOptions,
	type QueryHandle,
	useQuery,
	useQueryClient,
} from "@raf-query/react";
import { Suspense, use, useTransition } from "react";

import { DemoBrowser } from "~/demo-kit/browser.tsx";
import { formatTime, Spinner } from "~/demo-kit/controls.tsx";
import { defineDemo } from "~/demo-kit/define.ts";
import { createFakeServer } from "~/demo-kit/server.ts";

type Status = "all" | "done";

const server = createFakeServer(() => ({
	todos: [
		{ done: true, text: "Pick a key" },
		{ done: false, text: "Invalidate by prefix" },
		{ done: true, text: "Match exactly" },
		{ done: false, text: "Try a predicate" },
	],
	users: ["Ada", "Grace", "Linus"],
}));

interface StringPage {
	readonly items: ReadonlyArray<string>;
	readonly nextCursor: number | null;
}

function pageNext(lastPage: StringPage) {
	return lastPage.nextCursor;
}

function todosQuery(input: { readonly status: Status }) {
	return infiniteQueryOptions({
		getNextPageParam: pageNext,
		initialPageParam: 0,
		queryFn: (context) =>
			server.respond(
				`GET /todos?status=${input.status}`,
				(db) => ({
					items: db.todos
						.filter((todo) => input.status === "all" || todo.done)
						.map((todo) => todo.text),
					nextCursor: null,
				}),
				context,
			),
		queryKey: ["todos", input],
		staleTime: Infinity,
	});
}

function usersQuery() {
	return infiniteQueryOptions({
		getNextPageParam: pageNext,
		initialPageParam: 0,
		queryFn: (context) =>
			server.respond(
				"GET /users",
				(db) => ({ items: db.users, nextCursor: null }),
				context,
			),
		queryKey: ["users"],
		staleTime: Infinity,
	});
}

interface PageData {
	readonly all: QueryHandle<typeof todosQuery>;
	readonly done: QueryHandle<typeof todosQuery>;
	readonly users: QueryHandle<typeof usersQuery>;
}

function ListCard(props: {
	readonly items: Promise<{
		readonly pages: ReadonlyArray<{ readonly items: ReadonlyArray<string> }>;
	}>;
}) {
	const pages = use(props.items);
	return (
		<ul className="grid gap-1 text-sm">
			{pages.pages
				.flatMap((page) => page.items)
				.map((item) => (
					<li className="truncate" key={item}>
						{item}
					</li>
				))}
		</ul>
	);
}

function Card(props: {
	readonly fetching: boolean;
	readonly items: Promise<{
		readonly pages: ReadonlyArray<{ readonly items: ReadonlyArray<string> }>;
	}>;
	readonly label: string;
	readonly updatedAt: number;
}) {
	return (
		<section
			aria-busy={props.fetching}
			className={cn(
				"grid content-start gap-2 rounded-lg border p-3 transition-colors",
				props.fetching && "border-sky-500/60 bg-sky-500/5",
			)}
		>
			<h4 className="flex items-center justify-between gap-2 font-mono text-xs">
				{props.label}
				{props.fetching ? <Spinner /> : null}
			</h4>
			<Suspense
				fallback={
					<div className="grid gap-1">
						<Skeleton className="h-4 w-full" />
						<Skeleton className="h-4 w-2/3" />
					</div>
				}
			>
				<ListCard items={props.items} />
			</Suspense>
			<p className="text-[11px] text-muted-foreground tabular-nums">
				{props.updatedAt ? `Fetched ${formatTime(props.updatedAt)}` : "Loading"}
			</p>
		</section>
	);
}

function TodosCard(props: {
	readonly handle: QueryHandle<typeof todosQuery>;
	readonly label: string;
}) {
	const [todos, state] = useQuery(todosQuery, props.handle);
	return (
		<Card
			fetching={state.isFetching}
			items={todos}
			label={props.label}
			updatedAt={state.updatedAt}
		/>
	);
}

function UsersCard(props: { readonly handle: QueryHandle<typeof usersQuery> }) {
	const [users, state] = useQuery(usersQuery, props.handle);
	return (
		<Card
			fetching={state.isFetching}
			items={users}
			label='["users"]'
			updatedAt={state.updatedAt}
		/>
	);
}

const actions: ReadonlyArray<{
	readonly code: string;
	readonly filter: QueryCache.Filter;
}> = [
	{ code: '{ queryKey: ["todos"] }', filter: { queryKey: ["todos"] } },
	{
		code: '{ queryKey: ["todos", { status: "done" }] }',
		filter: { queryKey: ["todos", { status: "done" }] },
	},
	{
		code: '{ queryKey: ["todos"], exact: true }',
		filter: { exact: true, queryKey: ["todos"] },
	},
	{ code: "{}", filter: {} },
];

function InvalidateButtons() {
	const qc = useQueryClient();
	const [isPending, startTransition] = useTransition();
	return (
		<div className="grid gap-1.5">
			{actions.map((action) => (
				<Button
					className="h-auto justify-start py-1 font-mono text-xs whitespace-normal"
					disabled={isPending}
					key={action.code}
					onClick={() => {
						startTransition(async () => {
							await qc.invalidate(action.filter);
						});
					}}
					size="sm"
					variant="outline"
				>
					invalidate({action.code})
				</Button>
			))}
		</div>
	);
}

function Page(props: { readonly data: PageData }) {
	return (
		<div className="grid gap-3">
			<div className="grid gap-2 sm:grid-cols-3">
				<TodosCard
					handle={props.data.all}
					label='["todos", { status: "all" }]'
				/>
				<TodosCard
					handle={props.data.done}
					label='["todos", { status: "done" }]'
				/>
				<UsersCard handle={props.data.users} />
			</div>
			<InvalidateButtons />
		</div>
	);
}

function Invalidation() {
	return (
		<DemoBrowser
			fallback={<Skeleton className="h-40 w-full" />}
			initial={{ path: "/dashboard" }}
			loader={(args): PageData => ({
				all: args.client.prefetch(todosQuery, { status: "all" }),
				done: args.client.prefetch(todosQuery, { status: "done" }),
				users: args.client.prefetch(usersQuery),
			})}
		>
			{(route) => <Page data={route.data} />}
		</DemoBrowser>
	);
}

export default defineDemo({
	Component: Invalidation,
	hint: 'Every query here has staleTime: Infinity, so nothing refetches until it\'s invalidated. Try each filter and see which lists refetch. The exact one matches nothing: no key is just ["todos"].',
	server,
	title: "Invalidating with filters",
});
