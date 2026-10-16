import { rpcTransport } from "#rpc-transport";
import { Context, Layer } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/http";
import { RpcClient, RpcSerialization } from "effect/rpc";
import type { RpcClientError } from "effect/rpc/RpcClientError";

import { IssueRpcs } from "./rpc.ts";

/**
 * Where the RPC client sends requests. `#rpc-transport` picks one by export
 * condition: in-process on the server, over HTTP in the browser.
 */
export interface RpcTransport {
	/** Replaces `globalThis.fetch`. */
	readonly fetch?: typeof globalThis.fetch;
	readonly url: string;
}

/**
 * The issue tracker's RPC client. Each procedure is a method returning an
 * Effect, typed by `IssueRpcs`: `issues.GetIssue({ id })` is an
 * `Effect<Issue, IssueNotFound | RpcClientError>`.
 */
export class Issues extends Context.Service<
	Issues,
	RpcClient.FromGroup<typeof IssueRpcs, RpcClientError>
>()("examples/Issues") {
	/**
	 * Sends `headers()` with every request. It builds synchronously, as a
	 * `QueryClient`'s layer must.
	 */
	static layer(headers: () => Record<string, string>) {
		return Layer.effect(Issues, RpcClient.make(IssueRpcs)).pipe(
			Layer.provide(
				RpcClient.layerProtocolHttp({
					transformClient: HttpClient.mapRequest((request) =>
						HttpClientRequest.setHeaders(request, headers()),
					),
					url: rpcTransport.url,
				}),
			),
			Layer.provide([RpcSerialization.layerJson, httpClient]),
		);
	}
}

const httpClient = rpcTransport.fetch
	? FetchHttpClient.layer.pipe(
			Layer.provide(Layer.succeed(FetchHttpClient.Fetch, rpcTransport.fetch)),
		)
	: FetchHttpClient.layer;
