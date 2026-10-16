import { AssigneeCardView } from "@examples/kit/components/user";
import { type QueryHandle, useQuery } from "@raf-query/react";
import { Result, Schema } from "effect";
import { use } from "react";

import { assigneeQuery } from "~/queries.ts";
import { IssueNotFound } from "~/rpc.ts";

/**
 * Reads the assignee as `Result<User, …>`. The client's `layer` defaults
 * `throwOnError` to false, so the read never throws — match the Result.
 */
export function AssigneeCard(props: {
	readonly handle: QueryHandle<typeof assigneeQuery>;
}) {
	const [userPromise, controls] = useQuery(assigneeQuery, props.handle);
	const user = use(userPromise);
	return Result.match(user, {
		onFailure: (error) =>
			Schema.is(IssueNotFound)(error) ? null : (
				<div role="alert">
					<p className="text-sm text-destructive">
						Could not load the assignee.
					</p>
					<button
						className="text-sm underline"
						onClick={() => {
							void controls.refetch();
						}}
						type="button"
					>
						Try again
					</button>
				</div>
			),
		onSuccess: (assignee) => <AssigneeCardView user={assignee} />,
	});
}
