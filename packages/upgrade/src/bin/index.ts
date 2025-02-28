#!/usr/bin/env node
import { basename, extname } from 'node:path';
import { parse } from '@bomb.sh/args';
import { intro, isCancel, log, multiselect, outro } from '@clack/prompts';
import { version } from '../../package.json';
import { findTRPCImportReferences, getProgram } from '../lib/ast/scanners';
import { assertCleanGitTree, filterIgnored } from '../lib/git';
import { installPackage, uninstallPackage } from '../lib/pkgmgr';

const args = parse(process.argv.slice(2), {
  default: {
    force: false,
    skipTanstackQuery: false,
    verbose: false,
  },
  alias: {
    f: 'force',
    h: 'help',
    v: 'verbose',
    q: 'skipTanstackQuery',
  },
  boolean: true,
});
if (args.verbose) process.env['VERBOSE'] = '1';

intro(`tRPC Upgrade CLI v${version}`);

if (args['help']) {
  log.info(
    `
Usage: upgrade [options]

Options:
  -f, --force             Skip git status check, use with caution
  -q, --skipTanstackQuery Skip installing @trpc/tanstack-react-query package
  -v, --verbose           Enable verbose logging
  -h, --help              Show help
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

const transforms = await multiselect({
  message: 'Select transforms to run',
  options: [
    {
      value: require.resolve('@trpc/upgrade/transforms/hooksToOptions'),
      label: 'Migrate Hooks to xxxOptions API',
    },
    {
      value: require.resolve('@trpc/upgrade/transforms/provider'),
      label: 'Migrate context provider setup',
    },
  ],
});
if (isCancel(transforms)) process.exit(0);

// Make sure provider transform runs first if it's selected
const sortedTransforms = transforms.sort((a) =>
  a.includes('provider') ? -1 : 1,
);

const program = getProgram();
const sourceFiles = program.getSourceFiles();
const possibleReferences = findTRPCImportReferences(program);
const trpcFile = possibleReferences.mostUsed.file;
const trpcImportName = possibleReferences.importName;

const commitedFiles = await filterIgnored(sourceFiles);

for (const transform of sortedTransforms) {
  log.step(`Running transform: ${basename(transform, extname(transform))}`);
  const { run } = await import('jscodeshift/src/Runner.js');
  await run(transform, commitedFiles, {
    ...args,
    trpcFile,
    trpcImportName,
  });
  log.success(`Transform completed`);
}

if (!args.skipTanstackQuery) {
  log.info('Installing @trpc/tanstack-react-query');
  await installPackage('@trpc/tanstack-react-query');
  log.success('@trpc/tanstack-react-query installed');

  log.info('Uninstalling @trpc/react-query');
  await uninstallPackage('@trpc/react-query');
  log.success('@trpc/react-query uninstalled');
}

outro('Upgrade complete! 🎉');
