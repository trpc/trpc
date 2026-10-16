/**
 * The RPC server, over the fake database. Server-only: it imports
 * `@examples/db`, which must stay out of the browser's bundle.
 */
import {
	addComment,
	countIssues,
	getIssue,
	getIssueAssignee,
	listComments,
	listIssues,
	updateIssue,
} from "@examples/db";
import { LATENCY_COOKIE, parseLatency } from "@examples/db/types";
import { Effect, Layer, Option } from "effect";
import { Cookies, Headers, HttpRouter } from "effect/http";
import { RpcSerialization, RpcServer } from "effect/rpc";

import { EmptyBody, EmptyTitle, IssueNotFound, IssueRpcs } from "./rpc.ts";

/**
 * The database options a request asked for in its cookies, the way a real
 * server reads its session: the browser sends them, and SSR forwards the page
 * request's `cookie` header.
 */
function options(request: { readonly headers: Headers.Headers }) {
	const cookies = Cookies.parseHeader(
		Option.getOrElse(Headers.get(request.headers, "cookie"), () => ""),
	);
	return { latencyMs: parseLatency(cookies[LATENCY_COOKIE]) };
}

const IssueHandlers = IssueRpcs.toLayer({
	AddComment: (payload, request) =>
		Effect.promise(() => addComment(payload, options(request))),
	CountIssues: (_payload, request) =>
		Effect.promise(() => countIssues(options(request))),
	GetIssue: Effect.fn("IssueRpcs.GetIssue")(function* (payload, request) {
		const issue = yield* Effect.promise(() =>
			getIssue(payload.id, options(request)),
		);
		if (issue === null) {
			return yield* new IssueNotFound({ id: payload.id });
		}
		return issue;
	}),
	GetIssueAssignee: Effect.fn("IssueRpcs.GetIssueAssignee")(
		function* (payload, request) {
			const user = yield* Effect.promise(() =>
				getIssueAssignee(payload.issueId, options(request)),
			);
			if (user === null) {
				return yield* new IssueNotFound({ id: payload.issueId });
			}
			return user;
		},
	),
	ListComments: (payload, request) =>
		Effect.promise(() => listComments(payload, options(request))),
	ListIssues: (payload, request) =>
		Effect.promise(() => listIssues(payload, options(request))),
	SetStatus: (payload, request) =>
		Effect.promise(() => updateIssue(payload, options(request))),
	UpdateBody: Effect.fn("IssueRpcs.UpdateBody")(function* (payload, request) {
		if (payload.body.trim() === "") {
			return yield* new EmptyBody();
		}
		return yield* Effect.promise(() => updateIssue(payload, options(request)));
	}),
	UpdateTitle: Effect.fn("IssueRpcs.UpdateTitle")(function* (payload, request) {
		if (payload.title.trim() === "") {
			return yield* new EmptyTitle();
		}
		return yield* Effect.promise(() => updateIssue(payload, options(request)));
	}),
});

const RpcRoute = RpcServer.layerHttp({
	group: IssueRpcs,
	path: "/rpc",
	protocol: "http",
}).pipe(Layer.provide([IssueHandlers, RpcSerialization.layerJson]));

/**
 * Serves `POST /rpc`: the `/rpc` server route in the browser's requests,
 * and the in-process transport during server rendering.
 */
export const rpcServer = HttpRouter.toWebHandler(RpcRoute, {
	disableLogger: true,
});

import.meta.hot?.dispose(() => rpcServer.dispose());
