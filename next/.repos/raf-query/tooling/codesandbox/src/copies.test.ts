import { NodeServices } from "@effect/platform-node";
import { assert, describe, expect, it } from "@effect/vitest";
import { Effect, FileSystem, Path } from "effect";

import {
	apps,
	devPort,
	isIgnored,
	openUrl,
	rootPackageJson,
	standalonePackageJson,
	standaloneReadme,
	standaloneWorkspaceYaml,
	writeCopies,
} from "./copies.ts";

const root = new URL("../../..", import.meta.url).pathname;

describe("isIgnored", () => {
	it("skips build output, dependencies, TypeScript build info and Vercel config", () => {
		assert.isTrue(isIgnored("node_modules/react/index.js", "/"));
		assert.isTrue(isIgnored("src/.next/cache", "/"));
		assert.isTrue(isIgnored("tsconfig.tsbuildinfo", "/"));
		assert.isTrue(isIgnored("vercel.json", "/"));
		assert.isFalse(isIgnored("src/app/page.tsx", "/"));
		assert.isFalse(isIgnored("src/dist-utils.ts", "/"));
	});
});

describe("standalonePackageJson", () => {
	const published = new Map([["@raf-query/react", "1.2.0"]]);
	const shared = new Set(["@examples/ui"]);

	it("keeps shared packages in the workspace and installs raf-query from npm", () => {
		const scripts = { build: "vp build", dev: "vp dev --port 3000" };
		const pkg = standalonePackageJson(
			{
				dependencies: {
					"@examples/ui": "workspace:*",
					"@raf-query/react": "workspace:*",
					react: "19.3.0",
				},
				devDependencies: { typescript: "7.0.2", "vite-plus": "1.0.0" },
				name: "@examples/app",
				scripts,
				version: "0.0.0",
			},
			published,
			shared,
		);
		expect(pkg).toEqual({
			dependencies: {
				"@examples/ui": "workspace:*",
				"@raf-query/react": "1.2.0",
				react: "19.3.0",
			},
			devDependencies: { typescript: "7.0.2", "vite-plus": "1.0.0" },
			name: "@examples/app",
			scripts,
			version: "0.0.0",
		});
	});

	it("throws on a workspace package that isn't shared or published", () => {
		assert.throws(
			() =>
				standalonePackageJson(
					{
						dependencies: { "@raf-query/unreleased": "workspace:*" },
						name: "@examples/app",
						version: "0.0.0",
					},
					published,
					shared,
				),
			/@raf-query\/unreleased/,
		);
	});
});

describe("rootPackageJson", () => {
	it("runs the app's scripts from the workspace root, with the monorepo's pnpm", () => {
		expect(
			rootPackageJson(
				"nextjs",
				{
					name: "@examples/nextjs",
					scripts: { build: "next build", dev: "next dev", typecheck: "tsc" },
					version: "0.0.0",
				},
				{
					engines: { node: ">=24" },
					name: "monorepo",
					packageManager: "pnpm@12.9.1",
					scripts: { lint: "vp lint" },
					version: "0.0.0",
				},
			),
		).toEqual({
			engines: { node: ">=24" },
			name: "raf-query-nextjs-example",
			packageManager: "pnpm@12.9.1",
			private: true,
			scripts: {
				build: "pnpm --filter @examples/nextjs build",
				dev: "pnpm --filter @examples/nextjs dev",
				typecheck: "pnpm --recursive typecheck",
			},
			type: "module",
			version: "0.0.0",
		});
	});
});

describe("standaloneWorkspaceYaml", () => {
	it("swaps the package list, keeps the rest, and exempts raf-query from the release age", () => {
		expect(
			standaloneWorkspaceYaml(
				'packages:\n  - "examples/*"\n  - tooling/*\n\noverrides:\n  vite@*: npm:x@1.0.0\n',
			),
		).toBe(
			'packages:\n  - apps/*\n  - packages/*\n\noverrides:\n  vite@*: npm:x@1.0.0\n\nminimumReleaseAgeExclude:\n  - "@raf-query/*"\n',
		);
	});

	it("adds raf-query to an existing release age exclude list", () => {
		expect(
			standaloneWorkspaceYaml(
				"packages:\n  - tooling/*\n\nminimumReleaseAgeExclude:\n  - radix-ui@1.8.0\n",
			),
		).toBe(
			'packages:\n  - apps/*\n  - packages/*\n\nminimumReleaseAgeExclude:\n  - "@raf-query/*"\n  - radix-ui@1.8.0\n',
		);
	});

	it.effect("keeps the monorepo's Vite+ override", () =>
		Effect.gen(function* () {
			const fs = yield* FileSystem.FileSystem;
			const path = yield* Path.Path;
			const yaml = standaloneWorkspaceYaml(
				yield* fs.readFileString(path.join(root, "pnpm-workspace.yaml")),
			);
			expect(yaml).toContain("vite@*: npm:@voidzero-dev/vite-plus-core@");
			expect(yaml).not.toContain("examples/");
		}).pipe(Effect.provide(NodeServices.layer)),
	);

	it("returns undefined without a leading `packages:` list", () => {
		assert.isUndefined(standaloneWorkspaceYaml("catalog:\n  effect: 4.0.1\n"));
	});
});

describe("devPort", () => {
	it("reads the dev script's --port", () => {
		assert.strictEqual(
			devPort({
				name: "app",
				scripts: { dev: "next dev --port 3001" },
				version: "0.0.0",
			}),
			3001,
		);
		assert.isUndefined(
			devPort({ name: "app", scripts: { dev: "next dev" }, version: "0.0.0" }),
		);
	});
});

describe("openUrl", () => {
	it("opens the copy's folder on the codesandbox branch", () => {
		assert.strictEqual(
			openUrl("nextjs"),
			"https://codesandbox.io/p/devbox/github/KATT/raf-query/tree/codesandbox/examples/nextjs?file=/apps/nextjs/src/app/prefetch/issues/page.tsx",
		);
	});
});

describe("standaloneReadme", () => {
	it("notes the copy's origin and replaces the monorepo commands", () => {
		const readme = standaloneReadme(
			"nextjs",
			"# Example\n\nWhat it shows.\n\n## Run it\n\n```shell\npnpm dev:next\n```\n",
			3001,
		);
		expect(readme).toContain(
			"# Example\n\n> A standalone copy of [`examples/nextjs`]",
		);
		expect(readme).toContain(
			`What it shows.\n\n## Run it\n\n[Open it in CodeSandbox](${openUrl("nextjs")}), or locally:\n\n\`\`\`shell\npnpm install\npnpm dev\n\`\`\`\n\nThen open <http://localhost:3001>.\n`,
		);
		expect(readme).not.toContain("dev:next");
	});

	it("returns undefined without a `## Run it` section", () => {
		assert.isUndefined(
			standaloneReadme("nextjs", "# Example\n\nNo commands.\n", 3001),
		);
	});
});

describe("writeCopies", () => {
	it.effect("writes each app as its own pnpm workspace", () =>
		Effect.gen(function* () {
			const fs = yield* FileSystem.FileSystem;
			const path = yield* Path.Path;
			const out = yield* fs.makeTempDirectoryScoped();
			yield* fs.makeDirectory(path.join(out, ".git"));
			yield* fs.writeFileString(path.join(out, ".git", "HEAD"), "kept");
			yield* fs.writeFileString(path.join(out, "stale.txt"), "removed");

			const targets = yield* writeCopies(root, out);

			assert.deepStrictEqual(
				targets,
				apps.map((app) => path.join(out, "examples", app)),
			);
			assert.strictEqual(
				yield* fs.readFileString(path.join(out, ".git", "HEAD")),
				"kept",
			);
			assert.isFalse(yield* fs.exists(path.join(out, "stale.txt")));
			expect(yield* fs.readFileString(path.join(out, "README.md"))).toContain(
				openUrl("nextjs"),
			);

			const readJson = (file: string) =>
				fs.readFileString(file).pipe(Effect.map((text) => JSON.parse(text)));
			const react = yield* readJson(
				path.join(root, "packages", "react", "package.json"),
			);
			const monorepo = yield* readJson(path.join(root, "package.json"));
			for (const [index, target] of targets.entries()) {
				const app = apps[index];
				const read = (file: string) =>
					fs.readFileString(path.join(target, file));
				const exists = (file: string) => fs.exists(path.join(target, file));
				const source = yield* readJson(
					path.join(root, "examples", `${app}`, "package.json"),
				);

				const pkg = yield* readJson(
					path.join(target, `apps/${app}/package.json`),
				);
				assert.strictEqual(pkg.dependencies["@raf-query/react"], react.version);
				assert.strictEqual(pkg.dependencies["@examples/ui"], "workspace:*");
				assert.strictEqual(pkg.dependencies["@examples/kit"], "workspace:*");
				assert.strictEqual(pkg.dependencies["@examples/db"], "workspace:*");
				assert.deepStrictEqual(pkg.scripts, source.scripts);
				const rootPkg = yield* readJson(path.join(target, "package.json"));
				assert.strictEqual(
					rootPkg.scripts.dev,
					`pnpm --filter ${pkg.name} dev`,
				);
				assert.strictEqual(rootPkg.packageManager, monorepo.packageManager);
				expect(yield* read("pnpm-workspace.yaml")).toMatch(
					/^packages:\n {2}- apps\/\*\n {2}- packages\/\*\n/,
				);

				const port = devPort(pkg);
				const tasks = JSON.parse(yield* read(".codesandbox/tasks.json"));
				assert.deepStrictEqual(tasks.setupTasks, [
					{ command: "pnpm install", name: "Install dependencies" },
				]);
				assert.deepStrictEqual(tasks.tasks.dev.preview, { port });
				assert.isTrue(tasks.tasks.dev.runAtStart);
				const template = JSON.parse(yield* read(".codesandbox/template.json"));
				assert.strictEqual(template.description, source.description);
				expect(template.title).toMatch(/^raf-query on /);
				expect(
					JSON.parse(yield* read(".devcontainer/devcontainer.json")).image,
				).toMatch(/^ghcr\.io\/codesandbox\/devcontainers\/typescript-node:/);

				expect(yield* read("README.md")).toContain("pnpm install\npnpm dev\n");
				assert.isFalse(yield* exists(`apps/${app}/README.md`));
				expect(yield* read(`apps/${app}/components.json`)).toContain(
					'"../../packages/ui/src/styles/globals.css"',
				);
				assert.isFalse(yield* exists(`apps/${app}/node_modules`));

				for (const dir of yield* fs.readDirectory(
					path.join(root, "examples", ".shared"),
				)) {
					const file = path.join(dir, "package.json");
					assert.strictEqual(
						yield* read(path.join("packages", file)),
						yield* fs.readFileString(
							path.join(root, "examples", ".shared", file),
						),
					);
					assert.isFalse(
						yield* exists(path.join("packages", dir, "node_modules")),
					);
				}
			}
		}).pipe(Effect.provide(NodeServices.layer)),
	);
});
