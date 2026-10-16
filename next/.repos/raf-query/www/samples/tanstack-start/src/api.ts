export interface Post {
	readonly authorId: string;
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

export interface Todo {
	readonly done: boolean;
	readonly id: number;
	readonly title: string;
}

export interface Author {
	readonly id: string;
	readonly name: string;
}

export interface Build {
	readonly id: string;
	readonly status: "pending" | "running" | "done" | "failed";
}

export interface Org {
	readonly id: string;
	readonly name: string;
}

export interface User {
	readonly id: string;
	readonly name: string;
}

export class HttpError extends Error {
	constructor(readonly status: number) {
		super(`HTTP ${status}`);
	}
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
	const response = await fetch(url, init);
	if (!response.ok) throw new HttpError(response.status);
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

export function listPosts(input: { page: number; sort: "newest" | "oldest" }) {
	return request<ReadonlyArray<Post>>(
		`/api/posts?page=${input.page}&sort=${input.sort}`,
	);
}

export function updatePost(input: { slug: string; title: string }) {
	return request<Post>(`/api/posts/${input.slug}`, {
		method: "PATCH",
		body: JSON.stringify(input),
	});
}

export function listTodos(input?: { page?: number; status?: "open" | "done" }) {
	const search = new URLSearchParams();
	if (input?.page !== undefined) search.set("page", String(input.page));
	if (input?.status) search.set("status", input.status);
	return request<ReadonlyArray<Todo>>(`/api/todos?${search}`);
}

export function getTodo(id: number) {
	return request<Todo>(`/api/todos/${id}`);
}

export function createTodo(input: { title: string }) {
	return request<Todo>("/api/todos", {
		method: "POST",
		body: JSON.stringify(input),
	});
}

export function getAuthor(id: string) {
	return request<Author>(`/api/authors/${id}`);
}

export function getBuild(id: string) {
	return request<Build>(`/api/builds/${id}`);
}

export function getMe() {
	return request<User>("/api/me");
}

export function getCurrentOrg() {
	return request<Org>("/api/me/org");
}

export function getSettings() {
	return request<{ readonly theme: string }>("/api/settings");
}
