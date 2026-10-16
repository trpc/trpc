/**
 * The issue tracker's RPC contract: the procedures, their payloads, results
 * and typed errors. Client and server both import it; the handlers are in
 * `rpc-handlers.ts`.
 */
import { Effect, Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

export const issueStatuses = ["open", "in_progress", "closed"] as const;
export const IssueStatus = Schema.Literals(issueStatuses);
export type IssueStatus = typeof IssueStatus.Type;

export const issueSorts = ["newest", "oldest"] as const;
const IssueSort = Schema.Literals(issueSorts);

const Id = Schema.Int.check(Schema.isGreaterThan(0));
export const IssueId = Id;

/** Index of a page's first item. */
const Cursor = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));

/**
 * What the issue list shows. Lives in the URL's search params; missing keys
 * get defaults. Pages are loaded by scrolling, so they stay out of the URL.
 */
export const IssueListInput = Schema.Struct({
	sort: IssueSort.pipe(Schema.withDecodingDefault(Effect.succeed("newest"))),
	status: Schema.Literals(["all", ...issueStatuses]).pipe(
		Schema.withDecodingDefault(Effect.succeed("all")),
	),
});
export type IssueListInput = typeof IssueListInput.Type;

const User = Schema.Struct({
	id: Schema.String,
	name: Schema.String,
	title: Schema.String,
});

export const Issue = Schema.Struct({
	assigneeId: Schema.String,
	body: Schema.String,
	commentCount: Schema.Int,
	/** ISO date. */
	createdAt: Schema.String,
	id: Schema.Int,
	status: IssueStatus,
	title: Schema.String,
});
export type Issue = typeof Issue.Type;

export const Comment = Schema.Struct({
	author: User,
	body: Schema.String,
	/** ISO date. */
	createdAt: Schema.String,
	id: Schema.String,
	issueId: Schema.Int,
});
export type Comment = typeof Comment.Type;

const Page = { nextCursor: Schema.NullOr(Schema.Int), total: Schema.Int };

const IssueCounts = Schema.Struct({
	all: Schema.Int,
	closed: Schema.Int,
	in_progress: Schema.Int,
	open: Schema.Int,
});

export class IssueNotFound extends Schema.TaggedError<IssueNotFound>()(
	"IssueNotFound",
	{ id: Schema.Int },
) {}

export class EmptyTitle extends Schema.TaggedError<EmptyTitle>()(
	"EmptyTitle",
	{},
) {}

export class EmptyBody extends Schema.TaggedError<EmptyBody>()(
	"EmptyBody",
	{},
) {}

export const IssueRpcs = RpcGroup.make(
	Rpc.make("ListIssues", {
		payload: { ...IssueListInput.fields, cursor: Cursor },
		success: Schema.Struct({ ...Page, issues: Schema.Array(Issue) }),
	}),
	Rpc.make("CountIssues", { success: IssueCounts }),
	Rpc.make("GetIssue", {
		error: IssueNotFound,
		payload: { id: Id },
		success: Issue,
	}),
	Rpc.make("UpdateTitle", {
		error: EmptyTitle,
		payload: { id: Id, title: Schema.String },
		success: Issue,
	}),
	Rpc.make("UpdateBody", {
		error: EmptyBody,
		payload: { body: Schema.String, id: Id },
		success: Issue,
	}),
	Rpc.make("SetStatus", {
		payload: { id: Id, status: IssueStatus },
		success: Issue,
	}),
	/** Newest first. */
	Rpc.make("ListComments", {
		payload: { cursor: Cursor, issueId: Id },
		success: Schema.Struct({ ...Page, comments: Schema.Array(Comment) }),
	}),
	/** The client picks `id`, so its optimistic entry and the saved comment match. */
	Rpc.make("AddComment", {
		payload: {
			body: Schema.String,
			id: Schema.String.check(Schema.isUUID()),
			issueId: Id,
		},
		success: Comment,
	}),
	/**
	 * The issue's assignee in one round trip, by the issue's id, so a page can
	 * ask for it beside the issue instead of after it.
	 */
	Rpc.make("GetIssueAssignee", {
		error: IssueNotFound,
		payload: { issueId: Id },
		success: User,
	}),
);
