#!/usr/bin/env node
/**
 * Releases the packages in `packages/*`. `.github/workflows/release.yml` runs
 * it; locally, try a release without publishing anything with `--dry-run`:
 *
 *   pnpm release stable <patch|minor|major> [--dist-tag latest] [--provenance] [--dry-run]
 *   pnpm release canary [--preid canary] [--dist-tag canary] [--provenance] [--dry-run]
 *   pnpm release github-release <tag>
 */
import { parseArgs } from 'node:util';
import { NodeRuntime, NodeServices } from '@effect/platform-node';
import { Effect, Path } from 'effect';
import {
  canary,
  defaultWait,
  githubReleaseForTag,
  ReleaseError,
  stable,
} from '../release.ts';
import { bumps, isBump } from '../version.ts';

const usage = `Usage:
  pnpm release stable <${bumps.join('|')}> [--dist-tag latest] [--provenance] [--dry-run]
  pnpm release canary [--preid canary] [--dist-tag canary] [--provenance] [--dry-run]
  pnpm release github-release <tag>`;

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    'dist-tag': { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
    preid: { type: 'string', default: 'canary' },
    provenance: { type: 'boolean', default: false },
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
  switch (command) {
    case 'stable':
      if (arg === undefined || !isBump(arg)) {
        break;
      }
      yield* stable(root, {
        ...publish,
        bump: arg,
        distTag: values['dist-tag'] ?? 'latest',
        remote: 'origin',
        branch: 'main',
        wait: defaultWait,
      });
      return;
    case 'canary':
      yield* canary(root, {
        ...publish,
        preid: values.preid,
        distTag: values['dist-tag'] ?? 'canary',
      });
      return;
    case 'github-release':
      if (arg === undefined) {
        break;
      }
      yield* githubReleaseForTag(root, arg, defaultWait);
      return;
    case undefined:
    default:
      break;
  }
  return yield* new ReleaseError({ message: usage });
}).pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain);
