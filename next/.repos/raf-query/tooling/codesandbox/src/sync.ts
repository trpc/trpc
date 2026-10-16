import {
	Console,
	Context,
	Data,
	Effect,
	FileSystem,
	Layer,
	Path,
	PlatformError,
	Stream,
} from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

export class CommandError extends Data.TaggedError("CommandError")<{
	readonly args: ReadonlyArray<string>;
	readonly command: string;
	readonly cwd: string;
	readonly exitCode: number;
}> {
	override get message() {
		return `\`${[this.command, ...this.args].join(" ")}\` exited with ${this.exitCode} in ${this.cwd}`;
	}
}

const spawn = Effect.fn("spawn")(function* (
	cwd: string,
	command: string,
	args: ReadonlyArray<string>,
	stdout: "inherit" | "pipe",
) {
	const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
	return yield* Effect.scoped(
		Effect.gen(function* () {
			const handle = yield* spawner.spawn(
				ChildProcess.make(command, args, { cwd, stderr: "inherit", stdout }),
			);
			const [output, exitCode] = yield* Effect.all(
				[Stream.mkString(Stream.decodeText(handle.stdout)), handle.exitCode],
				{ concurrency: "unbounded" },
			);
			if (exitCode !== 0) {
				return yield* new CommandError({ args, command, cwd, exitCode });
			}
			return output;
		}),
	);
});

/** Runs `command` in `cwd` and returns its stdout. */
export const read = (
	cwd: string,
	command: string,
	args: ReadonlyArray<string>,
) => spawn(cwd, command, args, "pipe");

/** Runs `command` in `cwd` with its output on this process's. */
const run = (cwd: string, command: string, args: ReadonlyArray<string>) =>
	spawn(cwd, command, args, "inherit").pipe(Effect.asVoid);

/**
 * Each app's Next.js build cache in the copy at `dir`, paired with where it's
 * kept in `cache`: `[kept, inCopy]`. Turbopack keeps compiled modules there,
 * so a build that starts from the last one's skips most of the compile.
 */
const buildCaches = Effect.fn("buildCaches")(function* (
	cache: string,
	dir: string,
) {
	const fs = yield* FileSystem.FileSystem;
	const path = yield* Path.Path;
	const apps = yield* fs.readDirectory(path.join(dir, "apps"));
	return apps.map(
		(app) =>
			[
				path.join(cache, app),
				path.join(dir, "apps", app, ".next", "cache"),
			] as const,
	);
});

/** Copies the build caches `saveBuildCaches` kept in `cache` into the copy at `dir`. */
export const restoreBuildCaches = Effect.fn("restoreBuildCaches")(function* (
	cache: string,
	dir: string,
) {
	const fs = yield* FileSystem.FileSystem;
	const path = yield* Path.Path;
	for (const [kept, inCopy] of yield* buildCaches(cache, dir)) {
		if (yield* fs.exists(kept)) {
			yield* fs.makeDirectory(path.dirname(inCopy), { recursive: true });
			yield* fs.copy(kept, inCopy, { preserveTimestamps: true });
		}
	}
});

/** Keeps the copy at `dir`'s build caches in `cache`, replacing older ones. */
export const saveBuildCaches = Effect.fn("saveBuildCaches")(function* (
	cache: string,
	dir: string,
) {
	const fs = yield* FileSystem.FileSystem;
	for (const [kept, inCopy] of yield* buildCaches(cache, dir)) {
		if (yield* fs.exists(inCopy)) {
			yield* fs.remove(kept, { force: true, recursive: true });
			yield* fs.copy(inCopy, kept, { preserveTimestamps: true });
		}
	}
});

/**
 * Installs and builds a copy, so a copy that doesn't build isn't pushed. The
 * copies' `packageManager` is this repo's, so the lockfile is written by the
 * pnpm CodeSandbox installs with. With a `cache` directory, each build starts
 * from the last one's build caches.
 */
export class Builder extends Context.Service<
	Builder,
	{
		readonly build: (
			dir: string,
		) => Effect.Effect<void, CommandError | PlatformError.PlatformError>;
	}
>()("@tooling/codesandbox/Builder") {
	static readonly layer = (cache: string | undefined) =>
		Layer.effect(
			Builder,
			Effect.gen(function* () {
				const services = yield* Effect.context<
					| ChildProcessSpawner.ChildProcessSpawner
					| FileSystem.FileSystem
					| Path.Path
				>();
				const pnpm = (dir: string, args: ReadonlyArray<string>) =>
					run(dir, "pnpm", args).pipe(Effect.provideContext(services));
				return Builder.of({
					build: Effect.fn("build")(function* (dir) {
						yield* Console.log(`Building ${dir}`);
						// `CI` makes pnpm default to a frozen lockfile; the copies are
						// regenerated without one.
						yield* pnpm(dir, ["install", "--no-frozen-lockfile"]);
						if (cache !== undefined) {
							yield* restoreBuildCaches(cache, dir).pipe(
								Effect.provideContext(services),
							);
						}
						yield* pnpm(dir, ["run", "build"]);
						if (cache !== undefined) {
							yield* saveBuildCaches(cache, dir).pipe(
								Effect.provideContext(services),
							);
						}
					}),
				});
			}),
		);
}

export const committer = {
	email: "41898282+github-actions[bot]@users.noreply.github.com",
	name: "github-actions[bot]",
};

/**
 * A worktree of `remote`'s `branch` at `dir`, or of a new orphan branch if the
 * remote has none. Removed when the scope closes.
 */
const checkoutBranch = Effect.fn("checkoutBranch")(function* (
	root: string,
	remote: string,
	branch: string,
	dir: string,
) {
	const git = (args: ReadonlyArray<string>) => read(root, "git", args);
	const heads = yield* git([
		"ls-remote",
		"--heads",
		remote,
		`refs/heads/${branch}`,
	]);
	const orphan =
		heads.trim() === "" ? `${branch}-sync-${process.pid}` : undefined;
	yield* Effect.acquireRelease(
		orphan === undefined
			? git(["fetch", "--quiet", "--depth", "1", remote, branch]).pipe(
					Effect.andThen(
						git(["worktree", "add", "--quiet", "--detach", dir, "FETCH_HEAD"]),
					),
				)
			: git(["worktree", "add", "--quiet", "--orphan", "-b", orphan, dir]),
		() =>
			git(["worktree", "remove", "--force", dir]).pipe(
				Effect.andThen(
					orphan === undefined
						? Effect.void
						: git(["update-ref", "-d", `refs/heads/${orphan}`]),
				),
				Effect.ignore,
			),
	);
});

/**
 * Commits everything in the worktree at `dir` and pushes it to `remote`'s
 * `branch`. Returns the commit, or `undefined` if nothing changed.
 */
const commitAndPush = Effect.fn("commitAndPush")(function* (
	dir: string,
	remote: string,
	branch: string,
	message: string,
) {
	const git = (args: ReadonlyArray<string>) => read(dir, "git", args);
	yield* git(["add", "--all"]);
	if ((yield* git(["status", "--porcelain"])).trim() === "") {
		yield* Console.log("No changes.");
		return undefined;
	}
	yield* git([
		"-c",
		`user.name=${committer.name}`,
		"-c",
		`user.email=${committer.email}`,
		"-c",
		"commit.gpgsign=false",
		"commit",
		"--quiet",
		"--message",
		message,
	]);
	yield* git(["push", "--quiet", remote, `HEAD:refs/heads/${branch}`]);
	const commit = (yield* git(["rev-parse", "HEAD"])).trim();
	yield* Console.log(`Pushed ${commit} to ${branch}.`);
	return commit;
});

/**
 * Regenerates `remote`'s `branch` from `root`: `generate` writes the files into
 * a worktree of the branch and returns the directories to build. Pushes a
 * commit if anything changed and everything built.
 */
export const syncBranch = Effect.fn("syncBranch")(function* <E, R>(
	root: string,
	remote: string,
	branch: string,
	generate: (dir: string) => Effect.Effect<ReadonlyArray<string>, E, R>,
) {
	const fs = yield* FileSystem.FileSystem;
	const path = yield* Path.Path;
	const builder = yield* Builder;
	const source = (yield* read(root, "git", [
		"rev-parse",
		"--short",
		"HEAD",
	])).trim();
	return yield* Effect.scoped(
		Effect.gen(function* () {
			const dir = path.join(yield* fs.makeTempDirectoryScoped(), branch);
			yield* checkoutBranch(root, remote, branch, dir);
			for (const target of yield* generate(dir)) {
				yield* builder.build(target);
			}
			return yield* commitAndPush(
				dir,
				remote,
				branch,
				`chore: sync examples from main (${source})`,
			);
		}),
	);
});
