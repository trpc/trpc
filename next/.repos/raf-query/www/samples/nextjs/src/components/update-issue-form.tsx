"use client";

import { useQueryClient } from "@raf-query/react";

import { updateIssue } from "~/actions.ts";
import { issueQuery } from "~/queries.ts";

export function UpdateIssueForm(props: { id: number }) {
	const qc = useQueryClient();
	// #region form
	return (
		<form
			action={async (formData) => {
				await updateIssue(formData);
				await qc.invalidate(issueQuery, { id: props.id });
			}}
		/>
	);
	// #endregion
}
