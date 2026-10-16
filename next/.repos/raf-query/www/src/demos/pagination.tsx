import { Skeleton } from "@examples/ui/components/skeleton";
import { cn } from "@examples/ui/lib/utils";
import { type QueryHandle, queryOptions, useQuery } from "@raf-query/react";
import { use, useState } from "react";

import { DemoBrowser, DemoLink } from "~/demo-kit/browser.tsx";
import { Segmented, Spinner } from "~/demo-kit/controls.tsx";
import { defineDemo } from "~/demo-kit/define.ts";
import { createFakeServer } from "~/demo-kit/server.ts";

const pageSize = 4;
const pageCount = 5;

const server = createFakeServer(() => ({
	projects: Array.from({ length: pageSize * pageCount }, (_, index) => ({
		id: index + 1,
		name: `Project ${String(index + 1).padStart(2, "0")}`,
	})),
}));

function projectsQuery(input: { readonly page: number }) {
	return queryOptions({
		queryFn: (context) =>
			server.respond(
				`GET /projects?page=${input.page}`,
				(db) => ({
					hasMore: input.page < pageCount,
					items: db.projects.slice(
						(input.page - 1) * pageSize,
						input.page * pageSize,
					),
				}),
				context,
			),
		queryKey: ["projects", input],
		staleTime: 5000,
	});
}

interface PageData {
	readonly page: number;
	readonly projects: QueryHandle<typeof projectsQuery>;
}

type WhilePending = "previous" | "suspend";

function ListSkeleton() {
	return (
		<div className="grid gap-1.5">
			{Array.from({ length: pageSize }, (_, index) => (
				<Skeleton className="h-8 w-full" key={index} />
			))}
		</div>
	);
}

function Projects(props: {
	readonly data: PageData;
	readonly whilePending: WhilePending;
}) {
	const [projectsPromise, projects] = useQuery(
		projectsQuery,
		props.data.projects,
		{ whilePending: props.whilePending },
	);
	const result = use(projectsPromise);
	const page = props.data.page;
	return (
		<div className="grid gap-3">
			<ul
				aria-busy={projects.isPrevious}
				className={cn(
					"grid gap-1.5 transition-opacity",
					projects.isPrevious && "opacity-50",
				)}
			>
				{result.items.map((project) => (
					<li
						className="rounded-md border px-3 py-1.5 text-sm"
						key={project.id}
					>
						{project.name}
					</li>
				))}
			</ul>
			<nav aria-label="Pagination" className="flex items-center gap-2 text-sm">
				{page > 1 ? (
					<DemoLink
						className="rounded-md border px-2.5 py-1 hover:bg-accent"
						to={{ path: "/projects", search: { page: page - 1 } }}
					>
						← Previous
					</DemoLink>
				) : null}
				<span className="flex items-center gap-2 text-xs text-muted-foreground tabular-nums">
					Page {page} of {pageCount}
					{projects.isFetching ? <Spinner /> : null}
				</span>
				{page < pageCount ? (
					<DemoLink
						className="ml-auto rounded-md border px-2.5 py-1 hover:bg-accent"
						to={{ path: "/projects", search: { page: page + 1 } }}
					>
						Next →
					</DemoLink>
				) : null}
			</nav>
		</div>
	);
}

function Pagination() {
	const [whilePending, setWhilePending] = useState<WhilePending>("previous");
	return (
		<div className="grid gap-3">
			<Segmented
				label="whilePending"
				onChange={setWhilePending}
				options={[
					{ label: '"previous"', value: "previous" },
					{ label: '"suspend"', value: "suspend" },
				]}
				value={whilePending}
			/>
			<DemoBrowser
				fallback={<ListSkeleton />}
				initial={{ path: "/projects", search: { page: 1 } }}
				loader={(args): PageData => {
					const page = Math.max(1, Number(args.location.search?.page ?? 1));
					return {
						page,
						projects: args.client.prefetch(projectsQuery, { page }),
					};
				}}
			>
				{(route) => <Projects data={route.data} whilePending={whilePending} />}
			</DemoBrowser>
		</div>
	);
}

export default defineDemo({
	Component: Pagination,
	hint: 'Page through the list with each setting. "previous" commits the URL at once and dims the old page; "suspend" keeps the whole old screen until the new page is in. Visited pages render instantly.',
	server,
	title: "Paginated list with whilePending",
});
