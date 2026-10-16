"use client";

import {
	type IssueListInput,
	issueSorts,
	issueStatuses,
} from "@examples/db/types";
import { statusLabel } from "@examples/kit/components/status-badge";
import { cn } from "@examples/ui/lib/utils";
import { type QueryHandleWithData, useQuery } from "@raf-query/react";

import { AppLink } from "~/components/settings.tsx";
import { issueCountsQuery } from "~/queries.ts";

export function StatusFilter(props: {
	readonly counts: QueryHandleWithData<typeof issueCountsQuery>;
	readonly current: IssueListInput;
}) {
	const [counts] = useQuery(issueCountsQuery, props.counts);
	const current = props.current;

	return (
		<aside className="grid content-start gap-3 md:gap-6">
			<nav className="flex flex-wrap gap-1 md:grid">
				{(["all", ...issueStatuses] as const).map((status) => (
					<AppLink
						className={cn(
							"flex justify-between gap-2 rounded-md px-3 py-1.5 text-sm hover:bg-muted",
							current.status === status && "bg-muted font-medium",
						)}
						href={{
							pathname: "/ensure/issues",
							query: { ...current, status },
						}}
						key={status}
					>
						{statusLabel(status)}
						<span className="text-muted-foreground">{counts[status]}</span>
					</AppLink>
				))}
			</nav>
			<nav className="flex flex-wrap items-center gap-1 md:grid">
				<span className="px-3 text-xs font-medium text-muted-foreground uppercase">
					Sort
				</span>
				{issueSorts.map((sort) => (
					<AppLink
						className={cn(
							"rounded-md px-3 py-1.5 text-sm capitalize hover:bg-muted",
							current.sort === sort && "bg-muted font-medium",
						)}
						href={{ pathname: "/ensure/issues", query: { ...current, sort } }}
						key={sort}
					>
						{sort}
					</AppLink>
				))}
			</nav>
		</aside>
	);
}
