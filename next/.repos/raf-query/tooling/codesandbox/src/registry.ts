import {
	Console,
	Context,
	Data,
	Duration,
	Effect,
	Layer,
	Schema,
} from "effect";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http";

/**
 * The abbreviated metadata `npm install` reads. The registry CDN caches it
 * apart from the full document `npm view` reads, so a version Release just
 * published shows up here last.
 */
const installMetadata = "application/vnd.npm.install-v1+json";

const Packument = Schema.Struct({
	versions: Schema.Record(Schema.String, Schema.Unknown),
});

export class NpmRegistry extends Context.Service<
	NpmRegistry,
	{
		/** The versions `npm install` can resolve `name` to. */
		readonly versions: (
			name: string,
		) => Effect.Effect<ReadonlySet<string>, RegistryError>;
	}
>()("@tooling/codesandbox/NpmRegistry") {
	static readonly layer = Layer.effect(
		NpmRegistry,
		Effect.gen(function* () {
			const client = HttpClient.filterStatusOk(yield* HttpClient.HttpClient);
			return NpmRegistry.of({
				versions: (name) =>
					client
						.execute(
							HttpClientRequest.get(
								`https://registry.npmjs.org/${name.replace("/", "%2f")}`,
							).pipe(HttpClientRequest.accept(installMetadata)),
						)
						.pipe(
							Effect.flatMap(HttpClientResponse.schemaBodyJson(Packument)),
							Effect.map(
								(packument): ReadonlySet<string> =>
									new Set(Object.keys(packument.versions)),
							),
							Effect.mapError(
								(cause) => new RegistryError({ cause, packageName: name }),
							),
						),
			});
		}),
	);
}

export class RegistryError extends Data.TaggedError("RegistryError")<{
	readonly cause: Error;
	readonly packageName: string;
}> {}

export class NotPublishedError extends Data.TaggedError("NotPublishedError")<{
	readonly missing: ReadonlyArray<string>;
}> {
	override get message() {
		return `${this.missing.join(", ")} isn't on npm`;
	}
}

/**
 * Waits until `npm install` can resolve every `name@version` in `packages`,
 * checking `attempts` times, `interval` apart. A failed request counts as not
 * published yet.
 */
export const waitForVersions = Effect.fn("waitForVersions")(function* (
	packages: ReadonlyMap<string, string>,
	attempts: number,
	interval: Duration.Input,
) {
	const registry = yield* NpmRegistry;
	for (let attempt = 1; ; attempt++) {
		const missing: Array<string> = [];
		for (const [name, version] of packages) {
			const versions = yield* registry
				.versions(name)
				.pipe(
					Effect.catch((error) =>
						Console.warn(`${name}: ${error.cause.message}`).pipe(
							Effect.as(new Set<string>()),
						),
					),
				);
			if (!versions.has(version)) {
				missing.push(`${name}@${version}`);
			}
		}
		if (missing.length === 0) {
			return;
		}
		if (attempt >= attempts) {
			return yield* new NotPublishedError({ missing });
		}
		yield* Console.log(
			`Waiting for ${missing.join(", ")} on npm (${attempt}/${attempts})…`,
		);
		yield* Effect.sleep(interval);
	}
});
