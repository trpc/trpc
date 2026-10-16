import type { IssueStatus } from "@examples/db/types";
import { Badge } from "@examples/ui/components/badge";
import { cn } from "@examples/ui/lib/utils";
import { ChevronDown } from "lucide-react";

const labels = {
	closed: "Closed",
	in_progress: "In progress",
	open: "Open",
} as const satisfies Record<IssueStatus, string>;

const dots = {
	closed: "bg-zinc-400 dark:bg-zinc-500",
	in_progress: "bg-amber-500",
	open: "bg-emerald-500",
} as const satisfies Record<IssueStatus, string>;

export function statusLabel(status: IssueStatus | "all") {
	return status === "all" ? "All" : labels[status];
}

export function StatusDot(props: { readonly status: IssueStatus }) {
	return (
		<span
			aria-hidden
			className={cn("size-1.5 rounded-full", dots[props.status])}
		/>
	);
}

export function StatusBadge(props: {
	readonly interactive?: boolean;
	readonly status: IssueStatus;
}) {
	return (
		<Badge className="gap-1.5" variant="outline">
			<StatusDot status={props.status} />
			{labels[props.status]}
			{props.interactive ? (
				<ChevronDown aria-hidden className="size-3 opacity-60" />
			) : null}
		</Badge>
	);
}
