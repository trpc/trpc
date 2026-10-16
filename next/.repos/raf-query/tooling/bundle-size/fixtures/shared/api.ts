/** A fake backend, identical for every fixture app so only the query library differs. */
export interface Issue {
	readonly id: number;
	readonly title: string;
}

export interface Comment {
	readonly body: string;
	readonly id: string;
}

export interface CommentPage {
	readonly comments: ReadonlyArray<Comment>;
	readonly nextCursor: number | null;
}

const pageSize = 10;
const commentCount = 25;

function wait(ms: number) {
	return new Promise<void>((resolve) => {
		setTimeout(resolve, ms);
	});
}

export async function getIssue(id: number): Promise<Issue> {
	await wait(50);
	return { id, title: `Issue ${id}` };
}

export async function listComments(input: {
	readonly cursor: number;
	readonly issueId: number;
}): Promise<CommentPage> {
	await wait(50);
	const end = Math.min(input.cursor + pageSize, commentCount);
	const comments = Array.from({ length: end - input.cursor }, (_, index) => ({
		body: `Comment ${input.cursor + index} on issue ${input.issueId}`,
		id: `${input.issueId}-${input.cursor + index}`,
	}));
	return { comments, nextCursor: end < commentCount ? end : null };
}

export async function renameIssue(input: {
	readonly id: number;
	readonly title: string;
}): Promise<void> {
	await wait(50);
	if (input.title.length === 0) {
		throw new Error("A title is required");
	}
}
