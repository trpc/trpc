/**
 * The release plan Changesets makes from `.changeset/` with the workspace's
 * `.changeset/config.json`, and the rule the config can't express: a breaking
 * bump is breaking for every package that depends on the bumped one.
 */
import { fileURLToPath } from 'node:url';
import { assembleReleasePlan } from '@changesets/assemble-release-plan';
import { readConfig } from '@changesets/config';
import { readChangesets } from '@changesets/read';
import type {
  ComprehensiveRelease,
  Config,
  NewChangeset,
  ReleasePlan,
} from '@changesets/types';
import { getPackages, type Packages } from '@manypkg/get-packages';
import { Data, Effect } from 'effect';

/** `next/`, the pnpm workspace Changesets versions. */
export const root: string = fileURLToPath(new URL('../..', import.meta.url));

export class ReleaseConfigError extends Data.TaggedError('ReleaseConfigError')<{
  readonly message: string;
}> {}

export interface Workspace {
  readonly packages: Packages;
  readonly config: Config;
}

const attempt = <A>(what: string, run: () => Promise<A>) =>
  Effect.tryPromise({
    try: run,
    catch: (cause) =>
      new ReleaseConfigError({ message: `${what}: ${String(cause)}` }),
  });

/** The workspace's packages and its parsed `.changeset/config.json`. */
export const readWorkspace: Effect.Effect<Workspace, ReleaseConfigError> =
  Effect.gen(function* () {
    const packages = yield* attempt('reading the workspace', () =>
      getPackages(root),
    );
    const parsed = yield* attempt('reading .changeset/config.json', () =>
      readConfig(root, packages),
    );
    if (parsed.config === undefined) {
      return yield* new ReleaseConfigError({
        message: parsed.errors.join('\n'),
      });
    }
    return { packages, config: parsed.config };
  });

/** The changesets waiting in `.changeset/`. */
export const readPendingChangesets: Effect.Effect<
  ReadonlyArray<NewChangeset>,
  ReleaseConfigError
> = attempt('reading .changeset/', () => readChangesets(root));

/**
 * What `changeset version` would release for these changesets. Packages it
 * skips (private ones without a `version`, `ignore`) appear as `none`.
 */
export const releasePlan = (
  workspace: Workspace,
  changesets: ReadonlyArray<NewChangeset>,
): ReleasePlan =>
  assembleReleasePlan(
    [...changesets],
    workspace.packages,
    workspace.config,
    undefined,
  );

/** On `0.x` a minor is breaking, as a major is from `1.0.0`. */
const isBreaking = (release: ComprehensiveRelease): boolean =>
  release.type === 'major' ||
  (release.type === 'minor' && release.oldVersion.startsWith('0.'));

/**
 * Changesets gives every dependent of a bumped package a patch. A dependent
 * pins the version it was published with (`workspace:*`), so a breaking bump
 * reaches its users too: each such dependent must get a breaking bump of its
 * own. Returns one message per dependent that doesn't.
 */
export const underBumpedDependents = (
  workspace: Workspace,
  plan: ReleasePlan,
): ReadonlyArray<string> => {
  const releases = new Map(
    plan.releases.filter((r) => r.type !== 'none').map((r) => [r.name, r]),
  );
  return plan.releases.filter(isBreaking).flatMap((dependency) =>
    workspace.packages.packages.flatMap((pkg) => {
      const json = pkg.packageJson;
      const dependent = releases.get(json.name);
      const dependsOn =
        json.dependencies?.[dependency.name] !== undefined ||
        json.peerDependencies?.[dependency.name] !== undefined;
      return dependent === undefined || !dependsOn || isBreaking(dependent)
        ? []
        : [
            `${dependency.name} ${dependency.oldVersion} → ${dependency.newVersion} is breaking, so ${json.name} needs "${dependency.type}" in a changeset too, not "${dependent.type}"`,
          ];
    }),
  );
};
