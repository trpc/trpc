import {
	addComment,
	countIssues,
	getIssue,
	getIssueAssignee,
	listComments,
	listIssues,
	updateIssue,
} from "@examples/db";
import {
	AddCommentInput,
	Cursor,
	IssueId,
	IssueListInput,
	LATENCY_COOKIE,
	parseLatency,
	UpdateIssueFields,
} from "@examples/db/types";
import { sValidator } from "@hono/standard-validator";
import { type Context, Hono } from "hono";
import { getCookie } from "hono/cookie";
import { z } from "zod";

// Path and query values arrive as strings: coerce them, then check them with
// the db schemas.
const numeric = z.coerce.number<string>();
const IssueParam = z.object({ id: numeric.pipe(IssueId) });
const QueryCursor = numeric.pipe(Cursor);

/**
 * The database options a request asked for in its cookies, the way a real
 * API reads its session: the browser sends them, and server rendering
 * forwards the page request's `cookie` header.
 */
function options(c: Context) {
	return { latencyMs: parseLatency(getCookie(c, LATENCY_COOKIE)) };
}

const routes = new Hono()
	.get(
		"/issues",
		sValidator("query", IssueListInput.extend({ cursor: QueryCursor })),
		async (c) => c.json(await listIssues(c.req.valid("query"), options(c))),
	)
	// Registered before `/issues/:id`, which would match it too.
	.get("/issues/counts", async (c) => c.json(await countIssues(options(c))))
	.get("/issues/:id", sValidator("param", IssueParam), async (c) => {
		const issue = await getIssue(c.req.valid("param").id, options(c));
		return issue ? c.json(issue) : c.json({ error: "Issue not found" }, 404);
	})
	.patch(
		"/issues/:id",
		sValidator("param", IssueParam),
		sValidator("json", UpdateIssueFields),
		async (c) =>
			c.json(
				await updateIssue(
					{
						...c.req.valid("json"),
						id: c.req.valid("param").id,
					},
					options(c),
				),
			),
	)
	.get(
		"/issues/:id/comments",
		sValidator("param", IssueParam),
		sValidator("query", z.object({ cursor: QueryCursor })),
		async (c) =>
			c.json(
				await listComments(
					{
						cursor: c.req.valid("query").cursor,
						issueId: c.req.valid("param").id,
					},
					options(c),
				),
			),
	)
	.post(
		"/issues/:id/comments",
		sValidator("param", IssueParam),
		sValidator("json", AddCommentInput.omit({ issueId: true })),
		async (c) =>
			c.json(
				await addComment(
					{
						...c.req.valid("json"),
						issueId: c.req.valid("param").id,
					},
					options(c),
				),
				201,
			),
	)
	// Nested under the issue, so a page can ask for the assignee with the id
	// from its URL, beside the issue, instead of after it.
	.get("/issues/:id/assignee", sValidator("param", IssueParam), async (c) => {
		const user = await getIssueAssignee(c.req.valid("param").id, options(c));
		return user ? c.json(user) : c.json({ error: "Issue not found" }, 404);
	});

/** The routes' types, for `hc`: paths are relative to `/api`. */
export type Api = typeof routes;

/** Serves the API under `/api`. Mount it on the framework's `/api/*` route. */
export const app = new Hono().route("/api", routes);
