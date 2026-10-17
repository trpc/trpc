export interface Post {
	readonly authorId: number;
	readonly body: string;
	readonly slug: string;
	readonly title: string;
}

export interface Comment {
	readonly body: string;
	readonly id: number;
}

export interface CommentPage {
	readonly items: ReadonlyArray<Comment>;
	readonly nextCursor: number | null;
}

async function get<T>(path: string): Promise<T> {
	const response = await fetch(new URL(path, "https://api.example.com"));
	if (!response.ok) {
		throw new Error(`${path}: ${response.status}`);
	}
	return (await response.json()) as T;
}

export function getPost(slug: string) {
	return get<Post>(`/api/posts/${slug}`);
}

export function getAuthor(id: number) {
	return get<{ readonly name: string }>(`/api/authors/${id}`);
}

export function listComments(input: { cursor: number; slug: string }) {
	return get<CommentPage>(
		`/api/posts/${input.slug}/comments?cursor=${input.cursor}`,
	);
}

export async function addComment(input: { body: string; slug: string }) {
	await fetch(`/api/posts/${input.slug}/comments`, {
		body: JSON.stringify({ body: input.body }),
		method: "POST",
	});
}
