import { Skeleton } from "@examples/ui/components/skeleton";
import {
	infiniteQueryOptions,
	type QueryHandle,
	useQuery,
} from "@raf-query/react";
import { use } from "react";

import { DemoBrowser, DemoLink } from "~/demo-kit/browser.tsx";
import { defineDemo } from "~/demo-kit/define.ts";
import { createFakeServer } from "~/demo-kit/server.ts";

type Filter = "all" | "questions";

interface Message {
	readonly author: string;
	readonly body: string;
	readonly id: number;
}

interface MessagePage {
	readonly items: ReadonlyArray<Message>;
	readonly nextCursor: number | null;
}

const pageSize = 5;
const authors = ["Ada", "Grace", "Linus", "Margaret", "Ken", "Barbara"];
const bodies = [
	"Shipped the new loader today.",
	"Does prefetch block the navigation?",
	"The skeletons line up perfectly now.",
	"Why does my query refetch on focus?",
	"Moved the filter into the URL.",
	"Is staleTime per query or per read?",
	"Invalidation after the action fixed it.",
	"Can a component start a query?",
];

const server = createFakeServer(() => ({
	messages: Array.from({ length: 48 }, (_, index) => ({
		author: authors[index % authors.length] ?? "Ada",
		body: bodies[index % bodies.length] ?? "Hello.",
		id: index + 1,
	})),
}));

function messagesQuery(input: { readonly filter: Filter }) {
	return infiniteQueryOptions({
		queryFn: (context) =>
			server.respond(
				`GET /messages?filter=${input.filter}&cursor=${context.pageParam}`,
				(db): MessagePage => {
					const matching = db.messages.filter(
						(message) => input.filter === "all" || message.body.endsWith("?"),
					);
					const end = context.pageParam + pageSize;
					return {
						items: matching.slice(context.pageParam, end),
						nextCursor: end < matching.length ? end : null,
					};
				},
				context,
			),
		// After `queryFn`: TypeScript infers the page type from it.
		getNextPageParam: (lastPage) => lastPage.nextCursor,
		initialPageParam: 0,
		queryKey: ["messages", input],
		staleTime: 30_000,
	});
}

interface PageData {
	readonly messages: QueryHandle<typeof messagesQuery>;
}

function filterOf(value: number | string | undefined): Filter {
	return value === "questions" ? "questions" : "all";
}

function MessageSkeletons() {
	return Array.from({ length: pageSize }, (_, index) => (
		<li key={index}>
			<Skeleton className="h-12 w-full" />
		</li>
	));
}

function Messages(props: {
	readonly handle: QueryHandle<typeof messagesQuery>;
}) {
	const [pagesPromise, messages] = useQuery(messagesQuery, props.handle);
	const data = use(pagesPromise);
	const items = data.pages.flatMap((page) => page.items);
	return (
		<div
			className="h-72 overflow-y-auto overscroll-contain rounded-md border p-2"
			data-scroll-root
		>
			<ul className="grid gap-1.5">
				{items.map((message) => (
					<li
						className="rounded-md bg-muted/50 px-3 py-1.5 text-sm"
						key={message.id}
					>
						<span className="mr-2 font-medium">{message.author}</span>
						{message.body}
						<span className="float-right font-mono text-xs text-muted-foreground">
							#{message.id}
						</span>
					</li>
				))}
				{messages.isFetchingNextPage ? <MessageSkeletons /> : null}
			</ul>
			{messages.hasNextPage && !messages.isFetchingNextPage ? (
				<button
					className="mt-2 w-full rounded-md border py-1.5 text-xs text-muted-foreground hover:bg-accent"
					onClick={() => {
						void messages.fetchNextPage();
					}}
					ref={(button) => {
						if (button === null) {
							return;
						}
						const observer = new IntersectionObserver(
							(entries) => {
								if (entries.some((entry) => entry.isIntersecting)) {
									observer.disconnect();
									void messages.fetchNextPage();
								}
							},
							{
								root: button.closest("[data-scroll-root]"),
								rootMargin: "0px 0px 120px 0px",
							},
						);
						observer.observe(button);
						return () => {
							observer.disconnect();
						};
					}}
					type="button"
				>
					Load more
				</button>
			) : null}
			{messages.hasNextPage ? null : (
				<p className="py-2 text-center text-xs text-muted-foreground">
					That’s all {items.length} messages.
				</p>
			)}
		</div>
	);
}

function Page(props: { readonly data: PageData }) {
	return (
		<div className="grid gap-3">
			<nav className="flex gap-1 text-sm">
				{(["all", "questions"] satisfies ReadonlyArray<Filter>).map(
					(filter) => (
						<DemoLink
							className="rounded-md px-2.5 py-1 capitalize hover:bg-accent aria-[current=page]:bg-accent aria-[current=page]:font-medium"
							key={filter}
							to={{ path: "/messages", search: { filter } }}
						>
							{filter}
						</DemoLink>
					),
				)}
			</nav>
			<Messages handle={props.data.messages} />
		</div>
	);
}

function InfiniteScroll() {
	return (
		<DemoBrowser
			fallback={
				<ul className="grid gap-1.5">
					<MessageSkeletons />
				</ul>
			}
			initial={{ path: "/messages", search: { filter: "all" } }}
			loader={(args): PageData => ({
				messages: args.client.prefetch(messagesQuery, {
					filter: filterOf(args.location.search?.filter),
				}),
			})}
		>
			{(route) => <Page data={route.data} />}
		</DemoBrowser>
	);
}

export default defineDemo({
	Component: InfiniteScroll,
	hint: "Scroll the feed to load pages as you go. Switch the filter for a new list from its first page, then switch back: the old list is still cached with every page you loaded.",
	server,
	title: "Infinite scroll",
});
