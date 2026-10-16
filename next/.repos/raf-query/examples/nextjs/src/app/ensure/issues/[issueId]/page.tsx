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
	// `ensure` waits for data the cache doesn't have. The server renders
	// every navigation with a new client, so here it waits like `fetch`.
	const handles = await allKeyed({
		assignee: qc.ensure(assigneeQuery, { issueId: id }),
		comments: qc.ensure(commentsQuery, { issueId: id }),
		issue: qc.ensure(issueQuery, { id }),
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
