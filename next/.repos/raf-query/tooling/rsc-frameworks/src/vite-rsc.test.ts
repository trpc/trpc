import { NodeServices } from "@effect/platform-node";
import { describe, expect, it, vi } from "@effect/vitest";
import { Effect, Path } from "effect";
import { createBuilder } from "vite";

type Handler = (request: Request) => Promise<Response>;

/** Builds `vite-rsc/` into its `dist/` and imports the RSC entry. */
const buildApp = Effect.fn("buildApp")(function* () {
	const path = yield* Path.Path;
	const root = path.join(import.meta.dirname, "../vite-rsc");
	yield* Effect.tryPromise(async () => {
		const builder = await createBuilder({
			configFile: path.join(root, "vite.config.ts"),
			logLevel: "warn",
			root,
		});
		await builder.buildApp();
	});
	const entry = path.join(root, "dist/rsc/index.js");
	const module = yield* Effect.tryPromise(
		(): Promise<{ default: Handler }> => import(entry),
	);
	return module.default;
});

const request = Effect.fn("request")(function* (handler: Handler, url: string) {
	globalThis.queryFnCalls = [];
	const response = yield* Effect.tryPromise(() => handler(new Request(url)));
	return yield* Effect.tryPromise(() => response.text());
});

describe("@vitejs/plugin-rsc", () => {
	it.effect(
		"renders what the server component's HydrationBoundary sent, and starts each query once",
		() =>
			Effect.gen(function* () {
				// A production build, as deployed. Vitest sets `test`, which
				// builds development JSX.
				vi.stubEnv("NODE_ENV", "production");
				const handler = yield* buildApp();

				const html = yield* request(handler, "http://localhost/");
				expect(html).toContain("<h1>Post hello</h1>");
				expect(html).toContain("<p>First comment on hello</p>");
				expect(html).not.toContain("Loading comments…");
				// The server component started both. QueryProvider's server
				// render started neither.
				expect(globalThis.queryFnCalls).toEqual([
					"comments hello",
					"post hello",
				]);

				const payload = yield* request(handler, "http://localhost/?rsc");
				// The server build rendered: the client references are what it
				// renders, not HydrationBoundary itself.
				const clientReferences = [
					...payload.matchAll(/I\["[^"]+",\[[^\]]*\],"(\w+)"/g),
				].map((match) => match[1]);
				expect(clientReferences.toSorted()).toEqual([
					"Comments",
					"Hydrate",
					"Post",
					"QueryProvider",
				]);
				// The pending entry crossed as a promise, resolved later in the
				// stream.
				expect(payload).toMatch(
					/"key":\["comments","hello"\],"promise":"\$@\w+"/,
				);
				expect(payload).toContain('"data":["First comment on hello"]');
				expect(globalThis.queryFnCalls).toEqual([
					"comments hello",
					"post hello",
				]);
			}).pipe(Effect.provide(NodeServices.layer)),
	);
});
