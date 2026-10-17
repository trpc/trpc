export interface Post {
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
	const response = await fetch(new URL(path, import.meta.env.VITE_API_URL));
	if (!response.ok) {
		throw new Error(`${path}: ${response.status}`);
	}
	return (await response.json()) as T;
}

export function getPost(slug: string) {
	return get<Post>(`/api/posts/${slug}`);
}

export function listComments(input: { cursor: number; slug: string }) {
	return get<CommentPage>(
		`/api/posts/${input.slug}/comments?cursor=${input.cursor}`,
	);
}

export async function addComment(input: { body: string; slug: string }) {
	await fetch(new URL(`/api/posts/${input.slug}/comments`, location.origin), {
		body: JSON.stringify({ body: input.body }),
		method: "POST",
	});
}
