import { IssueId } from "@examples/db/types";
import { HydrationBoundary } from "@raf-query/react";
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
	// `prefetch` starts each query and returns its handle at once. The page
	// streams in behind skeletons, and finds out about a missing issue when
	// it reads it.
	const handles = {
		assignee: qc.prefetch(assigneeQuery, { issueId: id }),
		comments: qc.prefetch(commentsQuery, { issueId: id }),
		issue: qc.prefetch(issueQuery, { id }),
	};

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
