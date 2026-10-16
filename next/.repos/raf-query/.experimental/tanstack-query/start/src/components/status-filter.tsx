import {
	type IssueListInput,
	issueSorts,
	issueStatuses,
} from "@examples/db/types";
import {
	type QueryHandle,
	useQuery,
} from "@raf-query/experimental-tanstack-react-query";
import { cn } from "@examples/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import { use } from "react";

import { issueCountsQuery } from "~/queries.ts";

import { statusLabel } from "./status-badge.tsx";

export function StatusFilter(props: {
	readonly counts: QueryHandle<typeof issueCountsQuery>;
	readonly current: IssueListInput;
}) {
	const [countsPromise] = useQuery(issueCountsQuery, props.counts);
	const counts = use(countsPromise);
	const current = props.current;

	return (
		<aside className="grid content-start gap-6">
			<nav className="grid gap-1">
				{(["all", ...issueStatuses] as const).map((status) => (
					<Link
						className={cn(
							"flex justify-between rounded-md px-3 py-1.5 text-sm hover:bg-muted",
							current.status === status && "bg-muted font-medium",
						)}
						key={status}
						search={{ ...current, status }}
						to="/issues"
					>
						{statusLabel(status)}
						<span className="text-muted-foreground">{counts[status]}</span>
					</Link>
				))}
			</nav>
			<nav className="grid gap-1">
				<span className="px-3 text-xs font-medium text-muted-foreground uppercase">
					Sort
				</span>
				{issueSorts.map((sort) => (
					<Link
						className={cn(
							"rounded-md px-3 py-1.5 text-sm capitalize hover:bg-muted",
							current.sort === sort && "bg-muted font-medium",
						)}
						key={sort}
						search={{ ...current, sort }}
						to="/issues"
					>
						{sort}
					</Link>
				))}
			</nav>
		</aside>
	);
}
