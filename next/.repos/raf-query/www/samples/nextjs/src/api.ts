export interface Post {
	readonly body: string;
	readonly slug: string;
	readonly title: string;
}

export interface PostComment {
	readonly author: string;
	readonly body: string;
	readonly id: string;
}

export interface CommentPage {
	readonly items: ReadonlyArray<PostComment>;
	readonly nextCursor: number | null;
}

export interface Issue {
	readonly id: number;
	readonly title: string;
}

async function request<T>(url: string): Promise<T> {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`HTTP ${response.status}`);
	}
	return (await response.json()) as T;
}

export function getPost(slug: string) {
	return request<Post>(`/api/posts/${slug}`);
}

export function listComments(input: { cursor: number; slug: string }) {
	return request<CommentPage>(
		`/api/posts/${input.slug}/comments?cursor=${input.cursor}`,
	);
}

export function listIssues(input: { status: "open" | "done" }) {
	return request<Array<Issue>>(`/api/issues?status=${input.status}`);
}
