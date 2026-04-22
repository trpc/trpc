import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  getManagedPackageJsonPaths,
  getWorkspaceVersion,
  setWorkspaceVersion,
  syncWorkspacePackages,
} from './workspace-version.ts';

type ReleaseMode = 'stable' | 'prerelease' | 'canary';
type BumpType = 'patch' | 'minor';

type ReleaseOptions = {
  distTag: string;
  dryRun: boolean;
  gitTag: boolean;
  push: boolean;
  preid?: string;
};

const WORKSPACE_ROOT = path.join(import.meta.dirname, '..');
const PACKAGE_JSON_PATHS = getManagedPackageJsonPaths();
const DEFAULT_OPTIONS: ReleaseOptions = {
  distTag: 'latest',
  dryRun: false,
  gitTag: true,
  push: true,
};

function runCommand(command: string, args: string[], cwd = WORKSPACE_ROOT) {
  console.log(`$ ${command} ${args.join(' ')}`);
  execFileSync(command, args, {
    cwd,
    stdio: 'inherit',
  });
}

function runJsonCommand(command: string, args: string[]) {
  return JSON.parse(
    execFileSync(command, args, {
      cwd: WORKSPACE_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
    }),
  );
}

function parseArguments() {
  const [modeOrBump, ...argv] = process.argv.slice(2);
  const options: ReleaseOptions = { ...DEFAULT_OPTIONS };

  if (!modeOrBump) {
    throw new Error(
      'Usage: tsx scripts/release.ts <patch|minor|prerelease|canary> [--dist-tag <tag>] [--preid <identifier>] [--yes] [--dry-run] [--no-git-tag-version] [--no-push]',
    );
  }

  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];

    switch (argument) {
      case '--dist-tag': {
        options.distTag = argv[++index] ?? '';
        if (!options.distTag) {
          throw new Error('--dist-tag requires a value.');
        }
        break;
      }

      case '--preid': {
        options.preid = argv[++index] ?? '';
        if (!options.preid) {
          throw new Error('--preid requires a value.');
        }
        break;
      }

      case '--dry-run':
        options.dryRun = true;
        break;

      case '--yes':
        break;

      case '--no-git-tag-version':
        options.gitTag = false;
        break;

      case '--no-push':
        options.push = false;
        break;

      default:
        throw new Error(`Unknown argument: ${argument}`);
    }
  }

  if (modeOrBump === 'patch' || modeOrBump === 'minor') {
    return {
      mode: 'stable' as const,
      bump: modeOrBump,
      options,
    };
  }

  if (modeOrBump === 'prerelease' || modeOrBump === 'canary') {
    return {
      mode: modeOrBump,
      options,
    };
  }

  throw new Error(`Unsupported release mode: ${modeOrBump}`);
}

function splitVersion(version: string) {
  const match = /^(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)(?:-(?<prerelease>.+))?$/.exec(
    version,
  );

  if (!match?.groups) {
    throw new Error(`Unsupported semantic version: ${version}`);
  }

  return {
    major: Number(match.groups.major),
    minor: Number(match.groups.minor),
    patch: Number(match.groups.patch),
    prerelease: match.groups.prerelease,
  };
}

function getBaseVersion(version: string) {
  const parsed = splitVersion(version);
  return `${parsed.major}.${parsed.minor}.${parsed.patch}`;
}

function bumpStableVersion(currentVersion: string, bump: BumpType) {
  const parsed = splitVersion(currentVersion);
  if (bump === 'patch') {
    return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`;
  }

  return `${parsed.major}.${parsed.minor + 1}.0`;
}

function buildPrereleaseVersion(currentVersion: string, preid = 'next-beta') {
  const parsed = splitVersion(currentVersion);
  const prereleaseMatch = parsed.prerelease?.match(
    new RegExp(`^${preid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.(\\d+)$`),
  );

  if (prereleaseMatch) {
    return `${getBaseVersion(currentVersion)}-${preid}.${Number(prereleaseMatch[1]) + 1}`;
  }

  const nextBaseVersion = parsed.prerelease
    ? getBaseVersion(currentVersion)
    : bumpStableVersion(currentVersion, 'patch');

  return `${nextBaseVersion}-${preid}.0`;
}

function getCanaryCounter(baseVersion: string, preid: string) {
  const publishedVersions = runJsonCommand('pnpm', [
    'view',
    '@trpc/server',
    'versions',
    '--json',
  ]) as string[];

  let highestCounter = -1;

  for (const publishedVersion of publishedVersions) {
    const match = new RegExp(
      `^${baseVersion.replace(/\./g, '\\.')}-${preid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.(\\d+)$`,
    ).exec(publishedVersion);

    if (!match) {
      continue;
    }

    highestCounter = Math.max(highestCounter, Number(match[1]));
  }

  return highestCounter + 1;
}

function buildCanaryVersion(currentVersion: string, preid = 'canary') {
  const baseVersion = getBaseVersion(currentVersion);
  const counter = getCanaryCounter(baseVersion, preid);
  return `${baseVersion}-${preid}.${counter}`;
}

function stageManagedFiles() {
  runCommand('git', ['add', ...PACKAGE_JSON_PATHS]);
}

function commitRelease(version: string) {
  runCommand('git', ['commit', '-m', `release: v${version}`]);
}

function publishPackages(
  distTag: string,
  dryRun: boolean,
  skipGitChecks: boolean,
) {
  const publishArguments = ['publish', '-r', '--filter=./packages/*', '--tag', distTag];

  if (dryRun) {
    publishArguments.push('--dry-run');
  } else {
    publishArguments.push('--report-summary');
  }

  if (skipGitChecks) {
    publishArguments.push('--no-git-checks');
  }

  runCommand('pnpm', publishArguments);
}

function createGitTag(version: string, dryRun: boolean) {
  if (dryRun) {
    console.log(`[dry-run] would create git tag v${version}`);
    return;
  }

  runCommand('git', ['tag', `v${version}`]);
}

function pushRelease(version: string, dryRun: boolean) {
  if (dryRun) {
    console.log(`[dry-run] would push release commit and tag for v${version}`);
    return;
  }

  runCommand('git', ['push', '--follow-tags']);
}

function snapshotManagedFiles() {
  return new Map(
    PACKAGE_JSON_PATHS.map((filePath) => [filePath, fs.readFileSync(filePath, 'utf8')]),
  );
}

function restoreManagedFiles(snapshot: Map<string, string>) {
  for (const [filePath, content] of snapshot) {
    fs.writeFileSync(filePath, content);
  }
}

function determineNextVersion(
  mode: ReleaseMode,
  currentVersion: string,
  options: ReleaseOptions,
  bump?: BumpType,
) {
  switch (mode) {
    case 'stable':
      if (!bump) {
        throw new Error('Stable releases require a bump type.');
      }
      return bumpStableVersion(currentVersion, bump);

    case 'prerelease':
      return buildPrereleaseVersion(currentVersion, options.preid);

    case 'canary':
      return buildCanaryVersion(currentVersion, options.preid);
  }
}

function main() {
  const parsedArguments = parseArguments();
  const options =
    parsedArguments.mode === 'canary'
      ? {
          ...parsedArguments.options,
          gitTag: false,
          push: false,
        }
      : parsedArguments.options;
  const currentVersion = getWorkspaceVersion();
  const nextVersion = determineNextVersion(
    parsedArguments.mode,
    currentVersion,
    options,
    'bump' in parsedArguments ? parsedArguments.bump : undefined,
  );
  const snapshot = snapshotManagedFiles();
  const isEphemeralRelease = parsedArguments.mode === 'canary' || options.dryRun;
  let committedRelease = false;

  try {
    setWorkspaceVersion(nextVersion);
    syncWorkspacePackages(nextVersion);

    console.log(`ℹ️ Releasing ${nextVersion} with dist-tag "${options.distTag}"`);

    if (!isEphemeralRelease) {
      stageManagedFiles();
      commitRelease(nextVersion);
      committedRelease = true;
    }

    publishPackages(options.distTag, options.dryRun, isEphemeralRelease);

    if (options.gitTag) {
      createGitTag(nextVersion, options.dryRun);
    }

    if (options.push) {
      pushRelease(nextVersion, options.dryRun);
    }
  } finally {
    if (isEphemeralRelease || !committedRelease) {
      restoreManagedFiles(snapshot);
    }
  }
}

main();
