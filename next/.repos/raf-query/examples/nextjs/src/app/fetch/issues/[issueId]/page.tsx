import { IssueId } from "@examples/db/types";
import { allKeyed, HydrationBoundary } from "@raf-query/react";
import { notFound } from "next/navigation";
import { z } from "zod";

import { assigneeQuery, commentsQuery, issueQuery } from "~/queries.ts";
import { getQueryClient } from "~/query-client.ts";

import { IssuePage } from "./_components/issue-page.tsx";

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
	// `fetch` waits for fresh data: on a cache miss, and when the cached
	// data is stale.
	const handles = await allKeyed({
		assignee: qc.fetch(assigneeQuery, { issueId: id }),
		comments: qc.fetch(commentsQuery, { issueId: id }),
		issue: qc.fetch(issueQuery, { id }),
	});
	if (handles.issue.data === null) {
		notFound();
	}

	return (
		<HydrationBoundary client={qc}>
			<IssuePage
				assignee={handles.assignee}
				comments={handles.comments}
				issue={handles.issue}
			/>
		</HydrationBoundary>
	);
}
