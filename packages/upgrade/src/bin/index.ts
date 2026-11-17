#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { basename, extname, relative } from 'node:path';
import { parse } from '@bomb.sh/args';
import { intro, isCancel, log, multiselect, note, outro } from '@clack/prompts';
import { version } from '../../package.json';
import { scanProject } from '../lib/ast/scanners';
import { assertCleanGitTree, filterIgnored, trackedFiles } from '../lib/git';
import { installPackage, uninstallPackage } from '../lib/pkgmgr';

const args = parse(process.argv.slice(2), {
  default: {
    force: false,
    skipTanstackQuery: false,
    verbose: false,
    yes: false,
  },
  alias: {
    f: 'force',
    h: 'help',
    v: 'verbose',
    q: 'skipTanstackQuery',
    y: 'yes',
  },
  boolean: ['force', 'skipTanstackQuery', 'verbose', 'yes', 'help'],
  string: ['transforms'],
});
if (args.verbose) process.env['VERBOSE'] = '1';

intro(`tRPC Upgrade CLI v${version}`);

if (args['help']) {
  log.info(
    `
Usage: upgrade [options]

Options:
  -y, --yes                   Run every transform without asking
      --transforms <list>     Run these transforms without asking: provider,hooks
  -f, --force                 Skip git status check, use with caution
  -q, --skipTanstackQuery     Don't install @trpc/tanstack-react-query or uninstall
                              @trpc/react-query and @trpc/next
  -v, --verbose               Enable verbose logging
  -h, --help                  Show help
      `.trim(),
  );
  process.exit(0);
}

if (args.verbose) {
  log.info(`Running upgrade with args: ${JSON.stringify(args, null, 2)}`);
}

if (!args.force) {
  await assertCleanGitTree();
}

const available = {
  provider: {
    file: require.resolve('@trpc/upgrade/transforms/provider'),
    label:
      'Migrate the setup: createTRPCReact and createTRPCNext to createTRPCContext',
  },
  hooks: {
    file: require.resolve('@trpc/upgrade/transforms/hooksToOptions'),
    label: 'Migrate hooks and useUtils to TanStack Query with xxxOptions',
  },
} as const;
type TransformName = keyof typeof available;
const isTransformName = (name: string): name is TransformName =>
  name in available;

let selected: TransformName[];
if (typeof args['transforms'] === 'string') {
  const names = args['transforms'].split(',').map((name) => name.trim());
  const unknown = names.filter((name) => !isTransformName(name));
  if (unknown.length > 0) {
    log.error(
      `Unknown transforms: ${unknown.join(', ')}. Choose from: ${Object.keys(available).join(', ')}`,
    );
    process.exit(1);
  }
  selected = names.filter(isTransformName);
} else if (args.yes) {
  selected = ['provider', 'hooks'];
} else {
  const answer = await multiselect({
    message: 'Select transforms to run',
    options: Object.entries(available).map(([value, { label }]) => ({
      value: value as TransformName,
      label,
    })),
    initialValues: ['provider', 'hooks'] as TransformName[],
  });
  if (isCancel(answer)) process.exit(0);
  selected = answer;
}

// The setup first: the hooks transform imports what it exports
const ordered = (['provider', 'hooks'] as const).filter((name) =>
  selected.includes(name),
);

const { fileNames, references, routerType } = scanProject(process.cwd());
const trpcImportName = references.importName;
if (process.env['VERBOSE']) {
  log.info(`Using \`${trpcImportName}\` as the name of the tRPC hooks`);
}

const committedFiles = await filterIgnored(fileNames);

for (const name of ordered) {
  const transform = available[name].file;
  log.step(`Running transform: ${basename(transform, extname(transform))}`);
  const { run } = await import('jscodeshift/src/Runner.js');
  await run(transform, committedFiles, {
    ...args,
    trpcImportName,
    routerType,
    silent: !args.verbose,
  });
  log.success(`Transform completed`);
}

/**
 * Every tracked source file, not just the ones in the TypeScript program:
 * a test or script outside it can still need a package.
 */
const trackedSourceFiles = (await trackedFiles(process.cwd())).filter((file) =>
  /\.(?:[cm]?[jt]sx?)$/.test(file),
);

/**
 * Tracked files that still refer to `pkg` or a subpath of it, in an import,
 * `import()`, `require()` or `export … from`
 */
const importersOf = (pkg: string) => {
  const specifier = new RegExp(
    `['"\`]${pkg.replace('/', '\\/')}(?:\\/[^'"\`]*)?['"\`]`,
  );
  return trackedSourceFiles.filter((file) => {
    try {
      return specifier.test(readFileSync(file, 'utf8'));
    } catch {
      return false;
    }
  });
};

if (!args.skipTanstackQuery) {
  log.info('Installing @trpc/tanstack-react-query');
  await installPackage('@trpc/tanstack-react-query');
  log.success('@trpc/tanstack-react-query installed');

  for (const pkg of ['@trpc/react-query', '@trpc/next']) {
    const importers = importersOf(pkg);
    if (importers.length > 0) {
      log.warn(
        `Keeping ${pkg}, which these files still import:\n${importers
          .map((file) => `  ${relative(process.cwd(), file)}`)
          .join('\n')}`,
      );
      continue;
    }
    log.info(`Uninstalling ${pkg}`);
    await uninstallPackage(pkg);
    log.success(`${pkg} uninstalled`);
  }
}

const todos = committedFiles.filter((file) => {
  try {
    return readFileSync(file, 'utf8').includes('TODO(@trpc/upgrade)');
  } catch {
    return false;
  }
});
note(
  [
    'Next steps:',
    '1. Format the changed files with your formatter, e.g. `npx prettier --write .`',
    '2. Typecheck, e.g. `npx tsc --noEmit`',
    ...(todos.length > 0
      ? [
          `3. Search for \`TODO(@trpc/upgrade)\`, in:`,
          ...todos.map((file) => `   ${relative(process.cwd(), file)}`),
        ]
      : []),
    '',
    'Migration guide: https://trpc.io/docs/client/tanstack-react-query/migrating',
  ].join('\n'),
  'Done',
);

outro('Upgrade complete! 🎉');
