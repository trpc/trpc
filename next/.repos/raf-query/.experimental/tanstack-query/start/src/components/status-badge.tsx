import type { IssueStatus } from "@examples/db/types";
import { Badge } from "@examples/ui/components/badge";

const labels = {
	closed: "Closed",
	in_progress: "In progress",
	open: "Open",
} as const satisfies Record<IssueStatus, string>;

const variants = {
	closed: "secondary",
	in_progress: "default",
	open: "outline",
} as const satisfies Record<IssueStatus, string>;

export function statusLabel(status: IssueStatus | "all") {
	return status === "all" ? "All" : labels[status];
}

export function StatusBadge(props: { readonly status: IssueStatus }) {
	return <Badge variant={variants[props.status]}>{labels[props.status]}</Badge>;
}
