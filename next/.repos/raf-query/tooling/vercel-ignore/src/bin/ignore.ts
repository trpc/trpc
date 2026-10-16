#!/usr/bin/env node
/**
 * Vercel's "Ignored Build Step", run by `../../ignore.sh` from the project's
 * root directory once this package is installed: exit 0 skips the deployment,
 * exit 1 builds it. Any failure builds: Vercel fails the deployment on other
 * exit codes.
 */
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Cause, Console, Effect, Exit } from "effect";

import { decide } from "../decide.ts";

decide(process.cwd(), "https://github.com/KATT/raf-query.git").pipe(
	Effect.catchCause((cause) =>
		Effect.succeed({
			build: true,
			reason: `The ignore step failed:\n${Cause.pretty(cause)}`,
		}),
	),
	Effect.flatMap((decision) =>
		Console.log(
			`${decision.reason}\n${decision.build ? "Building." : "Skipping."}`,
		).pipe(
			Effect.andThen(decision.build ? Effect.fail(decision) : Effect.void),
		),
	),
	Effect.provide(NodeServices.layer),
	NodeRuntime.runMain({
		disableErrorReporting: true,
		teardown: (exit, onExit) => onExit(Exit.isSuccess(exit) ? 0 : 1),
	}),
);
