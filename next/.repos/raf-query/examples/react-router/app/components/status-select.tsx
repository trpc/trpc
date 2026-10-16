import { api, parseResponse } from "~/api.ts";
import type { IssueStatus } from "@examples/db/types";
import { StatusMenu } from "@examples/kit/components/status-menu";
import { warnMockDbWrite } from "@examples/kit/lib/mock-db-toast";
import { useQueryClient } from "@raf-query/react";
import { useOptimistic, useTransition } from "react";

/** Status badge that opens a menu and saves the choice optimistically. */
export function StatusSelect(props: {
	readonly align?: "start" | "center" | "end";
	readonly className?: string;
	readonly issueId: number;
	readonly status: IssueStatus;
}) {
	const queryClient = useQueryClient();
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
					await parseResponse(
						api.issues[":id"].$patch({
							json: { status: next },
							param: { id: String(props.issueId) },
						}),
					);
					await queryClient.invalidate({ queryKey: ["issues"] });
				});
			}}
			status={status}
		/>
	);
}
