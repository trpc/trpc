#!/usr/bin/env node
/**
 * Regenerates the `codesandbox` branch from this checkout and pushes it to
 * `origin`. `.github/workflows/codesandbox.yaml` runs it after Release, once
 * the version in `packages/*` is published. With a `build-cache` directory,
 * the copies' builds start from the last sync's build caches, and leave theirs
 * there.
 *
 * Usage: pnpm --filter @tooling/codesandbox sync [build-cache]
 */
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Effect, Layer, Path } from "effect";
import { FetchHttpClient } from "effect/http";

import { branch, publishedVersions, writeCopies } from "../copies.ts";
import { NpmRegistry, waitForVersions } from "../registry.ts";
import { Builder, syncBranch } from "../sync.ts";

const [cache] = process.argv.slice(2);

Effect.gen(function* () {
	const path = yield* Path.Path;
	const root = path.join(import.meta.dirname, "../../../..");
	yield* syncBranch(root, "origin", branch, (dir) =>
		writeCopies(root, dir).pipe(
			Effect.tap(() =>
				publishedVersions(root).pipe(
					Effect.flatMap((packages) =>
						waitForVersions(packages, 120, "5 seconds"),
					),
				),
			),
		),
	);
}).pipe(
	Effect.provide(
		Layer.mergeAll(Builder.layer(cache), NpmRegistry.layer).pipe(
			Layer.provideMerge(
				Layer.mergeAll(NodeServices.layer, FetchHttpClient.layer),
			),
		),
	),
	NodeRuntime.runMain,
);
