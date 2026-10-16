import { IssueId } from "@examples/db/types";
import { ensure, prefetch } from "@raf-query/experimental-tanstack-react-query";
import { HydrationBoundary } from "@raf-query/experimental-tanstack-react-query/rsc";
import { notFound } from "next/navigation";
import { z } from "zod";

import { IssuePage } from "~/components/issue-page.tsx";
import { assigneeQuery, commentsQuery, issueQuery } from "~/queries.ts";
import { getQueryClient } from "~/query-client.ts";

const IssueIdParam = z.coerce.number<string>().pipe(IssueId);

export default async function Page(props: {
	readonly params: Promise<{ issueId: string }>;
}) {
	const params = await props.params;
	const parsed = IssueIdParam.safeParse(params.issueId);
	if (!parsed.success) {
		notFound();
	}
	const id = parsed.data;
	const qc = getQueryClient();
	const assignee = prefetch(qc, assigneeQuery, { issueId: id });
	const comments = prefetch(qc, commentsQuery, { issueId: id });

	return (
		<HydrationBoundary client={qc}>
			<IssuePage
				assignee={assignee}
				comments={comments}
				issue={await ensure(qc, issueQuery, { id })}
			/>
		</HydrationBoundary>
	);
}
