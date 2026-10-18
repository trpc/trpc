import type { NewChangeset, VersionType } from '@changesets/types';
import { Effect } from 'effect';
import { expect, test } from 'vite-plus/test';
import {
  readPendingChangesets,
  readWorkspace,
  releasePlan,
  underBumpedDependents,
} from './release.ts';

const workspace = await Effect.runPromise(readWorkspace);

const changeset = (
  releases: Readonly<Record<string, VersionType>>,
): NewChangeset => ({
  id: 'test',
  summary: 'Test.',
  releases: Object.entries(releases).map(([name, type]) => ({ name, type })),
});

const bumps = (releases: Readonly<Record<string, VersionType>>) =>
  Object.fromEntries(
    releasePlan(workspace, [changeset(releases)])
      .releases.filter((r) => r.type !== 'none')
      .map((r) => [r.name, r.type]),
  );

const published = workspace.packages.packages
  .filter((pkg) => pkg.relativeDir.startsWith('packages/'))
  .map((pkg) => pkg.packageJson);

test('a bump releases every package that depends on the bumped one, peers included', () => {
  const dependents = published
    .filter(
      (json) =>
        json.dependencies?.['@trpc12/trpc'] !== undefined ||
        json.peerDependencies?.['@trpc12/trpc'] !== undefined,
    )
    .map((json) => json.name);
  expect(dependents).toContain('@trpc12/nest');
  expect(bumps({ '@trpc12/trpc': 'patch' })).toEqual(
    Object.fromEntries(
      ['@trpc12/trpc', ...dependents].map((name) => [name, 'patch']),
    ),
  );
});

test('packages version independently', () => {
  expect(bumps({ '@trpc12/tanstack-query': 'patch' })).toEqual({
    '@trpc12/tanstack-query': 'patch',
    '@trpc12/tanstack-angular-query': 'patch',
    '@trpc12/tanstack-lit-query': 'patch',
    '@trpc12/tanstack-preact-query': 'patch',
    '@trpc12/tanstack-react-query': 'patch',
    '@trpc12/tanstack-solid-query': 'patch',
    '@trpc12/tanstack-svelte-query': 'patch',
    '@trpc12/tanstack-vue-query': 'patch',
  });
  expect(bumps({ '@trpc12/upgrade': 'minor' })).toEqual({
    '@trpc12/upgrade': 'minor',
  });
});

test('only the packages in packages/ are released', () => {
  const names = published.map((json) => json.name);
  expect(names).toContain('@trpc12/trpc');
  expect(
    Object.keys(
      bumps(Object.fromEntries(names.map((name) => [name, 'patch']))),
    ).sort(),
  ).toEqual(names.sort());
});

test('a breaking bump needs a breaking bump on each dependent', () => {
  const adapters = published
    .map((json) => json.name)
    .filter((name) => /^@trpc12\/tanstack-.+-query$/.test(name));
  const breaking = changeset({ '@trpc12/tanstack-query': 'minor' });
  expect(
    underBumpedDependents(workspace, releasePlan(workspace, [breaking])),
  ).toHaveLength(adapters.length);
  expect(
    underBumpedDependents(workspace, releasePlan(workspace, [breaking]))[0],
  ).toMatch(
    /^@trpc12\/tanstack-query 0\.1\.0 → 0\.2\.0 is breaking, so @trpc12\/tanstack-\w+-query needs "minor" in a changeset too, not "patch"$/,
  );
  const carried = changeset({
    '@trpc12/tanstack-query': 'minor',
    ...Object.fromEntries(adapters.map((name) => [name, 'minor' as const])),
  });
  expect(
    underBumpedDependents(workspace, releasePlan(workspace, [carried])),
  ).toEqual([]);
  expect(
    underBumpedDependents(
      workspace,
      releasePlan(workspace, [changeset({ '@trpc12/trpc': 'patch' })]),
    ),
  ).toEqual([]);
});

test('the changesets in .changeset/ make no 1.0.0 and carry breaking bumps to dependents', async () => {
  const plan = releasePlan(
    workspace,
    await Effect.runPromise(readPendingChangesets),
  );
  expect(
    plan.releases.filter((r) => r.type === 'major').map((r) => r.name),
  ).toEqual([]);
  expect(underBumpedDependents(workspace, plan)).toEqual([]);
});
