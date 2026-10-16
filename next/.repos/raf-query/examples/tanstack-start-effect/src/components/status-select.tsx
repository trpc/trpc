import { StatusMenu } from "@examples/kit/components/status-menu";
import { warnMockDbWrite } from "@examples/kit/lib/mock-db-toast";
import { useRouteContext } from "@tanstack/react-router";
import { Effect } from "effect";
import { useOptimistic, useTransition } from "react";

import { Issues } from "~/issues.ts";
import { invalidateIssues } from "~/queries.ts";
import type { IssueStatus } from "~/rpc.ts";

/**
 * Saves the status, then waits for the refetched issues. A failure rejects,
 * so the transition throws to the nearest error boundary.
 */
const setStatus = Effect.fn("setStatus")(function* (input: {
	readonly id: number;
	readonly status: IssueStatus;
}) {
	const issues = yield* Issues;
	yield* issues.SetStatus(input);
	yield* invalidateIssues;
});

/** Status badge that opens a menu and saves the choice optimistically. */
export function StatusSelect(props: {
	readonly align?: "start" | "center" | "end";
	readonly className?: string;
	readonly issueId: number;
	readonly status: IssueStatus;
}) {
	const queryClient = useRouteContext({
		from: "__root__",
		select: (context) => context.queryClient,
	});
	const [status, setOptimisticStatus] = useOptimistic(props.status);
	const [isPending, startTransition] = useTransition();

	return (
		<StatusMenu
			align={props.align}
			className={props.className}
			isPending={isPending}
			onSelect={(next) => {
				if (next === props.status) {
					return;
				}
				startTransition(async () => {
					warnMockDbWrite();
					setOptimisticStatus(next);
					await queryClient.runPromise(
						setStatus({ id: props.issueId, status: next }),
					);
				});
			}}
			status={status}
		/>
	);
}
