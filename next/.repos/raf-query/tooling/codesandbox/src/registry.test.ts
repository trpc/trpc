import { assert, describe, it } from "@effect/vitest";
import { Effect, Exit, Fiber, Layer } from "effect";
import {
	HttpClient,
	HttpClientError,
	HttpClientRequest,
	HttpClientResponse,
} from "effect/http";
import { TestClock } from "effect/testing";

import {
	NotPublishedError,
	NpmRegistry,
	RegistryError,
	waitForVersions,
} from "./registry.ts";

const packages = new Map([
	["@raf-query/core", "1.2.0"],
	["@raf-query/react", "1.2.0"],
]);

/** A registry that has `@raf-query/core` from the start and publishes `@raf-query/react@1.2.0` on request `publishedOn`. */
const fakeRegistry = (publishedOn: number) => {
	const requests: Array<string> = [];
	const layer = Layer.succeed(
		NpmRegistry,
		NpmRegistry.of({
			versions: (name) =>
				Effect.sync(() => {
					requests.push(name);
					const reactRequests = requests.filter(
						(r) => r === "@raf-query/react",
					);
					return name === "@raf-query/core" ||
						reactRequests.length >= publishedOn
						? new Set(["1.1.0", "1.2.0"])
						: new Set(["1.1.0"]);
				}),
		}),
	);
	return { layer, requests };
};

describe("waitForVersions", () => {
	it.effect("returns once every version is installable", () =>
		Effect.gen(function* () {
			const registry = fakeRegistry(1);
			yield* waitForVersions(packages, 3, "20 seconds").pipe(
				Effect.provide(registry.layer),
			);
			assert.deepStrictEqual(registry.requests, [
				"@raf-query/core",
				"@raf-query/react",
			]);
		}),
	);

	it.effect("checks again after each interval", () =>
		Effect.gen(function* () {
			const registry = fakeRegistry(3);
			const fiber = yield* Effect.forkChild(
				waitForVersions(packages, 5, "20 seconds").pipe(
					Effect.provide(registry.layer),
				),
			);
			yield* TestClock.adjust("20 seconds");
			assert.strictEqual(registry.requests.length, 4);
			assert.isUndefined(fiber.pollUnsafe());
			yield* TestClock.adjust("20 seconds");
			assert.isTrue(Exit.isSuccess(yield* Fiber.await(fiber)));
			assert.strictEqual(registry.requests.length, 6);
		}),
	);

	it.effect("fails with what's missing after the last attempt", () =>
		Effect.gen(function* () {
			const registry = fakeRegistry(Number.POSITIVE_INFINITY);
			const fiber = yield* Effect.forkChild(
				waitForVersions(packages, 3, "20 seconds").pipe(
					Effect.provide(registry.layer),
					Effect.flip,
				),
			);
			yield* TestClock.adjust("40 seconds");
			const error = yield* Fiber.join(fiber);
			assert.instanceOf(error, NotPublishedError);
			assert.deepStrictEqual(error.missing, ["@raf-query/react@1.2.0"]);
			assert.strictEqual(registry.requests.length, 6);
		}),
	);

	it.effect("counts a failed request as not published yet", () =>
		Effect.gen(function* () {
			let calls = 0;
			const flaky = Layer.succeed(
				NpmRegistry,
				NpmRegistry.of({
					versions: (name) => {
						calls++;
						return calls === 1
							? Effect.fail(
									new RegistryError({
										cause: new Error("ECONNRESET"),
										packageName: name,
									}),
								)
							: Effect.succeed(new Set(["1.2.0"]));
					},
				}),
			);
			const fiber = yield* Effect.forkChild(
				waitForVersions(
					new Map([["@raf-query/core", "1.2.0"]]),
					2,
					"1 second",
				).pipe(Effect.provide(flaky)),
			);
			yield* TestClock.adjust("1 second");
			assert.isTrue(Exit.isSuccess(yield* Fiber.await(fiber)));
			assert.strictEqual(calls, 2);
		}),
	);
});

describe("NpmRegistry.layer", () => {
	const registryWith = (
		respond: (request: HttpClientRequest.HttpClientRequest) => Response,
	) => {
		const requests: Array<HttpClientRequest.HttpClientRequest> = [];
		const client = HttpClient.make((request) => {
			requests.push(request);
			return Effect.succeed(
				HttpClientResponse.fromWeb(request, respond(request)),
			);
		});
		const layer = NpmRegistry.layer.pipe(
			Layer.provide(Layer.succeed(HttpClient.HttpClient, client)),
		);
		return { layer, requests };
	};

	it.effect("reads the install metadata's versions", () =>
		Effect.gen(function* () {
			const registry = registryWith(
				() =>
					new Response(
						JSON.stringify({
							name: "x",
							versions: { "0.1.10": {}, "0.1.9": {} },
						}),
					),
			);
			const versions = yield* NpmRegistry.use((npm) =>
				npm.versions("@raf-query/react"),
			).pipe(Effect.provide(registry.layer));
			assert.deepStrictEqual([...versions], ["0.1.10", "0.1.9"]);
			const [request] = registry.requests;
			assert.strictEqual(
				request?.url,
				"https://registry.npmjs.org/@raf-query%2freact",
			);
			assert.strictEqual(
				request?.headers.accept,
				"application/vnd.npm.install-v1+json",
			);
		}),
	);

	it.effect("fails on a non-2xx response", () =>
		Effect.gen(function* () {
			const registry = registryWith(
				() => new Response("Not found", { status: 404 }),
			);
			const error = yield* NpmRegistry.use((npm) => npm.versions("nope")).pipe(
				Effect.provide(registry.layer),
				Effect.flip,
			);
			assert.strictEqual(error.packageName, "nope");
			assert.instanceOf(error.cause, HttpClientError.HttpClientError);
		}),
	);
});
