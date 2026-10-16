"use client";

import { type IssueStatus, issueStatuses } from "@examples/db/types";
import {
	StatusBadge,
	StatusDot,
	statusLabel,
} from "@examples/kit/components/status-badge";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@examples/ui/components/dropdown-menu";
import { cn } from "@examples/ui/lib/utils";
import { Check } from "lucide-react";

/** Status badge that opens a menu of statuses. Disabled while `isPending`. */
export function StatusMenu(props: {
	readonly align?: "start" | "center" | "end";
	readonly className?: string;
	readonly isPending: boolean;
	readonly onSelect: (status: IssueStatus) => void;
	readonly status: IssueStatus;
}) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				aria-label={`Status: ${statusLabel(props.status)}. Change status`}
				className={cn(
					"rounded-full outline-none transition-opacity focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none",
					props.isPending && "opacity-60",
					props.className,
				)}
				disabled={props.isPending}
			>
				<StatusBadge interactive status={props.status} />
			</DropdownMenuTrigger>
			<DropdownMenuContent align={props.align ?? "end"} className="min-w-40">
				{issueStatuses.map((option) => (
					<DropdownMenuItem
						className="gap-2"
						key={option}
						onClick={() => {
							props.onSelect(option);
						}}
					>
						<StatusDot status={option} />
						{statusLabel(option)}
						{option === props.status ? (
							<Check aria-hidden className="ml-auto size-3.5 opacity-70" />
						) : (
							<span aria-hidden className="ml-auto size-3.5" />
						)}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
