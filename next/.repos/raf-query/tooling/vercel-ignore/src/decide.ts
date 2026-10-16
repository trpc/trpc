import {
	Config,
	Data,
	Effect,
	Option,
	Path,
	Stream,
	String as Str,
} from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import { dependencyDirs } from "./workspace.ts";

/** Root files whose changes can change any project's install. */
const installInputs = [
	"package.json",
	"pnpm-lock.yaml",
	"pnpm-workspace.yaml",
	".npmrc",
	"patches",
];

class GitError extends Data.TaggedError("GitError")<{
	readonly args: ReadonlyArray<string>;
	readonly exitCode: number;
}> {
	override get message() {
		return `git ${this.args.join(" ")} exited with ${this.exitCode}`;
	}
}

/** Runs git in `cwd` and returns its trimmed stdout. Fails on a non-zero exit. */
export const git = Effect.fn("git")(function* (
	cwd: string,
	...args: ReadonlyArray<string>
) {
	const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
	const handle = yield* spawner.spawn(
		ChildProcess.make("git", args, { cwd, stderr: "inherit" }),
	);
	const [stdout, exitCode] = yield* Effect.all(
		[handle.stdout.pipe(Stream.decodeText(), Stream.mkString), handle.exitCode],
		{ concurrency: "unbounded" },
	);
	if (exitCode !== ChildProcessSpawner.ExitCode(0)) {
		return yield* new GitError({ args, exitCode });
	}
	return Str.trim(stdout);
}, Effect.scoped);

/**
 * The commit to diff from: the project's last deployment on this branch, or,
 * on a branch's first deployment, where the branch left `main` (fetched from
 * `mainRemote`). `None` on `main`'s first deployment.
 */
const baseCommit = Effect.fn("baseCommit")(function* (
	root: string,
	mainRemote: string,
) {
	const previous = yield* Config.String("VERCEL_GIT_PREVIOUS_SHA").pipe(
		Config.option,
	);
	if (Option.isSome(previous) && previous.value !== "") {
		return previous;
	}
	const branch = yield* Config.String("VERCEL_GIT_COMMIT_REF").pipe(
		Config.withDefault(""),
	);
	if (branch === "main") {
		return Option.none<string>();
	}
	yield* git(
		root,
		"fetch",
		"--quiet",
		"--no-tags",
		"--depth=100",
		mainRemote,
		"main",
	);
	return Option.some(yield* git(root, "merge-base", "FETCH_HEAD", "HEAD"));
});

/**
 * Whether Vercel should build the project in `cwd`: yes when the project, a
 * workspace package it depends on, or an install input changed since
 * {@link baseCommit}.
 */
export const decide = Effect.fn("decide")(function* (
	cwd: string,
	mainRemote: string,
) {
	const path = yield* Path.Path;
	const root = yield* git(cwd, "rev-parse", "--show-toplevel");
	const watched = [
		...(yield* dependencyDirs(root, path.relative(root, cwd))),
		...installInputs,
	];
	const base = yield* baseCommit(root, mainRemote);
	if (Option.isNone(base)) {
		return { build: true, reason: "No earlier deployment to compare with." };
	}

	const changed = yield* git(
		root,
		"diff",
		"--name-only",
		base.value,
		"HEAD",
		"--",
		...watched,
	);
	const since = `since ${base.value.slice(0, 12)} in ${watched.join(", ")}`;
	return changed === ""
		? { build: false, reason: `Nothing changed ${since}.` }
		: { build: true, reason: `Changed ${since}:\n${changed}` };
});
