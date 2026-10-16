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

const API_URL = "https://api.example.com";

async function request<T>(path: string): Promise<T> {
	const response = await fetch(`${API_URL}${path}`);
	if (!response.ok) {
		throw new Error(`HTTP ${response.status}`);
	}
	return (await response.json()) as T;
}

export function getPost(slug: string) {
	return request<Post>(`/posts/${slug}`);
}

export function listComments(input: { cursor: number; slug: string }) {
	return request<CommentPage>(
		`/posts/${input.slug}/comments?cursor=${input.cursor}`,
	);
}
