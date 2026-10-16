export interface IssueListFilter {
	readonly status: "open" | "done";
}

export const IssueListInput = {
	parse(value: Record<string, string | Array<string>>): IssueListFilter {
		const raw = value.status;
		const status = Array.isArray(raw) ? raw[0] : raw;
		return { status: status === "done" ? "done" : "open" };
	},
};
