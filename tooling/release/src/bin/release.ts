#!/usr/bin/env node
/**
 * Releases the packages in `packages/*`. Stable releases are only automatic:
 * `auto` works out whether there's one and which version it is (see
 * `releaseMajor` and `notBreaking` in `config.ts`), so there's no command to
 * pick a version. `.github/workflows/release.yml` runs each release in two
 * jobs: `--pack <dir>` builds and packs without
 * credentials, and `--from <dir>` publishes those tarballs. Without either,
 * one run does both; locally, try a release without publishing anything with
 * `--dry-run`:
 *
 *   pnpm release auto [--provenance] [--dry-run] [--pack <dir> | --from <dir>]
 *   pnpm release canary [--since <sha>] [--preid canary] [--dist-tag canary] [--provenance] [--dry-run] [--pack <dir> | --from <dir>]
 *   pnpm release github-release <tag>
 *   pnpm release notes [<tag>] [--to <ref>]
 *
 * `--since` applies when packing.
 */
import { parseArgs } from 'node:util';
import { NodeRuntime, NodeServices } from '@effect/platform-node';
import { Effect, Path } from 'effect';
import { notBreaking, releaseMajor } from '../config.ts';
import {
  auto,
  canary,
  githubReleaseForTag,
  packAuto,
  packCanary,
  printNotes,
  publishAuto,
  publishCanary,
  ReleaseError,
} from '../release.ts';

const usage = `Usage:
  pnpm release auto [--provenance] [--dry-run] [--pack <dir> | --from <dir>]
  pnpm release canary [--since <sha>] [--preid canary] [--dist-tag canary] [--provenance] [--dry-run] [--pack <dir> | --from <dir>]
  pnpm release github-release <tag>
  pnpm release notes [<tag>] [--to <ref>]`;

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    'dist-tag': { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
    from: { type: 'string' },
    pack: { type: 'string' },
    preid: { type: 'string', default: 'canary' },
    provenance: { type: 'boolean', default: false },
    since: { type: 'string' },
    to: { type: 'string' },
  },
});

Effect.gen(function* () {
  const path = yield* Path.Path;
  const root = path.join(import.meta.dirname, '../../../..');
  const [command, arg] = positionals;
  const publish = {
    dryRun: values['dry-run'],
    provenance: values.provenance,
  };
  const pack =
    values.pack === undefined ? undefined : path.resolve(values.pack);
  const from =
    values.from === undefined ? undefined : path.resolve(values.from);
  if (
    (pack !== undefined && from !== undefined) ||
    (values.to !== undefined && command !== 'notes') ||
    (values['dist-tag'] !== undefined && command !== 'canary') ||
    (command === 'notes' && (pack !== undefined || from !== undefined))
  ) {
    return yield* new ReleaseError({ message: usage });
  }
  const repo = {
    remote: 'origin',
    branch: 'main',
    major: releaseMajor,
    notBreaking,
  };
  switch (command) {
    case 'auto': {
      if (arg !== undefined) {
        break;
      }
      const opts = { ...publish, ...repo };
      if (pack !== undefined) {
        yield* packAuto(root, { ...opts, dir: pack });
      } else if (from !== undefined) {
        yield* publishAuto(root, { ...opts, dir: from });
      } else {
        yield* auto(root, opts);
      }
      return;
    }
    case 'canary': {
      if (arg !== undefined) {
        break;
      }
      const opts = {
        ...publish,
        preid: values.preid,
        distTag: values['dist-tag'] ?? 'canary',
      };
      if (pack !== undefined) {
        yield* packCanary(root, { ...opts, since: values.since, dir: pack });
      } else if (from !== undefined) {
        yield* publishCanary(root, { ...opts, dir: from });
      } else {
        yield* canary(root, { ...opts, since: values.since });
      }
      return;
    }
    case 'github-release':
      if (arg === undefined) {
        break;
      }
      yield* githubReleaseForTag(root, arg);
      return;
    case 'notes':
      yield* printNotes(root, { tag: arg, to: values.to });
      return;
    case undefined:
    default:
      break;
  }
  return yield* new ReleaseError({ message: usage });
}).pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain);
