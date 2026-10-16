import { z } from "zod";

export const issueStatuses = ["open", "in_progress", "closed"] as const;
export const IssueStatus = z.enum(issueStatuses);
export type IssueStatus = z.infer<typeof IssueStatus>;

export const issueSorts = ["newest", "oldest"] as const;
const IssueSort = z.enum(issueSorts);

/**
 * The cookie the apps' settings menu stores the database latency in, in ms.
 * The API reads it from each request, like a session cookie.
 */
export const LATENCY_COOKIE = "db-latency";

/** The latency when neither the request nor `DB_LATENCY_MS` sets one. */
export const DEFAULT_LATENCY_MS = 400;

export const latencyOptions = [
	{ label: "None", ms: 0 },
	{ label: "100 ms", ms: 100 },
	{ label: "400 ms", ms: 400 },
	{ label: "1 s", ms: 1000 },
	{ label: "3 s", ms: 3000 },
] as const;

/** A latency cookie, or `undefined` when it's missing or not a choice. */
export function parseLatency(value: string | undefined) {
	return latencyOptions.find((option) => String(option.ms) === value)?.ms;
}

/** The cookie the apps' settings menu stores `staleTime` in, in ms. */
export const STALE_TIME_COOKIE = "stale-time";

/** What the apps use until the menu picks one. */
export const DEFAULT_STALE_TIME = 5000;

export const staleTimeOptions = [
	{ label: "0 ms", ms: 0 },
	{ label: "5 s", ms: 5000 },
	{ label: "30 s", ms: 30_000 },
	{ label: "5 min", ms: 300_000 },
	{ label: "Forever", ms: Number.POSITIVE_INFINITY },
] as const;

/** A stale-time cookie, or `undefined` when it's missing or not a choice. */
export function parseStaleTime(value: string | undefined) {
	return staleTimeOptions.find((option) => String(option.ms) === value)?.ms;
}

/**
 * `gcTime` for a chosen `staleTime`. Unread entries stay at least five
 * minutes, and at least twice as long as they stay fresh, so a revisit still
 * has them after they go stale. Forever keeps them for the session: collecting
 * them would drop data that never goes stale.
 */
function gcTimeFor(staleTime: number) {
	return Number.isFinite(staleTime)
		? Math.max(staleTime * 2, 5 * 60_000)
		: Number.POSITIVE_INFINITY;
}

/** The defaults object a browser query client holds and the menu mutates. */
export interface QueryTimeDefaults {
	gcTime?: number;
	staleTime: number;
}

/**
 * Defaults for a client, without `gcTime`. The browser adds that with
 * {@link applyStaleTime} after it knows the client is not a server client.
 */
export function queryTimeDefaults(staleTime: number): QueryTimeDefaults {
	return { staleTime };
}

/** Point a live client's defaults at another stale time, and its `gcTime`. */
export function applyStaleTime(defaults: QueryTimeDefaults, staleTime: number) {
	defaults.gcTime = gcTimeFor(staleTime);
	defaults.staleTime = staleTime;
}

/**
 * How the apps' loaders start their queries. The URL's first segment picks
 * one (`/ensure/issues/1`), so each verb's pages can be compared and shared.
 */
export const loaderVerbs = ["prefetch", "ensure", "fetch"] as const;
export const LoaderVerb = z.enum(loaderVerbs);
export type LoaderVerb = z.infer<typeof LoaderVerb>;

/** Where `/` and the verb-less `/issues` URLs go. */
export const DEFAULT_LOADER_VERB: LoaderVerb = "prefetch";

const Id = z.int().positive();
const Text = z.string().trim().min(1);

/** Index of a page's first item. */
export const Cursor = z.int().nonnegative();

/**
 * What the issue list shows. Lives in the URL's search params; missing keys
 * get defaults. Pages are loaded by scrolling, so they stay out of the URL.
 */
export const IssueListInput = z.object({
	sort: IssueSort.default("newest"),
	status: z.enum(["all", ...issueStatuses]).default("all"),
});
export type IssueListInput = z.infer<typeof IssueListInput>;

export const IssuePageInput = IssueListInput.extend({ cursor: Cursor });
export type IssuePageInput = z.infer<typeof IssuePageInput>;

export const IssueId = Id;

/** Fields a client may PATCH on an issue. At least one is required. */
export const UpdateIssueFields = z
	.object({
		body: Text.optional(),
		status: IssueStatus.optional(),
		title: Text.optional(),
	})
	.refine(
		(value) =>
			value.body !== undefined ||
			value.status !== undefined ||
			value.title !== undefined,
		{ message: "Nothing to update" },
	);
export type UpdateIssueFields = z.infer<typeof UpdateIssueFields>;

/** The client picks `id`, so its optimistic entry and the saved comment match. */
export const AddCommentInput = z.object({
	body: Text,
	id: z.uuid(),
	issueId: Id,
});
export type AddCommentInput = z.infer<typeof AddCommentInput>;

export interface User {
	readonly id: string;
	readonly name: string;
	readonly title: string;
}

export interface Issue {
	readonly assigneeId: string;
	readonly body: string;
	readonly commentCount: number;
	/** ISO date. */
	readonly createdAt: string;
	readonly id: number;
	readonly status: IssueStatus;
	readonly title: string;
}

/** Who the example apps are signed in as. */
export const currentUser: User = {
	id: "ada",
	name: "Ada Lovelace",
	title: "Analyst",
};

export interface Comment {
	readonly author: User;
	readonly body: string;
	/** ISO date. */
	readonly createdAt: string;
	readonly id: string;
	readonly issueId: number;
}

export interface IssuePage {
	readonly issues: ReadonlyArray<Issue>;
	readonly nextCursor: number | null;
	readonly total: number;
}

export interface CommentPage {
	readonly comments: ReadonlyArray<Comment>;
	readonly nextCursor: number | null;
	readonly total: number;
}

export type IssueCounts = Readonly<Record<IssueStatus | "all", number>>;

export interface Store {
	comments: ReadonlyArray<Comment>;
	issues: ReadonlyArray<Issue>;
	readonly users: ReadonlyArray<User>;
}
