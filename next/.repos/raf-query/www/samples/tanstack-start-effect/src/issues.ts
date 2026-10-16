import { Context, Effect, Layer, Schema } from "effect";

export interface Issue {
	readonly assigneeId: string;
	readonly body: string;
	readonly id: number;
	readonly title: string;
}

export interface User {
	readonly id: string;
	readonly name: string;
}

// #region api
export class IssueNotFound extends Schema.TaggedError<IssueNotFound>()(
	"IssueNotFound",
	{ id: Schema.Number },
) {}
export class Unauthorized extends Schema.TaggedError<Unauthorized>()(
	"Unauthorized",
	{},
) {}
export class EmptyTitle extends Schema.TaggedError<EmptyTitle>()(
	"EmptyTitle",
	{},
) {}

export class IssueApi extends Context.Service<
	IssueApi,
	{
		readonly get: (
			id: number,
		) => Effect.Effect<Issue, IssueNotFound | Unauthorized>;
		readonly assignee: (
			issueId: number,
		) => Effect.Effect<User, IssueNotFound | Unauthorized>;
		readonly rename: (input: {
			readonly id: number;
			readonly title: string;
		}) => Effect.Effect<Issue, EmptyTitle | Unauthorized>;
	}
>()("app/IssueApi") {}
// #endregion

const issues = new Map<number, Issue>([
	[1, { assigneeId: "ada", body: "", id: 1, title: "Flaky test" }],
]);
const users = new Map<string, User>([["ada", { id: "ada", name: "Ada" }]]);

/** In memory here; an HTTP client, an RPC client or a database in an app. */
export const IssueApiLive = Layer.succeed(IssueApi, {
	assignee: (issueId) => {
		const issue = issues.get(issueId);
		const user = issue && users.get(issue.assigneeId);
		return user
			? Effect.succeed(user)
			: Effect.fail(new IssueNotFound({ id: issueId }));
	},
	get: (id) => {
		const issue = issues.get(id);
		return issue
			? Effect.succeed(issue)
			: Effect.fail(new IssueNotFound({ id }));
	},
	rename: (input) => {
		const issue = issues.get(input.id);
		if (!input.title.trim()) {
			return Effect.fail(new EmptyTitle());
		}
		if (!issue) {
			return Effect.die(new IssueNotFound({ id: input.id }));
		}
		const renamed = { ...issue, title: input.title };
		issues.set(input.id, renamed);
		return Effect.succeed(renamed);
	},
});
