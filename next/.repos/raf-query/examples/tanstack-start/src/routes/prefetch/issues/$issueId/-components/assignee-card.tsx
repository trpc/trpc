import { AssigneeCardView } from "@examples/kit/components/user";
import { type QueryHandle, useQuery } from "@raf-query/react";
import { use } from "react";

import { assigneeQuery } from "~/queries.ts";

export function AssigneeCard(props: {
	readonly handle: QueryHandle<typeof assigneeQuery>;
}) {
	const [userPromise] = useQuery(assigneeQuery, props.handle);
	const user = use(userPromise);
	if (!user) {
		return null;
	}

	return <AssigneeCardView user={user} />;
}
